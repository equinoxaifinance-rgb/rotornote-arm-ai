import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { analyzeVariableSpeedAnomaly } from "../src/anomaly.js";
import { parseCsv } from "../src/csv.js";
import { loadInferenceModel } from "../src/model.js";

const work = process.env.ROTORNOTE_ZHENJIANG_WORK || ".field-work/open-real/zhenjiang-prepared";
const manifest = JSON.parse(await readFile(`${work}/manifest.json`, "utf8"));
const model = await loadInferenceModel(new URL("../model/anomaly-model.json", import.meta.url));
const cases = [];
for (const record of manifest.records) {
  const csv = await readFile(record.prepared, "utf8");
  const parsed = parseCsv(csv, 25600, { minimumSamples: 2048 });
  for (const testedRpm of manifest.source.documentedRpms) {
    const result = analyzeVariableSpeedAnomaly(model, parsed.channels[0], 25600, testedRpm, "optimized");
    cases.push({
      id: `${record.id}-${testedRpm}rpm`,
      sourceSignal: record.id,
      condition: record.condition,
      sourceColumn: record.sourceColumn,
      testedRpm,
      preparedSha256: createHash("sha256").update(csv).digest("hex"),
      status: result.status,
      reasons: result.reasons,
      candidateInsideSupportedScope: result.primary,
      engineAgreement: result.engineAgreement,
      conditionRepresentationAgreement: result.conditionRepresentationAgreement,
    });
  }
}
const automaticConclusions = cases.filter((entry) => entry.status === "screened").length;
const engineDisagreements = cases.filter((entry) => !entry.engineAgreement).length;
const uncontainedEngineDisagreements = cases.filter((entry) => !entry.engineAgreement && entry.status !== "review_required").length;
const receipt = {
  schema: "rotornote-zhenjiang-bearing-boundary-v1",
  createdAt: new Date().toISOString(),
  source: manifest.source,
  route: "canonical one-channel variable-speed anomaly head",
  selection: manifest.selection,
  transform: manifest.transform,
  archiveSha256: manifest.archiveSha256,
  claim: "Second-rig fail-closed challenge across 35 predeclared physical traces and every documented RPM; not a bearing-accuracy estimate.",
  cases,
  summary: {
    physicalSignals: manifest.records.length,
    rpmChallenges: cases.length,
    automaticConclusions,
    abstentionRate: (cases.length - automaticConclusions) / cases.length,
    broadEngineAgreement: (cases.length - engineDisagreements) / cases.length,
    broadEngineDisagreements: engineDisagreements,
    uncontainedEngineDisagreements,
  },
  limitations: [
    "One additional laboratory rig does not establish fleet or field generalization.",
    "Faults are seeded and the archive does not machine-map individual matrix columns to RPM; every selected trace is therefore challenged at every documented RPM.",
    "Linear interpolation only satisfies the model's 2,048-sample feature contract and is disclosed; no accuracy claim is computed from these cases.",
  ],
};
if (automaticConclusions !== 0) throw new Error(`Boundary gate failed: ${automaticConclusions} second-rig cases were automatically screened`);
if (uncontainedEngineDisagreements !== 0) throw new Error(`Boundary gate failed: ${uncontainedEngineDisagreements} engine disagreements escaped review`);
await mkdir("field/results", { recursive: true });
await writeFile("field/results/zhenjiang-bearing-boundary.json", `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify(receipt.summary));
