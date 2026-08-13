import assert from "node:assert/strict";
import test from "node:test";
import { extractFeatures, fftPower, segmentSignal, WINDOW_SIZE } from "../src/signal.js";

test("feature extraction is deterministic and finite", () => {
  const signal = Float32Array.from({ length: WINDOW_SIZE }, (_, index) => Math.sin(index / 17) + 0.2 * Math.sin(index / 5));
  const features = extractFeatures(signal, 25000, 1238);
  assert.deepEqual(features, extractFeatures(signal, 25000, 1238));
  assert.equal(features.length, 48);
  assert.ok(features.every(Number.isFinite));
});

test("FFT rejects non-power-of-two input", () => {
  assert.throws(() => fftPower(new Float32Array(1000)), /power of two/);
});

test("segmentation uses 50 percent overlap and ignores incomplete tails", () => {
  assert.equal(segmentSignal(new Float32Array(16384)).length, 3);
  assert.equal(segmentSignal(new Float32Array(8191)).length, 0);
});
