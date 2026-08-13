# Field validation path

## Current status

RotorNote is a working laboratory-data screening product with evidence infrastructure. It is **not certified and not field validated**. No standards body, laboratory, manufacturer, or vibration analyst has certified its performance.

## Executed evidence

The production dataset is the CC BY 4.0 [Mechanical faults in rotating machinery dataset](https://data.mendeley.com/datasets/zx8pfhdtnb/3), DOI `10.17632/zx8pfhdtnb.3`. Grouped cross-validation holds out whole physical tests and records 94.0% four-channel balanced accuracy plus 19/20 physical-test accuracy; the five fold scores span 85.5%–100%. The 0.99 product threshold is selected inside nested grouped validation without seeing each outer fold. On those outer folds it covers 96.15% of recordings at 95.84% accepted accuracy. The full confusion matrices, calibration folds, risk/coverage table, and membership are committed in `field/results/open-grouped-cross-validation.json`.

The external safety dataset is the CC BY 4.0 [Vibration Data for Axial Ball Bearings and Spall Faults](https://data.mendeley.com/datasets/chwhh9n3bf/2), DOI `10.17632/chwhh9n3bf.2`. Four hash-pinned 25.6 kHz records from a separate rig all produced `review_required`; the receipt is `field/results/axial-bearing-boundary.json`. That proves the current gate refused this small foreign set, not that it will detect every out-of-domain signal.

## What makes it a product now

RotorNote accepts the exact four-channel CSV artifact a gateway can produce, returns a bounded decision, exports a machine-readable evidence receipt, and produces a maintenance note suitable for an existing CMMS. One-channel input is explicitly an abstaining ablation. It replaces manual first-pass file inspection; it does not replace calibrated acquisition, diagnosis, or maintenance authority.

## Required prospective pilot

1. Scope one asset family, sensor, mount, axis, sample rate, speed/load range, and decision owner.
2. Establish reference truth independently through inspection and qualified analysis—not RotorNote output.
3. Split by physical machine and maintenance event; never split windows from the same event.
4. Freeze the hashed software/model/acquisition configuration before opening the test set.
5. Report per-class sensitivity/specificity, macro F1, calibration error, abstention, false alerts per asset-day, and confidence intervals.
6. Run shadow mode with zero automatic control actions and investigate every false negative.
7. Revalidate after material model, feature, sensor, mount, or acquisition changes.

Relevant frameworks include [ISO 17359](https://www.iso.org/standard/71194.html), ISO 13373 measurement/analysis practice, ISO 18436-2 personnel competence, [NIST AI RMF 1.0](https://doi.org/10.6028/NIST.AI.100-1), and [NIST SSDF](https://doi.org/10.6028/NIST.SP.800-218). Mapping work to a standard is not certification.
