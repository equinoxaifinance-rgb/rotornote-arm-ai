import { WINDOW_SIZE } from "./signal.js";

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
export const MAX_SAMPLES = 131072;

export class InputError extends Error {
  constructor(message, code = "invalid_csv") {
    super(message);
    this.name = "InputError";
    this.code = code;
  }
}

export function parseCsv(text, requestedSampleRate = 1024) {
  if (typeof text !== "string") throw new InputError("Body must be UTF-8 CSV text");
  if (Buffer.byteLength(text) > MAX_UPLOAD_BYTES) throw new InputError("CSV exceeds the 2 MiB limit", "payload_too_large");
  if (text.includes("\0")) throw new InputError("CSV contains a null byte");
  const sampleRate = Number(requestedSampleRate);
  if (!Number.isFinite(sampleRate) || sampleRate < 256 || sampleRate > 5000) {
    throw new InputError("Sample rate must be between 256 and 5000 Hz", "invalid_sample_rate");
  }

  const values = [];
  let dataColumns = null;
  let previousTimestamp = -Infinity;
  for (const originalLine of text.split(/\r?\n/)) {
    const line = originalLine.trim();
    if (!line || line.startsWith("#")) continue;
    const columns = line.split(",").map((value) => value.trim());
    if (dataColumns === null && columns.some((value) => /[a-z]/i.test(value))) {
      dataColumns = columns.length;
      if (dataColumns !== 1 && dataColumns !== 2) throw new InputError("Use one amplitude column or timestamp,amplitude");
      continue;
    }
    if (columns.length !== 1 && columns.length !== 2) throw new InputError("Every row needs one amplitude or timestamp,amplitude");
    if (dataColumns !== null && columns.length !== dataColumns) throw new InputError("CSV column count changes between rows");
    dataColumns ??= columns.length;
    const amplitude = Number(columns.at(-1));
    if (!Number.isFinite(amplitude)) throw new InputError("Every amplitude must be a finite number");
    if (Math.abs(amplitude) > 1000) throw new InputError("Amplitude exceeds the ±1000 safety range");
    if (columns.length === 2) {
      const timestamp = Number(columns[0]);
      if (!Number.isFinite(timestamp) || timestamp <= previousTimestamp) throw new InputError("Timestamps must be finite and strictly increasing");
      previousTimestamp = timestamp;
    }
    values.push(amplitude);
    if (values.length > MAX_SAMPLES) throw new InputError(`CSV exceeds ${MAX_SAMPLES} samples`, "too_many_samples");
  }
  if (values.length < WINDOW_SIZE) throw new InputError(`At least ${WINDOW_SIZE} samples are required`, "too_few_samples");
  return { values: Float32Array.from(values), sampleRate };
}

