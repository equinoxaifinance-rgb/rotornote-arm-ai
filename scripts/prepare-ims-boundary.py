"""Verify NASA IMS provenance and prepare a fixed natural-failure boundary probe."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import subprocess
import zipfile
from pathlib import Path

import numpy as np


ROOT = Path(__file__).resolve().parents[1]
RUNS = [
    {
        "id": "set1",
        "archive": "1st_test.rar",
        "prefix": "1st_test/",
        "expected": 2156,
        "channels": 8,
        "first": "1st_test/2003.10.22.12.06.24",
        "last": "1st_test/2003.11.25.23.39.56",
        "failedBearings": [3, 4],
        "channelMap": [1, 1, 2, 2, 3, 3, 4, 4],
        "axes": ["x", "y", "x", "y", "x", "y", "x", "y"],
    },
    {
        "id": "set2",
        "archive": "2nd_test.rar",
        "prefix": "2nd_test/",
        "expected": 984,
        "channels": 4,
        "first": "2nd_test/2004.02.12.10.32.39",
        "last": "2nd_test/2004.02.19.06.22.39",
        "failedBearings": [1],
        "channelMap": [1, 2, 3, 4],
        "axes": ["single", "single", "single", "single"],
    },
    {
        "id": "set3",
        "archive": "3rd_test.rar",
        "prefix": "4th_test/txt/",
        "expected": 4448,
        "channels": 4,
        "first": "4th_test/txt/2004.03.04.09.27.46",
        "last": "4th_test/txt/2004.04.04.19.01.57",
        "failedBearings": [3],
        "channelMap": [1, 2, 3, 4],
        "axes": ["single", "single", "single", "single"],
    },
]


def digest_file(path: Path) -> str:
    hasher = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def run_7z(executable: str, arguments: list[str]) -> str:
    completed = subprocess.run([executable, *arguments], check=True, capture_output=True, text=True)
    return completed.stdout


def archive_paths(executable: str, archive: Path, run: dict) -> list[str]:
    lines = run_7z(executable, ["l", "-ba", str(archive)]).splitlines()
    paths = []
    for line in lines:
        candidate = line.split()[-1].replace("\\", "/") if line.split() else ""
        if candidate.startswith(run["prefix"]) and re.search(r"\d{4}\.\d{2}\.\d{2}\.\d{2}\.\d{2}\.\d{2}$", candidate):
            if run["id"] != "set3" or candidate <= run["last"]:
                paths.append(candidate)
    paths.sort()
    if len(paths) != run["expected"] or paths[0] != run["first"] or paths[-1] != run["last"]:
        raise RuntimeError(f"Unexpected {run['id']} archive boundary: count={len(paths)} first={paths[0]} last={paths[-1]}")
    return paths


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--archive", type=Path, default=ROOT / ".field-work/open-real/ims-bearing.zip")
    parser.add_argument("--output", type=Path, default=ROOT / ".field-work/open-real/ims-prepared")
    parser.add_argument("--seven-zip", default="7z")
    arguments = parser.parse_args()
    work_root = (ROOT / ".field-work").resolve()
    arguments.output = arguments.output.resolve()
    if arguments.output == work_root or work_root not in arguments.output.parents:
        raise ValueError(f"--output must be a child of {work_root}")

    source = json.loads((ROOT / "field/open-data-sources.json").read_text(encoding="utf-8"))["imsNaturalFailureBoundary"]
    archive_hash = digest_file(arguments.archive)
    if archive_hash != source["archiveSha256"]:
        raise RuntimeError(f"NASA IMS archive SHA-256 mismatch: {archive_hash}")

    if arguments.output.exists():
        shutil.rmtree(arguments.output)
    inner = arguments.output / "inner"
    selected = arguments.output / "selected"
    inner.mkdir(parents=True)
    selected.mkdir(parents=True)
    with zipfile.ZipFile(arguments.archive) as outer:
        names = outer.namelist()
        if names != ["4. Bearings/", "4. Bearings/IMS.7z"]:
            raise RuntimeError(f"Unexpected NASA IMS outer archive members: {names}")
        with outer.open("4. Bearings/IMS.7z") as source_stream, (arguments.output / "IMS.7z").open("wb") as destination:
            shutil.copyfileobj(source_stream, destination)
    inner_7z_hash = digest_file(arguments.output / "IMS.7z")
    if inner_7z_hash != source["inner7zSha256"]:
        raise RuntimeError(f"NASA IMS nested 7z SHA-256 mismatch: {inner_7z_hash}")
    run_7z(arguments.seven_zip, ["x", str(arguments.output / "IMS.7z"), f"-o{inner}", "-y"])
    for name, expected in source["innerSha256"].items():
        actual = digest_file(inner / name)
        if actual != expected:
            raise RuntimeError(f"NASA IMS inner hash mismatch for {name}: {actual}")

    records = []
    for run in RUNS:
        rar = inner / run["archive"]
        paths = archive_paths(arguments.seven_zip, rar, run)
        indices = np.linspace(0, len(paths) - 1, source["selectedTimepointsPerRun"], dtype=int).tolist()
        chosen = [paths[index] for index in indices]
        run_7z(arguments.seven_zip, ["x", str(rar), f"-o{selected}", *chosen, "-y"])
        for index, path in zip(indices, chosen):
            local = selected / Path(path)
            matrix = np.loadtxt(local)
            if matrix.shape != (20480, run["channels"]) or not np.isfinite(matrix).all():
                raise RuntimeError(f"Unexpected NASA IMS matrix {path}: {matrix.shape}")
            records.append({
                "run": run["id"],
                "sourcePath": path,
                "localPath": str(local),
                "sourceIndex": index,
                "timeFraction": index / (len(paths) - 1),
                "channels": run["channels"],
                "channelBearings": run["channelMap"],
                "channelAxes": run["axes"],
                "documentedFailedBearingsAtEndpoint": run["failedBearings"],
                "sourceFileSha256": digest_file(local),
            })
    manifest = {
        "schema": "rotornote-ims-natural-failure-preparation-v1",
        "source": source,
        "outerArchiveSha256": archive_hash,
        "selection": "Seven linearly spaced, timestamp-ordered snapshots from each official experiment interval, fixed before inference; every sensor channel in every selected snapshot is evaluated.",
        "transform": "No resampling, synthesis, relabeling, or amplitude transform; original 20,480-point ASCII channels at 20 kHz and documented 2,000 RPM.",
        "records": records,
    }
    (arguments.output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": "prepared", "runs": len(RUNS), "snapshots": len(records), "sensorCases": sum(row["channels"] for row in records), "archiveSha256": archive_hash}))


if __name__ == "__main__":
    main()
