import { performance } from "node:perf_hooks";
import { assessSignalQuality } from "./quality.js";
import { extractFeatures, segmentSignal, spectrumSummary } from "./signal.js";

const GUIDANCE = {
  healthy: {
    title: "Pattern inside the learned healthy envelope",
    action: "Save this run as the comparison baseline and repeat at the same load next round.",
    severity: "observe",
  },
  imbalance: {
    title: "Strong once-per-revolution pattern",
    action: "Inspect buildup and balance condition; retest after cleaning at the same speed and load.",
    severity: "plan",
  },
  misalignment: {
    title: "Multiple shaft harmonics resemble misalignment",
    action: "Check soft foot and coupling alignment, then capture a like-for-like retest before returning to service.",
    severity: "plan",
  },
  looseness: {
    title: "Impacts and subharmonics resemble looseness",
    action: "Inspect mounts, baseplate, and fasteners before a controlled retest.",
    severity: "inspect",
  },
};

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

function argmax(values) {
  let best = 0;
  for (let index = 1; index < values.length; index += 1) if (values[index] > values[best]) best = index;
  return best;
}

export function analyzeSignal(model, values, sampleRate, engine = "optimized", { verifyParity = false, context = {} } = {}) {
  const started = performance.now();
  const windows = segmentSignal(values);
  const predictions = [];
  let inferenceMs = 0;
  let agreementCount = 0;
  let inDistributionCount = 0;

  for (let index = 0; index < windows.length; index += 1) {
    const features = extractFeatures(windows[index], sampleRate, context.operatingRpm);
    const inferenceStarted = performance.now();
    const probabilities = model.infer(features, engine);
    inferenceMs += performance.now() - inferenceStarted;
    const labelIndex = argmax(probabilities);
    const distributionAssessment = model.assessDistribution(features);
    if (distributionAssessment.inDistribution) inDistributionCount += 1;

    let witnessLabel = null;
    if (verifyParity) {
      const witness = model.infer(features, engine === "optimized" ? "baseline" : "optimized");
      witnessLabel = model.metadata.labels[argmax(witness)];
      if (witnessLabel === model.metadata.labels[labelIndex]) agreementCount += 1;
    }

    predictions.push({
      second: Number(((index * 1024) / sampleRate).toFixed(2)),
      label: model.metadata.labels[labelIndex],
      confidence: Number(probabilities[labelIndex].toFixed(4)),
      probabilities,
      inDistribution: distributionAssessment.inDistribution,
      distance: distributionAssessment.distance,
      witnessLabel,
    });
  }

  const averages = model.metadata.labels.map((_, labelIndex) =>
    predictions.reduce((sum, prediction) => sum + prediction.probabilities[labelIndex], 0) / predictions.length);
  const primaryIndex = argmax(averages);
  const primary = model.metadata.labels[primaryIndex];
  const rms = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length);
  const peak = values.reduce((maximum, value) => Math.max(maximum, Math.abs(value)), 0);
  const clipping = values.reduce((count, value) => count + (Math.abs(value) >= 999 ? 1 : 0), 0) / values.length;
  const quality = assessSignalQuality(values, sampleRate);
  const distributionCoverage = inDistributionCount / predictions.length;
  const engineAgreement = verifyParity ? agreementCount / predictions.length : null;
  const reasons = [];
  if (quality.status !== "good") reasons.push(...quality.flags.map((flag) => flag.code));
  if (!Number.isFinite(context.operatingRpm) || context.operatingRpm <= 0) reasons.push("missing_operating_rpm");
  if (distributionCoverage < 0.6) reasons.push("outside_calibration_envelope");
  if (verifyParity && engineAgreement < 1) reasons.push("engine_disagreement");
  if (averages[primaryIndex] < model.metadata.decisionPolicy.minimumConfidence) reasons.push("low_model_confidence");
  const decisionStatus = reasons.length ? "review_required" : "screened";
  const totalMs = performance.now() - started;

  return {
    engine,
    primary,
    confidence: Number(averages[primaryIndex].toFixed(4)),
    guidance: decisionStatus === "screened" ? GUIDANCE[primary] : {
      title: "Review required before using this screen",
      action: "Repeat the capture with a verified mount and operating condition, then route persistent uncertainty to a qualified vibration analyst.",
      severity: "review",
      candidate: GUIDANCE[primary].title,
    },
    distribution: Object.fromEntries(model.metadata.labels.map((label, index) => [label, Number(averages[index].toFixed(4))])),
    timeline: predictions.map(({ probabilities, ...prediction }) => ({
      ...prediction,
      distribution: Object.fromEntries(model.metadata.labels.map((label, labelIndex) => [label, Number(probabilities[labelIndex].toFixed(4))])),
    })),
    decision: {
      status: decisionStatus,
      reasons,
      distributionCoverage: Number(distributionCoverage.toFixed(4)),
      engineAgreement: engineAgreement === null ? null : Number(engineAgreement.toFixed(4)),
      quality,
      policy: `Abstain when confidence is below ${model.metadata.decisionPolicy.minimumConfidence}, signal quality fails, most windows leave the fitted envelope, or FP32 and INT8 labels disagree.`,
    },
    context,
    signal: {
      samples: values.length,
      sampleRate,
      durationSeconds: Number((values.length / sampleRate).toFixed(2)),
      windows: windows.length,
      rms: Number(rms.toFixed(5)),
      peak: Number(peak.toFixed(5)),
      clippingFraction: Number(clipping.toFixed(6)),
      waveform: downsample(values),
      spectrum: spectrumSummary(values, sampleRate),
    },
    timing: { inferenceMs: Number(inferenceMs.toFixed(3)), totalMs: Number(totalMs.toFixed(3)) },
    note: decisionStatus === "screened"
      ? "Screening aid only — confirm findings with a qualified vibration analyst and like-for-like measurements."
      : "No operational conclusion: repeat the capture or route it to a qualified vibration analyst.",
  };
}

export function analyzeChannels(model, channels, sampleRate, engine = "optimized", options = {}) {
  if (!Array.isArray(channels) || ![1, 4].includes(channels.length)) throw new Error("RotorNote accepts one or four synchronized sensor channels");
  if (channels.length === 1) return analyzeSignal(model, channels[0], sampleRate, engine, options);

  const results = channels.map((values) => analyzeSignal(model, values, sampleRate, engine, options));
  const distribution = Object.fromEntries(model.metadata.labels.map((label) => [label,
    Number((results.reduce((sum, result) => sum + result.distribution[label], 0) / results.length).toFixed(4)),
  ]));
  const primary = Object.entries(distribution).reduce((best, current) => current[1] > best[1] ? current : best)[0];
  const reasons = [...new Set(results.flatMap((result) => result.decision.reasons).filter((reason) => reason !== "low_model_confidence"))];
  if (distribution[primary] < model.metadata.decisionPolicy.minimumConfidence) reasons.push("low_model_confidence");
  const screened = reasons.length === 0;
  const result = results[0];
  result.primary = primary;
  result.confidence = distribution[primary];
  result.distribution = distribution;
  result.guidance = screened ? GUIDANCE[primary] : {
    title: "Review required before using this screen",
    action: "Repeat the four-channel capture with verified synchronized mounts, then route persistent uncertainty to a qualified vibration analyst.",
    severity: "review",
    candidate: GUIDANCE[primary].title,
  };
  result.decision = {
    ...result.decision,
    status: screened ? "screened" : "review_required",
    reasons,
    distributionCoverage: Number((results.reduce((sum, item) => sum + item.decision.distributionCoverage, 0) / results.length).toFixed(4)),
    engineAgreement: Number(Math.min(...results.map((item) => item.decision.engineAgreement ?? 1)).toFixed(4)),
    channelQuality: results.map((item, index) => ({ channel: index + 1, ...item.decision.quality })),
    policy: "Four synchronized sensors are aggregated only after each channel passes quality, calibration-envelope, and engine-parity checks.",
  };
  result.signal.channels = channels.length;
  result.signal.aggregation = "mean class probability across four synchronized sensor channels";
  result.signal.displayChannel = 1;
  result.timeline = results[0].timeline.map((_, windowIndex) => {
    const windowDistribution = Object.fromEntries(model.metadata.labels.map((label) => [label,
      Number((results.reduce((sum, item) => sum + item.timeline[windowIndex].distribution[label], 0) / results.length).toFixed(4)),
    ]));
    const label = Object.entries(windowDistribution).reduce((best, current) => current[1] > best[1] ? current : best)[0];
    return {
      second: results[0].timeline[windowIndex].second,
      label,
      confidence: windowDistribution[label],
      distribution: windowDistribution,
      inDistribution: results.every((item) => item.timeline[windowIndex].inDistribution),
      distance: Math.max(...results.map((item) => item.timeline[windowIndex].distance)),
      witnessLabel: results.every((item) => item.timeline[windowIndex].witnessLabel === item.timeline[windowIndex].label) ? label : "engine_disagreement",
    };
  });
  result.channelResults = results.map((item, index) => ({
    channel: index + 1,
    primary: item.primary,
    confidence: item.confidence,
    status: item.decision.status,
    distributionCoverage: item.decision.distributionCoverage,
  }));
  result.note = screened
    ? "Four-channel screening aid only — confirm findings with a qualified vibration analyst and like-for-like measurements."
    : "No operational conclusion: repeat the synchronized capture or route it to a qualified vibration analyst.";
  return result;
}
