import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const MODEL_URL = new URL("../model/model.json", import.meta.url);
const WASM_URL = new URL("../dist/dense.wasm", import.meta.url);

function softmax(logits) {
  const maximum = Math.max(...logits);
  const values = Array.from(logits, (value) => Math.exp(value - maximum));
  const sum = values.reduce((total, value) => total + value, 0);
  return values.map((value) => value / sum);
}

function viewFloat(buffer, descriptor) {
  return new Float32Array(buffer.buffer, buffer.byteOffset + descriptor.offset, descriptor.length);
}

function denseFloat(input, weights, bias, outputs) {
  const result = new Float32Array(outputs);
  for (let row = 0; row < outputs; row += 1) {
    let total = bias[row];
    const offset = row * input.length;
    for (let column = 0; column < input.length; column += 1) total += input[column] * weights[offset + column];
    result[row] = total;
  }
  return result;
}

function relu(values) {
  return Float32Array.from(values, (value) => Math.max(0, value));
}

function normalize(features, metadata) {
  return Float32Array.from(features, (value, index) =>
    (value - metadata.normalization.means[index]) / metadata.normalization.deviations[index]);
}

async function loadAndVerify(url, expectedHash) {
  const buffer = await readFile(url);
  const actualHash = createHash("sha256").update(buffer).digest("hex");
  if (actualHash !== expectedHash) throw new Error(`Integrity check failed for ${url.pathname.split("/").pop()}`);
  return buffer;
}

export async function loadModel({ modelUrl = MODEL_URL, wasmUrl = WASM_URL } = {}) {
  const metadata = JSON.parse(await readFile(modelUrl, "utf8"));
  const baseUrl = new URL(".", modelUrl);
  const [floatBuffer, int8Buffer, wasmBuffer] = await Promise.all([
    loadAndVerify(new URL(metadata.float.file, baseUrl), metadata.float.sha256),
    loadAndVerify(new URL(metadata.int8.file, baseUrl), metadata.int8.sha256),
    readFile(wasmUrl),
  ]);
  const instance = await WebAssembly.instantiate(wasmBuffer);
  const { memory, dense } = instance.instance.exports;
  const memoryBytes = new Uint8Array(memory.buffer);
  const int8WeightAddresses = [65536, 80000, 114000];
  for (let index = 0; index < metadata.int8.layers.length; index += 1) {
    const descriptor = metadata.int8.layers[index].weights;
    const weights = int8Buffer.subarray(descriptor.offset, descriptor.offset + descriptor.length);
    memoryBytes.set(weights, int8WeightAddresses[index]);
  }

  const floatLayers = metadata.float.layers.map((layer) => ({
    ...layer,
    weightsView: viewFloat(floatBuffer, layer.weights),
    biasView: viewFloat(floatBuffer, layer.bias),
  }));
  const int8Layers = metadata.int8.layers.map((layer) => ({
    ...layer,
    biasView: viewFloat(int8Buffer, layer.bias),
  }));

  const inferBaseline = (features) => {
    let values = normalize(features, metadata);
    for (let index = 0; index < floatLayers.length; index += 1) {
      const layer = floatLayers[index];
      values = denseFloat(values, layer.weightsView, layer.biasView, layer.outputs);
      if (index < floatLayers.length - 1) values = relu(values);
    }
    return softmax(values);
  };

  const quantizeInto = (values, scale, address) => {
    const target = new Int8Array(memory.buffer, address, values.length);
    for (let index = 0; index < values.length; index += 1) {
      target[index] = Math.max(-127, Math.min(127, Math.round(values[index] / scale)));
    }
  };

  const inferOptimized = (features) => {
    let values = normalize(features, metadata);
    const inputAddresses = [0, 8192, 16384];
    const outputAddresses = [4096, 12288, 20480];
    for (let index = 0; index < int8Layers.length; index += 1) {
      const layer = int8Layers[index];
      quantizeInto(values, layer.activationScale, inputAddresses[index]);
      dense(inputAddresses[index], int8WeightAddresses[index], outputAddresses[index], layer.inputs, layer.outputs);
      const integers = new Int32Array(memory.buffer, outputAddresses[index], layer.outputs);
      values = Float32Array.from(integers, (value, row) =>
        value * layer.activationScale * layer.weightScale + layer.biasView[row]);
      if (index < int8Layers.length - 1) values = relu(values);
    }
    return softmax(values);
  };

  return {
    metadata,
    inferBaseline,
    inferOptimized,
    infer(features, engine = "optimized") {
      if (engine === "baseline") return inferBaseline(features);
      if (engine === "optimized") return inferOptimized(features);
      throw new Error(`Unknown engine: ${engine}`);
    },
    assessDistribution(features) {
      const values = normalize(features, metadata);
      let nearestDistance = Infinity;
      let nearestLabel = metadata.labels[0];
      for (let label = 0; label < metadata.ood.centroids.length; label += 1) {
        let total = 0;
        const centroid = metadata.ood.centroids[label];
        for (let index = 0; index < values.length; index += 1) total += (values[index] - centroid[index]) ** 2;
        const distance = total / values.length;
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestLabel = metadata.labels[label];
        }
      }
      return {
        inDistribution: nearestDistance <= metadata.ood.threshold,
        distance: Number(nearestDistance.toFixed(6)),
        threshold: Number(metadata.ood.threshold.toFixed(6)),
        nearestLabel,
      };
    },
  };
}
