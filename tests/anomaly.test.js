import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import test from "node:test";
import { analyzeVariableSpeedAnomaly } from "../src/anomaly.js";
import { parseCsv } from "../src/csv.js";
import { loadInferenceModel } from "../src/model.js";

const modelUrl = new URL("../model/anomaly-model.json", import.meta.url);

test("deep anomaly head executes attributed physical data with cross-engine agreement", async () => {
  const model = await loadInferenceModel(modelUrl);
  const parsed = parseCsv(await readFile(new URL("../samples/real-variable-speed-anomaly.csv", import.meta.url), "utf8"), 1024, { minimumSamples: 2048 });
  const baseline = analyzeVariableSpeedAnomaly(model, parsed.values, 1024, 2100, "baseline");
  const optimized = analyzeVariableSpeedAnomaly(model, parsed.values, 1024, 2100, "optimized");
  assert.equal(baseline.primary, "anomaly");
  assert.equal(optimized.primary, "anomaly");
  assert.equal(optimized.engineAgreement, true);
  assert.equal(optimized.signal.featureWindows, 2);
  assert.equal(model.metadata.architecture[0], 96);
  assert.equal(model.metadata.architecture.at(-1), 8);
  // The shipped graph is pruned strictly from real-bank activation, so guard
  // against regression to the former toy-sized head without rewarding dead
  // units that exist only to inflate a benchmark number.
  assert.ok(model.metadata.compiler.multiplyAccumulatesPerInference >= 250000);
});

test("deep anomaly model fails closed if its quantized bytes are changed", async () => {
  const temporary = await mkdtemp(`${tmpdir()}/rotornote-anomaly-test-`);
  try {
    await cp(new URL("../model/", import.meta.url), temporary, { recursive: true });
    await writeFile(`${temporary}/rotornote-anomaly-int8.bin`, "tampered");
    await assert.rejects(loadInferenceModel(new URL(`file://${temporary}/anomaly-model.json`)), /Integrity check failed/);
  } finally {
    await rm(temporary, { recursive: true });
  }
});
