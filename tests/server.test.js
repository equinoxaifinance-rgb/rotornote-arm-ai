import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createHandler, startServer } from "../src/server.js";
import { loadModel } from "../src/model.js";

async function withServer(handler, callback) {
  const server = await startServer({ port: 0, handler });
  const url = `http://127.0.0.1:${server.address().port}`;
  try { await callback(url); } finally { await new Promise((resolve) => server.close(resolve)); }
}

test("happy path serves UI, health, sample, and optimized analysis", async () => {
  await withServer(createHandler(), async (url) => {
    const page = await fetch(url);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Hear the machine/);
    assert.match(await (await fetch(url)).text(), /Analysis passport/);
    assert.match(page.headers.get("content-security-policy"), /default-src 'self'/);
    const styles = await (await fetch(`${url}/styles.css?v=layout-regression`)).text();
    assert.match(styles, /\.empty-state\[hidden\],#reportContent\[hidden\]\{display:none!important\}/);

    const health = await (await fetch(`${url}/health`)).json();
    assert.equal(health.status, "ready");
    assert.equal(health.nativeArm64, process.arch === "arm64");

    const sample = await (await fetch(`${url}/samples/real-imbalance.csv`)).text();
    const response = await fetch(`${url}/api/analyze?engine=optimized`, {
      method: "POST",
      headers: { "content-type": "text/csv", "x-sample-rate": "25000", "x-operating-rpm": "1238" },
      body: sample,
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.result.primary, "imbalance");
    assert.equal(payload.result.signal.windows, 5);
    assert.equal(payload.result.decision.status, "screened");
    assert.equal(payload.result.decision.engineAgreement, 1);
    assert.match(payload.result.receipt.evidenceId, /^[a-f0-9]{20}$/);
    const repeated = await fetch(`${url}/api/analyze?engine=optimized`, {
      method: "POST",
      headers: { "content-type": "text/csv", "x-sample-rate": "25000", "x-operating-rpm": "1238" },
      body: sample,
    });
    assert.equal((await repeated.json()).result.receipt.evidenceId, payload.result.receipt.evidenceId);
    assert.ok(response.headers.get("x-request-id"));
  });
});

test("API abstains on unusable sensor data and validates machine context", async () => {
  await withServer(createHandler(), async (url) => {
    const flatline = `amplitude\n${Array(8192).fill("0").join("\n")}`;
    const review = await fetch(`${url}/api/analyze`, {
      method: "POST",
      headers: { "content-type": "text/csv", "x-machine-id": "pump-7" },
      body: flatline,
    });
    assert.equal(review.status, 200);
    const payload = await review.json();
    assert.equal(payload.result.decision.status, "review_required");
    assert.ok(payload.result.decision.reasons.includes("flatline"));

    const invalidContext = await fetch(`${url}/api/analyze`, {
      method: "POST",
      headers: { "content-type": "text/csv", "x-machine-id": "../../secret" },
      body: await (await fetch(`${url}/samples/real-healthy.csv`)).text(),
    });
    assert.equal(invalidContext.status, 422);
    assert.equal((await invalidContext.json()).error, "invalid_context");
  });
});

test("API executes the four-sensor aggregation path", async () => {
  await withServer(createHandler(), async (url) => {
    const one = (await readFile(new URL("../samples/real-imbalance.csv", import.meta.url), "utf8")).trim().split(/\r?\n/);
    const rows = one.slice(1).map((line) => {
      const [timestamp, amplitude] = line.split(",");
      return `${timestamp},${amplitude},${amplitude},${amplitude},${amplitude}`;
    });
    const csv = `timestamp,ch1,ch2,ch3,ch4\n${rows.join("\n")}\n`;
    const response = await fetch(`${url}/api/analyze?engine=optimized`, {
      method: "POST",
      headers: { "content-type": "text/csv", "x-sample-rate": "25000", "x-operating-rpm": "1238" },
      body: csv,
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.result.signal.channels, 4);
    assert.equal(payload.result.signal.aggregation, "mean class probability across four synchronized sensor channels");
    assert.equal(payload.result.channelResults.length, 4);
    assert.ok(payload.result.timeline.every((window) => window.distribution.imbalance > 0));
    assert.equal(payload.result.primary, "imbalance");
    assert.equal(payload.result.decision.engineAgreement, 1);
  });
});

test("API enforces media type, engine allowlist, routes, and method boundaries", async () => {
  await withServer(createHandler(), async (url) => {
    assert.equal((await fetch(`${url}/api/analyze`, { method: "POST", body: "x" })).status, 415);
    assert.equal((await fetch(`${url}/api/analyze?engine=exec`, { method: "POST", headers: { "content-type": "text/csv" }, body: "x" })).status, 400);
    assert.equal((await fetch(`${url}/samples/../../TASK.md`)).status, 404);
    assert.equal((await fetch(`${url}/`, { method: "POST" })).status, 405);
    assert.equal((await fetch(`${url}/missing`)).status, 404);
  });
});

test("dependency failure returns retry contract and then recovers", async () => {
  let attempts = 0;
  const handler = createHandler({ modelLoader: async () => {
    attempts += 1;
    if (attempts === 1) throw new Error("simulated unavailable model store");
    return loadModel();
  } });
  await withServer(handler, async (url) => {
    const failed = await fetch(`${url}/health`);
    assert.equal(failed.status, 503);
    assert.equal(failed.headers.get("retry-after"), "1");
    const recovered = await fetch(`${url}/health`);
    assert.equal(recovered.status, 200);
    assert.equal((await recovered.json()).status, "ready");
  });
});

test("malformed uploads return bounded, structured errors", async () => {
  await withServer(createHandler(), async (url) => {
    const response = await fetch(`${url}/api/analyze`, {
      method: "POST",
      headers: { "content-type": "text/csv" },
      body: "amplitude\nNaN\n",
    });
    assert.equal(response.status, 422);
    const payload = await response.json();
    assert.equal(payload.error, "invalid_csv");
    assert.ok(payload.requestId);
  });
});
