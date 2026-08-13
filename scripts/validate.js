import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { analyzeSignal } from "../src/analyze.js";
import { parseCsv } from "../src/csv.js";
import { loadModel } from "../src/model.js";

const required = [
  "README.md", "ARCHITECTURE.md", "SECURITY.md", "BENCHMARKS.md", "SUBMISSION.md", "LICENSE",
  "INTEGRATION.md", "MODEL-CARD.md", "FIELD-VALIDATION.md", "sbom.spdx.json", "dist/build-manifest.json",
  "package.json", "package-lock.json", "Dockerfile", "compose.yaml", ".github/workflows/native-arm64.yml",
  "dist/dense.wasm", "model/model.json", "model/rotornote-fp32.bin", "model/rotornote-int8.bin",
  "assets/gallery/01-hero.svg", "assets/gallery/02-analysis.svg", "assets/gallery/03-arm-optimization.svg",
];
await Promise.all(required.map((path) => access(new URL(`../${path}`, import.meta.url))));

const model = await loadModel();
assert.deepEqual(model.metadata.architecture, [48, 256, 128, 5]);
assert.equal(model.metadata.training.engineAgreement, 1);
assert.ok(model.metadata.ood.validationCoverage >= 0.94);
assert.ok(model.metadata.ood.threshold > 0);
for (const file of ["steady-baseline.csv", "bearing-pulse.csv", "shift-change.csv"]) {
  const parsed = parseCsv(await readFile(new URL(`../samples/${file}`, import.meta.url), "utf8"));
  const baseline = analyzeSignal(model, parsed.values, parsed.sampleRate, "baseline");
  const optimized = analyzeSignal(model, parsed.values, parsed.sampleRate, "optimized");
  assert.equal(baseline.primary, optimized.primary, `${file} engine disagreement`);
}
const workflow = await readFile(new URL("../.github/workflows/native-arm64.yml", import.meta.url), "utf8");
assert.match(workflow, /runs-on: ubuntu-24\.04-arm/);
assert.match(workflow, /test "\$\(uname -m\)" = "aarch64"/);
const sbom = JSON.parse(await readFile(new URL("../sbom.spdx.json", import.meta.url), "utf8"));
assert.equal(sbom.spdxVersion, "SPDX-2.3");
assert.equal(sbom.packages.filter(({ primaryPackagePurpose }) => primaryPackagePurpose !== "BUILD_TOOL").length, 1);
const manifest = JSON.parse(await readFile(new URL("../dist/build-manifest.json", import.meta.url), "utf8"));
assert.equal(Object.keys(manifest.files).length, 13);
for (const file of required.filter((path) => path.endsWith(".svg"))) {
  const svg = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
  assert.match(svg, /viewBox="0 0 1600 900"/);
  assert.match(svg, /role="img" aria-label="[^"]+"/);
}
console.log(`validated ${required.length} required files, model integrity, 3 dual-engine samples, Arm gate, and gallery metadata`);
