"""Hash-verify and prepare the complete CC BY axial-bearing archive."""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import re
import zipfile
from pathlib import Path

from scipy.io import loadmat


ROOT = Path(__file__).resolve().parents[1]


def digest(path: Path) -> str:
    value = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            value.update(block)
    return value.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--archive", type=Path, default=ROOT / ".field-work/open-real/axial-bearing-v2.zip")
    parser.add_argument("--output", type=Path, default=ROOT / ".field-work/open-real/axial-prepared")
    arguments = parser.parse_args()
    source = json.loads((ROOT / "field/open-data-sources.json").read_text(encoding="utf-8"))["bearingBoundaryEvaluation"]
    actual_archive_hash = digest(arguments.archive)
    if actual_archive_hash != source["archiveSha256"]:
        raise RuntimeError(f"Archive SHA-256 mismatch: {actual_archive_hash}")
    arguments.output.mkdir(parents=True, exist_ok=True)
    records = []
    pattern = re.compile(r"^(N(?:5k|8\.8k))_(60|500)_([0-9.]+)(?:_(inner|outer))?\.mat$")
    with zipfile.ZipFile(arguments.archive) as archive:
        entries = sorted(
            (entry for entry in archive.infolist() if entry.filename.lower().endswith(".mat")),
            key=lambda entry: entry.filename,
        )
        if len(entries) != source["expectedRecords"]:
            raise RuntimeError(f"Expected {source['expectedRecords']} MAT records, found {len(entries)}")
        for entry in entries:
            filename = Path(entry.filename).name
            match = pattern.match(filename)
            if not match:
                raise RuntimeError(f"Unexpected archive record: {filename}")
            load_code, rpm_text, spall_text, location = match.groups()
            spall_mm = float(spall_text)
            if (spall_mm == 0) != (location is None):
                raise RuntimeError(f"Malformed condition encoding: {filename}")
            source_bytes = archive.read(entry)
            source_hash = hashlib.sha256(source_bytes).hexdigest()
            matlab = loadmat(io.BytesIO(source_bytes))
            values = matlab["y_ini"].reshape(-1)
            if len(values) != 768000:
                raise RuntimeError(f"Unexpected sample count for {filename}: {len(values)}")
            start = (len(values) - 131072) // 2
            selected = values[start : start + 131072]
            identifier = Path(filename).stem.lower().replace(".", "p").replace("_", "-")
            csv_path = arguments.output / f"{identifier}.csv"
            csv_path.write_text("amplitude\n" + "\n".join(f"{float(value):.9g}" for value in selected) + "\n", encoding="utf-8")
            records.append({
                "id": identifier,
                "file": filename,
                "condition": "healthy" if spall_mm == 0 else "bearing_spall",
                "spallLocation": location,
                "spallWidthMm": spall_mm,
                "axialLoadKn": 5.0 if load_code == "N5k" else 8.8,
                "rpm": int(rpm_text),
                "sha256": source_hash,
                "prepared": str(csv_path),
                "sourceSamples": len(values),
                "preparedSamples": len(selected),
                "sourceOffset": start,
                "preparedSha256": digest(csv_path),
            })
    healthy = sum(record["condition"] == "healthy" for record in records)
    faulty = len(records) - healthy
    if healthy != source["expectedHealthyRecords"] or faulty != source["expectedFaultRecords"]:
        raise RuntimeError(f"Unexpected condition counts: healthy={healthy}, fault={faulty}")
    manifest = {
        "source": source,
        "archiveSha256": actual_archive_hash,
        "selection": "Centered 131,072-sample segment from every record in the official archive; no cherry-picking.",
        "records": records,
    }
    (arguments.output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": "prepared", "records": len(records), "healthy": healthy, "fault": faulty, "archiveSha256": actual_archive_hash, "manifest": str(arguments.output / "manifest.json")}))


if __name__ == "__main__":
    main()
