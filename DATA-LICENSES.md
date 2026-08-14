# Data licenses and attribution

RotorNote's current production model and external safety probes use explicitly permissive CC BY 4.0 research data plus a public NASA-cataloged dataset whose official metadata links the U.S. government-works notice. Raw archives are downloaded from the publisher and are not committed.

## Production training and grouped evaluation

Lucas Costa Brito, Gian Antonio Susto, Jorge Nei Brito, and Marcus Antonio Viana Duarte, *Mechanical faults in rotating machinery dataset (normal, unbalance, misalignment, looseness)*, version 3, DOI [`10.17632/zx8pfhdtnb.3`](https://data.mendeley.com/datasets/zx8pfhdtnb/3), licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

Changes: RotorNote selects 100 evenly spaced recordings from each of 20 physical tests, uses four accelerometer channels, derives five evenly spaced 8,192-sample windows per channel, computes 48 features, and fits/evaluates the documented classifier by whole-test groups. Derived feature files, labels, groups, manifest, and receipts are committed with hashes.

## Variable-speed anomaly training and grouped evaluation

Dimitrios M. Bourdalos and John S. Sakellariou, *UPATRAS Rotating Machinery Vibration Dataset for Incipient Fault Diagnosis under Varying Rotating Speeds*, version 1, DOI [`10.17632/42v3s74gf9.1`](https://data.mendeley.com/datasets/42v3s74gf9/1), licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

Changes: RotorNote hash-verifies the publisher archive, reads 39 complete measurement sequences and all 2,925 speed signals, derives two deterministic 2,048-sample feature windows per signal, and collapses the documented healthy versus seven induced fault states only to `healthy` versus `anomaly`. Validation holds out entire measurement sequences. One attributed source signal is committed for the interactive demo; the raw archive is not redistributed.

## External bearing boundary

Mohamed Ismail, Jens Windelberg, Andreas Bierig, Iñaki Bravo-imaz, and Aitor Arnaiz, *Vibration Data for Axial Ball Bearings and Spall Faults*, version 2, DOI [`10.17632/chwhh9n3bf.2`](https://data.mendeley.com/datasets/chwhh9n3bf/2), licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

Changes: the complete 164,430,658-byte publisher archive is SHA-256 verified (`d22e5a569c8e675348f59c8024b2fb1037211619b68a390bd98409143961b927`) before any record is selected. RotorNote enumerates all 28 MATLAB records, rejects an unexpected filename or condition count, converts a deterministic centered 131,072-sample segment from every record to CSV, and tests fail-closed behavior through the canonical one-channel anomaly route. These records never enter production training.

## Second external bearing boundary

Weiwei Qian, *Zhenjiang bearing dataset*, version 1, DOI [`10.17632/xfj9t7cprb.1`](https://data.mendeley.com/datasets/xfj9t7cprb/1), licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

Changes: the complete 89,447,761-byte publisher archive is SHA-256 verified (`ff58f977d2c3f7bd3f0dadfa51b4934bcd989590a10ddb7b0efcdd4f42a769fd`). RotorNote selects seven evenly spaced physical traces from each of five documented condition files, linearly resamples each 1,800-sample trace to the product's 2,048-sample minimum, and challenges every trace at all seven documented operating speeds because the archive does not machine-map columns to speeds. The resulting 245 boundary executions never enter training and are not treated as an accuracy estimate.

## Natural run-to-failure boundary

J. Lee, H. Qiu, G. Yu, J. Lin, and Rexnord Technical Services, *IMS Bearing Data Set*, published by the [NASA Prognostics Center of Excellence Data Set Repository](https://www.nasa.gov/intelligent-systems-division/discovery-and-systems-health/pcoe/pcoe-data-set-repository/) and cataloged by [NASA Open Data](https://data.nasa.gov/dataset/ims-bearings). The NASA catalog marks access as public and links the [U.S. government works notice](https://www.usa.gov/government-works).

Changes: RotorNote verifies the complete 1,075,597,174-byte NASA archive (`21001ac266c465f5d345ec42d7b508c6a6328487fd9d4d7774422dd5ea10ad83`), its nested archive, all three RAR histories, and the official two-page readme before selection. Seven timestamp-ordered snapshots are fixed from each official experiment interval before inference. Every original sensor channel is evaluated without resampling or amplitude transformation: 3 experiments, 12 bearing installations, 16 sensor trajectories, 21 snapshots, and 112 sensor cases. The four documented natural end-state failures span six endpoint channels because Set 1 uses x/y sensors. These data never enter training, and the receipt is an abstention test rather than a natural-fault sensitivity or warning-time estimate.
