import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadInferenceModel } from "../src/model.js";

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}
const outputPath = argument("--output", "benchmark/results/anomaly-local.json");
const repetitions = Number(argument("--repetitions", "31"));
const batchSize = Number(argument("--batch", "512"));
const warmups = Number(argument("--warmups", "12"));
if (!Number.isInteger(repetitions) || repetitions < 15 || !Number.isInteger(batchSize) || batchSize < 16 || !Number.isInteger(warmups) || warmups < 4) throw new Error("invalid benchmark arguments");
const model = await loadInferenceModel(new URL("../model/anomaly-model.json", import.meta.url));
const manifest = JSON.parse(await readFile(new URL("../field/training/upatras-manifest.json", import.meta.url), "utf8"));
const bytes = await readFile(new URL("../field/training/upatras-features.f32", import.meta.url));
const rows = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
const featureBank = Array.from({ length: 64 }, (_, bankIndex) => {
  const signal = bankIndex % manifest.signals;
  const features = new Float32Array(manifest.featureCount * manifest.featureWindowsPerSignal);
  if (features.length !== model.metadata.inputFeatures) throw new Error("benchmark temporal feature contract does not match production model");
  for (let window = 0; window < manifest.featureWindowsPerSignal; window += 1) {
    const offset = (signal * manifest.featureWindowsPerSignal + window) * manifest.featureCount;
    features.set(rows.subarray(offset, offset + manifest.featureCount), window * manifest.featureCount);
  }
  return features;
});
const measure = (engine) => {
  const started = process.hrtime.bigint();
  let checksum = 0;
  for (let index = 0; index < batchSize; index += 1) {
    const result = model.infer(featureBank[index % featureBank.length], engine);
    checksum += result[index % result.length];
  }
  return { milliseconds: Number(process.hrtime.bigint() - started) / 1e6, checksum };
};
for (let warmup = 0; warmup < warmups; warmup += 1) { measure("baseline"); measure("optimized"); }
const raw = { baseline: [], optimized: [] };
for (let sample = 0; sample < repetitions; sample += 1) {
  for (const engine of sample % 2 ? ["optimized", "baseline"] : ["baseline", "optimized"]) raw[engine].push(measure(engine));
}
const quantile = (sorted, probability) => {
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const fraction = position - lower;
  return sorted[lower] + (sorted[Math.min(lower + 1, sorted.length - 1)] - sorted[lower]) * fraction;
};
const pairedSpeedups = raw.baseline.map((sample, index) => sample.milliseconds / raw.optimized[index].milliseconds);
let bootstrapState = 0x414e4f4d;
const random = () => { bootstrapState = (Math.imul(bootstrapState, 1664525) + 1013904223) >>> 0; return bootstrapState / 2 ** 32; };
const bootstrapMedians = [];
for (let iteration = 0; iteration < 10_000; iteration += 1) {
  const resample = Array.from({ length: pairedSpeedups.length }, () => pairedSpeedups[Math.floor(random() * pairedSpeedups.length)]).sort((a, b) => a - b);
  bootstrapMedians.push(quantile(resample, 0.5));
}
bootstrapMedians.sort((a, b) => a - b);
const pairedSorted = [...pairedSpeedups].sort((a, b) => a - b);
const pairedMedian = quantile(pairedSorted, 0.5);
let agreement = 0;
let maximumProbabilityDelta = 0;
for (const features of featureBank) {
  const baseline = model.infer(features, "baseline");
  const optimized = model.infer(features, "optimized");
  if (baseline.indexOf(Math.max(...baseline)) === optimized.indexOf(Math.max(...optimized))) agreement += 1;
  for (let index = 0; index < baseline.length; index += 1) maximumProbabilityDelta = Math.max(maximumProbabilityDelta, Math.abs(baseline[index] - optimized[index]));
}
if (agreement !== featureBank.length || maximumProbabilityDelta >= 0.08) throw new Error("anomaly benchmark parity failed");
const hash = async (url) => createHash("sha256").update(await readFile(url)).digest("hex");
const result = {
  schema: "rotornote-anomaly-benchmark-v1",
  recordedAt: new Date().toISOString(),
  machine: { architecture: process.arch, platform: process.platform, cpus: os.cpus().length, cpuModel: os.cpus()[0]?.model, node: process.version },
  workload: { batchSize, repetitions, warmups, featureVectors: featureBank.length, inputFeatures: model.metadata.inputFeatures, temporalAggregation: "ordered_concatenation", network: model.metadata.architecture },
  artifacts: {
    fp32: { bytes: model.metadata.float.bytes, sha256: model.metadata.float.sha256 },
    int8: { bytes: model.metadata.int8.bytes, sha256: model.metadata.int8.sha256 },
    wasm: { bytes: (await readFile(new URL("../dist/dense.wasm", import.meta.url))).length, sha256: await hash(new URL("../dist/dense.wasm", import.meta.url)) },
  },
  correctness: { labelAgreement: agreement / featureBank.length, maximumProbabilityDelta },
  raw,
  summary: {
    pairedMedianSpeedup: Number(pairedMedian.toFixed(4)),
    confidence95: [Number(quantile(bootstrapMedians, 0.025).toFixed(4)), Number(quantile(bootstrapMedians, 0.975).toFixed(4))],
    weightByteReduction: Number((1 - model.metadata.int8.bytes / model.metadata.float.bytes).toFixed(6)),
  },
  evidenceClass: process.arch === "arm64" ? "native-arm64" : "non-arm-local-only",
};
await mkdir(dirname(fileURLToPath(new URL(`../${outputPath}`, import.meta.url))), { recursive: true });
await writeFile(new URL(`../${outputPath}`, import.meta.url), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result.summary, null, 2));
