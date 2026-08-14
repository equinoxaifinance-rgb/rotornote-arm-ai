"""Prepare a predeclared, condition-balanced Zhenjiang boundary challenge."""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import zipfile
from pathlib import Path

import numpy as np
from scipy.io import loadmat


ROOT = Path(__file__).resolve().parents[1]
CONDITIONS = {
    1: "healthy",
    2: "inner_race_fault",
    3: "outer_race_fault",
    4: "ball_fault",
    5: "ball_plus_outer_race_fault",
}


def digest_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def digest_file(path: Path) -> str:
    return digest_bytes(path.read_bytes())


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--archive", type=Path, default=ROOT / ".field-work/open-real/zhenjiang-v1.zip")
    parser.add_argument("--output", type=Path, default=ROOT / ".field-work/open-real/zhenjiang-prepared")
    arguments = parser.parse_args()
    source = json.loads((ROOT / "field/open-data-sources.json").read_text(encoding="utf-8"))["zhenjiangBoundaryEvaluation"]
    archive_hash = digest_file(arguments.archive)
    if archive_hash != source["archiveSha256"]:
        raise RuntimeError(f"Archive SHA-256 mismatch: {archive_hash}")
    arguments.output.mkdir(parents=True, exist_ok=True)
    records = []
    selected_columns = np.linspace(0, 1889, source["selectedColumnsPerFile"], dtype=int).tolist()
    with zipfile.ZipFile(arguments.archive) as archive:
        entries = {Path(entry.filename).name: entry for entry in archive.infolist() if entry.filename.lower().endswith(".mat")}
        if sorted(entries) != [f"{index}.mat" for index in CONDITIONS]:
            raise RuntimeError(f"Unexpected Zhenjiang MAT files: {sorted(entries)}")
        for file_index, condition in CONDITIONS.items():
            entry = entries[f"{file_index}.mat"]
            source_bytes = archive.read(entry)
            group = loadmat(io.BytesIO(source_bytes))["group"]
            if group.shape != (1800, 1890) or not np.isfinite(group).all():
                raise RuntimeError(f"Unexpected signal matrix for {entry.filename}: {group.shape}")
            for selected_index, column in enumerate(selected_columns, start=1):
                raw = group[:, column]
                resampled = np.interp(np.linspace(0, len(raw) - 1, 2048), np.arange(len(raw)), raw)
                identifier = f"zj-{file_index}-{selected_index}"
                csv_path = arguments.output / f"{identifier}.csv"
                csv_path.write_text("amplitude\n" + "\n".join(f"{float(value):.9g}" for value in resampled) + "\n", encoding="utf-8")
                records.append({
                    "id": identifier,
                    "conditionFile": file_index,
                    "condition": condition,
                    "sourceColumn": column,
                    "sourceSamples": len(raw),
                    "preparedSamples": len(resampled),
                    "sourceFileSha256": digest_bytes(source_bytes),
                    "prepared": str(csv_path),
                    "preparedSha256": digest_file(csv_path),
                })
    expected = source["expectedConditionFiles"] * source["selectedColumnsPerFile"]
    if len(records) != expected:
        raise RuntimeError(f"Expected {expected} prepared signals, found {len(records)}")
    manifest = {
        "source": source,
        "archiveSha256": archive_hash,
        "selection": "Seven evenly spaced column indices from every numbered condition matrix, fixed before inference. Because the archive does not machine-map columns to RPM, each prepared trace is challenged at every documented RPM.",
        "transform": "Deterministic linear interpolation from 1,800 to 2,048 samples; no generated signals, labels, or noise.",
        "records": records,
    }
    (arguments.output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": "prepared", "signals": len(records), "conditions": len(CONDITIONS), "archiveSha256": archive_hash}))


if __name__ == "__main__":
    main()
