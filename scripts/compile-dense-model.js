import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { compileDenseModel } from "../src/dense-compiler.js";

const argument = (name) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
};
const inputPath = argument("--input");
const outputDirectory = argument("--output");
if (!inputPath || !outputDirectory) throw new Error("Usage: node scripts/compile-dense-model.js --input <source.json> --output <directory>");
const source = JSON.parse(await readFile(inputPath, "utf8"));
if (source.format !== "rotornote-dense-compile-input-v1") throw new Error("Unsupported dense compile input format");
const compiled = compileDenseModel(source);
await mkdir(outputDirectory, { recursive: true });
const manifest = {
  format: "rotornote-dense-compiled-v1",
  architecture: source.architecture,
  inputFeatures: source.architecture[0],
  labels: source.labels,
  normalization: source.normalization ?? { means: Array(source.architecture[0]).fill(0), deviations: Array(source.architecture[0]).fill(1) },
  quantization: { activations: "dynamic symmetric per layer", weights: "symmetric per output row" },
  compute: compiled.compute,
  parity: compiled.parity,
  utilization: compiled.utilization,
  float: { file: "model-fp32.bin", ...compiled.float },
  int8: { file: "model-int8.bin", ...compiled.int8 },
};
await Promise.all([
  writeFile(path.join(outputDirectory, manifest.float.file), compiled.floatBuffer),
  writeFile(path.join(outputDirectory, manifest.int8.file), compiled.int8Buffer),
  writeFile(path.join(outputDirectory, "model.json"), `${JSON.stringify(manifest, null, 2)}\n`),
]);
console.log(JSON.stringify({ outputDirectory: path.resolve(outputDirectory), ...manifest.compute, fp32Bytes: compiled.float.bytes, int8Bytes: compiled.int8.bytes, labelAgreement: compiled.parity.labelAgreement }));
