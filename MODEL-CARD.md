# RotorNote model card

## Intended use

RotorNote screens vibration recordings from rotating equipment for resemblance to five modeled patterns: healthy, imbalance, misalignment, looseness, and bearing-like impacts. Its output is intended to prioritize a controlled retest or qualified human review.

It is not a diagnosis, protection relay, safety controller, remaining-useful-life predictor, or authorization to continue or stop operation.

## Model and data

The classifier is a deterministic random-feature network with architecture 48→256→128→5. Two seeded ReLU projections create the representation; the multiclass head is fitted by a ridge-regularized least-squares solve, not by class prototypes or hand-authored weights. A scalar temperature selected on the held-out ordinary split minimizes multiclass negative log loss, so displayed probabilities are calibrated by an executed procedure rather than an arbitrary visual multiplier. The repository generates 900 training examples, 225 disjoint ordinary validation examples, and 300 harder stress examples from original physics-inspired simulations. It commits the generator, seed, split sizes, fitting and calibration methods, regularization, normalization, quantization scales, artifacts, and hashes.

Ordinary validation includes variable severity, gain, noise, bias, speed drift, nuisance harmonics, and weak secondary faults. The separately reported stress split increases those shifts and mixtures using unseen seeds. These results demonstrate pipeline consistency and controlled synthetic robustness; they do not estimate accuracy on real equipment.

An optional CWRU cross-domain probe downloads four official experimental records at run time, verifies their hashes, resamples the drive-end channel, and confirms that the uncalibrated model abstains rather than issuing an automatic conclusion. The receipt is a safety-boundary test—not field accuracy or training evidence.

## Runtime safeguards

- Both FP32 and INT8 engines run the same learned network and feature path.
- Runtime verifies both model-artifact hashes before becoming ready.
- The API witnesses every submitted window with the alternate engine and requires 100% label agreement.
- A calibrated normalized-feature distance rejects recordings when most windows fall outside the fitted envelope.
- Independent signal-quality checks detect flatline, repeated saturation, large DC bias, and sensor dropout.
- Failed gates produce `review_required`; they never silently promote the highest score into an operational conclusion.
- Every API response includes an analysis passport binding input, settings, model hashes, and deterministic output hashes.

## Known limitations

Mounting, sensor bandwidth and orientation, units, sample rate, load, speed, structural resonance, background machinery, and acquisition filtering can dominate a vibration signature. The model has no real-world fault prevalence calibration, machine-specific baselines, uncertainty guarantee, or field sensitivity/specificity estimate. Secondary-fault blending makes the synthetic test harder, but the output remains a dominant-pattern screen rather than compound-fault diagnosis.

## Required validation before field reliance

Use the protocol in `FIELD-VALIDATION.md`. In particular, isolate evaluation machines from training, use independently established reference labels, pre-register acceptance thresholds, publish the confusion matrix and abstention rate, and maintain a human escalation path.
