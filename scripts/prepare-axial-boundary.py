"""Hash-verify and prepare CC BY axial-bearing records for boundary testing."""

from __future__ import annotations

import argparse
import hashlib
import json
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
    parser.add_argument("--raw", type=Path, default=ROOT / ".field-work/open-real/axial-bearing")
    parser.add_argument("--output", type=Path, default=ROOT / ".field-work/open-real/axial-prepared")
    arguments = parser.parse_args()
    source = json.loads((ROOT / "field/open-data-sources.json").read_text(encoding="utf-8"))["bearingBoundaryEvaluation"]
    arguments.output.mkdir(parents=True, exist_ok=True)
    records = []
    for case in source["cases"]:
        candidates = [arguments.raw / case["localFile"], arguments.raw / case["file"], *arguments.raw.rglob(case["file"])]
        path = next((candidate for candidate in candidates if candidate.exists()), None)
        if path is None:
            raise FileNotFoundError(f"Missing {case['file']} in {arguments.raw}")
        actual = digest(path)
        if actual != case["sha256"]:
            raise RuntimeError(f"SHA-256 mismatch for {case['id']}: {actual}")
        matlab = loadmat(path)
        values = matlab["y_ini"].reshape(-1)
        if len(values) != 768000:
            raise RuntimeError(f"Unexpected sample count for {case['id']}: {len(values)}")
        start = (len(values) - 131072) // 2
        selected = values[start : start + 131072]
        csv_path = arguments.output / f"{case['id']}.csv"
        csv_path.write_text("amplitude\n" + "\n".join(f"{float(value):.9g}" for value in selected) + "\n", encoding="utf-8")
        records.append({**case, "prepared": str(csv_path), "sourceSamples": len(values), "preparedSamples": len(selected), "sourceOffset": start, "preparedSha256": digest(csv_path)})
    manifest = {"source": {key: value for key, value in source.items() if key != "cases"}, "records": records}
    (arguments.output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": "prepared", "records": len(records), "manifest": str(arguments.output / "manifest.json")}))


if __name__ == "__main__":
    main()
