import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { extractFeatures, LABELS, mulberry32, simulateSignal } from "../src/signal.js";

const INPUTS = 48;
const HIDDEN_1 = 256;
const HIDDEN_2 = 128;
const OUTPUTS = LABELS.length;
const TRAIN_PER_CLASS = 180;
const VALIDATION_PER_CLASS = 45;

function gaussian(random) {
  const u = Math.max(random(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
}

function randomMatrix(outputs, inputs, random) {
  const values = new Float32Array(outputs * inputs);
  const scale = Math.sqrt(2 / inputs);
  for (let index = 0; index < values.length; index += 1) values[index] = gaussian(random) * scale;
  return values;
}

function dense(input, weights, bias, outputs) {
  const output = new Float32Array(outputs);
  for (let row = 0; row < outputs; row += 1) {
    let value = bias[row];
    const offset = row * input.length;
    for (let column = 0; column < input.length; column += 1) value += weights[offset + column] * input[column];
    output[row] = value;
  }
  return output;
}

function relu(values) {
  return Float32Array.from(values, (value) => Math.max(0, value));
}

function normalize(features, means, deviations) {
  return Float32Array.from(features, (value, index) => (value - means[index]) / deviations[index]);
}

function argmax(values) {
  let best = 0;
  for (let index = 1; index < values.length; index += 1) if (values[index] > values[best]) best = index;
  return best;
}

function quantize(values, scale) {
  return Int8Array.from(values, (value) => Math.max(-127, Math.min(127, Math.round(value / scale))));
}

function quantizedDense(input, weights, bias, inputScale, weightScale, outputs) {
  const result = new Float32Array(outputs);
  for (let row = 0; row < outputs; row += 1) {
    let total = 0;
    const offset = row * input.length;
    for (let column = 0; column < input.length; column += 1) total += input[column] * weights[offset + column];
    result[row] = total * inputScale * weightScale + bias[row];
  }
  return result;
}

const random = mulberry32(0x524f544f);
const training = [];
const validation = [];
for (let label = 0; label < LABELS.length; label += 1) {
  for (let sample = 0; sample < TRAIN_PER_CLASS + VALIDATION_PER_CLASS; sample += 1) {
    const seed = 100_000 * (label + 1) + sample * 37;
    const features = extractFeatures(simulateSignal(LABELS[label], 2048, 1024, seed));
    (sample < TRAIN_PER_CLASS ? training : validation).push({ features, label });
  }
}

const means = new Float32Array(INPUTS);
for (const { features } of training) for (let i = 0; i < INPUTS; i += 1) means[i] += features[i] / training.length;
const deviations = new Float32Array(INPUTS);
for (const { features } of training) {
  for (let i = 0; i < INPUTS; i += 1) deviations[i] += (features[i] - means[i]) ** 2 / training.length;
}
for (let i = 0; i < INPUTS; i += 1) deviations[i] = Math.max(Math.sqrt(deviations[i]), 1e-4);

const weights1 = randomMatrix(HIDDEN_1, INPUTS, random);
const bias1 = Float32Array.from({ length: HIDDEN_1 }, () => (random() - 0.5) * 0.08);
const weights2 = randomMatrix(HIDDEN_2, HIDDEN_1, random);
const bias2 = Float32Array.from({ length: HIDDEN_2 }, () => (random() - 0.5) * 0.05);

const embeddedTraining = training.map(({ features, label }) => {
  const input = normalize(features, means, deviations);
  const hidden1 = relu(dense(input, weights1, bias1, HIDDEN_1));
  const hidden2 = relu(dense(hidden1, weights2, bias2, HIDDEN_2));
  return { input, hidden1, hidden2, label };
});

const featureCentroids = Array.from({ length: OUTPUTS }, () => new Float64Array(INPUTS));
const featureCounts = new Uint32Array(OUTPUTS);
for (const { input, label } of embeddedTraining) {
  featureCounts[label] += 1;
  for (let i = 0; i < INPUTS; i += 1) featureCentroids[label][i] += input[i];
}
for (let label = 0; label < OUTPUTS; label += 1) {
  for (let i = 0; i < INPUTS; i += 1) featureCentroids[label][i] /= featureCounts[label];
}
const featureDistance = (input, centroid) => {
  let total = 0;
  for (let i = 0; i < INPUTS; i += 1) total += (input[i] - centroid[i]) ** 2;
  return total / INPUTS;
};
const trainingDistances = embeddedTraining
  .map(({ input, label }) => featureDistance(input, featureCentroids[label]))
  .sort((left, right) => left - right);
const oodQuantile = 0.995;
const oodThreshold = trainingDistances[Math.floor((trainingDistances.length - 1) * oodQuantile)];

const centroids = Array.from({ length: OUTPUTS }, () => new Float64Array(HIDDEN_2));
const counts = new Uint32Array(OUTPUTS);
for (const { hidden2, label } of embeddedTraining) {
  counts[label] += 1;
  for (let i = 0; i < HIDDEN_2; i += 1) centroids[label][i] += hidden2[i];
}
for (let label = 0; label < OUTPUTS; label += 1) {
  for (let i = 0; i < HIDDEN_2; i += 1) centroids[label][i] /= counts[label];
}

let withinDistance = 0;
for (const { hidden2, label } of embeddedTraining) {
  for (let i = 0; i < HIDDEN_2; i += 1) withinDistance += (hidden2[i] - centroids[label][i]) ** 2;
}
withinDistance /= embeddedTraining.length;
const temperature = Math.max(withinDistance / 6, 0.05);
const weights3 = new Float32Array(OUTPUTS * HIDDEN_2);
const bias3 = new Float32Array(OUTPUTS);
for (let label = 0; label < OUTPUTS; label += 1) {
  let norm = 0;
  for (let i = 0; i < HIDDEN_2; i += 1) {
    weights3[label * HIDDEN_2 + i] = (2 * centroids[label][i]) / temperature;
    norm += centroids[label][i] ** 2;
  }
  bias3[label] = -norm / temperature;
}

const layers = [
  { name: "dense1", weights: weights1, bias: bias1, inputs: INPUTS, outputs: HIDDEN_1 },
  { name: "dense2", weights: weights2, bias: bias2, inputs: HIDDEN_1, outputs: HIDDEN_2 },
  { name: "logits", weights: weights3, bias: bias3, inputs: HIDDEN_2, outputs: OUTPUTS },
];

let maxInput = 0;
let maxHidden1 = 0;
let maxHidden2 = 0;
for (const row of embeddedTraining) {
  for (const value of row.input) maxInput = Math.max(maxInput, Math.abs(value));
  for (const value of row.hidden1) maxHidden1 = Math.max(maxHidden1, Math.abs(value));
  for (const value of row.hidden2) maxHidden2 = Math.max(maxHidden2, Math.abs(value));
}
const activationScales = [maxInput / 120, maxHidden1 / 120, maxHidden2 / 120];
const weightScales = layers.map(({ weights }) => Math.max(...weights.map(Math.abs)) / 127);
const quantizedWeights = layers.map(({ weights }, index) => quantize(weights, weightScales[index]));

function inferFloat(features) {
  const input = normalize(features, means, deviations);
  const hidden1 = relu(dense(input, weights1, bias1, HIDDEN_1));
  const hidden2 = relu(dense(hidden1, weights2, bias2, HIDDEN_2));
  return dense(hidden2, weights3, bias3, OUTPUTS);
}

function inferQuantized(features) {
  const input = quantize(normalize(features, means, deviations), activationScales[0]);
  const hidden1Float = relu(quantizedDense(input, quantizedWeights[0], bias1, activationScales[0], weightScales[0], HIDDEN_1));
  const hidden1 = quantize(hidden1Float, activationScales[1]);
  const hidden2Float = relu(quantizedDense(hidden1, quantizedWeights[1], bias2, activationScales[1], weightScales[1], HIDDEN_2));
  const hidden2 = quantize(hidden2Float, activationScales[2]);
  return quantizedDense(hidden2, quantizedWeights[2], bias3, activationScales[2], weightScales[2], OUTPUTS);
}

let floatCorrect = 0;
let quantizedCorrect = 0;
let agreement = 0;
let validationInsideEnvelope = 0;
for (const row of validation) {
  const floatPrediction = argmax(inferFloat(row.features));
  const quantizedPrediction = argmax(inferQuantized(row.features));
  if (floatPrediction === row.label) floatCorrect += 1;
  if (quantizedPrediction === row.label) quantizedCorrect += 1;
  if (floatPrediction === quantizedPrediction) agreement += 1;
  const normalized = normalize(row.features, means, deviations);
  const nearestDistance = Math.min(...featureCentroids.map((centroid) => featureDistance(normalized, centroid)));
  if (nearestDistance <= oodThreshold) validationInsideEnvelope += 1;
}
if (floatCorrect / validation.length < 0.95 || quantizedCorrect / validation.length < 0.95 || agreement !== validation.length || validationInsideEnvelope / validation.length < 0.94) {
  throw new Error(`Model validation gate failed: float=${floatCorrect}, int8=${quantizedCorrect}, agreement=${agreement}, total=${validation.length}`);
}

const floatParts = [];
const floatLayout = [];
let floatOffset = 0;
for (const layer of layers) {
  const weights = Buffer.from(layer.weights.buffer, layer.weights.byteOffset, layer.weights.byteLength);
  const bias = Buffer.from(layer.bias.buffer, layer.bias.byteOffset, layer.bias.byteLength);
  floatLayout.push({
    name: layer.name,
    inputs: layer.inputs,
    outputs: layer.outputs,
    weights: { offset: floatOffset, length: layer.weights.length },
    bias: { offset: floatOffset + weights.length, length: layer.bias.length },
  });
  floatParts.push(weights, bias);
  floatOffset += weights.length + bias.length;
}

const int8Parts = [];
const int8Layout = [];
let int8Offset = 0;
for (let index = 0; index < layers.length; index += 1) {
  const weights = Buffer.from(quantizedWeights[index].buffer, quantizedWeights[index].byteOffset, quantizedWeights[index].byteLength);
  const bias = Buffer.from(layers[index].bias.buffer, layers[index].bias.byteOffset, layers[index].bias.byteLength);
  int8Layout.push({
    name: layers[index].name,
    inputs: layers[index].inputs,
    outputs: layers[index].outputs,
    weightScale: weightScales[index],
    activationScale: activationScales[index],
    weights: { offset: int8Offset, length: quantizedWeights[index].length },
    bias: { offset: int8Offset + weights.length, length: layers[index].bias.length },
  });
  int8Parts.push(weights, bias);
  int8Offset += weights.length + bias.length;
}

const floatBuffer = Buffer.concat(floatParts);
const int8Buffer = Buffer.concat(int8Parts);
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");
const metadata = {
  format: "rotornote-elm-v1",
  seed: "0x524f544f",
  labels: LABELS,
  inputFeatures: INPUTS,
  architecture: [INPUTS, HIDDEN_1, HIDDEN_2, OUTPUTS],
  training: {
    method: "supervised extreme learning machine on deterministic physics-inspired simulations",
    samples: training.length,
    validationSamples: validation.length,
    floatAccuracy: floatCorrect / validation.length,
    int8Accuracy: quantizedCorrect / validation.length,
    engineAgreement: agreement / validation.length,
  },
  normalization: { means: Array.from(means), deviations: Array.from(deviations) },
  ood: {
    method: "mean squared normalized-feature distance to nearest training-class centroid",
    trainingQuantile: oodQuantile,
    threshold: oodThreshold,
    validationCoverage: validationInsideEnvelope / validation.length,
    centroids: featureCentroids.map((centroid) => Array.from(centroid)),
  },
  activationScales,
  float: { file: "rotornote-fp32.bin", bytes: floatBuffer.length, sha256: sha256(floatBuffer), layers: floatLayout },
  int8: { file: "rotornote-int8.bin", bytes: int8Buffer.length, sha256: sha256(int8Buffer), layers: int8Layout },
};

const modelDirectory = new URL("../model/", import.meta.url);
await mkdir(modelDirectory, { recursive: true });
await writeFile(new URL("rotornote-fp32.bin", modelDirectory), floatBuffer);
await writeFile(new URL("rotornote-int8.bin", modelDirectory), int8Buffer);
await writeFile(new URL("model.json", modelDirectory), `${JSON.stringify(metadata, null, 2)}\n`);
console.log(JSON.stringify(metadata.training));
console.log(`built fp32=${floatBuffer.length} bytes int8=${int8Buffer.length} bytes`);
