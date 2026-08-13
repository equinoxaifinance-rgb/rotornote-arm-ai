import { extractFeatures } from "./signal.js";

const argmax = (values) => values.reduce((best, value, index) => value > values[best] ? index : best, 0);

export function analyzeVariableSpeedAnomaly(model, values, sampleRate, operatingRpm, engine = "optimized") {
  if (values.length < 2048) throw new Error("Variable-speed anomaly screening needs at least 2,048 samples");
  if (!Number.isFinite(operatingRpm) || operatingRpm <= 0) throw new Error("Operating RPM is required for variable-speed anomaly screening");
  const offsets = values.length === 2048 ? [0] : [0, values.length - 2048];
  const features = new Float32Array(model.metadata.inputFeatures);
  for (const offset of offsets) {
    const row = extractFeatures(values.subarray(offset, offset + 2048), sampleRate, operatingRpm);
    for (let feature = 0; feature < features.length; feature += 1) features[feature] += row[feature] / offsets.length;
  }
  const baseline = model.infer(features, "baseline");
  const optimized = model.infer(features, "optimized");
  const baselineLabel = argmax(baseline);
  const optimizedLabel = argmax(optimized);
  const selected = engine === "baseline" ? baseline : optimized;
  const selectedLabel = argmax(selected);
  const confidence = selected[selectedLabel];
  const distribution = model.assessDistribution(features);
  const reasons = [];
  if (baselineLabel !== optimizedLabel) reasons.push("engine_disagreement");
  if (!distribution.inDistribution) reasons.push("outside_training_envelope");
  if (confidence < model.metadata.decisionPolicy.minimumConfidence) reasons.push("low_model_confidence");
  const status = reasons.length ? "review_required" : "screened";
  return {
    status,
    primary: status === "screened" ? model.metadata.labels[selectedLabel] : "review_required",
    confidence: Number(confidence.toFixed(4)),
    engine,
    engineAgreement: baselineLabel === optimizedLabel,
    probabilities: Object.fromEntries(model.metadata.labels.map((label, index) => [label, Number(selected[index].toFixed(6))])),
    distribution,
    reasons,
    signal: { samples: values.length, sampleRate, operatingRpm, featureWindows: offsets.length },
    model: { format: model.metadata.format, architecture: model.metadata.architecture, source: model.metadata.training.source.title },
    note: "Variable-speed healthy-versus-anomaly screen only. It does not identify a fault family, estimate severity, or replace a qualified vibration review.",
  };
}
