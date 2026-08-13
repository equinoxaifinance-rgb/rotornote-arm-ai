import { WINDOW_SIZE } from "./signal.js";

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
export const MAX_SAMPLES = 131072;

export class InputError extends Error {
  constructor(message, code = "invalid_csv") {
    super(message);
    this.name = "InputError";
    this.code = code;
  }
}

export function parseCsv(text, requestedSampleRate = 1024, { minimumSamples = WINDOW_SIZE } = {}) {
  if (typeof text !== "string") throw new InputError("Body must be UTF-8 CSV text");
  if (Buffer.byteLength(text) > MAX_UPLOAD_BYTES) throw new InputError("CSV exceeds the 8 MiB limit", "payload_too_large");
  if (text.includes("\0")) throw new InputError("CSV contains a null byte");
  const sampleRate = Number(requestedSampleRate);
  if (!Number.isFinite(sampleRate) || sampleRate < 256 || sampleRate > 100000) {
    throw new InputError("Sample rate must be between 256 and 100000 Hz", "invalid_sample_rate");
  }

  const channels = [];
  let dataColumns = null;
  let previousTimestamp = -Infinity;
  for (const originalLine of text.split(/\r?\n/)) {
    const line = originalLine.trim();
    if (!line || line.startsWith("#")) continue;
    const columns = line.split(",").map((value) => value.trim());
    if (dataColumns === null && columns.some((value) => /[a-z]/i.test(value))) {
      dataColumns = columns.length;
      if (![1, 2, 4, 5].includes(dataColumns)) throw new InputError("Use one sensor, four sensors, or an optional timestamp before them");
      continue;
    }
    if (![1, 2, 4, 5].includes(columns.length)) throw new InputError("Every row needs one sensor, four sensors, or an optional timestamp before them");
    if (dataColumns !== null && columns.length !== dataColumns) throw new InputError("CSV column count changes between rows");
    dataColumns ??= columns.length;
    const hasTimestamp = columns.length === 2 || columns.length === 5;
    const amplitudes = columns.slice(hasTimestamp ? 1 : 0).map(Number);
    if (amplitudes.some((value) => !Number.isFinite(value))) throw new InputError("Every amplitude must be a finite number");
    if (amplitudes.some((value) => Math.abs(value) > 1000)) throw new InputError("Amplitude exceeds the ±1000 safety range");
    if (hasTimestamp) {
      const timestamp = Number(columns[0]);
      if (!Number.isFinite(timestamp) || timestamp <= previousTimestamp) throw new InputError("Timestamps must be finite and strictly increasing");
      previousTimestamp = timestamp;
    }
    if (!channels.length) for (let index = 0; index < amplitudes.length; index += 1) channels.push([]);
    if (amplitudes.length !== channels.length) throw new InputError("CSV sensor count changes between rows");
    amplitudes.forEach((value, index) => channels[index].push(value));
    if (channels[0].length > MAX_SAMPLES) throw new InputError(`CSV exceeds ${MAX_SAMPLES} samples`, "too_many_samples");
  }
  if (!Number.isInteger(minimumSamples) || minimumSamples < 1024) throw new InputError("Minimum sample contract is invalid");
  if (!channels.length || channels[0].length < minimumSamples) throw new InputError(`At least ${minimumSamples} samples are required`, "too_few_samples");
  const typedChannels = channels.map((values) => Float32Array.from(values));
  return { values: typedChannels[0], channels: typedChannels, sampleRate };
}
