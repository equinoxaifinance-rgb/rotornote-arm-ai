import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { FEATURE_COUNT, LABELS } from "../src/signal.js";

const TRAINING_URL = new URL("../field/training/", import.meta.url);
const RESULTS_URL = new URL("../field/results/", import.meta.url);
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");
const canonicalTextBytes = (buffer) => Buffer.from(buffer.toString("utf8").replace(/\r\n/g, "\n"));

const [manifestText, exportText, validationBytes, featureBuffer, labelBuffer] = await Promise.all([
  readFile(new URL("mechanical-manifest.json", TRAINING_URL), "utf8"),
  readFile(new URL("linear-export.json", TRAINING_URL), "utf8"),
  readFile(new URL("open-grouped-cross-validation.json", RESULTS_URL)),
  readFile(new URL("mechanical-features.f32", TRAINING_URL)),
  readFile(new URL("mechanical-labels.u8", TRAINING_URL)),
]);
const sourceManifest = JSON.parse(manifestText);
const exported = JSON.parse(exportText);
const validation = JSON.parse(validationBytes);
if (sourceManifest.format !== "rotornote-real-features-v1" || exported.format !== "rotornote-real-lda-export-v3") {
  throw new Error("Real model source contract mismatch");
}
if (JSON.stringify(exported.labels) !== JSON.stringify(LABELS) || exported.featureCount !== FEATURE_COUNT) {
  throw new Error("Real model label or feature contract mismatch");
}
if (sha256(featureBuffer) !== sourceManifest.featuresSha256 || sha256(labelBuffer) !== sourceManifest.labelsSha256 || exported.sourceFeatureSha256 !== sourceManifest.featuresSha256) {
  throw new Error("Real model source integrity check failed");
}
if (validation.modelExportSha256 !== sha256(Buffer.from(exportText))) {
  throw new Error("Grouped validation receipt does not bind the production export");
}

const sourceRows = sourceManifest.rows;
const rowsPerRecording = sourceManifest.channelsPerFile * sourceManifest.windowsPerChannel;
const rows = sourceRows / rowsPerRecording;
const outputs = LABELS.length;
const sourceFeatures = new Float32Array(featureBuffer.buffer, featureBuffer.byteOffset, featureBuffer.length / 4);
const features = new Float32Array(rows * FEATURE_COUNT);
const recordingLabels = new Uint8Array(rows);
for (let recording = 0; recording < rows; recording += 1) {
  const sourceStart = recording * rowsPerRecording;
  recordingLabels[recording] = labelBuffer[sourceStart];
  for (let row = sourceStart; row < sourceStart + rowsPerRecording; row += 1) {
    if (labelBuffer[row] !== recordingLabels[recording]) throw new Error("Recording label boundary failed");
    for (let feature = 0; feature < FEATURE_COUNT; feature += 1) {
      features[recording * FEATURE_COUNT + feature] += sourceFeatures[row * FEATURE_COUNT + feature] / rowsPerRecording;
    }
  }
}
const means = Float32Array.from(exported.normalization.means);
const deviations = Float32Array.from(exported.normalization.deviations);
const weights = Float32Array.from(exported.weights.flat());
const bias = Float32Array.from(exported.bias);
const normalize = (row) => Float32Array.from(row, (value, index) => (value - means[index]) / deviations[index]);
const argmax = (values) => values.reduce((best, value, index) => value > values[best] ? index : best, 0);
const softmax = (logits) => {
  const maximum = Math.max(...logits);
  const values = Array.from(logits, (value) => Math.exp(value - maximum));
  const total = values.reduce((sum, value) => sum + value, 0);
  return values.map((value) => value / total);
};
const denseFloat = (input) => Float32Array.from({ length: outputs }, (_, output) => {
  let total = bias[output];
  for (let inputIndex = 0; inputIndex < FEATURE_COUNT; inputIndex += 1) total += input[inputIndex] * weights[output * FEATURE_COUNT + inputIndex];
  return total;
});

const normalizedRows = [];
for (let row = 0; row < rows; row += 1) {
  const normalized = normalize(features.subarray(row * FEATURE_COUNT, (row + 1) * FEATURE_COUNT));
  normalizedRows.push(normalized);
}
const quantize = (values, scale) => Int8Array.from(values, (value) => Math.max(-127, Math.min(127, Math.round(value / scale))));
const weightScales = Array.from({ length: outputs }, (_, output) => {
  let maximum = 0;
  const offset = output * FEATURE_COUNT;
  for (let inputIndex = 0; inputIndex < FEATURE_COUNT; inputIndex += 1) maximum = Math.max(maximum, Math.abs(weights[offset + inputIndex]));
  return maximum / 127;
});
const quantizedWeights = new Int8Array(weights.length);
for (let output = 0; output < outputs; output += 1) {
  const offset = output * FEATURE_COUNT;
  quantizedWeights.set(quantize(weights.subarray(offset, offset + FEATURE_COUNT), weightScales[output]), offset);
}
const denseQuantized = (input, inputScale) => Float32Array.from({ length: outputs }, (_, output) => {
  let total = 0;
  for (let inputIndex = 0; inputIndex < FEATURE_COUNT; inputIndex += 1) total += input[inputIndex] * quantizedWeights[output * FEATURE_COUNT + inputIndex];
  return total * inputScale * weightScales[output] + bias[output];
});

let agreement = 0;
let maximumProbabilityDelta = 0;
const probabilityDeltas = [];
const floatRows = [];
const int8Rows = [];
for (const normalized of normalizedRows) {
  const floatProbabilities = softmax(denseFloat(normalized));
  const maximumInput = Math.max(...normalized.map(Math.abs));
  const inputScale = maximumInput === 0 ? 1 : maximumInput / 127;
  const int8Probabilities = softmax(denseQuantized(quantize(normalized, inputScale), inputScale));
  floatRows.push(floatProbabilities);
  int8Rows.push(int8Probabilities);
  if (argmax(floatProbabilities) === argmax(int8Probabilities)) agreement += 1;
  for (let index = 0; index < outputs; index += 1) {
    const delta = Math.abs(floatProbabilities[index] - int8Probabilities[index]);
    probabilityDeltas.push(delta);
    maximumProbabilityDelta = Math.max(maximumProbabilityDelta, delta);
  }
}
const engineAgreement = agreement / rows;
probabilityDeltas.sort((left, right) => left - right);
const p99ProbabilityDelta = probabilityDeltas[Math.floor((probabilityDeltas.length - 1) * 0.99)];
let recordingAgreementCount = 0;
for (let row = 0; row < rows; row += 1) {
  if (argmax(floatRows[row]) === argmax(int8Rows[row])) recordingAgreementCount += 1;
}
const recordingEngineAgreement = recordingAgreementCount / rows;
if (engineAgreement < 0.995 || recordingEngineAgreement < 0.999 || p99ProbabilityDelta > 0.05) {
  throw new Error(`INT8 parity gate failed: windowAgreement=${engineAgreement}, recordingAgreement=${recordingEngineAgreement}, p99Delta=${p99ProbabilityDelta}, maxDelta=${maximumProbabilityDelta}`);
}

const centroids = Array.from({ length: outputs }, () => new Float64Array(FEATURE_COUNT));
const counts = new Uint32Array(outputs);
for (let row = 0; row < rows; row += 1) {
  const label = recordingLabels[row];
  counts[label] += 1;
  for (let index = 0; index < FEATURE_COUNT; index += 1) centroids[label][index] += normalizedRows[row][index];
}
for (let label = 0; label < outputs; label += 1) for (let index = 0; index < FEATURE_COUNT; index += 1) centroids[label][index] /= counts[label];
const distance = (values, centroid) => values.reduce((total, value, index) => total + (value - centroid[index]) ** 2, 0) / FEATURE_COUNT;
const distances = normalizedRows.map((values, row) => distance(values, centroids[recordingLabels[row]])).sort((left, right) => left - right);
const oodQuantile = 0.995;
const oodThreshold = distances[Math.floor((distances.length - 1) * oodQuantile)];

const floatBuffer = Buffer.concat([
  Buffer.from(weights.buffer, weights.byteOffset, weights.byteLength),
  Buffer.from(bias.buffer, bias.byteOffset, bias.byteLength),
]);
const int8Buffer = Buffer.concat([
  Buffer.from(quantizedWeights.buffer, quantizedWeights.byteOffset, quantizedWeights.byteLength),
  Buffer.from(bias.buffer, bias.byteOffset, bias.byteLength),
]);
const metadata = {
  format: "rotornote-real-lda-v5",
  seed: exported.seed,
  labels: LABELS,
  inputFeatures: FEATURE_COUNT,
  architecture: [FEATURE_COUNT, outputs],
  training: {
    method: "standard-scaled linear discriminant analysis over mean features from four synchronized channels and five windows per channel",
    dataKind: "real experimental vibration only",
    source: sourceManifest.sourceDataset,
    sourceArchiveSha256: sourceManifest.sourceArchiveSha256,
    featureArtifactSha256: sourceManifest.featuresSha256,
    sourceWindows: sourceRows,
    recordings: rows,
    physicalTests: exported.fitTests,
    validationProtocol: exported.validationProtocol,
    groupedValidationReceipt: "field/results/open-grouped-cross-validation.json",
    groupedValidationSha256: sha256(canonicalTextBytes(validationBytes)),
    singleChannelAblationBalancedAccuracy: validation.aggregate.singleChannelAblation.balancedAccuracy,
    fourChannelRecordingBalancedAccuracy: validation.aggregate.fourChannelRecording.balancedAccuracy,
    foldBalancedAccuracyRange: validation.physicalTestFoldBalancedAccuracyRange,
    physicalTestAccuracy: validation.aggregate.physicalTestAccuracy,
    engineAgreement,
    recordingEngineAgreement,
    p99ProbabilityDelta,
    maximumProbabilityDelta,
  },
  decisionPolicy: {
    minimumConfidence: 0.99,
    basis: "conservative engineering floor; confidence scores are not independently calibrated probabilities",
    groupedValidation: validation.aggregate.fourChannelRiskCoverage.find((row) => row.minimumConfidence === 0.99),
    nestedValidation: validation.aggregate.nestedConfidencePolicy,
  },
  normalization: { means: Array.from(means), deviations: Array.from(deviations) },
  ood: {
    method: "mean squared normalized-feature distance to nearest real-training class centroid",
    trainingQuantile: oodQuantile,
    threshold: oodThreshold,
    centroids: centroids.map((centroid) => Array.from(centroid)),
  },
  quantization: {
    input: "dynamic symmetric per inference",
    weights: "symmetric per output row",
  },
  float: {
    file: "rotornote-fp32.bin",
    bytes: floatBuffer.length,
    sha256: sha256(floatBuffer),
    layers: [{ name: "logits", inputs: FEATURE_COUNT, outputs, weights: { offset: 0, length: weights.length }, bias: { offset: weights.byteLength, length: bias.length } }],
  },
  int8: {
    file: "rotornote-int8.bin",
    bytes: int8Buffer.length,
    sha256: sha256(int8Buffer),
    layers: [{ name: "logits", inputs: FEATURE_COUNT, outputs, weightScales, weights: { offset: 0, length: quantizedWeights.length }, bias: { offset: quantizedWeights.byteLength, length: bias.length } }],
  },
};

const modelDirectory = new URL("../model/", import.meta.url);
await mkdir(modelDirectory, { recursive: true });
await Promise.all([
  writeFile(new URL("rotornote-fp32.bin", modelDirectory), floatBuffer),
  writeFile(new URL("rotornote-int8.bin", modelDirectory), int8Buffer),
  writeFile(new URL("model.json", modelDirectory), `${JSON.stringify(metadata, null, 2)}\n`),
]);
console.log(JSON.stringify(metadata.training));
console.log(`built fp32=${floatBuffer.length} bytes int8=${int8Buffer.length} bytes`);
