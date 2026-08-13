const elements = Object.fromEntries([
  "runtimeStatus", "samples", "fileInput", "dropzone", "analyzeButton", "sampleRate", "inputMessage",
  "formatHelp", "formatCopy", "report", "emptyState", "reportContent", "engineBadge", "timing", "severity",
  "verdictTitle", "primaryLabel", "confidence", "confidenceMeter", "duration", "waveform", "timeline", "action",
  "details", "disclaimer", "machineId", "measurementPoint", "sensorAxis", "operatingRpm", "loadPercent",
  "decisionBadge", "assurance", "machineContext", "receiptId", "downloadEvidence", "copyMaintenanceNote",
  "anomalyDemo", "anomalyResult",
].map((id) => [id, document.getElementById(id)]));

let selectedCsv = "";
let selectedName = "";
let lastWaveform = null;
let lastResult = null;

function message(text, error = false) {
  elements.inputMessage.textContent = text;
  elements.inputMessage.classList.toggle("error", error);
}

async function checkHealth() {
  try {
    const response = await fetch("/health");
    const health = await response.json();
    if (!response.ok) throw new Error(health.status);
    elements.runtimeStatus.textContent = "model ready · evidence linked";
    document.querySelector(".status-dot").classList.add("ready");
  } catch {
    elements.runtimeStatus.textContent = "Runtime unavailable";
  }
}

async function loadSamples() {
  const response = await fetch("/api/samples");
  const { samples } = await response.json();
  elements.samples.replaceChildren(...samples.map((sample) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "sample";
    button.innerHTML = `<strong>${sample.title}</strong><span>${sample.detail}</span>`;
    button.addEventListener("click", async () => {
      document.querySelectorAll(".sample").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      message("Loading sample…");
      const sampleResponse = await fetch(`/samples/${sample.id}.csv`);
      selectedCsv = await sampleResponse.text();
      selectedName = sample.title;
      elements.sampleRate.value = sample.sampleRate;
      elements.operatingRpm.value = sample.operatingRpm;
      elements.analyzeButton.disabled = false;
      message(`${sample.title} ready`);
    });
    return button;
  }));
}

function setFile(file) {
  if (!file) return;
  if (file.size > 8 * 1024 * 1024) return message("That file is larger than 8 MiB.", true);
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    selectedCsv = String(reader.result);
    selectedName = file.name;
    elements.analyzeButton.disabled = false;
    document.querySelectorAll(".sample").forEach((item) => item.classList.remove("active"));
    message(`${file.name} ready · ${(file.size / 1024).toFixed(1)} KiB`);
  });
  reader.addEventListener("error", () => message("The file could not be read.", true));
  reader.readAsText(file);
}

function drawWaveform(values) {
  if (!values?.length) return;
  lastWaveform = values;
  const canvas = elements.waveform;
  const ratio = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  const context = canvas.getContext("2d");
  context.scale(ratio, ratio);
  context.strokeStyle = "#43534b";
  context.lineWidth = 1;
  context.beginPath(); context.moveTo(0, height / 2); context.lineTo(width, height / 2); context.stroke();
  const maximum = Math.max(...values.map(Math.abs), 0.01);
  context.strokeStyle = "#d8ff62";
  context.lineWidth = 1.5;
  context.beginPath();
  values.forEach((value, index) => {
    const x = (index / (values.length - 1)) * width;
    const y = height / 2 - (value / maximum) * height * 0.43;
    index ? context.lineTo(x, y) : context.moveTo(x, y);
  });
  context.stroke();
}

function render(result) {
  lastResult = result;
  elements.emptyState.hidden = true;
  elements.reportContent.hidden = false;
  elements.engineBadge.textContent = result.engine === "optimized" ? "INT8 · WASM SIMD" : "FP32 · JS baseline";
  elements.timing.textContent = `${result.timing.totalMs.toFixed(1)} ms total`;
  elements.severity.textContent = result.guidance.severity;
  elements.severity.className = `severity ${result.guidance.severity}`;
  elements.verdictTitle.textContent = result.guidance.title;
  elements.primaryLabel.textContent = result.primary;
  elements.confidence.textContent = `${Math.round(result.confidence * 100)}%`;
  elements.confidenceMeter.style.width = `${Math.max(result.confidence * 100, 2)}%`;
  elements.decisionBadge.textContent = result.decision.status === "screened" ? "Screen accepted" : "Review required";
  elements.decisionBadge.className = result.decision.status;
  const assurance = `${Math.round(result.decision.engineAgreement * 100)}% engine agreement · ${Math.round(result.decision.distributionCoverage * 100)}% inside calibration envelope`;
  elements.assurance.textContent = result.decision.status === "screened"
    ? assurance
    : `${result.decision.reasons.join(" · ").replaceAll("_", " ")} · ${assurance}`;
  elements.duration.textContent = `${result.signal.durationSeconds}s · ${result.signal.samples.toLocaleString()} samples`;
  drawWaveform(result.signal.waveform);
  elements.timeline.replaceChildren(...result.timeline.map((point) => {
    const segment = document.createElement("span");
    segment.className = point.label;
    if (!point.inDistribution) segment.classList.add("out-of-envelope");
    segment.title = `${point.second}s · ${point.label} · ${Math.round(point.confidence * 100)}%`;
    segment.setAttribute("aria-label", segment.title);
    return segment;
  }));
  elements.action.textContent = result.guidance.action;
  const details = [
    [result.signal.windows, "analysis windows"],
    [result.signal.rms.toFixed(3), "RMS amplitude"],
    [`${result.signal.spectrum.peaks[0].hz} Hz`, "strongest peak"],
    [`${result.timing.inferenceMs.toFixed(2)} ms`, "model inference"],
  ];
  elements.details.innerHTML = details.map(([value, label]) => `<div><strong>${value}</strong><span>${label}</span></div>`).join("");
  elements.machineContext.textContent = `${result.context.machineId} · ${result.context.measurementPoint}`;
  elements.receiptId.textContent = result.receipt.evidenceId;
  elements.receiptId.title = result.receipt.statement;
  elements.disclaimer.textContent = result.note;
}

function maintenanceNote(result) {
  const status = result.decision.status === "screened" ? `screened as ${result.primary}` : `review required (${result.decision.reasons.join(", ")})`;
  return [
    `RotorNote screening note — ${result.context.machineId}`,
    `Point: ${result.context.measurementPoint}; axis: ${result.context.sensorAxis}; sample rate: ${result.signal.sampleRate} Hz`,
    `Result: ${status}; model score (not a calibrated probability): ${Math.round(result.confidence * 100)}%; evidence: ${result.receipt.evidenceId}`,
    `Next action: ${result.guidance.action}`,
    "Screening aid only; confirm through like-for-like retest and qualified vibration review before maintenance action.",
  ].join("\n");
}

elements.downloadEvidence.addEventListener("click", () => {
  if (!lastResult) return;
  const blob = new Blob([`${JSON.stringify(lastResult, null, 2)}\n`], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `rotornote-${lastResult.receipt.evidenceId}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
});

elements.copyMaintenanceNote.addEventListener("click", async () => {
  if (!lastResult) return;
  try {
    await navigator.clipboard.writeText(maintenanceNote(lastResult));
    message("Maintenance note copied");
  } catch {
    message("Clipboard permission was unavailable; download the evidence JSON instead.", true);
  }
});

async function analyze() {
  if (!selectedCsv) return;
  const engine = document.querySelector('input[name="engine"]:checked').value;
  elements.report.setAttribute("aria-busy", "true");
  elements.analyzeButton.disabled = true;
  elements.analyzeButton.querySelector("span").textContent = "Listening…";
  message(`Screening ${selectedName}`);
  try {
    const response = await fetch(`/api/analyze?engine=${engine}`, {
      method: "POST",
      headers: {
        "content-type": "text/csv",
        "x-sample-rate": elements.sampleRate.value,
        "x-machine-id": elements.machineId.value || "unassigned",
        "x-measurement-point": elements.measurementPoint.value || "unspecified",
        "x-sensor-axis": elements.sensorAxis.value,
        ...(elements.operatingRpm.value ? { "x-operating-rpm": elements.operatingRpm.value } : {}),
        ...(elements.loadPercent.value ? { "x-load-percent": elements.loadPercent.value } : {}),
      },
      body: selectedCsv,
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || payload.error || "Analysis failed");
    render(payload.result);
    message(`${selectedName} screened with ${engine}`);
    elements.report.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    message(error.message, true);
  } finally {
    elements.report.setAttribute("aria-busy", "false");
    elements.analyzeButton.disabled = false;
    elements.analyzeButton.querySelector("span").textContent = "Screen recording";
  }
}

elements.fileInput.addEventListener("change", (event) => setFile(event.target.files[0]));
elements.dropzone.addEventListener("dragover", (event) => { event.preventDefault(); elements.dropzone.classList.add("drag"); });
elements.dropzone.addEventListener("dragleave", () => elements.dropzone.classList.remove("drag"));
elements.dropzone.addEventListener("drop", (event) => { event.preventDefault(); elements.dropzone.classList.remove("drag"); setFile(event.dataTransfer.files[0]); });
elements.formatHelp.addEventListener("click", () => {
  elements.formatCopy.hidden = !elements.formatCopy.hidden;
  elements.formatHelp.setAttribute("aria-expanded", String(!elements.formatCopy.hidden));
});
elements.analyzeButton.addEventListener("click", analyze);
window.addEventListener("resize", () => drawWaveform(lastWaveform));

await Promise.all([checkHealth(), loadSamples()]);

elements.anomalyDemo.addEventListener("click", async () => {
  elements.anomalyDemo.disabled = true;
  elements.anomalyResult.textContent = "Running the real INT8 neural head…";
  try {
    const sample = await fetch("/samples/real-variable-speed-anomaly.csv");
    const csv = await sample.text();
    const response = await fetch("/api/anomaly?engine=optimized", {
      method: "POST",
      headers: { "content-type": "text/csv", "x-sample-rate": "1024", "x-operating-rpm": "2100" },
      body: csv,
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || payload.error || "Anomaly screen failed");
    const result = payload.result;
    elements.anomalyResult.textContent = `${result.primary.replaceAll("_", " ")} · ${Math.round(result.confidence * 100)}% uncalibrated model score · ${result.engineAgreement ? "FP32/INT8 agree" : "engine review"}`;
  } catch (error) {
    elements.anomalyResult.textContent = error.message;
  } finally {
    elements.anomalyDemo.disabled = false;
  }
});
