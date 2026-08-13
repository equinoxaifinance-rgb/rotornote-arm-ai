# RotorNote

**Hear the machine before it stops.** RotorNote turns four synchronized vibration channels into an Arm-optimized condition screen, a concrete retest, and a tamper-evident analysis passport. One-channel input is accepted only as a fail-closed ablation. It is an advisory companion to an acquisition gateway, CMMS workflow, and qualified vibration analyst—not a shutdown controller or diagnosis.

![RotorNote hero](assets/gallery/01-hero.svg)

## What is real

- Production training uses **40,000 feature windows from physical experiments**, not generated fault signals.
- The source is the CC BY 4.0 [Mechanical faults in rotating machinery dataset](https://data.mendeley.com/datasets/zx8pfhdtnb/3): 20 independently reset tests, four accelerometers, 25 kHz, and four conditions.
- Five-fold grouped evaluation holds out one complete physical test per class in every fold. No recording or window from a held test enters its scaler or classifier fit.
- Executed grouped results: **94.0% four-channel recording balanced accuracy** and **19/20 physical tests correctly identified**. The five held-test folds span **85.5%–100%**; the 19/20 physical-test proportion has a wide **76.4%–99.1% Wilson 95% interval**. A nested calibration audit could not establish 95% selective accuracy on every inner split, so the 0.99 floor remains a conservative engineering rule—not a calibrated probability claim. These are repeated laboratory measurements on one rig, not field sensitivity or certification.
- A separate CC BY 4.0 [axial-bearing dataset](https://data.mendeley.com/datasets/chwhh9n3bf/2) attacks the boundary. RotorNote issued **zero automatic conclusions on 4/4 foreign-rig records**, including healthy and seeded-spall captures.

The exact receipts are [`field/results/open-grouped-cross-validation.json`](field/results/open-grouped-cross-validation.json) and [`field/results/axial-bearing-boundary.json`](field/results/axial-bearing-boundary.json). Licenses and transformations are in [`DATA-LICENSES.md`](DATA-LICENSES.md).

## Complete loop

1. Send four synchronized sensor channels for the validated aggregation path. A one-channel upload is accepted only as an explicitly abstaining ablation, never as an operational screen.
2. Include sample rate and operating RPM; order-aware features depend on both.
3. RotorNote runs FP32 and INT8 engines, checks signal quality, calibration-envelope coverage, and a nested-validated 0.99 confidence floor, then abstains on disagreement or uncertainty.
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

The real classifier is a transparent 48→4 linear discriminant model over the mean feature vector from four sensors and five windows per sensor. FP32 weights and bias occupy 784 bytes; row-wise INT8 weights plus FP32 bias occupy 208 bytes—a **73.47% reduction**. Dynamic per-inference activation scaling and per-output weight scales preserve **100% of production recording labels** across all 2,000 real recordings, with a 2.80e-10 p99 probability delta and 0.01996 maximum delta.

Two native Arm64 Neoverse-N2 repeats over identical FP32, INT8, and WASM hashes measured **3.2164×** and **3.2819× paired-median end-to-end speedups** over FP32. Their deterministic bootstrap 95% intervals were **3.1751×–3.2539×** and **3.2512×–3.3015×** across 51 alternating-order samples per run. Both rebuilt the repository, passed all 24 tests, and proved exact NEON `vdotq_s32` agreement. These are workload-specific repeatability receipts—not energy, fleet, or universal-device claims. [Inspect run 31693588831](https://github.com/equinoxaifinance-rgb/rotornote-arm-ai/actions/runs/31693588831) and [repeat 31693809937](https://github.com/equinoxaifinance-rgb/rotornote-arm-ai/actions/runs/31693809937).

## API boundary

`POST /api/analyze?engine=optimized` with `Content-Type: text/csv`.

- One channel: `amplitude` or `timestamp,amplitude`
- Four channels: `ch1,ch2,ch3,ch4` or `timestamp,ch1,ch2,ch3,ch4`
- 8,192–131,072 rows per channel; 256–100,000 Hz; 8 MiB maximum; finite amplitudes within ±1,000
- Field use should set `X-Machine-Id`, `X-Measurement-Point`, `X-Sensor-Axis`, `X-Operating-RPM`, and `X-Load-Percent`

Read [`INTEGRATION.md`](INTEGRATION.md), [`MODEL-CARD.md`](MODEL-CARD.md), and [`FIELD-VALIDATION.md`](FIELD-VALIDATION.md) before any operational pilot.

MIT licensed. Production runtime has zero third-party npm dependencies.
