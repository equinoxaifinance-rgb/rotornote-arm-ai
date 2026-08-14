import assert from "node:assert/strict";
import test from "node:test";
import { deliverWorkOrder, signPayload, verifyPayload } from "../integrations/cmms-delivery.mjs";
import { proveMaintenanceLoop } from "../scripts/prove-maintenance-loop.mjs";
import { buildMaintenanceWorkOrder, canonicalJson, verifyWorkOrderIntegrity } from "../src/work-order.js";

const result = {
  primary: "imbalance",
  confidence: 0.99,
  engine: "optimized",
  decision: { status: "screened", engineAgreement: 1 },
  context: { machineId: "pump-7", measurementPoint: "drive-end", sensorAxis: "radial-horizontal", operatingRpm: 1238, loadPercent: 74 },
  guidance: { action: "Repeat the measurement under the same operating conditions and ask a qualified analyst to review it." },
  receipt: { evidenceId: "0123456789abcdef0123", statement: "Binds the uploaded bytes, model, context, and decision." },
};

test("work-order export is deterministic, evidence-bound, and advisory", () => {
  const first = buildMaintenanceWorkOrder(result, "four_sensor_specialist");
  const second = buildMaintenanceWorkOrder(result, "four_sensor_specialist");
  assert.deepEqual(first, second);
  assert.equal(first.externalId, "rotornote-0123456789abcdef0123");
  assert.equal(first.intent, "qualified_vibration_review");
  assert.equal(first.screening.scoreMeaning, "model score; not a calibrated probability");
  assert.match(first.request.guardrail, /Advisory screening only/);
  assert.match(first.contentSha256, /^[a-f0-9]{64}$/);
  assert.equal(verifyWorkOrderIntegrity(first), true);
  assert.equal(verifyWorkOrderIntegrity({ ...first, priority: "emergency" }), false);
});

test("CMMS signature rejects tampering", () => {
  const body = canonicalJson(buildMaintenanceWorkOrder(result, "four_sensor_specialist"));
  const secret = "sixteen-character-proof-secret";
  const signature = signPayload(body, secret);
  assert.equal(verifyPayload(body, signature, secret), true);
  assert.equal(verifyPayload(`${body} `, signature, secret), false);
  assert.equal(verifyPayload(body, "sha256=00", secret), false);
});

test("CMMS delivery retries transient failure and preserves idempotency key", async () => {
  const workOrder = buildMaintenanceWorkOrder(result, "four_sensor_specialist");
  let attempts = 0;
  const delivered = await deliverWorkOrder({
    url: "https://cmms.example/work-orders",
    workOrder,
    secret: "sixteen-character-proof-secret",
    retries: 1,
  }, { fetchImpl: async (_url, request) => {
    attempts += 1;
    assert.equal(request.headers["idempotency-key"], workOrder.externalId);
    assert.equal(verifyPayload(request.body, request.headers["x-rotornote-signature"], "sixteen-character-proof-secret"), true);
    return attempts === 1
      ? { ok: false, status: 503, json: async () => ({ error: "warming" }) }
      : { ok: true, status: 202, json: async () => ({ state: "accepted" }) };
  } });
  assert.equal(attempts, 2);
  assert.equal(delivered.payload.state, "accepted");
});

test("CMMS delivery refuses altered work orders and does not retry permanent rejection", async () => {
  const workOrder = buildMaintenanceWorkOrder(result, "four_sensor_specialist");
  let attempts = 0;
  await assert.rejects(deliverWorkOrder({
    url: "https://cmms.example/work-orders",
    workOrder: { ...workOrder, priority: "emergency" },
    secret: "sixteen-character-proof-secret",
    retries: 2,
  }, { fetchImpl: async () => { attempts += 1; throw new Error("must not send"); } }), /content hash/);
  assert.equal(attempts, 0);
  await assert.rejects(deliverWorkOrder({
    url: "https://cmms.example/work-orders",
    workOrder,
    secret: "sixteen-character-proof-secret",
    retries: 2,
  }, { fetchImpl: async () => {
    attempts += 1;
    return { ok: false, status: 422, json: async () => ({ error: "invalid_work_order" }) };
  } }), /422/);
  assert.equal(attempts, 1);
});

test("real gateway-to-CMMS loop accepts once, deduplicates, and rejects tampering", async () => {
  const receipt = await proveMaintenanceLoop();
  assert.equal(receipt.source.route, "four_sensor_specialist");
  assert.equal(receipt.delivery.firstState, "accepted");
  assert.equal(receipt.delivery.duplicateState, "duplicate");
  assert.equal(receipt.delivery.downstreamObjects, 1);
  assert.equal(receipt.delivery.tamperedStatus, 401);
  assert.ok(Object.values(receipt.gates).every(Boolean));
});
