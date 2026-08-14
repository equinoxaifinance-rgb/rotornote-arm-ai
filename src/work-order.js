import { createHash } from "node:crypto";

function requireText(value, name) {
  if (typeof value !== "string" || value.length < 1 || value.length > 4096) throw new Error(`Invalid ${name}`);
  return value;
}

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function buildMaintenanceWorkOrder(result, route = "unspecified", context = result?.context) {
  const evidenceId = requireText(result?.receipt?.evidenceId, "evidence ID");
  const machineId = requireText(context?.machineId, "machine ID");
  const measurementPoint = requireText(context?.measurementPoint, "measurement point");
  const primary = requireText(result?.primary, "screening label");
  const decisionStatus = result?.decision?.status || result?.status;
  if (!new Set(["screened", "review_required"]).has(decisionStatus)) throw new Error("Invalid decision status");
  const requiresReview = decisionStatus === "review_required" || primary !== "healthy";
  const nextAction = result?.guidance?.action || "Repeat the one-channel measurement at the same point, axis, RPM, load, and sample rate; send the evidence receipt to a qualified vibration analyst.";
  const workOrder = {
    schema: "rotornote.cmms-work-order.v1",
    externalId: `rotornote-${evidenceId}`,
    state: "open",
    intent: "qualified_vibration_review",
    priority: decisionStatus === "review_required" ? "review_required" : primary === "healthy" ? "routine_retest" : "inspection_requested",
    asset: {
      machineId,
      measurementPoint,
      sensorAxis: context.sensorAxis,
      operatingRpm: context.operatingRpm,
      loadPercent: context.loadPercent,
    },
    screening: {
      route,
      label: primary,
      decisionStatus,
      modelScore: result.confidence,
      scoreMeaning: "model score; not a calibrated probability",
      engine: result.engine,
      engineAgreement: result.decision?.engineAgreement ?? (result.engineAgreement ? 1 : 0),
      requiresQualifiedReview: requiresReview,
    },
    request: {
      summary: `${machineId} / ${measurementPoint}: RotorNote ${decisionStatus === "screened" ? `screened ${primary}` : "requires review"}`,
      nextAction: requireText(nextAction, "next action"),
      guardrail: "Advisory screening only. Confirm with a like-for-like retest and qualified vibration review before maintenance action.",
    },
    evidence: {
      evidenceId,
      statement: requireText(result.receipt.statement, "evidence statement"),
      sourceReceipt: result.receipt,
    },
  };
  workOrder.contentSha256 = createHash("sha256").update(canonicalJson(workOrder)).digest("hex");
  return workOrder;
}

export function verifyWorkOrderIntegrity(workOrder) {
  if (!workOrder || typeof workOrder !== "object" || !/^[a-f0-9]{64}$/.test(workOrder.contentSha256 || "")) return false;
  const { contentSha256, ...content } = workOrder;
  const computed = createHash("sha256").update(canonicalJson(content)).digest("hex");
  return computed === contentSha256;
}
