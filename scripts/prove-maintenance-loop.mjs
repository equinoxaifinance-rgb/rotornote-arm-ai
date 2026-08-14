import http from "node:http";
import { fileURLToPath } from "node:url";
import { deliverWorkOrder, verifyPayload } from "../integrations/cmms-delivery.mjs";
import { runGateway } from "../integrations/edge-gateway.mjs";
import { startServer } from "../src/server.js";

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

export async function proveMaintenanceLoop() {
  const secret = "rotornote-ci-proof-key";
  const accepted = new Map();
  const sink = await listen(http.createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString("utf8");
    if (!verifyPayload(body, request.headers["x-rotornote-signature"], secret)) {
      response.writeHead(401, { "content-type": "application/json" });
      return response.end(JSON.stringify({ error: "invalid_signature" }));
    }
    const workOrder = JSON.parse(body);
    const key = request.headers["idempotency-key"];
    if (key !== workOrder.externalId) {
      response.writeHead(422, { "content-type": "application/json" });
      return response.end(JSON.stringify({ error: "idempotency_mismatch" }));
    }
    const duplicate = accepted.has(key);
    if (!duplicate) accepted.set(key, workOrder);
    response.writeHead(duplicate ? 200 : 202, { "content-type": "application/json" });
    response.end(JSON.stringify({ state: duplicate ? "duplicate" : "accepted", externalId: key }));
  }));
  const app = await startServer({ port: 0 });
  try {
    const appPort = app.address().port;
    const sinkPort = sink.address().port;
    const screening = await runGateway({
      url: `http://127.0.0.1:${appPort}`,
      file: new URL("../samples/real-imbalance.csv", import.meta.url),
      machine: "proof-pump-7",
      point: "drive-end-bearing",
      axis: "radial-horizontal",
      rate: 25000,
      rpm: 1238,
      load: 74,
      engine: "optimized",
      retries: 0,
    });
    const deliveryOptions = { url: `http://127.0.0.1:${sinkPort}/work-orders`, workOrder: screening.workOrder, secret, retries: 0 };
    const first = await deliverWorkOrder(deliveryOptions);
    const second = await deliverWorkOrder(deliveryOptions);
    const tampered = await fetch(deliveryOptions.url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-rotornote-signature": "sha256=00", "idempotency-key": screening.workOrder.externalId },
      body: JSON.stringify({ ...screening.workOrder, priority: "emergency" }),
    });
    const receipt = {
      schema: "rotornote.maintenance-loop-proof.v1",
      architecture: process.arch,
      source: {
        route: screening.route,
        decisionStatus: screening.result.decision.status,
        label: screening.result.primary,
        evidenceId: screening.result.receipt.evidenceId,
      },
      workOrder: {
        schema: screening.workOrder.schema,
        externalId: screening.workOrder.externalId,
        contentSha256: screening.workOrder.contentSha256,
        intent: screening.workOrder.intent,
        guardrail: screening.workOrder.request.guardrail,
      },
      delivery: {
        firstStatus: first.status,
        firstState: first.payload.state,
        duplicateStatus: second.status,
        duplicateState: second.payload.state,
        downstreamObjects: accepted.size,
        tamperedStatus: tampered.status,
      },
      gates: {
        realScreeningRoute: screening.route === "four_sensor_specialist",
        acceptedExactlyOnce: first.payload.state === "accepted" && second.payload.state === "duplicate" && accepted.size === 1,
        tamperedRejected: tampered.status === 401,
        advisoryOnly: screening.workOrder.intent === "qualified_vibration_review" && /Advisory screening only/.test(screening.workOrder.request.guardrail),
      },
    };
    if (!Object.values(receipt.gates).every(Boolean)) throw new Error(`Maintenance-loop proof failed: ${JSON.stringify(receipt.gates)}`);
    return receipt;
  } finally {
    await Promise.all([close(app), close(sink)]);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.stdout.write(`${JSON.stringify(await proveMaintenanceLoop(), null, 2)}\n`);
}
