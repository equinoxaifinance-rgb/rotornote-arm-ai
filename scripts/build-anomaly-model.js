import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { compileDenseModel } from "../src/dense-compiler.js";

const TRAINING_URL = new URL("../field/training/", import.meta.url);
const RESULTS_URL = new URL("../field/results/", import.meta.url);
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");
const canonicalTextBytes = (buffer) => Buffer.from(buffer.toString("utf8").replace(/\r\n/g, "\n"));
const [manifestText, exportText, validationBytes, featureBuffer, labelBuffer, groupBuffer] = await Promise.all([
  readFile(new URL("upatras-manifest.json", TRAINING_URL), "utf8"),
  readFile(new URL("upatras-deep-export.json", TRAINING_URL), "utf8"),
  readFile(new URL("upatras-grouped-anomaly.json", RESULTS_URL)),
  readFile(new URL("upatras-features.f32", TRAINING_URL)),
  readFile(new URL("upatras-labels.u8", TRAINING_URL)),
  readFile(new URL("upatras-groups.u8", TRAINING_URL)),
]);
const manifest = JSON.parse(manifestText);
const exported = JSON.parse(exportText);
const validation = JSON.parse(validationBytes);
if (manifest.format !== "rotornote-upatras-features-v1" || exported.format !== "rotornote-upatras-mlp-export-v1") throw new Error("UPATRAS model source contract mismatch");
if (sha256(featureBuffer) !== manifest.featuresSha256 || sha256(labelBuffer) !== manifest.labelsSha256 || sha256(groupBuffer) !== manifest.groupsSha256) throw new Error("UPATRAS source artifact integrity failed");
if (exported.sourceFeatureSha256 !== manifest.featuresSha256 || validation.modelExportSha256 !== sha256(Buffer.from(exportText))) throw new Error("UPATRAS export receipt binding failed");
const inputFeatures = manifest.featureCount * manifest.featureWindowsPerSignal;
if (exported.architecture[0] !== inputFeatures || exported.architecture.at(-1) !== exported.labels.length || exported.architecture.length < 4 || exported.broadOutput?.labels?.length !== 2) throw new Error("UPATRAS network architecture mismatch");

const featureRows = new Float32Array(featureBuffer.buffer, featureBuffer.byteOffset, featureBuffer.byteLength / 4);
const signalFeatures = featureRows;
const labels = new Uint8Array(labelBuffer.buffer, labelBuffer.byteOffset, labelBuffer.byteLength);
const means = Float32Array.from(exported.normalization.means);
const deviations = Float32Array.from(exported.normalization.deviations);
const normalizedRows = Array.from({ length: manifest.signals }, (_, signal) => Float32Array.from(signalFeatures.subarray(signal * inputFeatures, (signal + 1) * inputFeatures), (value, feature) => (value - means[feature]) / deviations[feature]));
const layers = exported.layers.map((layer, index) => ({
  name: index === exported.layers.length - 1 ? "anomaly_logits" : `relu_${index + 1}`,
  inputs: exported.architecture[index],
  outputs: exported.architecture[index + 1],
  weights: Float32Array.from(layer.weights.flat()),
  bias: Float32Array.from(layer.bias),
}));
for (const layer of layers) if (layer.weights.length !== layer.inputs * layer.outputs || layer.bias.length !== layer.outputs) throw new Error(`Malformed layer ${layer.name}`);

const denseFloat = (input, layer) => Float32Array.from({ length: layer.outputs }, (_, output) => {
  let total = layer.bias[output];
  for (let inputIndex = 0; inputIndex < layer.inputs; inputIndex += 1) total += input[inputIndex] * layer.weights[output * layer.inputs + inputIndex];
  return total;
});
const relu = (values) => Float32Array.from(values, (value) => Math.max(0, value));
const softmax = (logits) => {
  const maximum = Math.max(...logits);
  const values = Array.from(logits, (value) => Math.exp(value - maximum));
  const total = values.reduce((sum, value) => sum + value, 0);
  return values.map((value) => value / total);
};
const baseline = (input) => {
  let values = input;
  for (let index = 0; index < layers.length; index += 1) {
    values = denseFloat(values, layers[index]);
    if (index < layers.length - 1) values = relu(values);
  }
  return softmax(values);
};
const quantize = (values, scale) => Int8Array.from(values, (value) => Math.max(-127, Math.min(127, Math.round(value / scale))));
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
for (const row of normalizedRows) {
  let values = row;
  for (let index = 0; index < layers.length - 1; index += 1) {
    values = relu(denseFloat(values, layers[index]));
    for (let unit = 0; unit < values.length; unit += 1) if (values[unit] > 0) hiddenActivationCounts[index][unit] += 1;
  }
}
const utilization = hiddenActivationCounts.map((counts, index) => {
  const rates = Array.from(counts, (count) => count / normalizedRows.length);
  const rowMaxima = Array.from({ length: layers[index].outputs }, (_, output) => {
    let maximum = 0;
    for (let input = 0; input < layers[index].inputs; input += 1) maximum = Math.max(maximum, Math.abs(layers[index].weights[output * layers[index].inputs + input]));
    return maximum;
  });
  return {
    layer: layers[index].name,
    units: counts.length,
    activeUnits: rates.filter((rate) => rate > 0).length,
    minimumActivationRate: Math.min(...rates),
    maximumActivationRate: Math.max(...rates),
    rowsBelowMaximumWeight1e6: rowMaxima.filter((value) => value < 1e-6).length,
    minimumRowMaximumWeight: Math.min(...rowMaxima),
  };
});
const argmax = (values) => values.reduce((best, value, index) => value > values[best] ? index : best, 0);
let agreement = 0;
const probabilityDeltas = [];
let maximumProbabilityDelta = 0;
for (const row of normalizedRows) {
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
const labelAgreement = agreement / normalizedRows.length;
const p99ProbabilityDelta = probabilityDeltas[Math.floor((probabilityDeltas.length - 1) * 0.99)];
if (labelAgreement !== 1 || p99ProbabilityDelta >= 0.05 || maximumProbabilityDelta >= 0.2) throw new Error(`UPATRAS INT8 parity failed: agreement=${labelAgreement}, p99=${p99ProbabilityDelta}, max=${maximumProbabilityDelta}`);

const centroids = Array.from({ length: 2 }, () => new Float64Array(inputFeatures));
const counts = new Uint32Array(2);
for (let row = 0; row < normalizedRows.length; row += 1) {
  const label = labels[row];
  counts[label] += 1;
  for (let feature = 0; feature < inputFeatures; feature += 1) centroids[label][feature] += normalizedRows[row][feature];
}
for (let label = 0; label < 2; label += 1) for (let feature = 0; feature < inputFeatures; feature += 1) centroids[label][feature] /= counts[label];
const distance = (values, centroid) => values.reduce((total, value, index) => total + (value - centroid[index]) ** 2, 0) / values.length;
const distances = normalizedRows.map((row, index) => distance(row, centroids[labels[index]])).sort((left, right) => left - right);
const oodQuantile = 0.995;
const oodThreshold = distances[Math.floor((distances.length - 1) * oodQuantile)];

let floatOffset = 0;
const floatChunks = [];
const floatDescriptors = [];
for (const layer of layers) {
  const weightBytes = Buffer.from(layer.weights.buffer, layer.weights.byteOffset, layer.weights.byteLength);
  const biasBytes = Buffer.from(layer.bias.buffer, layer.bias.byteOffset, layer.bias.byteLength);
  const weights = { offset: floatOffset, length: layer.weights.length };
  floatChunks.push(weightBytes);
  floatOffset += weightBytes.length;
  const bias = { offset: floatOffset, length: layer.bias.length };
  floatChunks.push(biasBytes);
  floatOffset += biasBytes.length;
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
  int8Chunks.push(weightBytes);
  int8Offset += weightBytes.length;
  if (int8Offset % 4) {
    const padding = Buffer.alloc(4 - (int8Offset % 4));
    int8Chunks.push(padding);
    int8Offset += padding.length;
  }
  const bias = { offset: int8Offset, length: layer.bias.length };
  int8Chunks.push(biasBytes);
  int8Offset += biasBytes.length;
  int8Descriptors.push({ name: layer.name, inputs: layer.inputs, outputs: layer.outputs, weightScales: layer.weightScales, weights, bias });
}
const int8Buffer = Buffer.concat(int8Chunks);
const reusableCompiled = compileDenseModel({
  architecture: exported.architecture,
  layers: layers.map((layer) => ({ name: layer.name, weights: layer.weights, bias: layer.bias })),
  calibrationRows: normalizedRows,
});
if (!floatBuffer.equals(reusableCompiled.floatBuffer) || !int8Buffer.equals(reusableCompiled.int8Buffer)) throw new Error("Reusable dense compiler diverged from the production artifact build");
const metadata = {
  format: "rotornote-upatras-mlp-v1",
  seed: exported.seed,
  labels: exported.labels,
  broadOutput: exported.broadOutput,
  inputFeatures,
  architecture: exported.architecture,
  training: {
    method: `class-balanced ${exported.architecture.join("-to-")} ReLU MLP over an ordered pair of measured temporal feature windows per speed signal; inactive production units pruned with zero fitted-bank logit drift`,
    pruning: exported.training,
    dataKind: "real experimental vibration only",
    source: manifest.sourceDataset,
    sourceInnerArchiveSha256: manifest.sourceInnerArchiveSha256,
    featureArtifactSha256: manifest.featuresSha256,
    sourceFeatureRows: manifest.featureRows,
    speedSignals: manifest.signals,
    measurementSequences: manifest.measurementSequences,
    validationProtocol: exported.validationProtocol,
    groupedValidationReceipt: "field/results/upatras-grouped-anomaly.json",
    groupedValidationSha256: sha256(canonicalTextBytes(validationBytes)),
    conditionBalancedAccuracy: validation.aggregate.conditionBalancedAccuracy,
    broadAnomalyBalancedAccuracy: validation.aggregate.broadAnomalyBalancedAccuracy,
    measurementSequenceAccuracy: validation.aggregate.measurementSequenceAccuracy,
    measurementSequenceAccuracyWilson95: validation.aggregate.measurementSequenceAccuracyWilson95,
    operatingRpmRange: manifest.operatingRpmRange,
    engineLabelAgreement: labelAgreement,
    p99ProbabilityDelta,
    maximumProbabilityDelta,
  },
  decisionPolicy: {
    minimumConfidence: 0.9,
    basis: "conservative observed grouped-CV floor; output scores are not field-calibrated failure probabilities",
    groupedValidation: validation.aggregate.riskCoverage.find((row) => row.minimumConfidence === 0.9),
    riskCoverage: validation.aggregate.riskCoverage,
  },
  normalization: { means: Array.from(means), deviations: Array.from(deviations) },
  ood: { method: "mean squared normalized-feature distance to nearest real-training broad class centroid", labels: exported.broadOutput.labels, trainingQuantile: oodQuantile, threshold: oodThreshold, centroids: centroids.map((centroid) => Array.from(centroid)) },
  quantization: { activations: "dynamic symmetric per layer", weights: "symmetric per output row" },
  compiler: {
    module: "src/dense-compiler.js",
    deterministicArtifactCrossCheck: true,
    parameters: reusableCompiled.compute.parameters,
    multiplyAccumulatesPerInference: reusableCompiled.compute.multiplyAccumulates,
    calibrationRows: reusableCompiled.parity.calibrationRows,
  },
  utilization: { source: "all 2,925 real training-bank signal representations", hiddenLayers: utilization },
  float: { file: "rotornote-anomaly-fp32.bin", bytes: floatBuffer.length, sha256: sha256(floatBuffer), layers: floatDescriptors },
  int8: { file: "rotornote-anomaly-int8.bin", bytes: int8Buffer.length, sha256: sha256(int8Buffer), layers: int8Descriptors },
};
const modelDirectory = new URL("../model/", import.meta.url);
await mkdir(modelDirectory, { recursive: true });
await Promise.all([
  writeFile(new URL(metadata.float.file, modelDirectory), floatBuffer),
  writeFile(new URL(metadata.int8.file, modelDirectory), int8Buffer),
  writeFile(new URL("anomaly-model.json", modelDirectory), `${JSON.stringify(metadata, null, 2)}\n`),
]);
console.log(JSON.stringify(metadata.training));
console.log(`built anomaly fp32=${floatBuffer.length} bytes int8=${int8Buffer.length} bytes`);
