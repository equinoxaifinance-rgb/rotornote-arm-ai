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
    # Four motor loads for normal operation and each 0.007-inch bearing
    # mechanism. Grouped evaluation holds out whole records, loads, and fault
    # mechanisms; windows from one record never cross a train/test boundary.
    {"file": 97, "id": "normal-0hp", "expected": "healthy", "mechanism": "healthy", "load_hp": 0, "rpm": 1797, "sha256": "16bf48babcf1c7ac224bc1a81cd9eafdb27e42d5cf559761907e067e8eeadf3c"},
    {"file": 98, "id": "normal-1hp", "expected": "healthy", "mechanism": "healthy", "load_hp": 1, "rpm": 1772, "sha256": "37e6612c05e65c415dcfa2ab27a3fda648a5863160fa898b884a14743044e045"},
    {"file": 99, "id": "normal-2hp", "expected": "healthy", "mechanism": "healthy", "load_hp": 2, "rpm": 1750, "sha256": "4b97e6b5361f45efb6951dc3b1aebcdb3b89cb69d0f96d6f5c297dd9f45eee75"},
    {"file": 100, "id": "normal-3hp", "expected": "healthy", "mechanism": "healthy", "load_hp": 3, "rpm": 1730, "sha256": "88a5990cb541320e91505a1d72139e1993500ffe6e292a451011667f4138ca78"},
    {"file": 105, "id": "inner-race-007-0hp", "expected": "bearing", "mechanism": "inner-race", "load_hp": 0, "rpm": 1797, "sha256": "f80b0ea04fd06b372a0eaec7c056543ea37e4bb4727a5b173d2a5bacd2aa9cab"},
    {"file": 106, "id": "inner-race-007-1hp", "expected": "bearing", "mechanism": "inner-race", "load_hp": 1, "rpm": 1772, "sha256": "e5cec7cdd138e6cd1deb9ed8634e5aaa9bc1bd7094ddc075bff606580eb6e883"},
    {"file": 107, "id": "inner-race-007-2hp", "expected": "bearing", "mechanism": "inner-race", "load_hp": 2, "rpm": 1750, "sha256": "111ba8996a115684661a13c913bd74d8029a59294492f88aec7b03e175fdd388"},
    {"file": 108, "id": "inner-race-007-3hp", "expected": "bearing", "mechanism": "inner-race", "load_hp": 3, "rpm": 1730, "sha256": "d415f0e65128bfa0b118c2051c988fb0dc6ce3e4c8aa45fdc5ad1d0967462e7d"},
    {"file": 118, "id": "ball-007-0hp", "expected": "bearing", "mechanism": "ball", "load_hp": 0, "rpm": 1797, "sha256": "b00628f8dd8d1d930af77fa465d1e5cdb385fe259489053f91f3680bda7f640e"},
    {"file": 119, "id": "ball-007-1hp", "expected": "bearing", "mechanism": "ball", "load_hp": 1, "rpm": 1772, "sha256": "bc72d9df7668219e004a0f711232b23ec0aed393eb9bd8f9f5483426f6b51330"},
    {"file": 120, "id": "ball-007-2hp", "expected": "bearing", "mechanism": "ball", "load_hp": 2, "rpm": 1750, "sha256": "e0b7a584c49af52335ff0904a97d4afcf02d045625c582de63a7c85ce10b489c"},
    {"file": 121, "id": "ball-007-3hp", "expected": "bearing", "mechanism": "ball", "load_hp": 3, "rpm": 1730, "sha256": "52f686e984ba8e9b04a047a57416271cdb322cee57ee105dce58926a24b966cb"},
    {"file": 130, "id": "outer-race-007-0hp", "expected": "bearing", "mechanism": "outer-race", "load_hp": 0, "rpm": 1797, "sha256": "35a095307d0971477049b343a1b5981dde465a58fb7f233ad89b035068c1717d"},
    {"file": 131, "id": "outer-race-007-1hp", "expected": "bearing", "mechanism": "outer-race", "load_hp": 1, "rpm": 1772, "sha256": "7883f7b83beadc54b2f301767f9145ce07055707182fb0278fdf0a6bb53ce3cb"},
    {"file": 132, "id": "outer-race-007-2hp", "expected": "bearing", "mechanism": "outer-race", "load_hp": 2, "rpm": 1750, "sha256": "17a69ed5d2270b42532e678e35bbe2fa04a2cc413cf2bf9e88c7692de8662d18"},
    {"file": 133, "id": "outer-race-007-3hp", "expected": "bearing", "mechanism": "outer-race", "load_hp": 3, "rpm": 1730, "sha256": "53f076cb0d905cf46bffaee7736abce8224ffed777deed03c0c863d762a90c71"},
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
        source = {**source, "url": f"https://engineering.case.edu/sites/default/files/{source['file']}.mat"}
        matlab_path = raw / f"{source['file']}.mat"
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
