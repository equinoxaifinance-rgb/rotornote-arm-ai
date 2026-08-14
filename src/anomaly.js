import { extractFeatures } from "./signal.js";

const argmax = (values) => values.reduce((best, value, index) => value > values[best] ? index : best, 0);

export function analyzeVariableSpeedAnomaly(model, values, sampleRate, operatingRpm, engine = "optimized") {
  if (values.length < 2048) throw new Error("Variable-speed anomaly screening needs at least 2,048 samples");
  if (!Number.isFinite(operatingRpm) || operatingRpm <= 0) throw new Error("Operating RPM is required for variable-speed anomaly screening");
  const offsets = [0, Math.max(0, values.length - 2048)];
  const features = new Float32Array(model.metadata.inputFeatures);
  for (let window = 0; window < offsets.length; window += 1) {
    const offset = offsets[window];
    const row = extractFeatures(values.subarray(offset, offset + 2048), sampleRate, operatingRpm);
    if (row.length * offsets.length !== features.length) throw new Error("Anomaly model temporal feature contract mismatch");
    features.set(row, window * row.length);
  }
  const baseline = model.infer(features, "baseline");
  const optimized = model.infer(features, "optimized");
  const healthyIndex = model.metadata.broadOutput.healthyConditionIndex;
  const collapse = (probabilities) => [probabilities[healthyIndex], 1 - probabilities[healthyIndex]];
  const baselineBroad = collapse(baseline);
  const optimizedBroad = collapse(optimized);
  const baselineLabel = argmax(baselineBroad);
  const optimizedLabel = argmax(optimizedBroad);
  const selected = engine === "baseline" ? baselineBroad : optimizedBroad;
  const selectedLabel = argmax(selected);
  const confidence = selected[selectedLabel];
  const distribution = model.assessDistribution(features);
  const reasons = [];
  if (baselineLabel !== optimizedLabel) reasons.push("engine_disagreement");
  const [minimumRpm, maximumRpm] = model.metadata.training.operatingRpmRange;
  if (operatingRpm < minimumRpm || operatingRpm > maximumRpm) reasons.push("outside_operating_envelope");
  if (!distribution.inDistribution) reasons.push("outside_training_envelope");
  if (confidence < model.metadata.decisionPolicy.minimumConfidence) reasons.push("low_model_confidence");
  const status = reasons.length ? "review_required" : "screened";
  return {
    status,
    primary: status === "screened" ? model.metadata.broadOutput.labels[selectedLabel] : "review_required",
    confidence: Number(confidence.toFixed(4)),
    engine,
    engineAgreement: baselineLabel === optimizedLabel,
    conditionRepresentationAgreement: argmax(baseline) === argmax(optimized),
    probabilities: Object.fromEntries(model.metadata.broadOutput.labels.map((label, index) => [label, Number(selected[index].toFixed(6))])),
    distribution,
    reasons,
    signal: { samples: values.length, sampleRate, operatingRpm, featureWindows: offsets.length, temporalAggregation: "ordered_concatenation" },
    model: { format: model.metadata.format, architecture: model.metadata.architecture, learnedExperimentalConditions: model.metadata.labels.length, source: model.metadata.training.source.title },
    note: "The learned representation preserves eight observed experimental conditions, but this product boundary emits healthy-versus-anomaly only. It does not identify a field fault family, estimate severity, or replace a qualified vibration review.",
  };
}
