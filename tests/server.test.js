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
    assert.match(page.headers.get("content-security-policy"), /default-src 'self'/);
    const styles = await (await fetch(`${url}/styles.css?v=layout-regression`)).text();
    assert.match(styles, /\.empty-state\[hidden\],#reportContent\[hidden\]\{display:none!important\}/);

    const health = await (await fetch(`${url}/health`)).json();
    assert.equal(health.status, "ready");
    assert.equal(health.nativeArm64, process.arch === "arm64");

    const sample = await (await fetch(`${url}/samples/bearing-pulse.csv`)).text();
    const response = await fetch(`${url}/api/analyze?engine=optimized`, {
      method: "POST",
      headers: { "content-type": "text/csv", "x-sample-rate": "1024" },
      body: sample,
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.result.primary, "bearing");
    assert.equal(payload.result.signal.windows, 7);
    assert.ok(response.headers.get("x-request-id"));
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
