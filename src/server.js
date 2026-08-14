import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { analyzeChannels } from "./analyze.js";
import { analyzeVariableSpeedAnomaly } from "./anomaly.js";
import { InputError, MAX_UPLOAD_BYTES, parseCsv } from "./csv.js";
import { compileDenseModel } from "./dense-compiler.js";
import { createAnalysisReceipt } from "./evidence.js";
import { loadInferenceModel, loadModel } from "./model.js";
import { buildMaintenanceWorkOrder } from "./work-order.js";

const STATIC = new Map([
  ["/", [new URL("../web/index.html", import.meta.url), "text/html; charset=utf-8"]],
  ["/app.js", [new URL("../web/app.js", import.meta.url), "text/javascript; charset=utf-8"]],
  ["/styles.css", [new URL("../web/styles.css", import.meta.url), "text/css; charset=utf-8"]],
  ["/actions.css", [new URL("../web/actions.css", import.meta.url), "text/css; charset=utf-8"]],
  ["/anomaly.css", [new URL("../web/anomaly.css", import.meta.url), "text/css; charset=utf-8"]],
  ["/compiler.css", [new URL("../web/compiler.css", import.meta.url), "text/css; charset=utf-8"]],
  ["/examples/dense-compile-input.json", [new URL("../examples/dense-compile-input.json", import.meta.url), "application/json; charset=utf-8"]],
]);
const SAMPLES = new Map([
  ["real-healthy", { file: "real-healthy.csv", title: "Healthy rig", detail: "1 s · attributed physical test", sampleRate: 25000, operatingRpm: 1238 }],
  ["real-imbalance", { file: "real-imbalance.csv", title: "Rotor imbalance", detail: "1 s · attributed physical test", sampleRate: 25000, operatingRpm: 1238 }],
  ["real-misalignment", { file: "real-misalignment.csv", title: "Shaft misalignment", detail: "1 s · attributed physical test", sampleRate: 25000, operatingRpm: 1238 }],
  ["real-looseness", { file: "real-looseness.csv", title: "Mechanical looseness", detail: "1 s · attributed physical test", sampleRate: 25000, operatingRpm: 1238 }],
]);
const VARIABLE_SAMPLE = { file: "real-variable-speed-anomaly.csv", sampleRate: 1024, operatingRpm: 2100 };

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

function screeningPayload({ requestId, route, result, context }) {
  return { requestId, route, result, workOrder: buildMaintenanceWorkOrder(result, route, context) };
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

function parseCompileRequest(body) {
  let source;
  try { source = JSON.parse(body); } catch { throw new InputError("Compiler input must be valid JSON", "invalid_compile_input"); }
  if (source?.format !== "rotornote-dense-compile-input-v1") throw new InputError("Unknown compiler input format", "invalid_compile_input");
  const architecture = source.architecture;
  if (!Array.isArray(architecture) || architecture.length < 2 || architecture.length > 6 || architecture.some((value) => !Number.isInteger(value) || value < 1 || value > 1024)) {
    throw new InputError("Architecture must contain 2–6 positive layer sizes no wider than 1,024", "invalid_compile_input");
  }
  const parameters = architecture.slice(1).reduce((total, outputs, index) => total + architecture[index] * outputs + outputs, 0);
  if (parameters > 1_000_000) throw new InputError("Compiler requests are limited to 1,000,000 parameters", "compile_limit_exceeded");
  if (!Array.isArray(source.calibrationRows) || source.calibrationRows.length < 1 || source.calibrationRows.length > 128) {
    throw new InputError("Provide 1–128 real calibration rows", "invalid_compile_input");
  }
  return { architecture, layers: source.layers, calibrationRows: source.calibrationRows };
}

async function readBody(request) {
  const declared = Number(request.headers["content-length"] || 0);
  if (declared > MAX_UPLOAD_BYTES) throw new InputError("CSV exceeds the 8 MiB limit", "payload_too_large");
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > MAX_UPLOAD_BYTES) throw new InputError("CSV exceeds the 8 MiB limit", "payload_too_large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export function createHandler({
  modelLoader = loadModel,
  anomalyModelLoader = () => loadInferenceModel(new URL("../model/anomaly-model.json", import.meta.url)),
} = {}) {
  let modelPromise;
  let anomalyModelPromise;
  const getModel = () => {
    if (!modelPromise) modelPromise = modelLoader().catch((error) => {
      modelPromise = undefined;
      throw error;
    });
    return modelPromise;
  };
  const getAnomalyModel = () => {
    if (!anomalyModelPromise) anomalyModelPromise = anomalyModelLoader().catch((error) => {
      anomalyModelPromise = undefined;
      throw error;
    });
    return anomalyModelPromise;
  };

  return async (request, response) => {
    const requestId = randomUUID();
    response.setHeader("x-request-id", requestId);
    try {
      const url = new URL(request.url, "http://localhost");
      if (request.method === "GET" && url.pathname === "/health") {
        try {
          const [model, anomalyModel] = await Promise.all([getModel(), getAnomalyModel()]);
          return respond(response, 200, {
            status: "ready",
            architecture: process.arch,
            nativeArm64: process.arch === "arm64",
            engines: ["baseline-fp32-js", "optimized-int8-wasm-simd"],
            model: model.metadata.format,
            anomalyModel: anomalyModel.metadata.format,
          });
        } catch {
          return respond(response, 503, { status: "dependency_unavailable", requestId }, undefined, { "retry-after": "1" });
        }
      }
      if (request.method === "GET" && url.pathname === "/api/samples") {
        return respond(response, 200, { samples: Array.from(SAMPLES, ([id, value]) => ({ id, ...value, file: undefined })) });
      }
      if (request.method === "POST" && url.pathname === "/api/compile") {
        const contentType = request.headers["content-type"] || "";
        if (!contentType.toLowerCase().startsWith("application/json")) return respond(response, 415, { error: "content_type_must_be_application_json", requestId });
        const source = parseCompileRequest(await readBody(request));
        let compiled;
        try { compiled = compileDenseModel(source); } catch { throw new InputError("Compiler rejected model shape, values, or parity", "compile_rejected"); }
        return respond(response, 200, {
          requestId,
          compiler: "rotornote-dense-int8-v1",
          architecture: source.architecture,
          parameters: compiled.compute.parameters,
          multiplyAccumulates: compiled.compute.multiplyAccumulates,
          learnedByteReduction: 1 - compiled.int8Buffer.length / compiled.floatBuffer.length,
          parity: compiled.parity,
          utilization: compiled.utilization,
          artifacts: {
            fp32: { bytes: compiled.floatBuffer.length, sha256: compiled.float.sha256, base64: compiled.floatBuffer.toString("base64") },
            int8: { bytes: compiled.int8Buffer.length, sha256: compiled.int8.sha256, base64: compiled.int8Buffer.toString("base64") },
          },
          boundary: "Compilation proves deterministic artifact generation and calibration-row parity; it does not validate model accuracy or fitness for deployment.",
        });
      }
      if (request.method === "GET" && url.pathname.startsWith("/samples/")) {
        const id = url.pathname.slice("/samples/".length).replace(/\.csv$/, "");
        if (id === "real-variable-speed-anomaly") {
          const csv = await readFile(new URL(`../samples/${VARIABLE_SAMPLE.file}`, import.meta.url));
          return respond(response, 200, csv, "text/csv; charset=utf-8");
        }
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
        const { channels, sampleRate } = parseCsv(body, request.headers["x-sample-rate"] || 1024);
        const model = await getModel();
        const context = parseContext(request.headers);
        const result = analyzeChannels(model, channels, sampleRate, engine, { verifyParity: true, context });
        result.receipt = createAnalysisReceipt({ csv: body, sampleRate, engine, model, context, result });
        return respond(response, 200, screeningPayload({ requestId, route: "four_sensor_specialist", result, context }));
      }
      if (request.method === "POST" && url.pathname === "/api/anomaly") {
        const contentType = request.headers["content-type"] || "";
        if (!contentType.toLowerCase().startsWith("text/csv")) return respond(response, 415, { error: "content_type_must_be_text_csv", requestId });
        const engine = url.searchParams.get("engine") || "optimized";
        if (!new Set(["baseline", "optimized"]).has(engine)) return respond(response, 400, { error: "unknown_engine", requestId });
        const body = await readBody(request);
        const { channels, sampleRate } = parseCsv(body, request.headers["x-sample-rate"] || 1024, { minimumSamples: 2048 });
        if (channels.length !== 1) return respond(response, 422, { error: "single_sensor_required", message: "Variable-speed anomaly screening accepts one uniaxial sensor", requestId });
        const context = parseContext(request.headers);
        if (context.operatingRpm === null || context.operatingRpm <= 0) return respond(response, 422, { error: "operating_rpm_required", message: "A positive operating RPM is required", requestId });
        const model = await getAnomalyModel();
        const result = analyzeVariableSpeedAnomaly(model, channels[0], sampleRate, context.operatingRpm, engine);
        result.receipt = createAnalysisReceipt({ csv: body, sampleRate, engine, model, context, result });
        return respond(response, 200, screeningPayload({ requestId, route: "variable_speed_anomaly", result, context }));
      }
      if (request.method === "POST" && url.pathname === "/api/screen") {
        const contentType = request.headers["content-type"] || "";
        if (!contentType.toLowerCase().startsWith("text/csv")) return respond(response, 415, { error: "content_type_must_be_text_csv", requestId });
        const engine = url.searchParams.get("engine") || "optimized";
        if (!new Set(["baseline", "optimized"]).has(engine)) return respond(response, 400, { error: "unknown_engine", requestId });
        const body = await readBody(request);
        const { channels, sampleRate } = parseCsv(body, request.headers["x-sample-rate"] || 1024, { minimumSamples: 2048 });
        const context = parseContext(request.headers);
        if (channels.length === 4) {
          if (channels[0].length < 8192) return respond(response, 422, { error: "too_few_samples", message: "The four-sensor specialist requires at least 8,192 synchronized samples", requestId });
          const model = await getModel();
          const result = analyzeChannels(model, channels, sampleRate, engine, { verifyParity: true, context });
          result.receipt = createAnalysisReceipt({ csv: body, sampleRate, engine, model, context, result });
          return respond(response, 200, screeningPayload({ requestId, route: "four_sensor_specialist", result, context }));
        }
        if (context.operatingRpm === null || context.operatingRpm <= 0) return respond(response, 422, { error: "operating_rpm_required", message: "A positive operating RPM is required", requestId });
        const model = await getAnomalyModel();
        const result = analyzeVariableSpeedAnomaly(model, channels[0], sampleRate, context.operatingRpm, engine);
        result.receipt = createAnalysisReceipt({ csv: body, sampleRate, engine, model, context, result });
        return respond(response, 200, screeningPayload({ requestId, route: "variable_speed_anomaly", result, context }));
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
