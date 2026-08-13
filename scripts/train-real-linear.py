"""Fit the frozen real-data classifier and open the final test set once."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import balanced_accuracy_score, confusion_matrix
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "field" / "training"
RESULTS = ROOT / "field" / "results"
FINAL_TESTS = {1, 2, 4, 5}
SEED = 5246534


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    receipt_path = RESULTS / "open-final-evaluation.json"
    if receipt_path.exists():
        raise RuntimeError("Final evaluation receipt already exists; refusing to reopen the frozen set")

    manifest = json.loads((DATA / "mechanical-manifest.json").read_text(encoding="utf-8"))
    features = np.fromfile(DATA / "mechanical-features.f32", dtype="<f4").reshape(manifest["rows"], manifest["featureCount"])
    labels = np.fromfile(DATA / "mechanical-labels.u8", dtype=np.uint8)
    groups = np.fromfile(DATA / "mechanical-groups.u8", dtype=np.uint8)
    final_mask = np.isin(groups, list(FINAL_TESTS))
    training_mask = ~final_mask
    if sorted(set(groups[final_mask].tolist())) != sorted(FINAL_TESTS):
        raise RuntimeError("Frozen final groups are incomplete")

    pipeline = make_pipeline(
        StandardScaler(),
        LogisticRegression(C=1.0, max_iter=1000, random_state=SEED),
    )
    pipeline.fit(features[training_mask], labels[training_mask])
    probabilities = pipeline.predict_proba(features[final_mask])
    predicted = probabilities.argmax(axis=1)
    expected = labels[final_mask]

    if len(expected) % 4 or not np.all(expected.reshape(-1, 4) == expected.reshape(-1, 4)[:, [0]]):
        raise RuntimeError("Four-channel recording aggregation contract failed")
    recording_probabilities = probabilities.reshape(-1, 4, 4).mean(axis=1)
    recording_expected = expected.reshape(-1, 4)[:, 0]
    recording_predicted = recording_probabilities.argmax(axis=1)

    scaler = pipeline.named_steps["standardscaler"]
    classifier = pipeline.named_steps["logisticregression"]
    export = {
        "format": "rotornote-real-logistic-export-v1",
        "seed": SEED,
        "labels": manifest["labels"],
        "featureCount": manifest["featureCount"],
        "normalization": {"means": scaler.mean_.tolist(), "deviations": scaler.scale_.tolist()},
        "weights": classifier.coef_.tolist(),
        "bias": classifier.intercept_.tolist(),
        "sourceFeatureSha256": manifest["featuresSha256"],
        "trainingTests": sorted(set(groups[training_mask].tolist())),
        "finalTests": sorted(FINAL_TESTS),
    }
    export_bytes = (json.dumps(export, indent=2) + "\n").encode()
    export_path = DATA / "linear-export.json"
    export_path.write_bytes(export_bytes)

    labels_order = list(range(len(manifest["labels"])))
    sample_confusion = confusion_matrix(expected, predicted, labels=labels_order).tolist()
    recording_confusion = confusion_matrix(recording_expected, recording_predicted, labels=labels_order).tolist()
    receipt = {
        "format": "rotornote-frozen-final-evaluation-v1",
        "executedAt": datetime.now(timezone.utc).isoformat(),
        "modelSelection": "logistic regression selected on tests 16,17,19,20 before final-set access; C=1.0; standard scaling",
        "source": manifest["sourceDataset"],
        "sourceFeatureSha256": manifest["featuresSha256"],
        "modelExportSha256": hashlib.sha256(export_bytes).hexdigest(),
        "trainingTests": export["trainingTests"],
        "finalTests": export["finalTests"],
        "finalSetAccessCount": 1,
        "sampleLevel": {
            "rows": int(len(expected)),
            "balancedAccuracy": balanced_accuracy_score(expected, predicted),
            "confusionMatrix": sample_confusion,
        },
        "recordingLevelFourChannel": {
            "recordings": int(len(recording_expected)),
            "balancedAccuracy": balanced_accuracy_score(recording_expected, recording_predicted),
            "confusionMatrix": recording_confusion,
        },
        "independenceWarning": "The final set contains one physical test per condition. Rows and recordings within a test are repeated measures, not independent machines; no field sensitivity or specificity claim is supported.",
        "scope": "One documented laboratory rig at approximately 1238 RPM. Not cross-machine validation, natural-fault validation, or certification.",
    }
    RESULTS.mkdir(parents=True, exist_ok=True)
    receipt_path.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"sampleBalancedAccuracy": receipt["sampleLevel"]["balancedAccuracy"], "recordingBalancedAccuracy": receipt["recordingLevelFourChannel"]["balancedAccuracy"], "modelExportSha256": receipt["modelExportSha256"]}))


if __name__ == "__main__":
    main()
