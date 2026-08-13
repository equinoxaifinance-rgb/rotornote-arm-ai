# RotorNote

**Hear the machine before it stops.** RotorNote turns four synchronized vibration channels into a deliberately small, auditable Arm condition screen, a concrete retest, and a tamper-evident analysis passport. One-channel input is accepted only as a fail-closed ablation. It is an advisory companion to an acquisition gateway, CMMS workflow, and qualified vibration analyst—not a shutdown controller or diagnosis.

![RotorNote hero](assets/gallery/01-hero.svg)

## What is real

- Production training uses **40,000 feature windows from physical experiments**, not generated fault signals.
- The source is the CC BY 4.0 [Mechanical faults in rotating machinery dataset](https://data.mendeley.com/datasets/zx8pfhdtnb/3): 20 independently reset tests, four accelerometers, 25 kHz, and four conditions.
- Five-fold grouped evaluation holds out one complete physical test per class in every fold. No recording or window from a held test enters its scaler or classifier fit.
- Across 20 physical tests, the **76.4%–99.1% Wilson 95% interval** is the uncertainty statement; the observed point estimate is **19/20 tests** and **94.0% four-channel recording balanced accuracy**. The five held-test folds span **85.5%–100%**. A nested calibration audit could not establish 95% selective accuracy on every inner split, so the 0.99 floor remains a conservative engineering rule—not a calibrated probability claim. These are repeated laboratory measurements on one rig, not field sensitivity or certification.
- A separate CC BY 4.0 [axial-bearing dataset](https://data.mendeley.com/datasets/chwhh9n3bf/2) attacks the boundary. RotorNote issued **zero automatic conclusions on 4/4 foreign-rig records**, including healthy and seeded-spall captures.

The exact receipts are [`field/results/open-grouped-cross-validation.json`](field/results/open-grouped-cross-validation.json) and [`field/results/axial-bearing-boundary.json`](field/results/axial-bearing-boundary.json). Licenses and transformations are in [`DATA-LICENSES.md`](DATA-LICENSES.md).

## Complete loop

1. Send four synchronized sensor channels for the validated aggregation path. A one-channel upload is accepted only as an explicitly abstaining ablation, never as an operational screen.
2. Include sample rate and operating RPM; order-aware features depend on both.
3. RotorNote runs FP32 and INT8 engines, checks signal quality and fitted-envelope coverage, applies a conservative 0.99 engineering floor, then abstains on disagreement or uncertainty. The nested audit is retained precisely because it did not validate that floor as a calibrated probability threshold.
4. Export evidence JSON or copy a maintenance note into the existing work-order system.

## Run

Requires Node.js 22.x.

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run build
npm test
npm start
```

Open <http://127.0.0.1:8787>, choose a real demo recording, and screen it. No API key, account, or remote inference service is required.

```bash
npm run gateway -- --url http://127.0.0.1:8787 --file samples/real-imbalance.csv --machine pump-7 --point drive-end-bearing --axis radial-horizontal --rate 25000 --rpm 1238 --load 74
```

## Arm optimization

RotorNote optimizes two deliberately different workloads: an interpretable four-fault specialist and a materially nonlinear variable-speed front door. Both run through the same deterministic FP32-to-INT8 compiler, dynamically planned WASM SIMD runtime, artifact-parity gates, and native Arm evidence workflow. The compiler is reusable outside RotorNote; see [`ARM-INT8-KIT.md`](ARM-INT8-KIT.md) and the executable example in `examples/dense-compile-input.json`.

The real classifier is a transparent 48→4 linear discriminant model over the mean feature vector from four sensors and five windows per sensor. FP32 weights and bias occupy 784 bytes; row-wise INT8 weights plus FP32 bias occupy 208 bytes—a **73.47% reduction**. Dynamic per-inference activation scaling and per-output weight scales preserve **100% of production recording labels** across all 2,000 real recordings, with a 2.80e-10 p99 probability delta and 0.01996 maximum delta.

Repeated native Arm64 Neoverse-N2 runs over identical linear-head FP32, INT8, and WASM hashes measure about **3.2×–3.4× paired-median speedup**; every deterministic bootstrap 95% interval excludes 1.0. Each rebuilds the repository and proves exact NEON `vdotq_s32` agreement; the current product suite contains 32 tests. This band is the repeatability claim—the exact frozen-commit JSON is authoritative for an individual run. These are workload-specific receipts, not energy, fleet, or universal-device claims. [Inspect the current Arm evidence history](https://github.com/equinoxaifinance-rgb/rotornote-arm-ai/actions/workflows/native-arm64.yml).

## API boundary

`POST /api/screen?engine=optimized` with `Content-Type: text/csv` is the canonical gateway and product boundary.

- One channel: `amplitude` or `timestamp,amplitude`
- Four channels: `ch1,ch2,ch3,ch4` or `timestamp,ch1,ch2,ch3,ch4`
- One channel needs at least 2,048 samples plus positive RPM and routes to the variable-speed anomaly head; four channels need at least 8,192 rows and route to the fault-family specialist
- Up to 131,072 rows per channel; 256–100,000 Hz; 8 MiB maximum; finite amplitudes within ±1,000
- Field use should set `X-Machine-Id`, `X-Measurement-Point`, `X-Sensor-Axis`, `X-Operating-RPM`, and `X-Load-Percent`

Read [`INTEGRATION.md`](INTEGRATION.md), [`MODEL-CARD.md`](MODEL-CARD.md), and [`FIELD-VALIDATION.md`](FIELD-VALIDATION.md) before any operational pilot.

MIT licensed. Production runtime has zero third-party npm dependencies.

## Variable-speed anomaly lane

The separate 48->253->126->8 ReLU head uses the CC BY 4.0 [UPATRAS dataset](https://data.mendeley.com/datasets/42v3s74gf9/1): 2,925 real signals across 39 complete measurement sequences and 75 shaft speeds. Its learned representation preserves all eight observed laboratory conditions, but the product collapses them to `healthy`, `anomaly`, or `review_required`; it never presents a laboratory condition as a field diagnosis. Four-fold validation holds out whole sequences and observes 99.8% eight-condition balanced accuracy, 100% broad anomaly balanced accuracy, and 39/39 sequence accuracy (Wilson 95%: 91.0%-100%). Training begins at 48->256->128->8, then removes five units never activated by any real training-bank signal; fitted-bank logit drift is 2.87e-6 and every shipped hidden unit is exercised. The exported head performs 45,030 multiply-accumulates per inference without adding a synthetic sample or weakening the grouped holdout.

FP32 learned bytes are 181,668; SIMD-row-padded INT8 learned bytes are 46,972, a 74.14% reduction. Across the complete 2,925-signal bank the engines preserve 100% eight-condition label agreement, with 0.002679 p99 and 0.036721 maximum probability drift. The current x64 diagnostic run measures a 1.36x paired median with a [1.26, 1.51] bootstrap interval; it is explicitly not the native claim. The frozen native Arm result is recorded by the linked workflow before release. [Inspect the native history](https://github.com/equinoxaifinance-rgb/rotornote-arm-ai/actions/workflows/native-arm64.yml). `POST /api/anomaly?engine=optimized` accepts one uniaxial channel plus sample rate and positive operating RPM. Its timing is never conflated with the linear head's range.

## One cascade

`POST /api/screen?engine=optimized` is the product boundary: one-channel captures route to the broad variable-speed anomaly head; four synchronized channels route to the narrower fault-family specialist. The response names the selected route and both paths emit the same hash-bound analysis passport. RotorNote never turns an anomaly-only result into a fault diagnosis.
