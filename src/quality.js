export function assessSignalQuality(values, sampleRate) {
  let sum = 0;
  let sumSquares = 0;
  let minimum = Infinity;
  let maximum = -Infinity;
  let maxAbs = 0;
  let longestRepeatedRun = 1;
  let repeatedRun = 1;

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    sum += value;
    sumSquares += value * value;
    minimum = Math.min(minimum, value);
    maximum = Math.max(maximum, value);
    maxAbs = Math.max(maxAbs, Math.abs(value));
    if (index && value === values[index - 1]) repeatedRun += 1;
    else repeatedRun = 1;
    longestRepeatedRun = Math.max(longestRepeatedRun, repeatedRun);
  }

  const mean = sum / values.length;
  const rms = Math.sqrt(sumSquares / values.length);
  const peakToPeak = maximum - minimum;
  const saturationBand = maxAbs * 0.9995;
  const saturationFraction = maxAbs === 0 ? 1 : values.reduce(
    (count, value) => count + (Math.abs(value) >= saturationBand ? 1 : 0), 0,
  ) / values.length;
  const flags = [];

  if (rms < 1e-5 || peakToPeak < 1e-4) flags.push({ code: "flatline", message: "Signal energy is too low for a trustworthy screen." });
  if (saturationFraction >= 0.02) flags.push({ code: "possible_clipping", message: "Repeated peak values resemble sensor clipping." });
  if (Math.abs(mean) / Math.max(rms, 1e-12) > 0.5) flags.push({ code: "dc_bias", message: "Large DC bias suggests a mounting or acquisition issue." });
  if (longestRepeatedRun >= Math.max(32, Math.floor(sampleRate * 0.05))) {
    flags.push({ code: "sensor_dropout", message: "Repeated identical samples suggest sensor or transport dropout." });
  }

  return {
    status: flags.length ? "review" : "good",
    flags,
    metrics: {
      mean: Number(mean.toFixed(6)),
      rms: Number(rms.toFixed(6)),
      peakToPeak: Number(peakToPeak.toFixed(6)),
      saturationFraction: Number(saturationFraction.toFixed(6)),
      longestRepeatedRun,
    },
  };
}

