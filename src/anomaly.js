import { performance } from "node:perf_hooks";
import { assessSignalQuality } from "./quality.js";
import { extractFeatures, spectrumSummary } from "./signal.js";

const argmax = (values) => values.reduce((best, value, index) => value > values[best] ? index : best, 0);

function downsample(values, points = 180) {
  const result = [];
  for (let bucket = 0; bucket < points; bucket += 1) {
    const start = Math.floor((bucket * values.length) / points);
    const end = Math.max(start + 1, Math.floor(((bucket + 1) * values.length) / points));
    let sum = 0;
    for (let index = start; index < end; index += 1) sum += values[index];
    result.push(Number((sum / (end - start)).toFixed(5)));
  }
  return result;
}

export function analyzeVariableSpeedAnomaly(model, values, sampleRate, operatingRpm, engine = "optimized", context = {}) {
  const started = performance.now();
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
  const baselineStarted = performance.now();
  const baseline = model.infer(features, "baseline");
  const baselineMs = performance.now() - baselineStarted;
  const optimizedStarted = performance.now();
  const optimized = model.infer(features, "optimized");
  const optimizedMs = performance.now() - optimizedStarted;
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
  const quality = assessSignalQuality(values, sampleRate);
  const reasons = [];
  if (baselineLabel !== optimizedLabel) reasons.push("engine_disagreement");
  if (quality.status !== "good") reasons.push(...quality.flags.map((flag) => flag.code));
  const [minimumRpm, maximumRpm] = model.metadata.training.operatingRpmRange;
  if (operatingRpm < minimumRpm || operatingRpm > maximumRpm) reasons.push("outside_operating_envelope");
  if (!distribution.inDistribution) reasons.push("outside_training_envelope");
  if (confidence < model.metadata.decisionPolicy.minimumConfidence) reasons.push("low_model_confidence");
  const status = reasons.length ? "review_required" : "screened";
  const candidate = model.metadata.broadOutput.labels[selectedLabel];
  const rms = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length);
  const guidance = status === "review_required" ? {
    title: "Review required before using this screen",
    action: "Repeat the one-channel capture at the same point, axis, speed, and load; route persistent uncertainty to a qualified vibration analyst.",
    severity: "review",
    candidate,
  } : candidate === "healthy" ? {
    title: "Pattern inside the learned healthy envelope",
    action: "Save this run as the comparison baseline and repeat at the same point, speed, and load next round.",
    severity: "observe",
  } : {
    title: "Broad vibration anomaly detected",
    action: "Repeat the capture under the same operating condition, then send both traces and this evidence receipt to a qualified vibration analyst.",
    severity: "inspect",
  };
  return {
    status,
    primary: status === "screened" ? candidate : "review_required",
    confidence: Number(confidence.toFixed(4)),
    engine,
    guidance,
    engineAgreement: baselineLabel === optimizedLabel,
    conditionRepresentationAgreement: argmax(baseline) === argmax(optimized),
    probabilities: Object.fromEntries(model.metadata.broadOutput.labels.map((label, index) => [label, Number(selected[index].toFixed(6))])),
    distribution,
    reasons,
    decision: {
      status,
      reasons,
      distributionCoverage: distribution.inDistribution ? 1 : 0,
      engineAgreement: baselineLabel === optimizedLabel ? 1 : 0,
      quality,
      policy: `Abstain when confidence is below ${model.metadata.decisionPolicy.minimumConfidence}, signal quality fails, operating RPM leaves the fitted envelope, the representation leaves the training envelope, or FP32 and INT8 labels disagree.`,
    },
    validationContext: {
      independenceUnit: "complete measurement sequence",
      heldOutUnits: model.metadata.training.measurementSequences,
      operatingPoint: model.metadata.decisionPolicy.groupedValidation,
      riskCoverage: model.metadata.decisionPolicy.riskCoverage,
      interpretation: "Observed grouped laboratory risk/coverage only; model scores are not calibrated field-failure probabilities.",
    },
    context: { ...context, operatingRpm },
    signal: {
      samples: values.length,
      sampleRate,
      operatingRpm,
      durationSeconds: Number((values.length / sampleRate).toFixed(2)),
      windows: offsets.length,
      featureWindows: offsets.length,
      temporalAggregation: "ordered_concatenation",
      rms: Number(rms.toFixed(5)),
      waveform: downsample(values),
      spectrum: spectrumSummary(values.subarray(offsets[0], offsets[0] + 2048), sampleRate),
    },
    timeline: [{
      second: 0,
      label: candidate,
      confidence: Number(confidence.toFixed(4)),
      inDistribution: distribution.inDistribution,
      distance: distribution.distance,
      witnessLabel: model.metadata.broadOutput.labels[engine === "baseline" ? optimizedLabel : baselineLabel],
    }],
    timing: {
      inferenceMs: Number((engine === "baseline" ? baselineMs : optimizedMs).toFixed(3)),
      totalMs: Number((performance.now() - started).toFixed(3)),
    },
    model: { format: model.metadata.format, architecture: model.metadata.architecture, learnedExperimentalConditions: model.metadata.labels.length, source: model.metadata.training.source.title },
    note: "The learned representation preserves eight observed experimental conditions, but this product boundary emits healthy-versus-anomaly only. It does not identify a field fault family, estimate severity, or replace a qualified vibration review.",
  };
}
