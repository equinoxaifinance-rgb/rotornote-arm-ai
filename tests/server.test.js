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
    assert.match(health.anomalyModel, /upatras/);

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

test("variable-speed anomaly path serves a real attributed signal through both engines", async () => {
  await withServer(createHandler(), async (url) => {
    const sample = await (await fetch(`${url}/samples/real-variable-speed-anomaly.csv`)).text();
    for (const engine of ["baseline", "optimized"]) {
      const response = await fetch(`${url}/api/anomaly?engine=${engine}`, {
        method: "POST",
        headers: { "content-type": "text/csv", "x-sample-rate": "1024", "x-operating-rpm": "2100" },
        body: sample,
      });
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.result.status, "screened");
      assert.equal(payload.result.primary, "anomaly");
      assert.equal(payload.result.engineAgreement, true);
      assert.equal(payload.result.signal.featureWindows, 2);
      assert.match(payload.result.model.source, /UPATRAS/);
      assert.equal(payload.result.receipt.route, "variable_speed_anomaly");
      assert.match(payload.result.receipt.evidenceId, /^[a-f0-9]{20}$/);
    }
  });
});

test("unified screen route selects the honest model contract and emits receipts", async () => {
  await withServer(createHandler(), async (url) => {
    const anomaly = await (await fetch(`${url}/samples/real-variable-speed-anomaly.csv`)).text();
    const broadResponse = await fetch(`${url}/api/screen`, {
      method: "POST",
      headers: { "content-type": "text/csv", "x-sample-rate": "1024", "x-operating-rpm": "2100" },
      body: anomaly,
    });
    assert.equal(broadResponse.status, 200);
    const broad = await broadResponse.json();
    assert.equal(broad.route, "variable_speed_anomaly");
    assert.equal(broad.result.receipt.route, "variable_speed_anomaly");
    const specialist = await readFile(new URL("../samples/real-imbalance.csv", import.meta.url), "utf8");
    const specialistResponse = await fetch(`${url}/api/screen`, {
      method: "POST",
      headers: { "content-type": "text/csv", "x-sample-rate": "25000", "x-operating-rpm": "1238" },
      body: specialist,
    });
    assert.equal(specialistResponse.status, 200);
    const specific = await specialistResponse.json();
    assert.equal(specific.route, "four_sensor_specialist");
    assert.equal(specific.result.primary, "imbalance");
    assert.equal(specific.result.receipt.route, "four_sensor_specialist");
  });
});

test("variable-speed anomaly path rejects missing RPM and multi-sensor input", async () => {
  await withServer(createHandler(), async (url) => {
    const sample = await (await fetch(`${url}/samples/real-variable-speed-anomaly.csv`)).text();
    const missingRpm = await fetch(`${url}/api/anomaly`, { method: "POST", headers: { "content-type": "text/csv" }, body: sample });
    assert.equal(missingRpm.status, 422);
    assert.equal((await missingRpm.json()).error, "operating_rpm_required");
    const rows = sample.trim().split(/\r?\n/).filter((row) => row && !row.startsWith("#") && row !== "sensor");
    const doubled = `a,b,c,d\n${rows.map((value) => `${value},${value},${value},${value}`).join("\n")}\n`;
    const multiple = await fetch(`${url}/api/anomaly`, {
      method: "POST",
      headers: { "content-type": "text/csv", "x-operating-rpm": "2100" },
      body: doubled,
    });
    assert.equal(multiple.status, 422);
    assert.equal((await multiple.json()).error, "single_sensor_required");
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
    const csv = await readFile(new URL("../samples/real-imbalance.csv", import.meta.url), "utf8");
    const firstDataRow = csv.trim().split(/\r?\n/)[1].split(",").slice(1);
    assert.equal(new Set(firstDataRow).size, 4, "fixture must contain four distinct physical sensor readings");
    const response = await fetch(`${url}/api/analyze?engine=optimized`, {
      method: "POST",
      headers: { "content-type": "text/csv", "x-sample-rate": "25000", "x-operating-rpm": "1238" },
      body: csv,
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.result.signal.channels, 4);
    assert.equal(payload.result.signal.aggregation, "mean 48-feature recording representation across four synchronized sensors and five windows per sensor");
    assert.equal(payload.result.channelResults.length, 4);
    assert.ok(payload.result.timeline.every((window) => window.distribution.imbalance > 0));
    assert.equal(payload.result.primary, "imbalance");
    assert.equal(payload.result.decision.engineAgreement, 1);
  });
});

test("four-sensor path fails closed when one distinct channel is flatlined", async () => {
  await withServer(createHandler(), async (url) => {
    const source = (await readFile(new URL("../samples/real-imbalance.csv", import.meta.url), "utf8")).trim().split(/\r?\n/);
    const rows = source.slice(1).map((line) => {
      const [timestamp, ch1, ch2, ch3] = line.split(",");
      return `${timestamp},${ch1},${ch2},${ch3},0`;
    });
    const response = await fetch(`${url}/api/analyze?engine=optimized`, {
      method: "POST",
      headers: { "content-type": "text/csv", "x-sample-rate": "25000", "x-operating-rpm": "1238" },
      body: `timestamp,ch1,ch2,ch3,ch4\n${rows.join("\n")}\n`,
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.result.decision.status, "review_required");
    assert.ok(payload.result.decision.reasons.includes("flatline"));
    assert.equal(payload.result.decision.channelQuality[3].status, "review");
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
