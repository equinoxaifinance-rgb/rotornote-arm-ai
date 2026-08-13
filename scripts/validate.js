import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { analyzeSignal } from "../src/analyze.js";
import { analyzeVariableSpeedAnomaly } from "../src/anomaly.js";
import { parseCsv } from "../src/csv.js";
import { loadInferenceModel, loadModel } from "../src/model.js";

const required = [
  "README.md", "ARCHITECTURE.md", "SECURITY.md", "BENCHMARKS.md", "SUBMISSION.md", "LICENSE",
  "INTEGRATION.md", "MODEL-CARD.md", "FIELD-VALIDATION.md", "DATA-LICENSES.md", "sbom.spdx.json", "dist/build-manifest.json",
  "package.json", "package-lock.json", "Dockerfile", "compose.yaml", ".github/workflows/native-arm64.yml",
  ".github/workflows/external-boundary.yml", ".github/workflows/independent-supply-chain.yml", "requirements-field.txt", "native/arm-dotprod-bench.c", "ARM-INT8-KIT.md", "src/dense-compiler.js", "scripts/compile-dense-model.js", "examples/dense-compile-input.json",
  "scripts/prepare-open-training.py", "scripts/build-open-features.js", "scripts/train-real-crossval.py",
  "scripts/prepare-axial-boundary.py", "scripts/evaluate-axial-boundary.js", "field/open-data-sources.json",
  "field/results/open-grouped-cross-validation.json", "field/results/axial-bearing-boundary.json",
  "field/training/mechanical-manifest.json", "field/training/mechanical-features.f32",
  "field/training/mechanical-labels.u8", "field/training/mechanical-groups.u8", "field/training/linear-export.json",
  "scripts/prepare-upatras-features.mjs", "scripts/prepare-upatras-demo.mjs", "scripts/train-upatras-anomaly.py",
  "scripts/build-anomaly-model.js", "benchmark/run-anomaly.js", "src/anomaly.js", "web/anomaly.css",
  "field/results/upatras-grouped-anomaly.json", "field/training/upatras-manifest.json",
  "field/training/upatras-features.f32", "field/training/upatras-labels.u8", "field/training/upatras-groups.u8",
  "field/training/upatras-deep-export.json", "model/anomaly-model.json", "model/rotornote-anomaly-fp32.bin",
  "model/rotornote-anomaly-int8.bin", "samples/real-variable-speed-anomaly.csv",
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
const anomalyModel = await loadInferenceModel(new URL("../model/anomaly-model.json", import.meta.url));
assert.deepEqual(anomalyModel.metadata.architecture, [48, 253, 126, 8]);
assert.deepEqual(anomalyModel.metadata.training.pruning.inactiveUnitsPruned, [3, 2]);
assert.ok(anomalyModel.metadata.training.pruning.maximumTrainingBankLogitDeltaAfterPruning <= 1e-5);
assert.equal(anomalyModel.metadata.training.dataKind, "real experimental vibration only");
assert.ok(anomalyModel.metadata.training.conditionBalancedAccuracy >= 0.998);
assert.equal(anomalyModel.metadata.training.broadAnomalyBalancedAccuracy, 1);
assert.equal(anomalyModel.metadata.training.measurementSequenceAccuracy, 1);
assert.equal(anomalyModel.metadata.training.measurementSequences, 39);
assert.ok(anomalyModel.metadata.training.measurementSequenceAccuracyWilson95[0] >= 0.9);
assert.equal(anomalyModel.metadata.training.engineLabelAgreement, 1);
assert.equal(anomalyModel.metadata.compiler.deterministicArtifactCrossCheck, true);
assert.equal(anomalyModel.metadata.compiler.multiplyAccumulatesPerInference, 45030);
assert.ok(anomalyModel.metadata.int8.bytes <= anomalyModel.metadata.float.bytes * 0.27);
assert.ok(anomalyModel.metadata.utilization.hiddenLayers.every((layer) => layer.activeUnits === layer.units));
assert.ok(anomalyModel.metadata.utilization.hiddenLayers.every((layer) => layer.rowsBelowMaximumWeight1e6 === 0));
const anomalyCsv = parseCsv(await readFile(new URL("../samples/real-variable-speed-anomaly.csv", import.meta.url), "utf8"), 1024, { minimumSamples: 2048 });
const anomalyResult = analyzeVariableSpeedAnomaly(anomalyModel, anomalyCsv.values, 1024, 2100);
assert.equal(anomalyResult.primary, "anomaly");
assert.equal(anomalyResult.status, "screened");
assert.equal(anomalyResult.engineAgreement, true);
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
console.log(`validated ${required.length} required files, both real-data model paths, dual-engine parity, external abstention, Arm gate, and gallery metadata`);
