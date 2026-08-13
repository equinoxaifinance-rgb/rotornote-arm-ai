"""Prepare real, CC BY 4.0 vibration windows for RotorNote model training.

The source archive is never committed. This script verifies the official
Mendeley Data archive, holds out one complete physical test per condition,
and writes a compact deterministic window stream for the JavaScript feature
extractor. Windows from one test never cross the train/validation boundary.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import math
import struct
import zipfile
from pathlib import Path

import numpy as np


WINDOW_SIZE = 8192
FILES_PER_TEST = 100
CHANNELS = 4
WINDOWS_PER_CHANNEL = 5
LABELS = ["healthy", "imbalance", "misalignment", "looseness"]
LABEL_BY_TEST = {
    1: "healthy", 2: "misalignment", 3: "healthy", 4: "imbalance",
    5: "looseness", 6: "healthy", 7: "imbalance", 8: "looseness",
    9: "healthy", 10: "misalignment", 11: "misalignment", 12: "looseness",
    13: "misalignment", 14: "looseness", 15: "imbalance",
    16: "misalignment", 17: "healthy", 18: "imbalance",
    19: "looseness", 20: "imbalance",
}
VALIDATION_TESTS = {16, 17, 19, 20}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def evenly_spaced(entries: list[zipfile.ZipInfo], count: int) -> list[zipfile.ZipInfo]:
    if len(entries) < count:
        raise ValueError(f"Expected at least {count} recordings, found {len(entries)}")
    if len(entries) == count:
        return entries
    indexes = [math.floor(index * len(entries) / count) for index in range(count)]
    return [entries[index] for index in indexes]


def parse_test_number(name: str) -> int:
    stem = Path(name).name
    if not stem.lower().startswith("test "):
        raise ValueError(f"Unexpected archive entry: {name}")
    return int(stem[5:7])


def deterministic_offsets(samples: int) -> list[int]:
    span = samples - WINDOW_SIZE
    if span < 0:
        raise ValueError(f"Recording has {samples} samples; need {WINDOW_SIZE}")
    if span == 0:
        return [0]
    return [round(index * span / (WINDOWS_PER_CHANNEL - 1)) for index in range(WINDOWS_PER_CHANNEL)]


def write_test(inner_bytes: bytes, test_number: int, windows, labels, groups, rows, samples) -> None:
    label = LABEL_BY_TEST[test_number]
    split = "validation" if test_number in VALIDATION_TESTS else "training"
    with zipfile.ZipFile(io.BytesIO(inner_bytes)) as inner:
        entries = sorted(
            [entry for entry in inner.infolist() if entry.filename.lower().endswith(".npy")],
            key=lambda entry: entry.filename,
        )
        selected = evenly_spaced(entries, FILES_PER_TEST)
        for file_index, entry in enumerate(selected):
            array = np.load(io.BytesIO(inner.read(entry)), allow_pickle=False)
            if array.shape != (CHANNELS, 25000):
                raise ValueError(f"Unexpected shape {array.shape} in {entry.filename}")
            if test_number in VALIDATION_TESTS and label not in samples:
                samples[label] = np.asarray(array[0], dtype="<f4")
            for channel in range(CHANNELS):
                for window_index, offset in enumerate(deterministic_offsets(array.shape[1])):
                    window = np.asarray(array[channel, offset : offset + WINDOW_SIZE], dtype="<f4")
                    windows.write(window.tobytes(order="C"))
                    labels.write(struct.pack("B", LABELS.index(label)))
                    groups.write(struct.pack("B", test_number))
                    rows.append({
                        "test": test_number,
                        "label": label,
                        "split": split,
                        "recording": Path(entry.filename).name,
                        "channel": channel,
                        "window": window_index,
                        "offset": offset,
                    })


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--archive", required=True, type=Path)
    parser.add_argument("--source", default=Path("field/open-data-sources.json"), type=Path)
    parser.add_argument("--output", default=Path(".field-work/open-real/prepared"), type=Path)
    arguments = parser.parse_args()

    source = json.loads(arguments.source.read_text(encoding="utf-8"))["productionTraining"]
    actual_hash = sha256_file(arguments.archive)
    if actual_hash != source["archiveSha256"]:
        raise ValueError(f"Archive SHA-256 mismatch: expected {source['archiveSha256']}, got {actual_hash}")

    arguments.output.mkdir(parents=True, exist_ok=True)
    rows: list[dict[str, object]] = []
    samples: dict[str, np.ndarray] = {}
    windows_path = arguments.output / "windows.f32"
    labels_path = arguments.output / "labels.u8"
    groups_path = arguments.output / "groups.u8"

    with zipfile.ZipFile(arguments.archive) as outer, windows_path.open("wb") as windows, labels_path.open("wb") as labels, groups_path.open("wb") as groups:
        entries = sorted(
            [entry for entry in outer.infolist() if entry.filename.lower().endswith(".zip")],
            key=lambda entry: parse_test_number(entry.filename),
        )
        tests = [parse_test_number(entry.filename) for entry in entries]
        if tests != list(range(1, 21)):
            raise ValueError(f"Expected tests 1-20, found {tests}")
        for entry in entries:
            test_number = parse_test_number(entry.filename)
            write_test(outer.read(entry), test_number, windows, labels, groups, rows, samples)

    samples_directory = arguments.output / "samples"
    samples_directory.mkdir(parents=True, exist_ok=True)
    sample_hashes = {}
    for label in LABELS:
        sample_path = samples_directory / f"real-{label}.csv"
        with sample_path.open("w", encoding="utf-8", newline="\n") as handle:
            handle.write("timestamp,amplitude\n")
            for index, value in enumerate(samples[label]):
                handle.write(f"{index / 25000:.8f},{float(value):.9g}\n")
        sample_hashes[label] = sha256_file(sample_path)

    manifest = {
        "format": "rotornote-real-window-stream-v1",
        "sourceDataset": source,
        "archiveSha256": actual_hash,
        "windowSize": WINDOW_SIZE,
        "sampleRateHz": 25000,
        "labels": LABELS,
        "filesPerTest": FILES_PER_TEST,
        "channelsPerFile": CHANNELS,
        "windowsPerChannel": WINDOWS_PER_CHANNEL,
        "rows": len(rows),
        "trainingRows": sum(row["split"] == "training" for row in rows),
        "validationRows": sum(row["split"] == "validation" for row in rows),
        "validationTests": sorted(VALIDATION_TESTS),
        "splitPolicy": "whole physical tests; no recording or window crosses train/validation",
        "windowSelection": "100 evenly spaced recordings per test; four sensor channels; five evenly spaced windows spanning each full one-second recording",
        "windowsSha256": sha256_file(windows_path),
        "labelsSha256": sha256_file(labels_path),
        "groupsSha256": sha256_file(groups_path),
        "sampleSha256": sample_hashes,
        "rowIndex": rows,
    }
    (arguments.output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: manifest[key] for key in ("rows", "trainingRows", "validationRows", "validationTests", "windowsSha256")}))


if __name__ == "__main__":
    main()
