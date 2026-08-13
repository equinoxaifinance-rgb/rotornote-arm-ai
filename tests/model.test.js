import assert from "node:assert/strict";
import test from "node:test";
import { writeFile, mkdtemp, cp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { loadModel } from "../src/model.js";
import { extractFeatures, LABELS, simulateSignal } from "../src/signal.js";
import { analyzeSignal } from "../src/analyze.js";

test("FP32 and INT8 SIMD engines classify all conditions consistently", async () => {
  const model = await loadModel();
  assert.equal(model.metadata.format, "rotornote-random-feature-ridge-v2");
  assert.match(model.metadata.training.method, /ridge-fitted/);
  assert.equal(model.metadata.training.stressValidationSamples, 300);
  assert.ok(model.metadata.training.floatAccuracy >= 0.95 && model.metadata.training.floatAccuracy < 1);
  assert.ok(model.metadata.training.stressFloatAccuracy >= 0.85);
  assert.ok(model.metadata.training.stressFloatAccuracy < model.metadata.training.floatAccuracy);
  for (const [index, label] of LABELS.entries()) {
    const features = extractFeatures(simulateSignal(label, 2048, 1024, 700 + index));
    const baseline = model.infer(features, "baseline");
    const optimized = model.infer(features, "optimized");
    assert.equal(LABELS[baseline.indexOf(Math.max(...baseline))], label);
    assert.equal(LABELS[optimized.indexOf(Math.max(...optimized))], label);
    assert.ok(Math.max(...baseline.map((value, i) => Math.abs(value - optimized[i]))) < 0.08);
    assert.ok(Math.abs(optimized.reduce((sum, value) => sum + value, 0) - 1) < 1e-6);
  }
  assert.throws(() => model.infer(new Float32Array(48), "mystery"), /Unknown engine/);
});

test("unseen broadband noise falls outside the fitted envelope and abstains", async () => {
  const model = await loadModel();
  let state = 123;
  const random = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  const values = Float32Array.from({ length: 4096 }, () => random() * 2 - 1);
  const result = analyzeSignal(model, values, 1024, "optimized", { verifyParity: true });
  assert.equal(result.decision.status, "review_required");
  assert.ok(result.decision.reasons.includes("outside_calibration_envelope"));
  assert.equal(result.decision.distributionCoverage, 0);
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
