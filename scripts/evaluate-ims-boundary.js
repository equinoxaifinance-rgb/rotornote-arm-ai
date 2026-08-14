import { readFile, writeFile } from "node:fs/promises";
import { analyzeVariableSpeedAnomaly } from "../src/anomaly.js";
import { loadInferenceModel } from "../src/model.js";

const work = process.env.ROTORNOTE_IMS_WORK || ".field-work/open-real/ims-prepared";
const manifest = JSON.parse(await readFile(`${work}/manifest.json`, "utf8"));
const model = await loadInferenceModel(new URL("../model/anomaly-model.json", import.meta.url));
const cases = [];
for (const record of manifest.records) {
  const rows = (await readFile(record.localPath, "utf8")).trim().split(/\r?\n/).map((line) => line.trim().split(/\s+/).map(Number));
  for (let channel = 0; channel < record.channels; channel += 1) {
    const values = Float32Array.from(rows, (row) => row[channel]);
    const result = analyzeVariableSpeedAnomaly(model, values, 20000, 2000, "optimized");
    const bearing = record.channelBearings[channel];
    cases.push({
      id: `${record.run}-${record.sourceIndex}-ch${channel + 1}`,
      run: record.run,
      sourceIndex: record.sourceIndex,
      timeFraction: record.timeFraction,
      bearing,
      sensorAxis: record.channelAxes[channel],
      documentedFailedBearingAtEndpoint: record.timeFraction === 1 && record.documentedFailedBearingsAtEndpoint.includes(bearing),
      sourceFileSha256: record.sourceFileSha256,
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
const endpointFailureChannels = cases.filter((entry) => entry.documentedFailedBearingAtEndpoint);
const receipt = {
  schema: "rotornote-ims-natural-failure-boundary-v1",
  source: manifest.source,
  route: "canonical one-channel variable-speed anomaly head",
  selection: manifest.selection,
  transform: manifest.transform,
  outerArchiveSha256: manifest.outerArchiveSha256,
  claim: "Natural run-to-failure, multi-bearing, multi-sensor fail-closed boundary probe; not a natural-fault sensitivity estimate, early-warning claim, or field pilot.",
  cases,
  summary: {
    experiments: new Set(cases.map((entry) => entry.run)).size,
    bearingInstallations: 12,
    sensorTrajectories: 16,
    selectedSnapshots: manifest.records.length,
    sensorCases: cases.length,
    documentedFailedBearingsAtEndpoints: 4,
    documentedFailedBearingEndpointChannels: endpointFailureChannels.length,
    endpointFailureChannelsReviewRequired: endpointFailureChannels.filter((entry) => entry.status === "review_required").length,
    automaticConclusions,
    abstentionRate: (cases.length - automaticConclusions) / cases.length,
    broadEngineAgreement: (cases.length - engineDisagreements) / cases.length,
    broadEngineDisagreements: engineDisagreements,
    uncontainedEngineDisagreements,
  },
  limitations: [
    "The NASA/IMS experiments are accelerated laboratory run-to-failure histories, not a prospective industrial field pilot.",
    "RotorNote was not trained on IMS and all cases are outside its fitted RPM/training envelope; this receipt proves abstention behavior only.",
    "Seven predeclared timestamps per experiment test early, intermediate, and documented endpoint behavior but do not estimate natural-fault sensitivity or warning lead time.",
  ],
};
if (automaticConclusions !== 0) throw new Error(`Natural-failure boundary failed: ${automaticConclusions} cases were automatically screened`);
if (uncontainedEngineDisagreements !== 0) throw new Error(`Natural-failure boundary failed: ${uncontainedEngineDisagreements} engine disagreements escaped review`);
if (endpointFailureChannels.length !== 6 || endpointFailureChannels.some((entry) => entry.status !== "review_required")) throw new Error("Documented natural-failure endpoint boundary failed");
await writeFile("field/results/ims-natural-failure-boundary.json", `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify(receipt.summary));
