import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { analyzeSignal } from "../src/analyze.js";
import { parseCsv } from "../src/csv.js";
import { loadModel } from "../src/model.js";
import { extractFeatures } from "../src/signal.js";

const work = process.env.ROTORNOTE_FIELD_WORK || ".field-work";
const manifest = JSON.parse(await readFile(`${work}/manifest.json`, "utf8"));
const model = await loadModel();

function recordWindows(values, size = 2048, limit = 10) {
  const available = Math.floor(values.length / size);
  const count = Math.min(limit, available);
  return Array.from({ length: count }, (_, index) => {
    const offset = count === 1 ? 0 : Math.floor((index * (values.length - size)) / (count - 1));
    return values.slice(offset, offset + size);
  });
}

function solve(matrix, vector) {
  const size = vector.length;
  const rows = matrix.map((row, index) => [...row, vector[index]]);
  for (let pivot = 0; pivot < size; pivot += 1) {
    let best = pivot;
    for (let row = pivot + 1; row < size; row += 1) if (Math.abs(rows[row][pivot]) > Math.abs(rows[best][pivot])) best = row;
    [rows[pivot], rows[best]] = [rows[best], rows[pivot]];
    const divisor = rows[pivot][pivot];
    if (Math.abs(divisor) < 1e-10) throw new Error(`Grouped ridge solver failed at pivot ${pivot}`);
    for (let column = pivot; column <= size; column += 1) rows[pivot][column] /= divisor;
    for (let row = 0; row < size; row += 1) {
      if (row === pivot) continue;
      const factor = rows[row][pivot];
      for (let column = pivot; column <= size; column += 1) rows[row][column] -= factor * rows[pivot][column];
    }
  }
  return rows.map((row) => row[size]);
}

function fitRidge(records, lambda = 3) {
  const training = records.flatMap((record) => record.features.map((features) => ({ features, target: record.expected === "bearing" ? 1 : -1 })));
  const width = training[0].features.length;
  const means = Array(width).fill(0);
  for (const row of training) for (let index = 0; index < width; index += 1) means[index] += row.features[index] / training.length;
  const scales = Array(width).fill(0);
  for (const row of training) for (let index = 0; index < width; index += 1) scales[index] += (row.features[index] - means[index]) ** 2 / training.length;
  for (let index = 0; index < width; index += 1) scales[index] = Math.max(Math.sqrt(scales[index]), 1e-6);
  const dimensions = width + 1;
  const gram = Array.from({ length: dimensions }, () => Array(dimensions).fill(0));
  const target = Array(dimensions).fill(0);
  for (const row of training) {
    const normalized = row.features.map((value, index) => (value - means[index]) / scales[index]).concat(1);
    for (let left = 0; left < dimensions; left += 1) {
      target[left] += normalized[left] * row.target;
      for (let right = 0; right < dimensions; right += 1) gram[left][right] += normalized[left] * normalized[right];
    }
  }
  for (let index = 0; index < width; index += 1) gram[index][index] += lambda;
  return { means, scales, weights: solve(gram, target) };
}

function ridgeScore(fitted, features) {
  let result = fitted.weights.at(-1);
  for (let index = 0; index < features.length; index += 1) result += fitted.weights[index] * (features[index] - fitted.means[index]) / fitted.scales[index];
  return result;
}

function evaluateRecord(fitted, record) {
  const scores = record.features.map((features) => ridgeScore(fitted, features));
  const bearingVote = scores.filter((score) => score >= 0).length / scores.length;
  const predicted = bearingVote >= 0.5 ? "bearing" : "healthy";
  return { id: record.id, expected: record.expected, predicted, correct: predicted === record.expected, bearingVote: Number(bearingVote.toFixed(4)), windows: scores.length };
}

function wilson(successes, total) {
  const z = 1.959963984540054;
  const rate = successes / total;
  const denominator = 1 + (z * z) / total;
  const center = (rate + (z * z) / (2 * total)) / denominator;
  const margin = (z * Math.sqrt((rate * (1 - rate) + (z * z) / (4 * total)) / total)) / denominator;
  return [Number(Math.max(0, center - margin).toFixed(4)), Number(Math.min(1, center + margin).toFixed(4))];
}

function metrics(cases) {
  const healthy = cases.filter((entry) => entry.expected === "healthy");
  const bearing = cases.filter((entry) => entry.expected === "bearing");
  const trueHealthy = healthy.filter((entry) => entry.correct).length;
  const trueBearing = bearing.filter((entry) => entry.correct).length;
  const sensitivity = trueBearing / bearing.length;
  const specificity = trueHealthy / healthy.length;
  return {
    sensitivity,
    sensitivityWilson95: wilson(trueBearing, bearing.length),
    specificity,
    specificityWilson95: wilson(trueHealthy, healthy.length),
    balancedAccuracy: (sensitivity + specificity) / 2,
    bearingRecords: bearing.length,
    healthyRecords: healthy.length,
  };
}

const records = [];
const safetyCases = [];
for (const source of manifest) {
  const csv = await readFile(source.csv, "utf8");
  const { values, sampleRate } = parseCsv(csv, 1024);
  const analysis = analyzeSignal(model, values, sampleRate, "optimized", { verifyParity: true });
  records.push({ ...source, features: recordWindows(values).map((window) => Array.from(extractFeatures(window, sampleRate))) });
  safetyCases.push({
    id: source.id,
    expected: source.expected,
    mechanism: source.mechanism,
    loadHp: source.load_hp,
    sourceUrl: source.url,
    sourceSha256: source.sha256,
    preparedSha256: createHash("sha256").update(csv).digest("hex"),
    status: analysis.decision.status,
    candidate: analysis.primary,
    candidateMatchesExpected: analysis.primary === source.expected,
    envelopeCoverage: analysis.decision.distributionCoverage,
    engineAgreement: analysis.decision.engineAgreement,
  });
}

const faultSafetyCases = safetyCases.filter((entry) => entry.expected === "bearing");
const safetyReceipt = {
  schema: "rotornote-cross-domain-probe-v2",
  createdAt: new Date().toISOString(),
  source: {
    name: "Case Western Reserve University Bearing Data Center",
    page: "https://engineering.case.edu/bearingdatacenter/download-data-file",
    apparatus: "https://engineering.case.edu/bearingdatacenter/apparatus-and-procedures",
    note: "Official experimental records are downloaded and hash-verified at run time; raw records are not redistributed.",
  },
  adaptation: "drive-end channel; 12,000 Hz to 1,024 Hz polyphase resampling",
  cases: safetyCases,
  summary: {
    records: safetyCases.length,
    abstentionRate: safetyCases.filter((entry) => entry.status === "review_required").length / safetyCases.length,
    automaticConclusions: safetyCases.filter((entry) => entry.status === "screened").length,
    faultCandidateRecall: faultSafetyCases.filter((entry) => entry.candidateMatchesExpected).length / faultSafetyCases.length,
    interpretation: "Safety-boundary probe of the synthetic five-pattern model; not training, field calibration, certification, or an accuracy estimate.",
  },
};

const loadCases = [];
for (const heldLoad of [0, 1, 2, 3]) {
  const fitted = fitRidge(records.filter((record) => record.load_hp !== heldLoad));
  loadCases.push(...records.filter((record) => record.load_hp === heldLoad).map((record) => ({ heldLoad, ...evaluateRecord(fitted, record) })));
}

const mechanismCases = [];
for (const heldMechanism of ["inner-race", "ball", "outer-race"]) {
  for (const heldLoad of [0, 1, 2, 3]) {
    const training = records.filter((record) => record.load_hp !== heldLoad && record.mechanism !== heldMechanism);
    const fitted = fitRidge(training);
    const held = records.filter((record) => record.load_hp === heldLoad && (record.mechanism === heldMechanism || record.expected === "healthy"));
    mechanismCases.push(...held.map((record) => ({ heldMechanism, heldLoad, ...evaluateRecord(fitted, record) })));
  }
}

const groupedReceipt = {
  schema: "rotornote-cwru-grouped-validation-v1",
  createdAt: new Date().toISOString(),
  claim: "Real experimental bearing-versus-healthy validation on one CWRU rig; not validation of imbalance, misalignment, looseness, other machines, or field deployment.",
  method: "Ridge-fitted binary head over RotorNote's production 48-feature extractor; record-level majority vote.",
  sourceRecords: records.length,
  leaveOneLoadOut: {
    protocol: "Four folds. An entire motor load and its four records are absent from training in each fold; no record contributes windows to both train and test.",
    cases: loadCases,
    metrics: metrics(loadCases),
  },
  leaveOneMechanismAndLoadOut: {
    protocol: "Twelve folds. The test fault mechanism is absent from training, and the test load is also absent; each fold tests one held fault record plus its held-load healthy record.",
    cases: mechanismCases,
    metrics: metrics(mechanismCases),
  },
  limitations: [
    "Only 16 source recordings from one documented laboratory rig.",
    "All faults are seeded 0.007-inch bearing defects; the result does not establish natural-fault or cross-machine performance.",
    "The Wilson intervals remain wide because records, not windows, are the independent evaluation units.",
    "The raw dataset is fetched at evaluation time and is not redistributed or relicensed by RotorNote.",
  ],
};

if (safetyReceipt.summary.abstentionRate !== 1 || safetyReceipt.summary.automaticConclusions !== 0) throw new Error(`Cross-domain safety gate failed: ${JSON.stringify(safetyReceipt.summary)}`);
if (groupedReceipt.leaveOneLoadOut.metrics.balancedAccuracy < 0.8 || groupedReceipt.leaveOneMechanismAndLoadOut.metrics.balancedAccuracy < 0.8) throw new Error("Grouped real-data validation fell below the disclosed 0.80 research gate");
await mkdir("field/results", { recursive: true });
await writeFile("field/results/cwru-cross-domain.json", `${JSON.stringify(safetyReceipt, null, 2)}\n`);
await writeFile("field/results/cwru-grouped-validation.json", `${JSON.stringify(groupedReceipt, null, 2)}\n`);
console.log(JSON.stringify({ safety: safetyReceipt.summary, grouped: { leaveOneLoadOut: groupedReceipt.leaveOneLoadOut.metrics, leaveOneMechanismAndLoadOut: groupedReceipt.leaveOneMechanismAndLoadOut.metrics } }));
