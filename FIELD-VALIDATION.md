# Field validation path

## Current status

RotorNote is a working laboratory-data screening product with evidence infrastructure. It is **not certified and not field validated**. No standards body, laboratory, manufacturer, or vibration analyst has certified its performance.

## Executed evidence

The production dataset is the CC BY 4.0 [Mechanical faults in rotating machinery dataset](https://data.mendeley.com/datasets/zx8pfhdtnb/3), DOI `10.17632/zx8pfhdtnb.3`. Grouped cross-validation holds out whole physical tests and records 94.0% four-channel balanced accuracy plus 19/20 physical-test accuracy; the five fold scores span 85.5%–100%, and the physical-test proportion has a 76.4%–99.1% Wilson 95% interval. A nested audit searched thresholds through 0.9999 but did not establish 95% selective accuracy inside every split, so no calibrated-confidence claim is made. The full confusion matrices, search traces, risk/coverage table, and fold membership are committed in `field/results/open-grouped-cross-validation.json`.

The first external safety dataset is the CC BY 4.0 [Vibration Data for Axial Ball Bearings and Spall Faults](https://data.mendeley.com/datasets/chwhh9n3bf/2), DOI `10.17632/chwhh9n3bf.2`. The complete official archive is SHA-256 pinned before selection; all 28 25.6 kHz records from the separate physical rig pass through the canonical one-channel anomaly route. Every record produced `review_required`, including four healthy and 24 seeded-spall captures across two loads and two speeds. Broad FP32/INT8 decisions agreed on all 28.

The second external safety dataset is the CC BY 4.0 [Zhenjiang bearing dataset](https://data.mendeley.com/datasets/xfj9t7cprb/1), DOI `10.17632/xfj9t7cprb.1`. RotorNote SHA-256 verifies its complete publisher archive, preselects seven evenly spaced traces from each of five physical conditions, and challenges each trace at every one of the seven documented operating speeds because the archive does not machine-map columns to speeds. All 245 executions returned `review_required` with complete broad FP32/INT8 agreement.

The third external safety source is the public [NASA IMS Bearing Data Set](https://data.nasa.gov/dataset/ims-bearings): three accelerated test-to-failure experiments, four bearing installations per run, 16 sensor trajectories, and four documented natural end-state bearing failures. RotorNote verifies the 1.075 GB archive plus every nested source artifact, fixes seven timestamps per official experiment interval before inference, and executes all 112 selected sensor cases without resampling. Every case returned `review_required` with complete broad FP32/INT8 agreement, including all six endpoint sensor channels attached to the four documented failed bearings. The receipt is `field/results/ims-natural-failure-boundary.json`. Together the three external sources prove bounded fail-closed behavior on seeded and natural-failure foreign rigs, not universal OOD detection, natural-fault sensitivity, warning lead time, or field accuracy.

## What makes it a product now

RotorNote accepts either a one-channel CSV for broad variable-speed anomaly screening or the exact synchronized four-channel CSV artifact a gateway can produce for the narrower specialist. It returns a bounded decision, exports a machine-readable evidence receipt, and produces a maintenance note suitable for an existing CMMS. It replaces manual first-pass file inspection; it does not replace calibrated acquisition, diagnosis, or maintenance authority.

## Required prospective pilot

1. Scope one asset family, sensor, mount, axis, sample rate, speed/load range, and decision owner.
2. Establish reference truth independently through inspection and qualified analysis—not RotorNote output.
3. Split by physical machine and maintenance event; never split windows from the same event.
4. Freeze the hashed software/model/acquisition configuration before opening the test set.
5. Report per-class sensitivity/specificity, macro F1, calibration error, abstention, false alerts per asset-day, and confidence intervals.
6. Run shadow mode with zero automatic control actions and investigate every false negative.
7. Revalidate after material model, feature, sensor, mount, or acquisition changes.

Relevant frameworks include [ISO 17359](https://www.iso.org/standard/71194.html), ISO 13373 measurement/analysis practice, ISO 18436-2 personnel competence, [NIST AI RMF 1.0](https://doi.org/10.6028/NIST.AI.100-1), and [NIST SSDF](https://doi.org/10.6028/NIST.SP.800-218). Mapping work to a standard is not certification.
