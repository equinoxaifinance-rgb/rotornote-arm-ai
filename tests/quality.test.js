import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { parseCsv } from "../src/csv.js";
import { assessSignalQuality } from "../src/quality.js";

test("quality gate accepts a real vibration trace", async () => {
  const parsed = parseCsv(await readFile(new URL("../samples/real-imbalance.csv", import.meta.url), "utf8"), 25000);
  const result = assessSignalQuality(parsed.values, 25000);
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
