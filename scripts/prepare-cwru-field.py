"""Fetch a tiny, cited CWRU cross-domain probe without redistributing raw data."""

from __future__ import annotations

import hashlib
import json
import os
import urllib.request
from pathlib import Path

from scipy.io import loadmat
from scipy.signal import resample_poly

SOURCES = [
    {
        "id": "normal-0hp",
        "expected": "healthy",
        "url": "https://engineering.case.edu/sites/default/files/97.mat",
        "sha256": "16bf48babcf1c7ac224bc1a81cd9eafdb27e42d5cf559761907e067e8eeadf3c",
        "rpm": 1797,
    },
    {
        "id": "inner-race-007-0hp",
        "expected": "bearing",
        "url": "https://engineering.case.edu/sites/default/files/105.mat",
        "sha256": "f80b0ea04fd06b372a0eaec7c056543ea37e4bb4727a5b173d2a5bacd2aa9cab",
        "rpm": 1797,
    },
    {
        "id": "ball-007-0hp",
        "expected": "bearing",
        "url": "https://engineering.case.edu/sites/default/files/118.mat",
        "sha256": "b00628f8dd8d1d930af77fa465d1e5cdb385fe259489053f91f3680bda7f640e",
        "rpm": 1797,
    },
    {
        "id": "outer-race-007-0hp",
        "expected": "bearing",
        "url": "https://engineering.case.edu/sites/default/files/130.mat",
        "sha256": "35a095307d0971477049b343a1b5981dde465a58fb7f233ad89b035068c1717d",
        "rpm": 1797,
    },
]


def digest(path: Path) -> str:
    value = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            value.update(block)
    return value.hexdigest()


def main() -> None:
    root = Path(os.environ.get("ROTORNOTE_FIELD_WORK", ".field-work")).resolve()
    raw = root / "raw"
    prepared = root / "prepared"
    raw.mkdir(parents=True, exist_ok=True)
    prepared.mkdir(parents=True, exist_ok=True)
    manifest = []
    for source in SOURCES:
        matlab_path = raw / f"{source['id']}.mat"
        if not matlab_path.exists() or digest(matlab_path) != source["sha256"]:
            urllib.request.urlretrieve(source["url"], matlab_path)
        actual = digest(matlab_path)
        if actual != source["sha256"]:
            raise RuntimeError(f"source hash mismatch for {source['id']}: {actual}")
        matlab = loadmat(matlab_path)
        key = next(name for name in matlab if name.endswith("DE_time"))
        original = matlab[key].reshape(-1)
        # CWRU's selected records are 12 kHz; polyphase resampling preserves
        # anti-aliasing while adapting to RotorNote's disclosed 1,024 Hz input.
        reduced = resample_poly(original, 128, 1500)
        csv_path = prepared / f"{source['id']}.csv"
        csv_path.write_text("amplitude\n" + "\n".join(f"{value:.8f}" for value in reduced) + "\n", encoding="utf-8")
        manifest.append({**source, "source_samples": len(original), "prepared_samples": len(reduced), "csv": str(csv_path)})
    (root / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": "prepared", "records": len(manifest), "manifest": str(root / "manifest.json")}))


if __name__ == "__main__":
    main()
