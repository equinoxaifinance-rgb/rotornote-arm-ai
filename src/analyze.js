import { performance } from "node:perf_hooks";
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
  bearing: {
    title: "High-frequency impacts resemble bearing distress",
    action: "Schedule a qualified inspection; compare temperature and a second vibration point before acting.",
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

export function analyzeSignal(model, values, sampleRate, engine = "optimized") {
  const started = performance.now();
  const windows = segmentSignal(values);
  const predictions = [];
  let inferenceMs = 0;
  for (let index = 0; index < windows.length; index += 1) {
    const features = extractFeatures(windows[index], sampleRate);
    const inferenceStarted = performance.now();
    const probabilities = model.infer(features, engine);
    inferenceMs += performance.now() - inferenceStarted;
    let labelIndex = 0;
    for (let i = 1; i < probabilities.length; i += 1) if (probabilities[i] > probabilities[labelIndex]) labelIndex = i;
    predictions.push({
      second: Number(((index * 1024) / sampleRate).toFixed(2)),
      label: model.metadata.labels[labelIndex],
      confidence: Number(probabilities[labelIndex].toFixed(4)),
      probabilities,
    });
  }
  const averages = model.metadata.labels.map((_, labelIndex) =>
    predictions.reduce((sum, prediction) => sum + prediction.probabilities[labelIndex], 0) / predictions.length);
  let primaryIndex = 0;
  for (let i = 1; i < averages.length; i += 1) if (averages[i] > averages[primaryIndex]) primaryIndex = i;
  const primary = model.metadata.labels[primaryIndex];
  const rms = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length);
  const peak = values.reduce((maximum, value) => Math.max(maximum, Math.abs(value)), 0);
  const clipping = values.reduce((count, value) => count + (Math.abs(value) >= 999 ? 1 : 0), 0) / values.length;
  const totalMs = performance.now() - started;

  return {
    engine,
    primary,
    confidence: Number(averages[primaryIndex].toFixed(4)),
    guidance: GUIDANCE[primary],
    distribution: Object.fromEntries(model.metadata.labels.map((label, index) => [label, Number(averages[index].toFixed(4))])),
    timeline: predictions.map(({ probabilities: _, ...prediction }) => prediction),
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
    note: "Screening aid only — confirm findings with a qualified technician and like-for-like measurements.",
  };
}

