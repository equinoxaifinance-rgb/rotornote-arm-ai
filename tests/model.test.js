import assert from "node:assert/strict";
import test from "node:test";
import { writeFile, mkdtemp, cp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { loadModel } from "../src/model.js";
import { extractFeatures, LABELS, segmentSignal } from "../src/signal.js";
import { parseCsv } from "../src/csv.js";
import { analyzeSignal } from "../src/analyze.js";

test("FP32 and INT8 SIMD engines agree on attributed real recordings", async () => {
  const model = await loadModel();
  assert.equal(model.metadata.format, "rotornote-real-logistic-v4");
  assert.match(model.metadata.training.method, /multinomial logistic/);
  assert.equal(model.metadata.training.dataKind, "real experimental vibration only");
  assert.equal(model.metadata.decisionPolicy.minimumConfidence, 0.9);
  assert.equal(model.metadata.decisionPolicy.groupedValidation.coverage, 0.371);
  assert.ok(model.metadata.training.fourChannelRecordingBalancedAccuracy >= 0.75);
  assert.ok(model.metadata.training.recordingEngineAgreement >= 0.999);
  for (const label of LABELS) {
    const parsed = parseCsv(await readFile(new URL(`../samples/real-${label}.csv`, import.meta.url), "utf8"), 25000);
    for (const window of segmentSignal(parsed.values)) {
      const features = extractFeatures(window, 25000, 1238);
      const baseline = model.infer(features, "baseline");
      const optimized = model.infer(features, "optimized");
      assert.equal(LABELS[baseline.indexOf(Math.max(...baseline))], LABELS[optimized.indexOf(Math.max(...optimized))]);
      assert.ok(Math.abs(optimized.reduce((sum, value) => sum + value, 0) - 1) < 1e-6);
    }
  }
  assert.throws(() => model.infer(new Float32Array(48), "mystery"), /Unknown engine/);
});

test("unseen broadband noise falls outside the fitted envelope and abstains", async () => {
  const model = await loadModel();
  let state = 123;
  const random = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  const values = Float32Array.from({ length: 16384 }, () => random() * 2 - 1);
  const result = analyzeSignal(model, values, 25000, "optimized", { verifyParity: true, context: { operatingRpm: 1238 } });
  assert.equal(result.decision.status, "review_required");
  assert.ok(result.decision.reasons.includes("outside_calibration_envelope"));
  assert.equal(result.decision.distributionCoverage, 0);
});

test("ambiguous real-signal mixture abstains below the confidence policy", async () => {
  const model = await loadModel();
  const healthy = parseCsv(await readFile(new URL("../samples/real-healthy.csv", import.meta.url), "utf8"), 25000).values;
  const misalignment = parseCsv(await readFile(new URL("../samples/real-misalignment.csv", import.meta.url), "utf8"), 25000).values;
  const mixture = Float32Array.from(healthy, (value, index) => (value + misalignment[index]) / 2);
  const result = analyzeSignal(model, mixture, 25000, "optimized", { verifyParity: true, context: { operatingRpm: 1238 } });
  assert.equal(result.decision.status, "review_required");
  assert.ok(result.decision.reasons.includes("low_model_confidence"));
  assert.ok(result.confidence < model.metadata.decisionPolicy.minimumConfidence);
});

test("model loader fails closed on artifact tampering", async () => {
  const temporary = await mkdtemp(`${tmpdir()}/rotornote-model-test-`);
  try {
    await cp(new URL("../model/", import.meta.url), temporary, { recursive: true });
    await writeFile(`${temporary}/rotornote-int8.bin`, "tampered");
    await assert.rejects(loadModel({ modelUrl: new URL(`file://${temporary}/model.json`) }), /Integrity check failed/);
  } finally {
    await rm(temporary, { recursive: true });
  }
});
