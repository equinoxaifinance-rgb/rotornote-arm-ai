# RotorNote model card

## Intended use

RotorNote screens vibration recordings from rotating equipment for resemblance to five modeled patterns: healthy, imbalance, misalignment, looseness, and bearing-like impacts. Its output is intended to prioritize a controlled retest or qualified human review.

It is not a diagnosis, protection relay, safety controller, remaining-useful-life predictor, or authorization to continue or stop operation.

## Model and data

The classifier is a deterministic supervised extreme-learning network with architecture 48→256→128→5. The repository generates 900 training and 225 disjoint validation examples from original physics-inspired simulations. It commits the generator, seed, split sizes, normalization, quantization scales, artifacts, and hashes.

The validation result demonstrates pipeline consistency on the simulated distribution. It does not estimate accuracy on real equipment.

## Runtime safeguards

- Both FP32 and INT8 engines run the same learned network and feature path.
- Runtime verifies both model-artifact hashes before becoming ready.
- The API witnesses every submitted window with the alternate engine and requires 100% label agreement.
- A calibrated normalized-feature distance rejects recordings when most windows fall outside the fitted envelope.
- Independent signal-quality checks detect flatline, repeated saturation, large DC bias, and sensor dropout.
- Failed gates produce `review_required`; they never silently promote the highest score into an operational conclusion.
- Every API response includes an analysis passport binding input, settings, model hashes, and deterministic output hashes.

## Known limitations

Mounting, sensor bandwidth and orientation, units, sample rate, load, speed, structural resonance, background machinery, and acquisition filtering can dominate a vibration signature. The model has no real-world fault prevalence calibration, machine-specific baselines, uncertainty guarantee, or field sensitivity/specificity estimate. It does not cover compound faults.

## Required validation before field reliance

Use the protocol in `FIELD-VALIDATION.md`. In particular, isolate evaluation machines from training, use independently established reference labels, pre-register acceptance thresholds, publish the confusion matrix and abstention rate, and maintain a human escalation path.

