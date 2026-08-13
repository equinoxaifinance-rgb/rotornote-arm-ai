import { createHash } from "node:crypto";

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");
const argmax = (values) => values.reduce((best, value, index) => value > values[best] ? index : best, 0);

function denseFloat(input, layer) {
  return Float32Array.from({ length: layer.outputs }, (_, output) => {
    let total = layer.bias[output];
    for (let inputIndex = 0; inputIndex < layer.inputs; inputIndex += 1) total += input[inputIndex] * layer.weights[output * layer.inputs + inputIndex];
    return total;
  });
}

const relu = (values) => Float32Array.from(values, (value) => Math.max(0, value));
const softmax = (logits) => {
  const maximum = Math.max(...logits);
  const values = Array.from(logits, (value) => Math.exp(value - maximum));
  const total = values.reduce((sum, value) => sum + value, 0);
  return values.map((value) => value / total);
};
const quantize = (values, scale) => Int8Array.from(values, (value) => Math.max(-127, Math.min(127, Math.round(value / scale))));

function validateSource({ architecture, layers, calibrationRows }) {
  if (!Array.isArray(architecture) || architecture.length < 2 || architecture.some((value) => !Number.isInteger(value) || value < 1)) throw new Error("architecture must contain positive integer layer sizes");
  if (!Array.isArray(layers) || layers.length !== architecture.length - 1) throw new Error("layer count does not match architecture");
  for (let index = 0; index < layers.length; index += 1) {
    if (layers[index].weights.length !== architecture[index] * architecture[index + 1]) throw new Error(`layer ${index} weight shape mismatch`);
    if (layers[index].bias.length !== architecture[index + 1]) throw new Error(`layer ${index} bias shape mismatch`);
    if ([...layers[index].weights, ...layers[index].bias].some((value) => !Number.isFinite(value))) throw new Error(`layer ${index} contains non-finite parameters`);
  }
  if (!Array.isArray(calibrationRows) || calibrationRows.length < 1 || calibrationRows.some((row) => row.length !== architecture[0] || [...row].some((value) => !Number.isFinite(value)))) throw new Error("calibration rows do not match finite model input");
}

/** Compile a dense ReLU classifier into deterministic FP32 and row-wise INT8 artifacts.
 * Calibration rows must already be normalized exactly as the runtime will see them.
 */
export function compileDenseModel({ architecture, layers: sourceLayers, calibrationRows, parity = {} }) {
  validateSource({ architecture, layers: sourceLayers, calibrationRows });
  const layers = sourceLayers.map((layer, index) => ({
    name: layer.name ?? (index === sourceLayers.length - 1 ? "logits" : `relu_${index + 1}`),
    inputs: architecture[index],
    outputs: architecture[index + 1],
    weights: Float32Array.from(layer.weights),
    bias: Float32Array.from(layer.bias),
  }));
  const baseline = (input) => {
    let values = input;
    for (let index = 0; index < layers.length; index += 1) {
      values = denseFloat(values, layers[index]);
      if (index < layers.length - 1) values = relu(values);
    }
    return softmax(values);
  };
  const quantizedLayers = layers.map((layer) => {
    const weightScales = Array.from({ length: layer.outputs }, (_, output) => {
      let maximum = 0;
      for (let input = 0; input < layer.inputs; input += 1) maximum = Math.max(maximum, Math.abs(layer.weights[output * layer.inputs + input]));
      return maximum === 0 ? 1 : maximum / 127;
    });
    const weights = new Int8Array(layer.weights.length);
    for (let output = 0; output < layer.outputs; output += 1) {
      const offset = output * layer.inputs;
      weights.set(quantize(layer.weights.subarray(offset, offset + layer.inputs), weightScales[output]), offset);
    }
    return { ...layer, weights, weightScales };
  });
  const optimized = (input) => {
    let values = input;
    for (let index = 0; index < quantizedLayers.length; index += 1) {
      const layer = quantizedLayers[index];
      let maximum = 0;
      for (const value of values) maximum = Math.max(maximum, Math.abs(value));
      const inputScale = maximum === 0 ? 1 : maximum / 127;
      const quantizedInput = quantize(values, inputScale);
      values = Float32Array.from({ length: layer.outputs }, (_, output) => {
        let total = 0;
        for (let input = 0; input < layer.inputs; input += 1) total += quantizedInput[input] * layer.weights[output * layer.inputs + input];
        return total * inputScale * layer.weightScales[output] + layer.bias[output];
      });
      if (index < quantizedLayers.length - 1) values = relu(values);
    }
    return softmax(values);
  };

  const hiddenActivationCounts = layers.slice(0, -1).map((layer) => new Uint32Array(layer.outputs));
  let agreement = 0;
  const probabilityDeltas = [];
  let maximumProbabilityDelta = 0;
  for (const row of calibrationRows) {
    let values = row;
    for (let index = 0; index < layers.length - 1; index += 1) {
      values = relu(denseFloat(values, layers[index]));
      for (let unit = 0; unit < values.length; unit += 1) if (values[unit] > 0) hiddenActivationCounts[index][unit] += 1;
    }
    const left = baseline(row);
    const right = optimized(row);
    if (argmax(left) === argmax(right)) agreement += 1;
    for (let index = 0; index < left.length; index += 1) {
      const delta = Math.abs(left[index] - right[index]);
      probabilityDeltas.push(delta);
      maximumProbabilityDelta = Math.max(maximumProbabilityDelta, delta);
    }
  }
  probabilityDeltas.sort((left, right) => left - right);
  const labelAgreement = agreement / calibrationRows.length;
  const p99ProbabilityDelta = probabilityDeltas[Math.floor((probabilityDeltas.length - 1) * 0.99)];
  const minimumAgreement = parity.minimumAgreement ?? 1;
  const maximumP99Delta = parity.maximumP99Delta ?? 0.05;
  const maximumDelta = parity.maximumDelta ?? 0.2;
  if (labelAgreement < minimumAgreement || p99ProbabilityDelta >= maximumP99Delta || maximumProbabilityDelta >= maximumDelta) throw new Error(`INT8 parity failed: agreement=${labelAgreement}, p99=${p99ProbabilityDelta}, max=${maximumProbabilityDelta}`);

  const utilization = hiddenActivationCounts.map((counts, index) => {
    const rates = Array.from(counts, (count) => count / calibrationRows.length);
    return { layer: layers[index].name, units: counts.length, activeUnits: rates.filter((rate) => rate > 0).length, minimumActivationRate: Math.min(...rates), maximumActivationRate: Math.max(...rates) };
  });
  let floatOffset = 0;
  const floatChunks = [];
  const floatDescriptors = [];
  for (const layer of layers) {
    const weightBytes = Buffer.from(layer.weights.buffer, layer.weights.byteOffset, layer.weights.byteLength);
    const biasBytes = Buffer.from(layer.bias.buffer, layer.bias.byteOffset, layer.bias.byteLength);
    const weights = { offset: floatOffset, length: layer.weights.length };
    floatChunks.push(weightBytes); floatOffset += weightBytes.length;
    const bias = { offset: floatOffset, length: layer.bias.length };
    floatChunks.push(biasBytes); floatOffset += biasBytes.length;
    floatDescriptors.push({ name: layer.name, inputs: layer.inputs, outputs: layer.outputs, weights, bias });
  }
  const floatBuffer = Buffer.concat(floatChunks);
  let int8Offset = 0;
  const int8Chunks = [];
  const int8Descriptors = [];
  for (const layer of quantizedLayers) {
    const weightStride = Math.ceil(layer.inputs / 16) * 16;
    const weightBytes = Buffer.alloc(weightStride * layer.outputs);
    for (let output = 0; output < layer.outputs; output += 1) {
      const source = Buffer.from(layer.weights.buffer, layer.weights.byteOffset + output * layer.inputs, layer.inputs);
      source.copy(weightBytes, output * weightStride);
    }
    const biasBytes = Buffer.from(layer.bias.buffer, layer.bias.byteOffset, layer.bias.byteLength);
    const weights = { offset: int8Offset, length: weightBytes.length, rowStride: weightStride };
    int8Chunks.push(weightBytes); int8Offset += weightBytes.length;
    if (int8Offset % 4) { const padding = Buffer.alloc(4 - (int8Offset % 4)); int8Chunks.push(padding); int8Offset += padding.length; }
    const bias = { offset: int8Offset, length: layer.bias.length };
    int8Chunks.push(biasBytes); int8Offset += biasBytes.length;
    int8Descriptors.push({ name: layer.name, inputs: layer.inputs, outputs: layer.outputs, weightScales: layer.weightScales, weights, bias });
  }
  const int8Buffer = Buffer.concat(int8Chunks);
  return {
    floatBuffer, int8Buffer,
    float: { bytes: floatBuffer.length, sha256: sha256(floatBuffer), layers: floatDescriptors },
    int8: { bytes: int8Buffer.length, sha256: sha256(int8Buffer), layers: int8Descriptors },
    parity: { calibrationRows: calibrationRows.length, labelAgreement, p99ProbabilityDelta, maximumProbabilityDelta },
    utilization,
    compute: { parameters: layers.reduce((total, layer) => total + layer.weights.length + layer.bias.length, 0), multiplyAccumulates: layers.reduce((total, layer) => total + layer.inputs * layer.outputs, 0) },
  };
}
