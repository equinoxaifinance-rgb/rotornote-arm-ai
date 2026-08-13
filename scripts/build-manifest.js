import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const files = [
  "package-lock.json",
  "kernel/dense.wat",
  "dist/dense.wasm",
  "model/model.json",
  "model/rotornote-fp32.bin",
  "model/rotornote-int8.bin",
  "src/analyze.js",
  "src/csv.js",
  "src/evidence.js",
  "src/model.js",
  "src/quality.js",
  "src/server.js",
  "src/signal.js",
  "scripts/build-model.js",
  "benchmark/run.js",
  "native/arm-dotprod-bench.c",
  "scripts/prepare-cwru-field.py",
  "scripts/evaluate-cwru-field.js",
  "requirements-field.txt",
  ".github/workflows/native-arm64.yml",
  ".github/workflows/external-field-probe.yml",
];
const hashes = {};
for (const path of files) {
  const bytes = await readFile(new URL(`../${path}`, import.meta.url));
  hashes[path] = createHash("sha256").update(bytes).digest("hex");
}
const manifest = {
  schema: "rotornote.build-manifest.v1",
  reproducibility: "Generated deterministically from the listed source and artifact bytes.",
  files: hashes,
};
await writeFile(new URL("../dist/build-manifest.json", import.meta.url), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`built dist/build-manifest.json (${files.length} hashed inputs)`);
