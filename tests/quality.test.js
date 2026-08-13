import assert from "node:assert/strict";
import test from "node:test";
import { assessSignalQuality } from "../src/quality.js";
import { simulateSignal } from "../src/signal.js";

test("quality gate accepts a modeled vibration trace", () => {
  const result = assessSignalQuality(simulateSignal("imbalance", 4096, 1024, 22), 1024);
  assert.equal(result.status, "good");
  assert.deepEqual(result.flags, []);
});

test("quality gate detects flatline, clipping, bias, and dropout", () => {
  const flatline = assessSignalQuality(new Float32Array(4096), 1024);
  assert.equal(flatline.status, "review");
  assert.ok(flatline.flags.some(({ code }) => code === "flatline"));
  assert.ok(flatline.flags.some(({ code }) => code === "sensor_dropout"));

  const saturated = Float32Array.from({ length: 4096 }, (_, index) => index % 2 ? 1 : -1);
  const result = assessSignalQuality(saturated, 1024);
  assert.ok(result.flags.some(({ code }) => code === "possible_clipping"));
});

