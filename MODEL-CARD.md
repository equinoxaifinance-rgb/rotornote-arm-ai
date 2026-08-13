# RotorNote model card

## Intended use

RotorNote is a first-pass vibration screening and evidence tool for four signatures on rotating equipment: healthy, imbalance, misalignment, and mechanical looseness. It works alongside sensor acquisition, maintenance records, and qualified vibration analysis. It does not diagnose bearing faults, authorize operation, predict remaining life, or control machinery.

## Model and evidence

The production classifier is standard scaling plus multinomial logistic regression (C=1.0) over 48 order-aware time/frequency features from 8,192-sample windows. Its source is the CC BY 4.0 dataset DOI `10.17632/zx8pfhdtnb.3`. Training/evaluation uses 100 evenly spaced recordings per physical test, four accelerometers, and five windows spanning each one-second recording.

Five grouped folds each hold out one complete physical test per class. Aggregate results are 71.06% window, 71.11% single-channel recording, and 76.30% four-channel recording balanced accuracy; 16 of 20 physical tests are correctly identified. Healthy versus misalignment is the dominant error. A 0.90 confidence threshold, fixed from these same out-of-fold predictions, covers 37.1% of recordings at 97.71% selective accuracy and 96.46% selective balanced accuracy. That risk/coverage result is useful policy-development evidence, not an independently calibrated field estimate. Because recordings within a physical test are repeated measures, 2,000 recording decisions are not 2,000 independent machines.

After cross-validation, the fixed specification is refit on all 20 tests for production. A historical one-time four-test final evaluation remains preserved separately and must not be combined with or substituted for grouped cross-validation.

## Safeguards

- Model binaries are SHA-256 verified before readiness.
- The alternate engine witnesses every analyzed window.
- Signal-quality checks cover flatline, saturation, DC bias, and dropout.
- A 99.5th-percentile real-training feature envelope routes foreign signals to `review_required`.
- Scores below 0.90 route to `review_required`; the response never silently promotes the top class.
- Four-channel results average class probability only after each synchronized channel is separately checked.
- An analysis passport binds input, acquisition settings, model artifacts, and deterministic output.

The separate CC BY bearing boundary probe (DOI `10.17632/chwhh9n3bf.2`) produced 100% abstention across four foreign-rig records. This demonstrates fail-closed behavior only, not bearing detection accuracy.

## Known limitations

Evidence covers one laboratory rig near 1,238 RPM with experimentally induced conditions. It does not cover natural faults, severity estimation, compound faults, sensor interchangeability, changing mounts, broad speed/load ranges, cross-machine transfer, or field prevalence. Probabilities are classifier scores, not calibrated real-world failure risk. Certification and field reliance require the independent protocol in `FIELD-VALIDATION.md`.
