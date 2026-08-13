import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { analyzeSignal } from "../src/analyze.js";
import { parseCsv } from "../src/csv.js";
import { loadModel } from "../src/model.js";

const work = process.env.ROTORNOTE_FIELD_WORK || ".field-work";
const manifest = JSON.parse(await readFile(`${work}/manifest.json`, "utf8"));
const model = await loadModel();
const cases = [];
for (const source of manifest) {
  const csv = await readFile(source.csv, "utf8");
  const { values, sampleRate } = parseCsv(csv, 1024);
  const analysis = analyzeSignal(model, values, sampleRate, "optimized", { verifyParity: true });
  cases.push({
    id: source.id,
    expected: source.expected,
    sourceUrl: source.url,
    sourceSha256: source.sha256,
    preparedSha256: createHash("sha256").update(csv).digest("hex"),
    sourceSamples: source.source_samples,
    preparedSamples: source.prepared_samples,
    status: analysis.decision.status,
    candidate: analysis.primary,
    candidateMatchesExpected: analysis.primary === source.expected,
    confidence: analysis.confidence,
    envelopeCoverage: analysis.decision.distributionCoverage,
    engineAgreement: analysis.decision.engineAgreement,
    quality: analysis.decision.quality.status,
  });
}
const faultCases = cases.filter((entry) => entry.expected === "bearing");
const receipt = {
  schema: "rotornote-cross-domain-probe-v1",
  createdAt: new Date().toISOString(),
  source: {
    name: "Case Western Reserve University Bearing Data Center",
    page: "https://engineering.case.edu/bearingdatacenter/download-data-file",
    apparatus: "https://engineering.case.edu/bearingdatacenter/apparatus-and-procedures",
    note: "Official public experimental records are downloaded at run time and are not redistributed by this repository.",
  },
  adaptation: "drive-end channel; 12,000 Hz to 1,024 Hz polyphase resampling",
  cases,
  summary: {
    records: cases.length,
    abstentionRate: cases.filter((entry) => entry.status === "review_required").length / cases.length,
    automaticConclusions: cases.filter((entry) => entry.status === "screened").length,
    faultCandidateRecall: faultCases.filter((entry) => entry.candidateMatchesExpected).length / faultCases.length,
    interpretation: "Cross-domain safety probe only. It tests fail-closed behavior on experimental data; it is not training, field calibration, certification, or an accuracy estimate.",
  },
};
if (receipt.summary.abstentionRate !== 1 || receipt.summary.automaticConclusions !== 0 || receipt.summary.faultCandidateRecall !== 1) {
  throw new Error(`Cross-domain safety gate failed: ${JSON.stringify(receipt.summary)}`);
}
await mkdir("field/results", { recursive: true });
await writeFile("field/results/cwru-cross-domain.json", `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify(receipt.summary));
