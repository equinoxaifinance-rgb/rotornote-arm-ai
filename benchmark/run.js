import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadModel } from "../src/model.js";
import { extractFeatures, LABELS, simulateSignal } from "../src/signal.js";

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}
const outputPath = argument("--output", "benchmark/results/local.json");
const repetitions = Number(argument("--repetitions", "15"));
const batchSize = Number(argument("--batch", "512"));
if (!Number.isInteger(repetitions) || repetitions < 3 || !Number.isInteger(batchSize) || batchSize < 16) {
  throw new Error("repetitions must be >=3 and batch must be >=16");
}

const model = await loadModel();
const featureBank = Array.from({ length: 64 }, (_, index) =>
  extractFeatures(simulateSignal(LABELS[index % LABELS.length], 2048, 1024, 9000 + index)));
const hash = async (path) => createHash("sha256").update(await readFile(path)).digest("hex");
const measure = (engine) => {
  const started = process.hrtime.bigint();
  let checksum = 0;
  for (let index = 0; index < batchSize; index += 1) {
    const result = model.infer(featureBank[index % featureBank.length], engine);
    checksum += result[index % result.length];
  }
  return { milliseconds: Number(process.hrtime.bigint() - started) / 1e6, checksum };
};

for (let warmup = 0; warmup < 4; warmup += 1) {
  measure("baseline");
  measure("optimized");
}
const raw = { baseline: [], optimized: [] };
for (let sample = 0; sample < repetitions; sample += 1) {
  const order = sample % 2 ? ["optimized", "baseline"] : ["baseline", "optimized"];
  for (const engine of order) raw[engine].push(measure(engine));
}

const summarize = (samples) => {
  const durations = samples.map((sample) => sample.milliseconds).sort((a, b) => a - b);
  const median = durations[Math.floor(durations.length / 2)];
  const p95 = durations[Math.min(durations.length - 1, Math.ceil(durations.length * 0.95) - 1)];
  return {
    medianMs: Number(median.toFixed(4)),
    p95Ms: Number(p95.toFixed(4)),
    medianInferencesPerSecond: Number(((batchSize / median) * 1000).toFixed(2)),
  };
};

let agreement = 0;
let maximumProbabilityDelta = 0;
for (const features of featureBank) {
  const baseline = model.infer(features, "baseline");
  const optimized = model.infer(features, "optimized");
  if (baseline.indexOf(Math.max(...baseline)) === optimized.indexOf(Math.max(...optimized))) agreement += 1;
  for (let index = 0; index < baseline.length; index += 1) maximumProbabilityDelta = Math.max(maximumProbabilityDelta, Math.abs(baseline[index] - optimized[index]));
}
if (agreement !== featureBank.length || maximumProbabilityDelta >= 0.08) {
  throw new Error(`Engine correctness gate failed: agreement=${agreement}/${featureBank.length}, maxDelta=${maximumProbabilityDelta}`);
}
const baselineSummary = summarize(raw.baseline);
const optimizedSummary = summarize(raw.optimized);
const result = {
  schema: "rotornote-benchmark-v1",
  recordedAt: new Date().toISOString(),
  machine: { architecture: process.arch, platform: process.platform, cpus: os.cpus().length, cpuModel: os.cpus()[0]?.model, node: process.version },
  workload: { batchSize, repetitions, warmups: 4, featureVectors: featureBank.length, network: model.metadata.architecture },
  artifacts: {
    fp32: { bytes: model.metadata.float.bytes, sha256: model.metadata.float.sha256 },
    int8: { bytes: model.metadata.int8.bytes, sha256: model.metadata.int8.sha256 },
    wasm: { bytes: (await readFile("dist/dense.wasm")).length, sha256: await hash("dist/dense.wasm") },
  },
  correctness: { labelAgreement: agreement / featureBank.length, maximumProbabilityDelta },
  raw,
  summary: {
    baseline: baselineSummary,
    optimized: optimizedSummary,
    medianSpeedup: Number((baselineSummary.medianMs / optimizedSummary.medianMs).toFixed(4)),
    weightByteReduction: Number((1 - model.metadata.int8.bytes / model.metadata.float.bytes).toFixed(6)),
  },
  evidenceClass: process.arch === "arm64" ? "native-arm64" : "non-arm-local-only",
};
await mkdir(dirname(fileURLToPath(new URL(`../${outputPath}`, import.meta.url))), { recursive: true });
await writeFile(new URL(`../${outputPath}`, import.meta.url), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result.summary, null, 2));
console.log(`wrote ${outputPath} (${result.evidenceClass})`);
