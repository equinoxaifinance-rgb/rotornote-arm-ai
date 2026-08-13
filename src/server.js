import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { analyzeSignal } from "./analyze.js";
import { InputError, MAX_UPLOAD_BYTES, parseCsv } from "./csv.js";
import { createAnalysisReceipt } from "./evidence.js";
import { loadModel } from "./model.js";

const STATIC = new Map([
  ["/", [new URL("../web/index.html", import.meta.url), "text/html; charset=utf-8"]],
  ["/app.js", [new URL("../web/app.js", import.meta.url), "text/javascript; charset=utf-8"]],
  ["/styles.css", [new URL("../web/styles.css", import.meta.url), "text/css; charset=utf-8"]],
]);
const SAMPLES = new Map([
  ["steady-baseline", { file: "steady-baseline.csv", title: "Steady baseline", detail: "8 s · learned healthy envelope" }],
  ["bearing-pulse", { file: "bearing-pulse.csv", title: "Bearing pulse", detail: "8 s · periodic high-frequency impacts" }],
  ["shift-change", { file: "shift-change.csv", title: "Shift change", detail: "9 s · healthy-to-imbalance transition" }],
]);

const securityHeaders = {
  "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  "cross-origin-opener-policy": "same-origin",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
};

function respond(response, status, body, contentType = "application/json; charset=utf-8", extra = {}) {
  response.writeHead(status, { ...securityHeaders, "content-type": contentType, "cache-control": "no-store", ...extra });
  response.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function parseContext(headers) {
  const machineId = String(headers["x-machine-id"] || "unassigned");
  const measurementPoint = String(headers["x-measurement-point"] || "unspecified");
  const sensorAxis = String(headers["x-sensor-axis"] || "unknown");
  const operatingRpm = headers["x-operating-rpm"] === undefined ? null : Number(headers["x-operating-rpm"]);
  const loadPercent = headers["x-load-percent"] === undefined ? null : Number(headers["x-load-percent"]);
  if (!/^[a-zA-Z0-9._-]{1,64}$/.test(machineId)) throw new InputError("Machine ID must use 1–64 letters, numbers, dots, dashes, or underscores", "invalid_context");
  if (!/^[a-zA-Z0-9 ._/-]{1,64}$/.test(measurementPoint)) throw new InputError("Measurement point is invalid", "invalid_context");
  if (!["unknown", "axial", "radial-horizontal", "radial-vertical"].includes(sensorAxis)) throw new InputError("Sensor axis is invalid", "invalid_context");
  if (operatingRpm !== null && (!Number.isFinite(operatingRpm) || operatingRpm < 0 || operatingRpm > 120000)) throw new InputError("Operating RPM must be between 0 and 120000", "invalid_context");
  if (loadPercent !== null && (!Number.isFinite(loadPercent) || loadPercent < 0 || loadPercent > 100)) throw new InputError("Load percent must be between 0 and 100", "invalid_context");
  return { machineId, measurementPoint, sensorAxis, operatingRpm, loadPercent };
}

async function readBody(request) {
  const declared = Number(request.headers["content-length"] || 0);
  if (declared > MAX_UPLOAD_BYTES) throw new InputError("CSV exceeds the 2 MiB limit", "payload_too_large");
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > MAX_UPLOAD_BYTES) throw new InputError("CSV exceeds the 2 MiB limit", "payload_too_large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export function createHandler({ modelLoader = loadModel } = {}) {
  let modelPromise;
  const getModel = () => {
    if (!modelPromise) modelPromise = modelLoader().catch((error) => {
      modelPromise = undefined;
      throw error;
    });
    return modelPromise;
  };

  return async (request, response) => {
    const requestId = randomUUID();
    response.setHeader("x-request-id", requestId);
    try {
      const url = new URL(request.url, "http://localhost");
      if (request.method === "GET" && url.pathname === "/health") {
        try {
          const model = await getModel();
          return respond(response, 200, {
            status: "ready",
            architecture: process.arch,
            nativeArm64: process.arch === "arm64",
            engines: ["baseline-fp32-js", "optimized-int8-wasm-simd"],
            model: model.metadata.format,
          });
        } catch {
          return respond(response, 503, { status: "dependency_unavailable", requestId }, undefined, { "retry-after": "1" });
        }
      }
      if (request.method === "GET" && url.pathname === "/api/samples") {
        return respond(response, 200, { samples: Array.from(SAMPLES, ([id, value]) => ({ id, ...value, file: undefined })) });
      }
      if (request.method === "GET" && url.pathname.startsWith("/samples/")) {
        const id = url.pathname.slice("/samples/".length).replace(/\.csv$/, "");
        const sample = SAMPLES.get(id);
        if (!sample) return respond(response, 404, { error: "sample_not_found", requestId });
        const csv = await readFile(new URL(`../samples/${sample.file}`, import.meta.url));
        return respond(response, 200, csv, "text/csv; charset=utf-8");
      }
      if (request.method === "POST" && url.pathname === "/api/analyze") {
        const contentType = request.headers["content-type"] || "";
        if (!contentType.toLowerCase().startsWith("text/csv")) {
          return respond(response, 415, { error: "content_type_must_be_text_csv", requestId });
        }
        const engine = url.searchParams.get("engine") || "optimized";
        if (!new Set(["baseline", "optimized"]).has(engine)) return respond(response, 400, { error: "unknown_engine", requestId });
        const body = await readBody(request);
        const { values, sampleRate } = parseCsv(body, request.headers["x-sample-rate"] || 1024);
        const model = await getModel();
        const context = parseContext(request.headers);
        const result = analyzeSignal(model, values, sampleRate, engine, { verifyParity: true, context });
        result.receipt = createAnalysisReceipt({ csv: body, sampleRate, engine, model, context, result });
        return respond(response, 200, { requestId, result });
      }
      if (STATIC.has(url.pathname)) {
        if (request.method !== "GET" && request.method !== "HEAD") return respond(response, 405, { error: "method_not_allowed", requestId }, undefined, { allow: "GET, HEAD" });
        const [path, type] = STATIC.get(url.pathname);
        const data = await readFile(path);
        if (request.method === "HEAD") return respond(response, 200, "", type, { "content-length": data.length });
        return respond(response, 200, data, type);
      }
      return respond(response, 404, { error: "not_found", requestId });
    } catch (error) {
      if (error instanceof InputError) {
        const status = error.code === "payload_too_large" ? 413 : 422;
        return respond(response, status, { error: error.code, message: error.message, requestId });
      }
      console.error(JSON.stringify({ level: "error", requestId, message: error.message }));
      return respond(response, 503, { error: "analysis_dependency_unavailable", requestId }, undefined, { "retry-after": "1" });
    }
  };
}

export function startServer({ port = Number(process.env.PORT || 8787), host = process.env.HOST || "127.0.0.1", handler = createHandler() } = {}) {
  const server = http.createServer(handler);
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve(server));
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const server = await startServer();
  const address = server.address();
  console.log(`RotorNote listening on http://${address.address}:${address.port}`);
}
