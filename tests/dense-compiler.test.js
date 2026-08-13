import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { compileDenseModel } from "../src/dense-compiler.js";
import { loadInferenceModel } from "../src/model.js";

const source = {
  architecture: [16, 2],
  layers: [
    { weights: [...Array(16).fill(1), ...Array(16).fill(-1)], bias: [0, 0] },
  ],
  calibrationRows: [Float32Array.from(Array(16).fill(1)), Float32Array.from(Array(16).fill(-1)), Float32Array.from(Array(16).fill(0.5))],
};

test("reusable dense compiler is deterministic and parity-gated", () => {
  const first = compileDenseModel(source);
  const second = compileDenseModel(source);
  assert.equal(first.float.sha256, second.float.sha256);
  assert.equal(first.int8.sha256, second.int8.sha256);
  assert.deepEqual(first.floatBuffer, second.floatBuffer);
  assert.deepEqual(first.int8Buffer, second.int8Buffer);
  assert.equal(first.parity.labelAgreement, 1);
  assert.equal(first.compute.parameters, 34);
  assert.equal(first.compute.multiplyAccumulates, 32);
});

test("reusable dense compiler rejects malformed shapes", () => {
  assert.throws(() => compileDenseModel({ ...source, architecture: [16, 3] }), /weight shape mismatch/);
  assert.throws(() => compileDenseModel({ ...source, layers: [{ ...source.layers[0], weights: [...source.layers[0].weights.slice(0, -1), Number.NaN] }] }), /non-finite parameters/);
});

test("compiled non-SIMD-width layers execute through the actual WASM runtime", async () => {
  const architecture = [17, 5, 2];
  const multilayer = {
    architecture,
    layers: [
      {
        weights: Array.from({ length: 17 * 5 }, (_, index) => ((index * 13) % 19 - 9) / 20),
        bias: [0.3, 0.2, 0.4, 0.1, 0.25],
      },
      {
        weights: [0.8, -0.4, 0.3, -0.2, 0.5, -0.7, 0.6, -0.1, 0.4, -0.3],
        bias: [0.1, -0.1],
      },
    ],
    calibrationRows: [
      Array.from({ length: 17 }, (_, index) => (index - 8) / 8),
      Array.from({ length: 17 }, (_, index) => (8 - index) / 7),
      Array.from({ length: 17 }, (_, index) => Math.sin(index)),
    ],
  };
  const compiled = compileDenseModel(multilayer);
  assert.equal(compiled.int8.layers[0].weights.rowStride, 32);
  assert.equal(compiled.int8.layers[1].weights.rowStride, 16);
  const directory = await mkdtemp(path.join(os.tmpdir(), "rotornote-dense-"));
  try {
    await Promise.all([
      writeFile(path.join(directory, "model-fp32.bin"), compiled.floatBuffer),
      writeFile(path.join(directory, "model-int8.bin"), compiled.int8Buffer),
      writeFile(path.join(directory, "model.json"), JSON.stringify({
        format: "rotornote-dense-compiled-v1",
        architecture,
        inputFeatures: 17,
        labels: ["left", "right"],
        normalization: { means: Array(17).fill(0), deviations: Array(17).fill(1) },
        float: { file: "model-fp32.bin", ...compiled.float },
        int8: { file: "model-int8.bin", ...compiled.int8 },
      })),
    ]);
    const model = await loadInferenceModel(pathToFileURL(path.join(directory, "model.json")));
    for (const row of multilayer.calibrationRows) {
      const baseline = model.infer(row, "baseline");
      const optimized = model.infer(row, "optimized");
      assert.equal(baseline[0] >= baseline[1], optimized[0] >= optimized[1]);
      assert.ok(Math.max(...baseline.map((value, index) => Math.abs(value - optimized[index]))) < 0.05);
    }
    assert.deepEqual(model.assessDistribution(multilayer.calibrationRows[0]), { inDistribution: null, reason: "distribution_policy_not_configured" });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
