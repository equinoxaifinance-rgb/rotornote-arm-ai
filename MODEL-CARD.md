# RotorNote model card

## Intended use

RotorNote is a first-pass vibration screening and evidence tool for four signatures on rotating equipment: healthy, imbalance, misalignment, and mechanical looseness. It works alongside sensor acquisition, maintenance records, and qualified vibration analysis. It does not diagnose bearing faults, authorize operation, predict remaining life, or control machinery.

## Model and evidence

The production classifier is standard scaling plus linear discriminant analysis with a fixed 1e-8 numerical covariance ridge. It is intentionally one transparent 48→4 linear layer, not a neural network, and the project does not claim otherwise. Each input is the mean of 48 order-aware time/frequency features over four synchronized accelerometers and five windows per channel. Its source is the CC BY 4.0 dataset DOI `10.17632/zx8pfhdtnb.3`; training/evaluation uses 100 evenly spaced recordings per physical test.

Five grouped outer folds each hold out one complete physical test per class. Four-channel recording balanced accuracy is 94.0%; the individual fold scores are 85.75%, 85.5%, 98.75%, 100%, and 100%, and 19 of 20 physical tests are correctly identified. The failed physical test is misalignment test 10, predicted healthy. The 19/20 proportion has a 76.4%–99.1% Wilson 95% interval, and RotorNote makes no blanket misalignment-sensitivity claim. A single-channel ablation of this narrower specialist reaches only 67.96% and is therefore forced to `review_required`; operational single-channel input routes to the separate anomaly head. A nested audit searched confidence thresholds through 0.9999 but could not establish 95% selective accuracy inside every split; its full traces are retained in the grouped receipt. Therefore 0.99 is a conservative abstention rule, not an independently calibrated probability threshold. Because recordings within a physical test are repeated measures, 2,000 recording decisions are not 2,000 independent machines.

After grouped validation, the fixed specification is refit on all 20 tests for production. Superseded model-selection experiments are intentionally excluded from the shipped evidence chain; the grouped receipt is the single authoritative performance artifact.

## Safeguards

- Model binaries are SHA-256 verified before readiness.
- The alternate engine witnesses every analyzed window.
- Signal-quality checks cover flatline, saturation, DC bias, and dropout.
- A 99.5th-percentile real-training feature envelope routes foreign signals to `review_required`.
- Scores below 0.99 route to `review_required`; the response never silently promotes the top class.
- Four-channel specialist results average the validated feature representation only after each synchronized channel is quality checked; one-channel input routes to the broad anomaly head, while the unsupported one-channel specialist ablation abstains.
- An analysis passport binds input, acquisition settings, model artifacts, and deterministic output.

The separate CC BY bearing boundary probe (DOI `10.17632/chwhh9n3bf.2`) produced 100% abstention across four foreign-rig records. This demonstrates fail-closed behavior only, not bearing detection accuracy.

## Known limitations

Evidence covers one laboratory rig near 1,238 RPM with experimentally induced conditions. It does not cover natural faults, severity estimation, compound faults, sensor interchangeability, changing mounts, broad speed/load ranges, cross-machine transfer, or field prevalence. Probabilities are classifier scores, not calibrated real-world failure risk. Certification and field reliance require the independent protocol in `FIELD-VALIDATION.md`.

## Variable-speed anomaly head

RotorNote separately ships a 48->253->126->8 ReLU MLP whose eight outputs preserve the healthy state and seven observed UPATRAS experimental conditions. The customer-facing boundary collapses those outputs to `healthy | anomaly`; it never presents a laboratory condition as a field diagnosis. The CC BY 4.0 source (DOI `10.17632/42v3s74gf9.1`) contains 2,925 signals from 39 complete measurement sequences at 75 speeds. Four-fold validation is grouped by complete sequence, with 99.8% observed eight-condition balanced accuracy, 100% broad anomaly balanced accuracy, and 39/39 sequence accuracy (Wilson 95%: 91.0%-100%). Training begins at 48->256->128->8; five units that never activate anywhere on the complete real training bank are removed before export with 2.87e-6 maximum fitted-bank logit drift. Every exported hidden unit activates on real bank data. This is evidence on that rig, not field certification.

The head uses a 0.90 conservative broad-anomaly score floor, fitted-envelope rejection, and mandatory FP32/INT8 agreement. SIMD-row-padded INT8 reduces learned bytes by 74.14%, preserves every eight-condition production label across the 2,925-signal bank, and has 0.036721 maximum probability drift. It cannot name a field fault family, estimate severity, or replace the four-sensor head.
