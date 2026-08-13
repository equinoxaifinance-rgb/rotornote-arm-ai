import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const files = [
  "README.md",
  "ARCHITECTURE.md",
  "INTEGRATION.md",
  "MODEL-CARD.md",
  "FIELD-VALIDATION.md",
  "DATA-LICENSES.md",
  "BENCHMARKS.md",
  "SECURITY.md",
  "SUBMISSION.md",
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
  "scripts/secret-scan.js",
  "scripts/train-real-crossval.py",
  "scripts/prepare-axial-boundary.py",
  "scripts/evaluate-axial-boundary.js",
  "benchmark/run.js",
  "native/arm-dotprod-bench.c",
  "requirements-field.txt",
  "field/open-data-sources.json",
  "field/results/open-grouped-cross-validation.json",
  "field/results/axial-bearing-boundary.json",
  "field/training/mechanical-manifest.json",
  "field/training/mechanical-features.f32",
  "field/training/mechanical-labels.u8",
  "field/training/mechanical-groups.u8",
  "field/training/linear-export.json",
  "web/index.html",
  "web/styles.css",
  "web/actions.css",
  "web/app.js",
  "samples/real-healthy.csv",
  "samples/real-imbalance.csv",
  "samples/real-misalignment.csv",
  "samples/real-looseness.csv",
];
const hashes = {};
const textExtensions = new Set([".c", ".css", ".html", ".js", ".json", ".md", ".py", ".txt", ".wat"]);
for (const path of files) {
  let bytes = await readFile(new URL(`../${path}`, import.meta.url));
  const extension = path.slice(path.lastIndexOf("."));
  if (textExtensions.has(extension)) bytes = Buffer.from(bytes.toString("utf8").replace(/\r\n/g, "\n"));
  hashes[path] = createHash("sha256").update(bytes).digest("hex");
}
const manifest = {
  schema: "rotornote.build-manifest.v1",
  reproducibility: "Generated deterministically from the listed source and artifact bytes; text inputs are canonicalized to LF before hashing.",
  files: hashes,
};
await writeFile(new URL("../dist/build-manifest.json", import.meta.url), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`built dist/build-manifest.json (${files.length} hashed inputs)`);
