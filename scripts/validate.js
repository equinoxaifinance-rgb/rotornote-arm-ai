import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { analyzeSignal } from "../src/analyze.js";
import { parseCsv } from "../src/csv.js";
import { loadModel } from "../src/model.js";

const required = [
  "README.md", "ARCHITECTURE.md", "SECURITY.md", "BENCHMARKS.md", "SUBMISSION.md", "LICENSE",
  "INTEGRATION.md", "MODEL-CARD.md", "FIELD-VALIDATION.md", "DATA-LICENSES.md", "sbom.spdx.json", "dist/build-manifest.json",
  "package.json", "package-lock.json", "Dockerfile", "compose.yaml", ".github/workflows/native-arm64.yml",
  ".github/workflows/external-boundary.yml", "requirements-field.txt", "native/arm-dotprod-bench.c",
  "scripts/prepare-open-training.py", "scripts/build-open-features.js", "scripts/train-real-crossval.py",
  "scripts/prepare-axial-boundary.py", "scripts/evaluate-axial-boundary.js", "field/open-data-sources.json",
  "field/results/open-grouped-cross-validation.json", "field/results/axial-bearing-boundary.json",
  "field/training/mechanical-manifest.json", "field/training/mechanical-features.f32",
  "field/training/mechanical-labels.u8", "field/training/mechanical-groups.u8", "field/training/linear-export.json",
  "dist/dense.wasm", "model/model.json", "model/rotornote-fp32.bin", "model/rotornote-int8.bin",
  "samples/real-healthy.csv", "samples/real-imbalance.csv", "samples/real-misalignment.csv", "samples/real-looseness.csv",
  "assets/gallery/01-hero.svg", "assets/gallery/02-analysis.svg", "assets/gallery/03-arm-optimization.svg",
];
await Promise.all(required.map((path) => access(new URL(`../${path}`, import.meta.url))));

const model = await loadModel();
assert.deepEqual(model.metadata.architecture, [48, 4]);
assert.equal(model.metadata.format, "rotornote-real-lda-v5");
assert.equal(model.metadata.training.dataKind, "real experimental vibration only");
assert.ok(model.metadata.training.engineAgreement >= 0.995);
assert.equal(model.metadata.training.recordingEngineAgreement, 1);
assert.ok(model.metadata.training.fourChannelRecordingBalancedAccuracy >= 0.93);
assert.ok(model.metadata.training.foldBalancedAccuracyRange[0] >= 0.85);
assert.equal(model.metadata.decisionPolicy.nestedValidation.aggregate.calibrationTargetMetAllFolds, false);
assert.ok(model.metadata.ood.threshold > 0);
for (const label of model.metadata.labels) {
  const file = `real-${label}.csv`;
  const parsed = parseCsv(await readFile(new URL(`../samples/${file}`, import.meta.url), "utf8"), 25000);
  const options = { verifyParity: true, context: { operatingRpm: 1238 } };
  const baseline = analyzeSignal(model, parsed.values, 25000, "baseline", options);
  const optimized = analyzeSignal(model, parsed.values, 25000, "optimized", options);
  assert.equal(baseline.primary, optimized.primary, `${file} engine disagreement`);
}
const workflow = await readFile(new URL("../.github/workflows/native-arm64.yml", import.meta.url), "utf8");
assert.match(workflow, /runs-on: ubuntu-24\.04-arm/);
assert.match(workflow, /test "\$\(uname -m\)" = "aarch64"/);
assert.match(await readFile(new URL("../native/arm-dotprod-bench.c", import.meta.url), "utf8"), /vdotq_s32/);
const boundary = JSON.parse(await readFile(new URL("../field/results/axial-bearing-boundary.json", import.meta.url), "utf8"));
assert.equal(boundary.summary.abstentionRate, 1);
assert.equal(boundary.summary.automaticConclusions, 0);
const grouped = JSON.parse(await readFile(new URL("../field/results/open-grouped-cross-validation.json", import.meta.url), "utf8"));
assert.equal(grouped.physicalTests.length, 20);
assert.ok(grouped.aggregate.fourChannelRecording.balancedAccuracy >= 0.93);
assert.ok(grouped.physicalTestFoldBalancedAccuracyRange[0] >= 0.85);
const sbom = JSON.parse(await readFile(new URL("../sbom.spdx.json", import.meta.url), "utf8"));
assert.equal(sbom.spdxVersion, "SPDX-2.3");
assert.equal(sbom.packages.filter(({ primaryPackagePurpose }) => primaryPackagePurpose !== "BUILD_TOOL").length, 1);
const manifest = JSON.parse(await readFile(new URL("../dist/build-manifest.json", import.meta.url), "utf8"));
assert.ok(Object.keys(manifest.files).length >= 30);
for (const file of required.filter((path) => path.endsWith(".svg"))) {
  const svg = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
  assert.match(svg, /viewBox="0 0 1600 900"/);
  assert.match(svg, /role="img" aria-label="[^"]+"/);
}
console.log(`validated ${required.length} required files, real-data model integrity, four dual-engine samples, external abstention, Arm gate, and gallery metadata`);
