"""Grouped real-data cross-validation and final production refit.

Each fold holds out one complete physical test per condition. No window from a
held test appears in its fold's scaler or classifier fit. The already frozen
logistic specification is reused without post-final tuning.
"""

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
SEED = 5246534
FOLDS = [
    [1, 2, 4, 5],
    [3, 10, 7, 8],
    [6, 11, 15, 12],
    [9, 13, 18, 14],
    [17, 16, 20, 19],
]


def classifier():
    return make_pipeline(StandardScaler(), LogisticRegression(C=1.0, max_iter=1000, random_state=SEED))


def score(expected, probabilities):
    predicted = probabilities.argmax(axis=1)
    return {
        "rows": int(len(expected)),
        "balancedAccuracy": balanced_accuracy_score(expected, predicted),
        "confusionMatrix": confusion_matrix(expected, predicted, labels=[0, 1, 2, 3]).tolist(),
    }


def risk_coverage(expected, probabilities):
    predicted = probabilities.argmax(axis=1)
    confidence = probabilities.max(axis=1)
    rows = []
    for threshold in [0.5, 0.7, 0.8, 0.9, 0.95]:
        accepted = confidence >= threshold
        class_accuracy = []
        for label in [0, 1, 2, 3]:
            selected = accepted & (expected == label)
            class_accuracy.append(float((predicted[selected] == label).mean()) if selected.any() else None)
        available = [value for value in class_accuracy if value is not None]
        rows.append({
            "minimumConfidence": threshold,
            "coverage": float(accepted.mean()),
            "acceptedRecordings": int(accepted.sum()),
            "selectiveAccuracy": float((predicted[accepted] == expected[accepted]).mean()) if accepted.any() else None,
            "selectiveBalancedAccuracy": float(np.mean(available)) if available else None,
            "acceptedByClass": [int((accepted & (expected == label)).sum()) for label in [0, 1, 2, 3]],
            "classConditionalAccuracy": class_accuracy,
        })
    return rows


def main():
    manifest = json.loads((DATA / "mechanical-manifest.json").read_text(encoding="utf-8"))
    features = np.fromfile(DATA / "mechanical-features.f32", dtype="<f4").reshape(manifest["rows"], manifest["featureCount"])
    labels = np.fromfile(DATA / "mechanical-labels.u8", dtype=np.uint8)
    groups = np.fromfile(DATA / "mechanical-groups.u8", dtype=np.uint8)
    windows_per_channel = manifest["windowsPerChannel"]
    channels_per_file = manifest["channelsPerFile"]
    rows_per_recording = windows_per_channel * channels_per_file

    all_window_probabilities = []
    all_window_expected = []
    all_channel_probabilities = []
    all_channel_expected = []
    all_recording_probabilities = []
    all_recording_expected = []
    fold_receipts = []
    group_results = []

    for fold_index, held_tests in enumerate(FOLDS, start=1):
        held_mask = np.isin(groups, held_tests)
        train_mask = ~held_mask
        model = classifier().fit(features[train_mask], labels[train_mask])
        probabilities = model.predict_proba(features[held_mask])
        expected = labels[held_mask]
        held_groups = groups[held_mask]

        if len(expected) % rows_per_recording:
            raise RuntimeError("Recording aggregation contract failed")
        shaped_probabilities = probabilities.reshape(-1, channels_per_file, windows_per_channel, 4)
        shaped_expected = expected.reshape(-1, channels_per_file, windows_per_channel)
        shaped_groups = held_groups.reshape(-1, channels_per_file, windows_per_channel)
        if not np.all(shaped_expected == shaped_expected[:, :1, :1]) or not np.all(shaped_groups == shaped_groups[:, :1, :1]):
            raise RuntimeError("A physical recording crossed an aggregation boundary")

        channel_probabilities = shaped_probabilities.mean(axis=2).reshape(-1, 4)
        channel_expected = shaped_expected[:, :, 0].reshape(-1)
        recording_probabilities = shaped_probabilities.mean(axis=(1, 2))
        recording_expected = shaped_expected[:, 0, 0]
        recording_groups = shaped_groups[:, 0, 0]

        window_score = score(expected, probabilities)
        channel_score = score(channel_expected, channel_probabilities)
        recording_score = score(recording_expected, recording_probabilities)
        fold_receipts.append({
            "fold": fold_index,
            "heldTests": held_tests,
            "windowLevel": window_score,
            "singleChannelRecording": channel_score,
            "fourChannelRecording": recording_score,
        })
        for test in held_tests:
            test_mask = recording_groups == test
            test_expected = recording_expected[test_mask]
            test_probabilities = recording_probabilities[test_mask]
            test_prediction = int(test_probabilities.mean(axis=0).argmax())
            group_results.append({
                "test": test,
                "expected": manifest["labels"][int(test_expected[0])],
                "predicted": manifest["labels"][test_prediction],
                "correct": test_prediction == int(test_expected[0]),
                "recordings": int(test_mask.sum()),
            })

        all_window_probabilities.append(probabilities)
        all_window_expected.append(expected)
        all_channel_probabilities.append(channel_probabilities)
        all_channel_expected.append(channel_expected)
        all_recording_probabilities.append(recording_probabilities)
        all_recording_expected.append(recording_expected)

    aggregate = {
        "windowLevel": score(np.concatenate(all_window_expected), np.concatenate(all_window_probabilities)),
        "singleChannelRecording": score(np.concatenate(all_channel_expected), np.concatenate(all_channel_probabilities)),
        "fourChannelRecording": score(np.concatenate(all_recording_expected), np.concatenate(all_recording_probabilities)),
        "physicalTestAccuracy": sum(row["correct"] for row in group_results) / len(group_results),
    }
    aggregate["fourChannelRiskCoverage"] = risk_coverage(
        np.concatenate(all_recording_expected), np.concatenate(all_recording_probabilities)
    )

    production = classifier().fit(features, labels)
    scaler = production.named_steps["standardscaler"]
    fitted = production.named_steps["logisticregression"]
    export = {
        "format": "rotornote-real-logistic-export-v2",
        "seed": SEED,
        "labels": manifest["labels"],
        "featureCount": manifest["featureCount"],
        "normalization": {"means": scaler.mean_.tolist(), "deviations": scaler.scale_.tolist()},
        "weights": fitted.coef_.tolist(),
        "bias": fitted.intercept_.tolist(),
        "sourceFeatureSha256": manifest["featuresSha256"],
        "fitTests": sorted(set(groups.tolist())),
        "validationProtocol": "five folds; one whole physical test per class held out per fold; production refit after cross-validation",
    }
    export_bytes = (json.dumps(export, indent=2) + "\n").encode()
    (DATA / "linear-export.json").write_bytes(export_bytes)

    receipt = {
        "format": "rotornote-open-grouped-cross-validation-v1",
        "executedAt": datetime.now(timezone.utc).isoformat(),
        "modelSpecification": "standard scaling plus multinomial logistic regression; C=1.0; fixed before this cross-validation",
        "source": manifest["sourceDataset"],
        "sourceFeatureSha256": manifest["featuresSha256"],
        "modelExportSha256": hashlib.sha256(export_bytes).hexdigest(),
        "folds": fold_receipts,
        "aggregate": aggregate,
        "physicalTests": group_results,
        "independenceWarning": "The 20 physical tests are the highest-level experimental units. Recordings and windows inside a test are repeated measures; row counts must not be interpreted as independent machines.",
        "scope": "One documented laboratory rig at approximately 1238 RPM. Not cross-machine validation, natural-fault validation, or certification.",
    }
    RESULTS.mkdir(parents=True, exist_ok=True)
    (RESULTS / "open-grouped-cross-validation.json").write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "windowBalancedAccuracy": aggregate["windowLevel"]["balancedAccuracy"],
        "singleChannelRecordingBalancedAccuracy": aggregate["singleChannelRecording"]["balancedAccuracy"],
        "fourChannelRecordingBalancedAccuracy": aggregate["fourChannelRecording"]["balancedAccuracy"],
        "physicalTestAccuracy": aggregate["physicalTestAccuracy"],
        "modelExportSha256": receipt["modelExportSha256"],
    }))


if __name__ == "__main__":
    main()
