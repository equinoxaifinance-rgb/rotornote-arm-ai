export const WINDOW_SIZE = 2048;
export const HOP_SIZE = 1024;
export const FEATURE_COUNT = 48;
export const LABELS = ["healthy", "imbalance", "misalignment", "looseness", "bearing"];

export function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(random) {
  const u = Math.max(random(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
}

export function simulateSignal(kind, count = WINDOW_SIZE, sampleRate = 1024, seed = 1, options = {}) {
  if (!LABELS.includes(kind)) throw new Error(`Unknown simulation kind: ${kind}`);
  const random = mulberry32(seed);
  const values = new Float32Array(count);
  const shaftHz = 36 + random() * 18;
  const phase = random() * Math.PI * 2;
  const stress = Boolean(options.stress);
  const severity = options.severity ?? (0.48 + random() * 0.72);
  const gain = 0.72 + random() * 0.64;
  const noise = (stress ? 0.12 : 0.055) + random() * (stress ? 0.19 : 0.11);
  const drift = (random() - 0.5) * (stress ? 0.055 : 0.018);
  const bias = (random() - 0.5) * (stress ? 0.09 : 0.035);
  const faultKinds = LABELS.filter((label) => label !== "healthy" && label !== kind);
  const contaminant = faultKinds[Math.floor(random() * faultKinds.length)];
  const contaminantStrength = (stress ? 0.18 : 0.04) + random() * (stress ? 0.3 : 0.15);
  const impulseSpacing = sampleRate / shaftHz;

  const faultComponent = (fault, angle, time, index) => {
    if (fault === "imbalance") return 0.78 * Math.sin(angle) + 0.16 * Math.sin(2 * angle + 0.2);
    if (fault === "misalignment") return 0.3 * Math.sin(angle) + 0.58 * Math.sin(2 * angle + 0.4) + 0.31 * Math.sin(3 * angle - 0.2);
    if (fault === "looseness") {
      let component = 0.24 * Math.sin(angle / 2) + 0.27 * Math.sin(2 * angle);
      component += 0.22 * Math.sign(Math.sin(angle)) * Math.abs(Math.sin(4 * angle));
      if (random() < 0.006) component += (random() - 0.5) * 2.4;
      return component;
    }
    if (fault === "bearing") {
      const distance = ((index + impulseSpacing * 0.12) % impulseSpacing);
      const impulse = distance < 22 ? 0.92 * Math.exp(-distance / 7) * Math.sin(2 * Math.PI * (210 + shaftHz * 0.7) * time) : 0;
      return 0.13 * Math.sin(2 * angle) + impulse;
    }
    return 0;
  };

  for (let index = 0; index < count; index += 1) {
    const time = index / sampleRate;
    const instantaneousHz = shaftHz * (1 + drift * Math.sin(2 * Math.PI * 0.7 * time));
    const angle = 2 * Math.PI * instantaneousHz * time + phase;
    let value = 0.22 * Math.sin(angle) + 0.02 * Math.sin(2 * angle + 0.3) + noise * gaussian(random) + bias;

    // Every class shares nuisance harmonics and a weak secondary fault. This
    // deliberately prevents the synthetic benchmark from being a collection
    // of non-overlapping formulas.
    value += (0.03 + random() * 0.12) * Math.sin(2 * angle + random() * 0.04);
    value += contaminantStrength * faultComponent(contaminant, angle, time, index);

    if (kind === "healthy") {
      value += 0.025 * Math.sin(3 * angle - 0.15);
    } else {
      value += severity * faultComponent(kind, angle, time, index);
    }

    if (stress) value += 0.08 * Math.sin(2 * Math.PI * (72 + random() * 8) * time);
    values[index] = gain * value;
  }
  return values;
}

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

export function extractFeatures(window, sampleRate = 1024) {
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
  for (let band = 0; band < 32; band += 1) {
    const start = 1 + Math.floor((band * (power.length - 1)) / 32);
    const end = 1 + Math.floor(((band + 1) * (power.length - 1)) / 32);
    let energy = 0;
    for (let bin = start; bin < end; bin += 1) energy += power[bin];
    bandFeatures.push(Math.log1p((energy / totalPower) * 1000));
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

  const result = Float32Array.from([...bandFeatures, ...timeFeatures, ...spectralFeatures]);
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
