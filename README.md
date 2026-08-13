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

RotorNote does not inflate a maintenance screen into a large network merely to manufacture compute. The learned layer is intentionally minimal because auditability, memory movement, cold-start cost, and deterministic fail-closed behavior are product requirements. The optimization contribution is therefore measurable deployment work: transparent FP32 and quantized INT8 implementations of the same real-data model, SIMD dot products, artifact-parity gates, and repeatable native Arm evidence.

The real classifier is a transparent 48→4 linear discriminant model over the mean feature vector from four sensors and five windows per sensor. FP32 weights and bias occupy 784 bytes; row-wise INT8 weights plus FP32 bias occupy 208 bytes—a **73.47% reduction**. Dynamic per-inference activation scaling and per-output weight scales preserve **100% of production recording labels** across all 2,000 real recordings, with a 2.80e-10 p99 probability delta and 0.01996 maximum delta.

Five native Arm64 Neoverse-N2 repeats over identical linear-head FP32, INT8, and WASM hashes measured paired-median speedups from **3.2164× to 3.3056×**; every deterministic bootstrap 95% interval excluded 1.0. Each rebuilt the repository and proved exact NEON `vdotq_s32` agreement; the newest product run passed 30/30 tests. This range is the repeatability claim—the exact frozen-commit JSON is authoritative for an individual run. These are workload-specific receipts, not energy, fleet, or universal-device claims. [Inspect the current Arm evidence history](https://github.com/equinoxaifinance-rgb/rotornote-arm-ai/actions/workflows/native-arm64.yml).

## API boundary

`POST /api/analyze?engine=optimized` with `Content-Type: text/csv`.

- One channel: `amplitude` or `timestamp,amplitude`
- Four channels: `ch1,ch2,ch3,ch4` or `timestamp,ch1,ch2,ch3,ch4`
- 8,192–131,072 rows per channel; 256–100,000 Hz; 8 MiB maximum; finite amplitudes within ±1,000
- Field use should set `X-Machine-Id`, `X-Measurement-Point`, `X-Sensor-Axis`, `X-Operating-RPM`, and `X-Load-Percent`

Read [`INTEGRATION.md`](INTEGRATION.md), [`MODEL-CARD.md`](MODEL-CARD.md), and [`FIELD-VALIDATION.md`](FIELD-VALIDATION.md) before any operational pilot.

MIT licensed. Production runtime has zero third-party npm dependencies.

## Variable-speed anomaly lane

The separate 48->63->32->2 ReLU head uses the CC BY 4.0 [UPATRAS dataset](https://data.mendeley.com/datasets/42v3s74gf9/1): 2,925 real signals across 39 complete measurement sequences and 75 shaft speeds. Four-fold validation holds out whole sequences and observed 100% balanced accuracy plus 39/39 sequence accuracy (Wilson 95%: 91.0%-100%). It answers only `healthy`, `anomaly`, or `review_required`; it never invents a fault family or severity. Training begins at 48->64->32->2, then removes the one unit never activated by any real training-bank signal; fitted-bank logit drift is 1.91e-6 and every shipped hidden unit is exercised.

FP32 learned bytes are 20,804; row-wise INT8 learned bytes are 5,492, a 73.60% reduction. Across the complete 2,925-signal bank the engines preserve 100% label agreement, with 0.000417 p99 and 0.002414 maximum probability drift. The first native repeat of this exact pruned artifact measured a **1.0429x paired-median speedup** with a **1.0401x-1.0488x** interval, 100% label agreement, and 0.0000691 maximum benchmark drift. [Inspect run 31699484874](https://github.com/equinoxaifinance-rgb/rotornote-arm-ai/actions/runs/31699484874). `POST /api/anomaly?engine=optimized` accepts one uniaxial channel plus sample rate and positive operating RPM. Its timing is never conflated with the linear head's range.

## One cascade

`POST /api/screen?engine=optimized` is the product boundary: one-channel captures route to the broad variable-speed anomaly head; four synchronized channels route to the narrower fault-family specialist. The response names the selected route and both paths emit the same hash-bound analysis passport. RotorNote never turns an anomaly-only result into a fault diagnosis.
