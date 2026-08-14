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
WINDOW_FEATURES = 48
FEATURE_WINDOWS = 2
INPUT_FEATURES = WINDOW_FEATURES * FEATURE_WINDOWS
HIDDEN_LAYERS = (768, 384, 128)
TRAINING_ARCHITECTURE = [INPUT_FEATURES, *HIDDEN_LAYERS, 8]


def wilson_interval(successes, total, z=1.959963984540054):
    proportion = successes / total
    denominator = 1 + z * z / total
    center = (proportion + z * z / (2 * total)) / denominator
    margin = z * np.sqrt(proportion * (1 - proportion) / total + z * z / (4 * total * total)) / denominator
    return [float(center - margin), float(center + margin)]


def fit_model(features, labels):
    scaler = StandardScaler().fit(features)
    model = MLPClassifier(
        hidden_layer_sizes=HIDDEN_LAYERS,
        activation="relu",
        solver="adam",
        alpha=0.2,
        batch_size=128,
        learning_rate_init=0.001,
        max_iter=220,
        random_state=SEED,
        tol=1e-5,
        n_iter_no_change=30,
    )
    class_count = len(set(labels.tolist()))
    counts = np.bincount(labels, minlength=class_count)
    sample_weights = np.asarray([len(labels) / (class_count * counts[label]) for label in labels])
    with warnings.catch_warnings():
        warnings.filterwarnings("ignore", category=ConvergenceWarning)
        model.fit(scaler.transform(features), labels, sample_weight=sample_weights)
    return scaler, model


def main():
    manifest = json.loads((DATA / "upatras-manifest.json").read_text(encoding="utf-8"))
    feature_rows = np.fromfile(DATA / "upatras-features.f32", dtype="<f4").reshape(manifest["signals"], manifest["featureWindowsPerSignal"], manifest["featureCount"])
    if feature_rows.shape[1:] != (FEATURE_WINDOWS, WINDOW_FEATURES):
        raise RuntimeError(f"Unexpected UPATRAS feature shape: {feature_rows.shape}")
    # Preserve the two measured temporal windows instead of averaging away
    # within-signal evolution. The order is deterministic: first window, then last.
    features = feature_rows.reshape(manifest["signals"], INPUT_FEATURES)
    broad_labels = np.fromfile(DATA / "upatras-labels.u8", dtype=np.uint8)
    groups = np.fromfile(DATA / "upatras-groups.u8", dtype=np.uint8)
    group_state = {row["group"]: row["state"] for row in manifest["sourceFiles"]}
    states = sorted(set(group_state.values()))
    state_index = {state: index for index, state in enumerate(states)}
    labels = np.asarray([state_index[group_state[int(group)]] for group in groups], dtype=np.uint8)
    healthy_index = state_index["Healthy"]
    derived_broad_labels = np.asarray([0 if label == healthy_index else 1 for label in labels], dtype=np.uint8)
    if len(features) != len(labels) or len(labels) != len(groups) or not np.array_equal(broad_labels, derived_broad_labels):
        raise RuntimeError("UPATRAS signal aggregation boundary failed")

    splitter = StratifiedGroupKFold(n_splits=4, shuffle=True, random_state=SEED)
    probabilities = np.zeros((len(labels), len(states)), dtype=np.float64)
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
            row = {"group": group, "state": group_state[group], "expected": states[expected], "predicted": states[voted], "correct": expected == voted, "signals": int(selected.sum())}
            fold_sequences.append(row)
            sequence_results.append(row)
        folds.append({
            "fold": fold,
            "heldGroups": held_groups,
            "conditionBalancedAccuracy": balanced_accuracy_score(labels[held], predicted),
            "conditionConfusionMatrix": confusion_matrix(labels[held], predicted, labels=list(range(len(states)))).tolist(),
            "broadAnomalyBalancedAccuracy": balanced_accuracy_score(broad_labels[held], np.asarray([0 if label == healthy_index else 1 for label in predicted])),
            "sequenceAccuracy": sum(row["correct"] for row in fold_sequences) / len(fold_sequences),
            "sequences": fold_sequences,
        })

    predicted = probabilities.argmax(axis=1)
    broad_probabilities = np.column_stack([probabilities[:, healthy_index], 1 - probabilities[:, healthy_index]])
    broad_predicted = broad_probabilities.argmax(axis=1)
    confidence = broad_probabilities.max(axis=1)
    risk_coverage = []
    for threshold in [0.5, 0.7, 0.8, 0.9, 0.95, 0.99, 0.995, 0.999]:
        accepted = confidence >= threshold
        risk_coverage.append({
            "minimumConfidence": threshold,
            "coverage": float(accepted.mean()),
            "acceptedSignals": int(accepted.sum()),
            "selectiveAccuracy": float((broad_predicted[accepted] == broad_labels[accepted]).mean()) if accepted.any() else None,
            "selectiveBalancedAccuracy": balanced_accuracy_score(broad_labels[accepted], broad_predicted[accepted]) if len(set(broad_labels[accepted])) == 2 else None,
        })

    production_scaler, production_model = fit_model(features, labels)
    scaled_features = production_scaler.transform(features)
    activations = scaled_features
    hidden_activations = []
    keep_hidden = []
    for weights, bias in zip(production_model.coefs_[:-1], production_model.intercepts_[:-1]):
        activations = np.maximum(0, activations @ weights + bias)
        hidden_activations.append(activations)
        keep_hidden.append(np.flatnonzero(np.any(activations > 0, axis=0)))
    original_logits = hidden_activations[-1] @ production_model.coefs_[-1] + production_model.intercepts_[-1]

    pruned_coefs = []
    pruned_intercepts = []
    previous_keep = np.arange(INPUT_FEATURES)
    for layer, keep in enumerate(keep_hidden):
        pruned_coefs.append(production_model.coefs_[layer][previous_keep, :][:, keep])
        pruned_intercepts.append(production_model.intercepts_[layer][keep])
        previous_keep = keep
    pruned_coefs.append(production_model.coefs_[-1][previous_keep, :])
    pruned_intercepts.append(production_model.intercepts_[-1])

    pruned_values = scaled_features
    for weights, bias in zip(pruned_coefs[:-1], pruned_intercepts[:-1]):
        pruned_values = np.maximum(0, pruned_values @ weights + bias)
    pruned_logits = pruned_values @ pruned_coefs[-1] + pruned_intercepts[-1]
    maximum_pruning_logit_delta = float(np.max(np.abs(original_logits - pruned_logits)))
    if maximum_pruning_logit_delta > 1e-5:
        raise RuntimeError(f"Inactive-unit pruning changed fitted-bank logits: {maximum_pruning_logit_delta}")
    architecture = [INPUT_FEATURES, *[len(keep) for keep in keep_hidden], len(states)]
    coefs = [matrix.T for matrix in pruned_coefs]
    intercepts = [vector for vector in pruned_intercepts]
    if coefs[-1].shape != (len(states), len(keep_hidden[-1])):
        raise RuntimeError(f"Unexpected multi-condition MLP output shape: {coefs[-1].shape}")
    export = {
        "format": "rotornote-upatras-mlp-export-v1",
        "seed": SEED,
        "labels": states,
        "broadOutput": {"labels": manifest["labels"], "healthyConditionIndex": healthy_index, "anomalyConditionIndices": [index for index in range(len(states)) if index != healthy_index]},
        "architecture": architecture,
        "recordingRepresentation": "ordered concatenation of the first and last deterministic 2,048-sample feature windows from one 3,500-sample speed signal",
        "normalization": {"means": production_scaler.mean_.tolist(), "deviations": production_scaler.scale_.tolist()},
        "layers": [{"weights": matrix.tolist(), "bias": bias.tolist()} for matrix, bias in zip(coefs, intercepts)],
        "sourceFeatureSha256": manifest["featuresSha256"],
        "fitMeasurementSequences": sorted(set(groups.tolist())),
        "training": {"epochs": int(production_model.n_iter_), "finalLoss": float(production_model.loss_), "fixedMaximumEpochs": 220, "alpha": 0.2, "solver": "adam", "trainingArchitecture": TRAINING_ARCHITECTURE, "exportArchitecture": architecture, "inactiveUnitsPruned": [size - len(keep) for size, keep in zip(HIDDEN_LAYERS, keep_hidden)], "maximumTrainingBankLogitDeltaAfterPruning": maximum_pruning_logit_delta},
        "validationProtocol": "four-fold stratified whole-measurement-sequence cross-validation; no speed signal or feature window from a held sequence is used in training",
    }
    export_bytes = (json.dumps(export, indent=2) + "\n").encode()
    (DATA / "upatras-deep-export.json").write_bytes(export_bytes)

    correct_sequences = sum(row["correct"] for row in sequence_results)
    receipt = {
        "format": "rotornote-upatras-grouped-anomaly-v1",
        "executedAt": datetime.now(timezone.utc).isoformat(),
        "modelSpecification": "standard scaling plus 96-to-768-to-384-to-128-to-8 ReLU multilayer perceptron over an ordered pair of measured temporal windows; eight observed experimental conditions preserve anomaly heterogeneity, while the product boundary collapses them to healthy-versus-anomaly; class-balanced sample weighting; fixed 220-epoch maximum schedule; post-fit removal of units never activated by any of 2,925 real training-bank signals",
        "source": manifest["sourceDataset"],
        "sourceFeatureSha256": manifest["featuresSha256"],
        "modelExportSha256": hashlib.sha256(export_bytes).hexdigest(),
        "folds": folds,
        "aggregate": {
            "conditionBalancedAccuracy": balanced_accuracy_score(labels, predicted),
            "conditionConfusionMatrix": confusion_matrix(labels, predicted, labels=list(range(len(states)))).tolist(),
            "broadAnomalyBalancedAccuracy": balanced_accuracy_score(broad_labels, broad_predicted),
            "broadAnomalyConfusionMatrix": confusion_matrix(broad_labels, broad_predicted, labels=[0, 1]).tolist(),
            "measurementSequenceAccuracy": correct_sequences / len(sequence_results),
            "measurementSequenceAccuracyWilson95": wilson_interval(correct_sequences, len(sequence_results)),
            "riskCoverage": risk_coverage,
        },
        "measurementSequences": sequence_results,
        "independenceWarning": "The 39 measurement sequences are the highest-level experimental units. The 75 speed signals inside each sequence are repeated sweep measurements and are not 2,925 independent machines. This is development cross-validation, not a prospective field pilot.",
        "scope": "One documented University of Patras laboratory rig, one uniaxial accelerometer, 35.0-49.8 Hz, healthy plus seven induced incipient fault states. The learned representation preserves all eight observed conditions, but the product emits binary anomaly screening only; no condition-state output is presented as a field fault diagnosis or certification.",
    }
    RESULTS.mkdir(parents=True, exist_ok=True)
    (RESULTS / "upatras-grouped-anomaly.json").write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"conditionBalancedAccuracy": receipt["aggregate"]["conditionBalancedAccuracy"], "broadAnomalyBalancedAccuracy": receipt["aggregate"]["broadAnomalyBalancedAccuracy"], "measurementSequenceAccuracy": receipt["aggregate"]["measurementSequenceAccuracy"], "measurementSequenceAccuracyWilson95": receipt["aggregate"]["measurementSequenceAccuracyWilson95"], "modelExportSha256": receipt["modelExportSha256"]}))


if __name__ == "__main__":
    main()
