"""Development-only model selection over frozen physical-test groups.

Tests 1, 2, 4, and 5 are excluded from every fit and score in this script.
They are the untouched final evaluation set. Tests 16, 17, 19, and 20 are
the development set that the first model exposed; all remaining tests are
the model-selection training set.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from sklearn.discriminant_analysis import LinearDiscriminantAnalysis
from sklearn.ensemble import ExtraTreesClassifier, HistGradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import balanced_accuracy_score, confusion_matrix
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "field" / "training"
FINAL_TESTS = {1, 2, 4, 5}
DEVELOPMENT_TESTS = {16, 17, 19, 20}


def evaluate(name, model, x_train, y_train, x_development, y_development):
    model.fit(x_train, y_train)
    predicted = model.predict(x_development)
    return {
        "name": name,
        "developmentBalancedAccuracy": balanced_accuracy_score(y_development, predicted),
        "developmentConfusion": confusion_matrix(y_development, predicted, labels=[0, 1, 2, 3]).tolist(),
    }


def main():
    manifest = json.loads((DATA / "mechanical-manifest.json").read_text(encoding="utf-8"))
    features = np.fromfile(DATA / "mechanical-features.f32", dtype="<f4").reshape(manifest["rows"], manifest["featureCount"])
    labels = np.fromfile(DATA / "mechanical-labels.u8", dtype=np.uint8)
    groups = np.fromfile(DATA / "mechanical-groups.u8", dtype=np.uint8)
    training_mask = ~np.isin(groups, list(FINAL_TESTS | DEVELOPMENT_TESTS))
    development_mask = np.isin(groups, list(DEVELOPMENT_TESTS))
    if set(groups[~(training_mask | development_mask)]) != FINAL_TESTS:
        raise RuntimeError("Frozen final groups are not isolated")

    candidates = [
        ("logistic", make_pipeline(StandardScaler(), LogisticRegression(C=1.0, max_iter=1000, random_state=5246534))),
        ("lda-shrinkage", make_pipeline(StandardScaler(), LinearDiscriminantAnalysis(solver="lsqr", shrinkage="auto"))),
        ("extra-trees", ExtraTreesClassifier(n_estimators=400, min_samples_leaf=3, max_features="sqrt", n_jobs=-1, random_state=5246534)),
        ("hist-gradient", HistGradientBoostingClassifier(max_iter=250, learning_rate=0.08, max_leaf_nodes=31, l2_regularization=0.5, random_state=5246534)),
        ("mlp-128-64", make_pipeline(StandardScaler(), MLPClassifier(hidden_layer_sizes=(128, 64), alpha=0.01, max_iter=500, early_stopping=True, validation_fraction=0.15, n_iter_no_change=30, random_state=5246534))),
        ("mlp-256-128", make_pipeline(StandardScaler(), MLPClassifier(hidden_layer_sizes=(256, 128), alpha=0.01, max_iter=500, early_stopping=True, validation_fraction=0.15, n_iter_no_change=30, random_state=5246534))),
    ]
    results = []
    for name, model in candidates:
        results.append(evaluate(name, model, features[training_mask], labels[training_mask], features[development_mask], labels[development_mask]))
        print(json.dumps(results[-1]), flush=True)
    output = {
        "policy": {
            "selectionTrainingTests": sorted(set(groups[training_mask].tolist())),
            "developmentTests": sorted(DEVELOPMENT_TESTS),
            "frozenFinalTests": sorted(FINAL_TESTS),
            "finalSetWasScored": False,
        },
        "results": results,
    }
    (ROOT / ".field-work" / "open-real" / "model-selection.json").write_text(json.dumps(output, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
