import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { analyzeVariableSpeedAnomaly } from "../src/anomaly.js";
import { parseCsv } from "../src/csv.js";
import { loadInferenceModel } from "../src/model.js";

const work = process.env.ROTORNOTE_AXIAL_WORK || ".field-work/open-real/axial-prepared";
const manifest = JSON.parse(await readFile(`${work}/manifest.json`, "utf8"));
const model = await loadInferenceModel(new URL("../model/anomaly-model.json", import.meta.url));
const cases = [];
for (const record of manifest.records) {
  const csv = await readFile(record.prepared, "utf8");
  const parsed = parseCsv(csv, 25600);
  if (parsed.channels.length !== 1) throw new Error(`Expected one channel for ${record.id}`);
  const result = analyzeVariableSpeedAnomaly(model, parsed.channels[0], 25600, record.rpm, "optimized");
  cases.push({
    id: record.id,
    condition: record.condition,
    axialLoadKn: record.axialLoadKn,
    rpm: record.rpm,
    spallLocation: record.spallLocation,
    spallWidthMm: record.spallWidthMm,
    sourceSha256: record.sha256,
    preparedSha256: createHash("sha256").update(csv).digest("hex"),
    status: result.status,
    reasons: result.reasons,
    candidateInsideSupportedScope: result.primary,
    distributionDistance: result.distribution.distance,
    distributionThreshold: result.distribution.threshold,
    engineAgreement: result.engineAgreement,
    conditionRepresentationAgreement: result.conditionRepresentationAgreement,
  });
}
const automaticConclusions = cases.filter((entry) => entry.status === "screened").length;
const engineDisagreements = cases.filter((entry) => !entry.engineAgreement).length;
const representationDisagreements = cases.filter((entry) => !entry.conditionRepresentationAgreement).length;
const uncontainedEngineDisagreements = cases.filter((entry) => !entry.engineAgreement && entry.status !== "review_required").length;
const receipt = {
  schema: "rotornote-axial-bearing-boundary-v2",
  createdAt: new Date().toISOString(),
  source: manifest.source,
  route: "canonical one-channel variable-speed anomaly head",
  selection: manifest.selection,
  archiveSha256: manifest.archiveSha256,
  claim: "Full-archive boundary behavior on a separate CC BY physical bearing rig; this is a fail-closed test, not a bearing-detection accuracy estimate.",
  cases,
  summary: {
    records: cases.length,
    automaticConclusions,
    abstentionRate: (cases.length - automaticConclusions) / cases.length,
    broadEngineAgreement: (cases.length - engineDisagreements) / cases.length,
    broadEngineDisagreements: engineDisagreements,
    internalEightConditionRepresentationDisagreements: representationDisagreements,
    uncontainedEngineDisagreements,
  },
  limitations: [
    "All 28 records from one external laboratory rig are a safety probe, not a field accuracy estimate or a multi-rig validation study.",
    "Faults are artificially seeded inner/outer-race spalls.",
    "The archive operates at 60 or 500 RPM, outside the production head's 2,100-2,988 RPM training range; correct behavior is review_required through the fitted-envelope gate.",
    "No candidate laboratory condition is exposed as an automatic bearing diagnosis.",
  ],
};
if (automaticConclusions !== 0) throw new Error(`Boundary gate failed: ${automaticConclusions} foreign-rig records were automatically screened`);
if (uncontainedEngineDisagreements !== 0) throw new Error(`Boundary gate failed: ${uncontainedEngineDisagreements} engine disagreements escaped review`);
await mkdir("field/results", { recursive: true });
await writeFile("field/results/axial-bearing-boundary.json", `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify(receipt.summary));
