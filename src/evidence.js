import { createHash } from "node:crypto";

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function createAnalysisReceipt({ csv, sampleRate, engine, model, context, result }) {
  const inputSha256 = sha256(Buffer.from(csv, "utf8"));
  const configurationSha256 = sha256(JSON.stringify(canonicalize({ sampleRate, engine, context })));
  const decisionEvidence = {
    primary: result.primary,
    confidence: result.confidence,
    decision: result.decision ?? { status: result.status, reasons: result.reasons, engineAgreement: result.engineAgreement },
    distribution: result.distribution,
    timeline: result.timeline ?? null,
    signal: {
      samples: result.signal.samples,
      sampleRate: result.signal.sampleRate,
      durationSeconds: result.signal.durationSeconds ?? result.signal.samples / result.signal.sampleRate,
      rms: result.signal.rms ?? null,
      peak: result.signal.peak ?? null,
    },
  };
  const outputSha256 = sha256(JSON.stringify(canonicalize(decisionEvidence)));
  const evidenceId = sha256(JSON.stringify({
    inputSha256,
    configurationSha256,
    outputSha256,
    fp32ModelSha256: model.metadata.float.sha256,
    int8ModelSha256: model.metadata.int8.sha256,
  })).slice(0, 20);

  return {
    schema: "rotornote.analysis-receipt.v1",
    evidenceId,
    inputSha256,
    configurationSha256,
    outputSha256,
    model: {
      format: model.metadata.format,
      fp32Sha256: model.metadata.float.sha256,
      int8Sha256: model.metadata.int8.sha256,
    },
    route: model.metadata.broadOutput ? "variable_speed_anomaly" : "four_sensor_specialist",
    statement: "Hash receipt proves reproducibility of these bytes and settings; it is not a digital signature or field certification.",
  };
}
