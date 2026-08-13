"""Grouped real-data validation, nested policy calibration, and production refit.

Every reported outer fold holds out one complete physical test per condition.
The production representation is the mean RotorNote feature vector over four
synchronized channels and five deterministic windows. The resulting LDA is a
single linear 48-to-4 layer, preserving the Arm FP32/INT8 optimization path.
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from sklearn.discriminant_analysis import LinearDiscriminantAnalysis
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
    # A fixed, numerically minimal covariance ridge avoids singular LDA weights
    # while preserving the grouped accuracy and exact INT8 recording labels.
    return make_pipeline(StandardScaler(), LinearDiscriminantAnalysis(solver="lsqr", shrinkage=1e-8))


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
    for threshold in [0.5, 0.7, 0.8, 0.9, 0.95, 0.99]:
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


def choose_threshold(expected, probabilities):
    predicted = probabilities.argmax(axis=1)
    confidence = probabilities.max(axis=1)
    for threshold in np.arange(0.50, 1.0, 0.01):
        accepted = confidence >= threshold
        if accepted.any() and float((predicted[accepted] == expected[accepted]).mean()) >= 0.95:
            return float(round(threshold, 2))
    return 0.99


def nested_policy(recording_features, recording_labels, recording_groups):
    """Choose a threshold without seeing each outer fold, then evaluate it."""
    fold_rows = []
    aggregate_expected = []
    aggregate_probabilities = []
    aggregate_thresholds = []
    for outer_index, outer_tests in enumerate(FOLDS):
        outer_mask = np.isin(recording_groups, outer_tests)
        inner_expected = []
        inner_probabilities = []
        for inner_index, inner_tests in enumerate(FOLDS):
            if inner_index == outer_index:
                continue
            inner_mask = np.isin(recording_groups, inner_tests)
            train_mask = ~(outer_mask | inner_mask)
            fitted = classifier().fit(recording_features[train_mask], recording_labels[train_mask])
            inner_expected.append(recording_labels[inner_mask])
            inner_probabilities.append(fitted.predict_proba(recording_features[inner_mask]))
        calibration_expected = np.concatenate(inner_expected)
        calibration_probabilities = np.concatenate(inner_probabilities)
        threshold = choose_threshold(calibration_expected, calibration_probabilities)

        fitted = classifier().fit(recording_features[~outer_mask], recording_labels[~outer_mask])
        probabilities = fitted.predict_proba(recording_features[outer_mask])
        expected = recording_labels[outer_mask]
        accepted = probabilities.max(axis=1) >= threshold
        fold_rows.append({
            "outerFold": outer_index + 1,
            "heldTests": outer_tests,
            "thresholdChosenWithoutOuterFold": threshold,
            "coverage": float(accepted.mean()),
            "acceptedRecordings": int(accepted.sum()),
            "selectiveAccuracy": float((probabilities.argmax(axis=1)[accepted] == expected[accepted]).mean()) if accepted.any() else None,
        })
        aggregate_expected.append(expected)
        aggregate_probabilities.append(probabilities)
        aggregate_thresholds.extend([threshold] * len(expected))

    expected = np.concatenate(aggregate_expected)
    probabilities = np.concatenate(aggregate_probabilities)
    thresholds = np.asarray(aggregate_thresholds)
    accepted = probabilities.max(axis=1) >= thresholds
    return {
        "method": "For each outer fold, inner grouped CV on the other 16 physical tests selected the lowest 0.01-grid confidence threshold reaching 95% accepted accuracy; that threshold was then applied once to the unseen outer fold.",
        "folds": fold_rows,
        "aggregate": {
            "coverage": float(accepted.mean()),
            "acceptedRecordings": int(accepted.sum()),
            "selectiveAccuracy": float((probabilities.argmax(axis=1)[accepted] == expected[accepted]).mean()),
            "thresholds": sorted(set(thresholds.tolist())),
        },
    }


def main():
    manifest = json.loads((DATA / "mechanical-manifest.json").read_text(encoding="utf-8"))
    window_features = np.fromfile(DATA / "mechanical-features.f32", dtype="<f4").reshape(manifest["rows"], manifest["featureCount"])
    window_labels = np.fromfile(DATA / "mechanical-labels.u8", dtype=np.uint8)
    window_groups = np.fromfile(DATA / "mechanical-groups.u8", dtype=np.uint8)
    channels = manifest["channelsPerFile"]
    windows = manifest["windowsPerChannel"]
    shaped_features = window_features.reshape(-1, channels, windows, manifest["featureCount"])
    shaped_labels = window_labels.reshape(-1, channels, windows)
    shaped_groups = window_groups.reshape(-1, channels, windows)
    if not np.all(shaped_labels == shaped_labels[:, :1, :1]) or not np.all(shaped_groups == shaped_groups[:, :1, :1]):
        raise RuntimeError("A physical recording crossed an aggregation boundary")
    recording_features = shaped_features.mean(axis=(1, 2))
    channel_features = shaped_features.mean(axis=2).reshape(-1, manifest["featureCount"])
    recording_labels = shaped_labels[:, 0, 0]
    recording_groups = shaped_groups[:, 0, 0]
    channel_labels = np.repeat(recording_labels, channels)

    all_probabilities = []
    all_expected = []
    all_channel_probabilities = []
    all_channel_expected = []
    fold_receipts = []
    group_results = []
    for fold_index, held_tests in enumerate(FOLDS, start=1):
        held_mask = np.isin(recording_groups, held_tests)
        fitted = classifier().fit(recording_features[~held_mask], recording_labels[~held_mask])
        probabilities = fitted.predict_proba(recording_features[held_mask])
        expected = recording_labels[held_mask]
        held_groups = recording_groups[held_mask]
        channel_mask = np.repeat(held_mask, channels)
        channel_probabilities = fitted.predict_proba(channel_features[channel_mask])
        fold_receipts.append({
            "fold": fold_index,
            "heldTests": held_tests,
            "singleChannelAblation": score(channel_labels[channel_mask], channel_probabilities),
            "fourChannelRecording": score(expected, probabilities),
        })
        for physical_test in held_tests:
            test_mask = held_groups == physical_test
            test_expected = expected[test_mask]
            test_probabilities = probabilities[test_mask]
            test_prediction = int(test_probabilities.mean(axis=0).argmax())
            group_results.append({
                "test": physical_test,
                "expected": manifest["labels"][int(test_expected[0])],
                "predicted": manifest["labels"][test_prediction],
                "correct": test_prediction == int(test_expected[0]),
                "recordings": int(test_mask.sum()),
            })
        all_probabilities.append(probabilities)
        all_expected.append(expected)
        all_channel_probabilities.append(channel_probabilities)
        all_channel_expected.append(channel_labels[channel_mask])

    expected = np.concatenate(all_expected)
    probabilities = np.concatenate(all_probabilities)
    aggregate = {
        "singleChannelAblation": score(np.concatenate(all_channel_expected), np.concatenate(all_channel_probabilities)),
        "fourChannelRecording": score(expected, probabilities),
        "physicalTestAccuracy": sum(row["correct"] for row in group_results) / len(group_results),
        "fourChannelRiskCoverage": risk_coverage(expected, probabilities),
        "nestedConfidencePolicy": nested_policy(recording_features, recording_labels, recording_groups),
    }

    production = classifier().fit(recording_features, recording_labels)
    scaler = production.named_steps["standardscaler"]
    fitted = production.named_steps["lineardiscriminantanalysis"]
    export = {
        "format": "rotornote-real-lda-export-v3",
        "seed": SEED,
        "labels": manifest["labels"],
        "featureCount": manifest["featureCount"],
        "recordingRepresentation": "mean feature vector over four synchronized sensor channels and five deterministic windows per channel",
        "normalization": {"means": scaler.mean_.tolist(), "deviations": scaler.scale_.tolist()},
        "weights": fitted.coef_.tolist(),
        "bias": fitted.intercept_.tolist(),
        "sourceFeatureSha256": manifest["featuresSha256"],
        "fitTests": sorted(set(recording_groups.tolist())),
        "validationProtocol": "five outer folds; one whole physical test per class held out per fold; nested grouped confidence calibration; production refit after validation",
    }
    export_bytes = (json.dumps(export, indent=2) + "\n").encode()
    (DATA / "linear-export.json").write_bytes(export_bytes)

    receipt = {
        "format": "rotornote-open-grouped-cross-validation-v2",
        "executedAt": datetime.now(timezone.utc).isoformat(),
        "modelSpecification": "standard scaling plus linear discriminant analysis with shared covariance (lsqr solver; fixed shrinkage=1e-8 numerical ridge); 48-to-4 linear inference layer",
        "recordingRepresentation": export["recordingRepresentation"],
        "source": manifest["sourceDataset"],
        "sourceFeatureSha256": manifest["featuresSha256"],
        "modelExportSha256": hashlib.sha256(export_bytes).hexdigest(),
        "folds": fold_receipts,
        "aggregate": aggregate,
        "physicalTests": group_results,
        "physicalTestFoldBalancedAccuracyRange": [min(row["fourChannelRecording"]["balancedAccuracy"] for row in fold_receipts), max(row["fourChannelRecording"]["balancedAccuracy"] for row in fold_receipts)],
        "independenceWarning": "The 20 physical tests are the highest-level experimental units. Recordings and windows inside a test are repeated measures; row counts must not be interpreted as independent machines.",
        "scope": "One documented laboratory rig at approximately 1238 RPM. Not cross-machine validation, natural-fault validation, or certification.",
    }
    RESULTS.mkdir(parents=True, exist_ok=True)
    (RESULTS / "open-grouped-cross-validation.json").write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "singleChannelAblationBalancedAccuracy": aggregate["singleChannelAblation"]["balancedAccuracy"],
        "fourChannelRecordingBalancedAccuracy": aggregate["fourChannelRecording"]["balancedAccuracy"],
        "foldBalancedAccuracyRange": receipt["physicalTestFoldBalancedAccuracyRange"],
        "physicalTestAccuracy": aggregate["physicalTestAccuracy"],
        "nestedPolicy": aggregate["nestedConfidencePolicy"]["aggregate"],
        "modelExportSha256": receipt["modelExportSha256"],
    }))


if __name__ == "__main__":
    main()
