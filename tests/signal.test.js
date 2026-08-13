import assert from "node:assert/strict";
import test from "node:test";
import { extractFeatures, fftPower, LABELS, segmentSignal, simulateSignal, WINDOW_SIZE } from "../src/signal.js";

test("simulator and feature extraction are deterministic and finite", () => {
  const first = simulateSignal("bearing", WINDOW_SIZE, 1024, 77);
  const second = simulateSignal("bearing", WINDOW_SIZE, 1024, 77);
  assert.deepEqual(first, second);
  const features = extractFeatures(first);
  assert.equal(features.length, 48);
  assert.ok(features.every(Number.isFinite));
});

test("every modeled condition produces a distinct feature vector", () => {
  const vectors = LABELS.map((label) => extractFeatures(simulateSignal(label, WINDOW_SIZE, 1024, 12)));
  for (let left = 0; left < vectors.length; left += 1) {
    for (let right = left + 1; right < vectors.length; right += 1) {
      const distance = vectors[left].reduce((sum, value, index) => sum + (value - vectors[right][index]) ** 2, 0);
      assert.ok(distance > 0.01, `${LABELS[left]} and ${LABELS[right]} collapsed`);
    }
  }
});

test("FFT rejects non-power-of-two input", () => {
  assert.throws(() => fftPower(new Float32Array(1000)), /power of two/);
});

test("segmentation uses 50 percent overlap and ignores incomplete tails", () => {
  assert.equal(segmentSignal(new Float32Array(4096)).length, 3);
  assert.equal(segmentSignal(new Float32Array(2047)).length, 0);
});

