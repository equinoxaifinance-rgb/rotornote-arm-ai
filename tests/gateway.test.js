import assert from "node:assert/strict";
import test from "node:test";
import { parseArguments, runGateway } from "../integrations/edge-gateway.mjs";
import { createHandler, startServer } from "../src/server.js";

test("gateway requires identity and refuses plaintext remote transport", async () => {
  assert.throws(() => parseArguments(["--url", "http://localhost:8787"]), /Required/);
  await assert.rejects(runGateway({
    url: "http://example.com",
    file: new URL("../samples/steady-baseline.csv", import.meta.url),
    machine: "pump-7",
    rate: 1024,
    engine: "optimized",
    axis: "radial-horizontal",
    point: "drive-end",
    retries: 0,
  }), /require HTTPS/);
});

test("gateway parses a complete command and retries a transient server failure", async () => {
  const options = parseArguments([
    "--url", "https://rotornote.example", "--file", "samples/steady-baseline.csv", "--machine", "fan-2",
    "--rate", "2048", "--retries", "1",
  ]);
  assert.equal(options.rate, 2048);
  assert.equal(options.engine, "optimized");
  let attempts = 0;
  const payload = await runGateway(options, { fetchImpl: async () => {
    attempts += 1;
    return attempts === 1
      ? { ok: false, status: 503, json: async () => ({ error: "warming" }) }
      : { ok: true, status: 200, json: async () => ({ result: { primary: "healthy" } }) };
  } });
  assert.equal(attempts, 2);
  assert.equal(payload.result.primary, "healthy");
  assert.throws(() => parseArguments(["--url", "https://x", "--file", "x", "--machine", "x", "--retries", "6"]), /Retries/);
});

test("gateway sends machine context through the real API", async () => {
  const server = await startServer({ port: 0, handler: createHandler() });
  try {
    const payload = await runGateway({
      url: `http://127.0.0.1:${server.address().port}`,
      file: new URL("../samples/shift-change.csv", import.meta.url),
      machine: "pump-7",
      point: "drive-end-bearing",
      axis: "radial-horizontal",
      rate: 1024,
      rpm: 1800,
      load: 74,
      engine: "optimized",
      retries: 0,
    });
    assert.equal(payload.result.context.machineId, "pump-7");
    assert.equal(payload.result.context.operatingRpm, 1800);
    assert.equal(payload.result.decision.engineAgreement, 1);
    assert.match(payload.result.receipt.evidenceId, /^[a-f0-9]{20}$/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
