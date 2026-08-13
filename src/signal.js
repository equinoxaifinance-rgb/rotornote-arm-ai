export const WINDOW_SIZE = 8192;
export const HOP_SIZE = 4096;
export const FEATURE_COUNT = 48;
export const LABELS = ["healthy", "imbalance", "misalignment", "looseness"];

export function fftPower(input) {
  const size = input.length;
  if (size < 2 || (size & (size - 1)) !== 0) throw new Error("FFT length must be a power of two");
  const real = Float64Array.from(input);
  const imaginary = new Float64Array(size);

  for (let i = 1, j = 0; i < size; i += 1) {
    let bit = size >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [real[i], real[j]] = [real[j], real[i]];
    }
  }

  for (let length = 2; length <= size; length <<= 1) {
    const angle = (-2 * Math.PI) / length;
    const wLengthReal = Math.cos(angle);
    const wLengthImag = Math.sin(angle);
    for (let offset = 0; offset < size; offset += length) {
      let wReal = 1;
      let wImag = 0;
      for (let j = 0; j < length / 2; j += 1) {
        const even = offset + j;
        const odd = even + length / 2;
        const oddReal = real[odd] * wReal - imaginary[odd] * wImag;
        const oddImag = real[odd] * wImag + imaginary[odd] * wReal;
        real[odd] = real[even] - oddReal;
        imaginary[odd] = imaginary[even] - oddImag;
        real[even] += oddReal;
        imaginary[even] += oddImag;
        const nextReal = wReal * wLengthReal - wImag * wLengthImag;
        wImag = wReal * wLengthImag + wImag * wLengthReal;
        wReal = nextReal;
      }
    }
  }

  const power = new Float64Array(size / 2);
  for (let i = 0; i < power.length; i += 1) {
    power[i] = real[i] * real[i] + imaginary[i] * imaginary[i];
  }
  return power;
}

export function extractFeatures(window, sampleRate = 1024, operatingRpm = null) {
  if (window.length !== WINDOW_SIZE) throw new Error(`Expected ${WINDOW_SIZE} samples`);
  let sum = 0;
  let sumAbs = 0;
  let sumSquares = 0;
  let peak = 0;
  let crossings = 0;
  for (let i = 0; i < window.length; i += 1) {
    const value = window[i];
    sum += value;
    sumAbs += Math.abs(value);
    sumSquares += value * value;
    peak = Math.max(peak, Math.abs(value));
    if (i && (value < 0) !== (window[i - 1] < 0)) crossings += 1;
  }
  const mean = sum / window.length;
  const meanAbs = sumAbs / window.length;
  const rms = Math.sqrt(sumSquares / window.length) + 1e-12;
  let moment3 = 0;
  let moment4 = 0;
  for (const value of window) {
    const centered = value - mean;
    moment3 += centered ** 3;
    moment4 += centered ** 4;
  }
  const variance = Math.max(sumSquares / window.length - mean * mean, 1e-12);
  const deviation = Math.sqrt(variance);
  const timeFeatures = [
    Math.log1p(rms),
    Math.log1p(peak),
    peak / rms,
    moment4 / window.length / variance ** 2,
    moment3 / window.length / deviation ** 3,
    crossings / window.length,
    Math.log1p(meanAbs),
    peak / (meanAbs + 1e-12),
  ];

  const power = fftPower(window);
  power[0] = 0;
  const totalPower = power.reduce((total, value) => total + value, 1e-12);
  const bandFeatures = [];
  for (let band = 0; band < 16; band += 1) {
    const start = Math.max(1, Math.floor(Math.exp((band / 16) * Math.log(power.length))));
    const end = Math.max(start + 1, Math.floor(Math.exp(((band + 1) / 16) * Math.log(power.length))));
    let energy = 0;
    for (let bin = start; bin < end; bin += 1) energy += power[bin];
    bandFeatures.push(Math.log1p((energy / totalPower) * 1000));
  }

  const orderFeatures = [];
  const orderTargets = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 9, 10, 12, 15];
  const shaftHz = Number.isFinite(Number(operatingRpm)) && Number(operatingRpm) > 0 ? Number(operatingRpm) / 60 : sampleRate / 1024;
  for (const order of orderTargets) {
    const center = (shaftHz * order * window.length) / sampleRate;
    const radius = Math.max(1, Math.ceil(center * 0.06));
    const start = Math.max(1, Math.floor(center - radius));
    const end = Math.min(power.length, Math.ceil(center + radius + 1));
    let energy = 0;
    for (let bin = start; bin < end; bin += 1) energy += power[bin];
    orderFeatures.push(Math.log1p((energy / totalPower) * 1000));
  }

  let weighted = 0;
  let weightedSquare = 0;
  let maxPower = 0;
  let maxBin = 1;
  let cumulative = 0;
  let rolloffBin = 1;
  for (let bin = 1; bin < power.length; bin += 1) {
    weighted += bin * power[bin];
    weightedSquare += bin * bin * power[bin];
    if (power[bin] > maxPower) {
      maxPower = power[bin];
      maxBin = bin;
    }
    cumulative += power[bin];
    if (cumulative < totalPower * 0.85) rolloffBin = bin;
  }
  const centroidBin = weighted / totalPower;
  const spreadBin = Math.sqrt(Math.max(weightedSquare / totalPower - centroidBin ** 2, 0));
  const rangePower = (from, to) => {
    let value = 0;
    for (let bin = Math.floor(from); bin < Math.min(Math.floor(to), power.length); bin += 1) value += power[bin];
    return value / totalPower;
  };
  const spectralFeatures = [
    centroidBin / power.length,
    spreadBin / power.length,
    rolloffBin / power.length,
    maxBin / power.length,
    maxPower / totalPower,
    rangePower(1, power.length / 8),
    rangePower(power.length / 8, power.length / 3),
    rangePower(power.length / 3, power.length),
  ];

  const result = Float32Array.from([...orderFeatures, ...bandFeatures, ...timeFeatures, ...spectralFeatures]);
  const invalidIndex = result.findIndex((value) => !Number.isFinite(value));
  if (result.length !== FEATURE_COUNT || invalidIndex !== -1) {
    throw new Error(`Feature extraction produced invalid output (length=${result.length}, invalidIndex=${invalidIndex})`);
  }
  return result;
}

export function segmentSignal(values) {
  const segments = [];
  for (let start = 0; start + WINDOW_SIZE <= values.length; start += HOP_SIZE) {
    segments.push(values.subarray(start, start + WINDOW_SIZE));
  }
  return segments;
}

export function spectrumSummary(values, sampleRate) {
  const window = values.subarray(0, WINDOW_SIZE);
  const power = fftPower(window);
  power[0] = 0;
  const ranked = Array.from(power, (value, bin) => ({
    hz: (bin * sampleRate) / WINDOW_SIZE,
    power: value,
  })).sort((a, b) => b.power - a.power).slice(0, 5);
  const max = Math.max(...power, 1e-12);
  const plot = [];
  for (let index = 1; index < power.length; index += 8) {
    let bucket = 0;
    for (let bin = index; bin < Math.min(index + 8, power.length); bin += 1) bucket += power[bin];
    plot.push(Number(Math.sqrt(bucket / 8 / max).toFixed(5)));
  }
  return {
    peaks: ranked.map(({ hz, power: peakPower }) => ({ hz: Number(hz.toFixed(1)), relative: Number((peakPower / max).toFixed(4)) })),
    bins: plot,
  };
}
