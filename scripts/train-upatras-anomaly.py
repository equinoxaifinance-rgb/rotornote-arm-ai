"""Train and group-validate RotorNote's variable-speed anomaly MLP.

Every validation fold holds out complete UPATRAS measurement sequences. The
source contains only physical vibration signals; RotorNote does not generate
fault examples or map coupler wear to a different fault label.
"""

from __future__ import annotations

import hashlib
import json
import warnings
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from sklearn.exceptions import ConvergenceWarning
from sklearn.metrics import balanced_accuracy_score, confusion_matrix
from sklearn.model_selection import StratifiedGroupKFold
from sklearn.neural_network import MLPClassifier
from sklearn.preprocessing import StandardScaler


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "field" / "training"
RESULTS = ROOT / "field" / "results"
SEED = 5246534
TRAINING_ARCHITECTURE = [48, 64, 32, 2]


def wilson_interval(successes, total, z=1.959963984540054):
    proportion = successes / total
    denominator = 1 + z * z / total
    center = (proportion + z * z / (2 * total)) / denominator
    margin = z * np.sqrt(proportion * (1 - proportion) / total + z * z / (4 * total * total)) / denominator
    return [float(center - margin), float(center + margin)]


def fit_model(features, labels):
    scaler = StandardScaler().fit(features)
    model = MLPClassifier(
        hidden_layer_sizes=(64, 32),
        activation="relu",
        solver="adam",
        alpha=0.1,
        batch_size=128,
        learning_rate_init=0.001,
        max_iter=180,
        random_state=SEED,
        tol=1e-5,
        n_iter_no_change=30,
    )
    counts = np.bincount(labels, minlength=2)
    sample_weights = np.asarray([len(labels) / (2 * counts[label]) for label in labels])
    with warnings.catch_warnings():
        warnings.filterwarnings("ignore", category=ConvergenceWarning)
        model.fit(scaler.transform(features), labels, sample_weight=sample_weights)
    return scaler, model


def main():
    manifest = json.loads((DATA / "upatras-manifest.json").read_text(encoding="utf-8"))
    feature_rows = np.fromfile(DATA / "upatras-features.f32", dtype="<f4").reshape(manifest["signals"], manifest["featureWindowsPerSignal"], manifest["featureCount"])
    features = feature_rows.mean(axis=1)
    labels = np.fromfile(DATA / "upatras-labels.u8", dtype=np.uint8)
    groups = np.fromfile(DATA / "upatras-groups.u8", dtype=np.uint8)
    group_state = {row["group"]: row["state"] for row in manifest["sourceFiles"]}
    if len(features) != len(labels) or len(labels) != len(groups):
        raise RuntimeError("UPATRAS signal aggregation boundary failed")

    splitter = StratifiedGroupKFold(n_splits=4, shuffle=True, random_state=SEED)
    probabilities = np.zeros((len(labels), 2), dtype=np.float64)
    folds = []
    sequence_results = []
    for fold, (train, held) in enumerate(splitter.split(features, labels, groups), start=1):
        scaler, model = fit_model(features[train], labels[train])
        probabilities[held] = model.predict_proba(scaler.transform(features[held]))
        predicted = probabilities[held].argmax(axis=1)
        held_groups = sorted(set(groups[held].tolist()))
        fold_sequences = []
        for group in held_groups:
            selected = groups[held] == group
            expected = int(labels[held][selected][0])
            voted = int(probabilities[held][selected].mean(axis=0).argmax())
            row = {"group": group, "state": group_state[group], "expected": manifest["labels"][expected], "predicted": manifest["labels"][voted], "correct": expected == voted, "signals": int(selected.sum())}
            fold_sequences.append(row)
            sequence_results.append(row)
        folds.append({
            "fold": fold,
            "heldGroups": held_groups,
            "signalBalancedAccuracy": balanced_accuracy_score(labels[held], predicted),
            "signalConfusionMatrix": confusion_matrix(labels[held], predicted, labels=[0, 1]).tolist(),
            "sequenceAccuracy": sum(row["correct"] for row in fold_sequences) / len(fold_sequences),
            "sequences": fold_sequences,
        })

    predicted = probabilities.argmax(axis=1)
    confidence = probabilities.max(axis=1)
    risk_coverage = []
    for threshold in [0.5, 0.7, 0.8, 0.9, 0.95, 0.99, 0.995, 0.999]:
        accepted = confidence >= threshold
        risk_coverage.append({
            "minimumConfidence": threshold,
            "coverage": float(accepted.mean()),
            "acceptedSignals": int(accepted.sum()),
            "selectiveAccuracy": float((predicted[accepted] == labels[accepted]).mean()) if accepted.any() else None,
            "selectiveBalancedAccuracy": balanced_accuracy_score(labels[accepted], predicted[accepted]) if len(set(labels[accepted])) == 2 else None,
        })

    production_scaler, production_model = fit_model(features, labels)
    scaled_features = production_scaler.transform(features)
    first_activations = np.maximum(0, scaled_features @ production_model.coefs_[0] + production_model.intercepts_[0])
    keep_first = np.flatnonzero(np.any(first_activations > 0, axis=0))
    second_activations = np.maximum(0, first_activations @ production_model.coefs_[1] + production_model.intercepts_[1])
    keep_second = np.flatnonzero(np.any(second_activations > 0, axis=0))
    pruned_coefs = [
        production_model.coefs_[0][:, keep_first],
        production_model.coefs_[1][keep_first, :][:, keep_second],
        production_model.coefs_[2][keep_second, :],
    ]
    pruned_intercepts = [
        production_model.intercepts_[0][keep_first],
        production_model.intercepts_[1][keep_second],
        production_model.intercepts_[2],
    ]
    original_logits = second_activations @ production_model.coefs_[2] + production_model.intercepts_[2]
    pruned_first = np.maximum(0, scaled_features @ pruned_coefs[0] + pruned_intercepts[0])
    pruned_second = np.maximum(0, pruned_first @ pruned_coefs[1] + pruned_intercepts[1])
    pruned_logits = pruned_second @ pruned_coefs[2] + pruned_intercepts[2]
    maximum_pruning_logit_delta = float(np.max(np.abs(original_logits - pruned_logits)))
    if maximum_pruning_logit_delta > 1e-5:
        raise RuntimeError(f"Inactive-unit pruning changed fitted-bank logits: {maximum_pruning_logit_delta}")
    architecture = [48, len(keep_first), len(keep_second), 2]
    coefs = [matrix.T for matrix in pruned_coefs]
    intercepts = [vector for vector in pruned_intercepts]
    if coefs[-1].shape != (1, len(keep_second)):
        raise RuntimeError(f"Unexpected binary MLP output shape: {coefs[-1].shape}")
    coefs[-1] = np.vstack([np.zeros((1, coefs[-1].shape[1])), coefs[-1]])
    intercepts[-1] = np.asarray([0.0, intercepts[-1][0]])
    export = {
        "format": "rotornote-upatras-mlp-export-v1",
        "seed": SEED,
        "labels": manifest["labels"],
        "architecture": architecture,
        "recordingRepresentation": "mean of two deterministic 2,048-sample feature windows from one 3,500-sample speed signal",
        "normalization": {"means": production_scaler.mean_.tolist(), "deviations": production_scaler.scale_.tolist()},
        "layers": [{"weights": matrix.tolist(), "bias": bias.tolist()} for matrix, bias in zip(coefs, intercepts)],
        "sourceFeatureSha256": manifest["featuresSha256"],
        "fitMeasurementSequences": sorted(set(groups.tolist())),
        "training": {"epochs": int(production_model.n_iter_), "finalLoss": float(production_model.loss_), "fixedMaximumEpochs": 180, "alpha": 0.1, "solver": "adam", "trainingArchitecture": TRAINING_ARCHITECTURE, "exportArchitecture": architecture, "inactiveUnitsPruned": [64 - len(keep_first), 32 - len(keep_second)], "maximumTrainingBankLogitDeltaAfterPruning": maximum_pruning_logit_delta},
        "validationProtocol": "four-fold stratified whole-measurement-sequence cross-validation; no speed signal or feature window from a held sequence is used in training",
    }
    export_bytes = (json.dumps(export, indent=2) + "\n").encode()
    (DATA / "upatras-deep-export.json").write_bytes(export_bytes)

    correct_sequences = sum(row["correct"] for row in sequence_results)
    receipt = {
        "format": "rotornote-upatras-grouped-anomaly-v1",
        "executedAt": datetime.now(timezone.utc).isoformat(),
        "modelSpecification": "standard scaling plus 48-to-64-to-32-to-2 ReLU multilayer perceptron; class-balanced sample weighting; fixed 180-epoch maximum schedule; post-fit removal of units never activated by any of 2,925 real training-bank signals",
        "source": manifest["sourceDataset"],
        "sourceFeatureSha256": manifest["featuresSha256"],
        "modelExportSha256": hashlib.sha256(export_bytes).hexdigest(),
        "folds": folds,
        "aggregate": {
            "signalBalancedAccuracy": balanced_accuracy_score(labels, predicted),
            "signalConfusionMatrix": confusion_matrix(labels, predicted, labels=[0, 1]).tolist(),
            "measurementSequenceAccuracy": correct_sequences / len(sequence_results),
            "measurementSequenceAccuracyWilson95": wilson_interval(correct_sequences, len(sequence_results)),
            "riskCoverage": risk_coverage,
        },
        "measurementSequences": sequence_results,
        "independenceWarning": "The 39 measurement sequences are the highest-level experimental units. The 75 speed signals inside each sequence are repeated sweep measurements and are not 2,925 independent machines. This is development cross-validation, not a prospective field pilot.",
        "scope": "One documented University of Patras laboratory rig, one uniaxial accelerometer, 35.0-49.8 Hz, healthy plus seven induced incipient fault states. Binary anomaly screening only; no fault-family diagnosis or field certification.",
    }
    RESULTS.mkdir(parents=True, exist_ok=True)
    (RESULTS / "upatras-grouped-anomaly.json").write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"signalBalancedAccuracy": receipt["aggregate"]["signalBalancedAccuracy"], "measurementSequenceAccuracy": receipt["aggregate"]["measurementSequenceAccuracy"], "measurementSequenceAccuracyWilson95": receipt["aggregate"]["measurementSequenceAccuracyWilson95"], "modelExportSha256": receipt["modelExportSha256"]}))


if __name__ == "__main__":
    main()
