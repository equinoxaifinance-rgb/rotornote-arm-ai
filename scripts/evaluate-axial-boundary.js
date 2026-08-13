import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { analyzeSignal } from "../src/analyze.js";
import { parseCsv } from "../src/csv.js";
import { loadModel } from "../src/model.js";

const work = process.env.ROTORNOTE_AXIAL_WORK || ".field-work/open-real/axial-prepared";
const manifest = JSON.parse(await readFile(`${work}/manifest.json`, "utf8"));
const model = await loadModel();
const cases = [];
for (const record of manifest.records) {
  const csv = await readFile(record.prepared, "utf8");
  const parsed = parseCsv(csv, 25600);
  const result = analyzeSignal(model, parsed.values, 25600, "optimized", {
    verifyParity: true,
    context: { machineId: record.id, measurementPoint: "bearing-outer-race", sensorAxis: "axial", operatingRpm: record.rpm, loadPercent: null },
  });
  cases.push({
    id: record.id,
    condition: record.condition,
    sourceSha256: record.sha256,
    preparedSha256: createHash("sha256").update(csv).digest("hex"),
    status: result.decision.status,
    reasons: result.decision.reasons,
    candidateInsideSupportedScope: result.primary,
    distributionCoverage: result.decision.distributionCoverage,
    engineAgreement: result.decision.engineAgreement,
  });
}
const automaticConclusions = cases.filter((entry) => entry.status === "screened").length;
const receipt = {
  schema: "rotornote-axial-bearing-boundary-v1",
  createdAt: new Date().toISOString(),
  source: manifest.source,
  claim: "Boundary behavior on a separate CC BY physical bearing rig; bearing diagnosis is outside the production classifier's supported labels.",
  cases,
  summary: { records: cases.length, automaticConclusions, abstentionRate: (cases.length - automaticConclusions) / cases.length },
  limitations: [
    "Four records from one external laboratory rig are a safety probe, not a field accuracy estimate.",
    "Faults are artificially seeded inner/outer-race spalls.",
    "The candidate label is retained only for review context and is never presented as an automatic bearing diagnosis.",
  ],
};
if (automaticConclusions !== 0) throw new Error(`Boundary gate failed: ${automaticConclusions} foreign-rig records were automatically screened`);
await mkdir("field/results", { recursive: true });
await writeFile("field/results/axial-bearing-boundary.json", `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify(receipt.summary));
