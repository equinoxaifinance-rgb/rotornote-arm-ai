import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { extractFeatures, FEATURE_COUNT, WINDOW_SIZE } from "../src/signal.js";

const prepared = new URL("../.field-work/open-real/prepared/", import.meta.url);
const destination = new URL("../field/training/", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("manifest.json", prepared), "utf8"));
const [windowBytes, labelBytes, groupBytes] = await Promise.all([
  readFile(new URL("windows.f32", prepared)),
  readFile(new URL("labels.u8", prepared)),
  readFile(new URL("groups.u8", prepared)),
]);

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
if (sha256(windowBytes) !== manifest.windowsSha256 || sha256(labelBytes) !== manifest.labelsSha256 || sha256(groupBytes) !== manifest.groupsSha256) {
  throw new Error("Prepared real-data stream failed integrity verification");
}
if (windowBytes.length !== manifest.rows * WINDOW_SIZE * 4 || labelBytes.length !== manifest.rows || groupBytes.length !== manifest.rows) {
  throw new Error("Prepared real-data stream has inconsistent row counts");
}

const sourceWindows = new Float32Array(windowBytes.buffer, windowBytes.byteOffset, windowBytes.length / 4);
const featureBytes = Buffer.allocUnsafe(manifest.rows * FEATURE_COUNT * 4);
const features = new Float32Array(featureBytes.buffer, featureBytes.byteOffset, manifest.rows * FEATURE_COUNT);
for (let row = 0; row < manifest.rows; row += 1) {
  const window = sourceWindows.subarray(row * WINDOW_SIZE, (row + 1) * WINDOW_SIZE);
  features.set(extractFeatures(window, manifest.sampleRateHz, manifest.sourceDataset.operatingRpm), row * FEATURE_COUNT);
}

await mkdir(destination, { recursive: true });
await Promise.all([
  writeFile(new URL("mechanical-features.f32", destination), featureBytes),
  writeFile(new URL("mechanical-labels.u8", destination), labelBytes),
  writeFile(new URL("mechanical-groups.u8", destination), groupBytes),
  ...Object.keys(manifest.sampleSha256).map((label) => copyFile(new URL(`samples/real-${label}.csv`, prepared), new URL(`../samples/real-${label}.csv`, import.meta.url))),
]);

const trainingManifest = {
  format: "rotornote-real-features-v1",
  sourceDataset: manifest.sourceDataset,
  sourceArchiveSha256: manifest.archiveSha256,
  sampleRateHz: manifest.sampleRateHz,
  operatingRpm: manifest.sourceDataset.operatingRpm,
  windowSize: manifest.windowSize,
  featureCount: FEATURE_COUNT,
  labels: manifest.labels,
  rows: manifest.rows,
  trainingRows: manifest.trainingRows,
  validationRows: manifest.validationRows,
  validationTests: manifest.validationTests,
  splitPolicy: manifest.splitPolicy,
  windowSelection: manifest.windowSelection,
  channelsPerFile: manifest.channelsPerFile,
  windowsPerChannel: manifest.windowsPerChannel,
  featureExtractor: "src/signal.js extractFeatures",
  featuresSha256: sha256(featureBytes),
  labelsSha256: sha256(labelBytes),
  groupsSha256: sha256(groupBytes),
  sampleSha256: manifest.sampleSha256,
};
await writeFile(new URL("mechanical-manifest.json", destination), `${JSON.stringify(trainingManifest, null, 2)}\n`);
console.log(JSON.stringify({ rows: manifest.rows, featuresSha256: trainingManifest.featuresSha256 }));
