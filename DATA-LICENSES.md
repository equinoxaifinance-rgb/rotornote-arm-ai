# Data licenses and attribution

RotorNote's current production model and external safety probe use only explicitly permissive CC BY 4.0 research data. Raw archives are downloaded from the publisher and are not committed.

## Production training and grouped evaluation

Lucas Costa Brito, Gian Antonio Susto, Jorge Nei Brito, and Marcus Antonio Viana Duarte, *Mechanical faults in rotating machinery dataset (normal, unbalance, misalignment, looseness)*, version 3, DOI [`10.17632/zx8pfhdtnb.3`](https://data.mendeley.com/datasets/zx8pfhdtnb/3), licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

Changes: RotorNote selects 100 evenly spaced recordings from each of 20 physical tests, uses four accelerometer channels, derives five evenly spaced 8,192-sample windows per channel, computes 48 features, and fits/evaluates the documented classifier by whole-test groups. Derived feature files, labels, groups, manifest, and receipts are committed with hashes.

## Variable-speed anomaly training and grouped evaluation

Dimitrios M. Bourdalos and John S. Sakellariou, *UPATRAS Rotating Machinery Vibration Dataset for Incipient Fault Diagnosis under Varying Rotating Speeds*, version 1, DOI [`10.17632/42v3s74gf9.1`](https://data.mendeley.com/datasets/42v3s74gf9/1), licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

Changes: RotorNote hash-verifies the publisher archive, reads 39 complete measurement sequences and all 2,925 speed signals, derives two deterministic 2,048-sample feature windows per signal, and collapses the documented healthy versus seven induced fault states only to `healthy` versus `anomaly`. Validation holds out entire measurement sequences. One attributed source signal is committed for the interactive demo; the raw archive is not redistributed.

## External bearing boundary

Mohamed Ismail, Jens Windelberg, Andreas Bierig, Iñaki Bravo-imaz, and Aitor Arnaiz, *Vibration Data for Axial Ball Bearings and Spall Faults*, version 2, DOI [`10.17632/chwhh9n3bf.2`](https://data.mendeley.com/datasets/chwhh9n3bf/2), licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

Changes: four source files are individually SHA-256 verified; a deterministic centered 131,072-sample segment is converted from MATLAB to CSV; RotorNote tests only whether its supported classifier abstains on the foreign rig. These records never enter production training.
