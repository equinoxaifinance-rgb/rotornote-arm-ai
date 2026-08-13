import assert from "node:assert/strict";
import test from "node:test";
import { parseCsv } from "../src/csv.js";

const validRows = (count = 2048) => `amplitude\n${Array.from({ length: count }, (_, index) => Math.sin(index / 9)).join("\n")}`;

test("parses one-column and timestamped CSV", () => {
  const one = parseCsv(validRows(), 1024);
  assert.equal(one.values.length, 2048);
  const two = parseCsv(`timestamp,amplitude\n${Array.from({ length: 2048 }, (_, index) => `${index / 1024},${Math.sin(index)}`).join("\n")}`);
  assert.equal(two.values.length, 2048);
});

test("rejects malformed and hostile values", () => {
  const cases = [
    ["amplitude\n1\n2", /At least/],
    [`amplitude\n${Array(2048).fill("NaN").join("\n")}`, /finite/],
    [`amplitude\n${Array(2048).fill("1001").join("\n")}`, /safety range/],
    [`amplitude\n${Array(2048).fill("1,2,3").join("\n")}`, /one amplitude/],
    [`timestamp,amplitude\n${Array.from({ length: 2048 }, () => "1,0.2").join("\n")}`, /strictly increasing/],
    [`amplitude\n${Array(2048).fill("0").join("\n")}\0`, /null byte/],
  ];
  for (const [csv, expectation] of cases) assert.throws(() => parseCsv(csv), expectation);
});

test("rejects out-of-range sample rates", () => {
  assert.throws(() => parseCsv(validRows(), 0), /between 256 and 5000/);
  assert.throws(() => parseCsv(validRows(), "wat"), /between 256 and 5000/);
});

test("enforces byte and sample-count ceilings before analysis", () => {
  assert.throws(() => parseCsv(`amplitude\n${"0\n".repeat(1_048_576)}`), /2 MiB limit/);
  assert.throws(() => parseCsv(`amplitude\n${"0\n".repeat(131_073)}`), /131072 samples/);
});
