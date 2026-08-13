import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { extractFeatures, FEATURE_COUNT } from "../src/signal.js";

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

const signalsRoot = path.resolve(argument("--source") || "");
const archivePath = path.resolve(argument("--archive") || "");
if (!signalsRoot || !archivePath || !fs.existsSync(signalsRoot) || !fs.existsSync(archivePath)) {
  throw new Error("Usage: node scripts/prepare-upatras-features.mjs --source <extracted signals directory> --archive <inner source zip>");
}
const sources = JSON.parse(fs.readFileSync(new URL("../field/open-data-sources.json", import.meta.url), "utf8"));
const source = sources.variableSpeedAnomalyTraining;
const archiveBytes = fs.readFileSync(archivePath);
const archiveSha256 = crypto.createHash("sha256").update(archiveBytes).digest("hex");
if (archiveSha256 !== source.innerArchiveSha256) throw new Error(`UPATRAS inner archive hash mismatch: ${archiveSha256}`);

const outputRoot = new URL("../field/training/", import.meta.url);
const states = fs.readdirSync(signalsRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
const files = states.flatMap((state) => fs.readdirSync(path.join(signalsRoot, state)).filter((name) => name.endsWith(".csv")).sort().map((name) => ({ state, name, file: path.join(signalsRoot, state, name) })));
if (files.length !== 39) throw new Error(`Expected 39 UPATRAS measurement sequences; found ${files.length}`);
const featureRowsPerSignal = 2;
const signalsPerSequence = 75;
const features = new Float32Array(files.length * signalsPerSequence * featureRowsPerSignal * FEATURE_COUNT);
const labels = new Uint8Array(files.length * signalsPerSequence);
const groups = new Uint8Array(files.length * signalsPerSequence);
const sourceFiles = [];
let featureOffset = 0;
let signalOffset = 0;
const familyFor = (state) => state === "Healthy" ? "healthy" : state.startsWith("Unbalance") ? "unbalance" : state.startsWith("Bolt") ? "looseness" : "coupler_wear";

for (let groupIndex = 0; groupIndex < files.length; groupIndex += 1) {
  const record = files[groupIndex];
  const bytes = fs.readFileSync(record.file);
  const lines = bytes.toString("utf8").trim().split(/\r?\n/);
  const header = lines.shift().split(",");
  if (header.length !== 77 || lines.length !== 3500) throw new Error(`Unexpected source shape for ${record.file}`);
  const columns = Array.from({ length: signalsPerSequence }, () => new Float32Array(3500));
  for (let row = 0; row < lines.length; row += 1) {
    const values = lines[row].split(",");
    if (values.length !== 77) throw new Error(`Malformed row ${row + 2} in ${record.file}`);
    for (let column = 0; column < signalsPerSequence; column += 1) {
      const value = Number(values[column + 2]);
      if (!Number.isFinite(value)) throw new Error(`Non-finite amplitude in ${record.file}`);
      columns[column][row] = value;
    }
  }
  const family = familyFor(record.state);
  for (let column = 0; column < signalsPerSequence; column += 1) {
    const match = /^speed_(\d+)_(\d+)_Hz$/.exec(header[column + 2]);
    if (!match) throw new Error(`Unexpected speed header ${header[column + 2]}`);
    const speedHz = Number(`${match[1]}.${match[2]}`);
    for (const start of [0, 3500 - 2048]) {
      const row = extractFeatures(columns[column].subarray(start, start + 2048), 1024, speedHz * 60);
      features.set(row, featureOffset);
      featureOffset += row.length;
    }
    labels[signalOffset] = family === "healthy" ? 0 : 1;
    groups[signalOffset] = groupIndex + 1;
    signalOffset += 1;
  }
  sourceFiles.push({ group: groupIndex + 1, state: record.state, family, file: record.name, sha256: crypto.createHash("sha256").update(bytes).digest("hex") });
}

const featureBytes = Buffer.from(features.buffer, features.byteOffset, features.byteLength);
const labelBytes = Buffer.from(labels.buffer, labels.byteOffset, labels.byteLength);
const groupBytes = Buffer.from(groups.buffer, groups.byteOffset, groups.byteLength);
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const manifest = {
  format: "rotornote-upatras-features-v1",
  sourceDataset: source,
  sourceInnerArchiveSha256: archiveSha256,
  sampleRateHz: 1024,
  sourceSamplesPerSignal: 3500,
  featureWindowsPerSignal: featureRowsPerSignal,
  featureWindowSamples: 2048,
  measurementSequences: files.length,
  signals: signalOffset,
  featureRows: featureOffset / FEATURE_COUNT,
  featureCount: FEATURE_COUNT,
  labels: ["healthy", "anomaly"],
  splitPolicy: "whole measurement sequences; no speed signal or window crosses a validation boundary",
  sourceFiles,
  featuresSha256: sha256(featureBytes),
  labelsSha256: sha256(labelBytes),
  groupsSha256: sha256(groupBytes),
};
fs.writeFileSync(new URL("upatras-features.f32", outputRoot), featureBytes);
fs.writeFileSync(new URL("upatras-labels.u8", outputRoot), labelBytes);
fs.writeFileSync(new URL("upatras-groups.u8", outputRoot), groupBytes);
fs.writeFileSync(new URL("upatras-manifest.json", outputRoot), `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ signals: signalOffset, groups: files.length, featureRows: manifest.featureRows, featuresSha256: manifest.featuresSha256 })}\n`);
