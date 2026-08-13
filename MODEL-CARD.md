# RotorNote model card

## Intended use

RotorNote is a first-pass vibration screening and evidence tool for four signatures on rotating equipment: healthy, imbalance, misalignment, and mechanical looseness. It works alongside sensor acquisition, maintenance records, and qualified vibration analysis. It does not diagnose bearing faults, authorize operation, predict remaining life, or control machinery.

## Model and evidence

The production classifier is standard scaling plus linear discriminant analysis with a fixed 1e-8 numerical covariance ridge. It is still one transparent 48→4 linear layer. Each input is the mean of 48 order-aware time/frequency features over four synchronized accelerometers and five windows per channel. Its source is the CC BY 4.0 dataset DOI `10.17632/zx8pfhdtnb.3`; training/evaluation uses 100 evenly spaced recordings per physical test.

Five grouped outer folds each hold out one complete physical test per class. Four-channel recording balanced accuracy is 94.0%; the individual fold scores are 85.75%, 85.5%, 98.75%, 100%, and 100%, and 19 of 20 physical tests are correctly identified. A single-channel ablation reaches only 67.96% and is therefore forced to `review_required`. For confidence calibration, each outer fold receives a threshold selected by inner grouped validation on only the other physical tests. The resulting outer-fold policy uses 0.99, covers 96.15% of recordings, and reaches 95.84% selective accuracy. Because recordings within a physical test are repeated measures, 2,000 recording decisions are not 2,000 independent machines.

After cross-validation, the fixed specification is refit on all 20 tests for production. A historical one-time four-test final evaluation remains preserved separately and must not be combined with or substituted for grouped cross-validation.

## Safeguards

- Model binaries are SHA-256 verified before readiness.
- The alternate engine witnesses every analyzed window.
- Signal-quality checks cover flatline, saturation, DC bias, and dropout.
- A 99.5th-percentile real-training feature envelope routes foreign signals to `review_required`.
- Scores below 0.99 route to `review_required`; the response never silently promotes the top class.
- Four-channel results average the validated feature representation only after each synchronized channel is quality checked; one-channel input always abstains.
- An analysis passport binds input, acquisition settings, model artifacts, and deterministic output.

The separate CC BY bearing boundary probe (DOI `10.17632/chwhh9n3bf.2`) produced 100% abstention across four foreign-rig records. This demonstrates fail-closed behavior only, not bearing detection accuracy.

## Known limitations

Evidence covers one laboratory rig near 1,238 RPM with experimentally induced conditions. It does not cover natural faults, severity estimation, compound faults, sensor interchangeability, changing mounts, broad speed/load ranges, cross-machine transfer, or field prevalence. Probabilities are classifier scores, not calibrated real-world failure risk. Certification and field reliance require the independent protocol in `FIELD-VALIDATION.md`.
