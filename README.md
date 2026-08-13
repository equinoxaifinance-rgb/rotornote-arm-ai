# RotorNote

**Hear the machine before it stops.** RotorNote turns one- or four-channel vibration CSV into an Arm-optimized condition screen, a concrete retest, and a tamper-evident analysis passport. It is an advisory companion to an acquisition gateway, CMMS workflow, and qualified vibration analyst—not a shutdown controller or diagnosis.

![RotorNote hero](assets/gallery/01-hero.svg)

## What is real

- Production training uses **40,000 feature windows from physical experiments**, not generated fault signals.
- The source is the CC BY 4.0 [Mechanical faults in rotating machinery dataset](https://data.mendeley.com/datasets/zx8pfhdtnb/3): 20 independently reset tests, four accelerometers, 25 kHz, and four conditions.
- Five-fold grouped evaluation holds out one complete physical test per class in every fold. No recording or window from a held test enters its scaler or classifier fit.
- Executed grouped results: **76.3% four-channel recording balanced accuracy** and **16/20 physical tests correctly identified**. A 0.90 confidence policy answers on 37.1% of out-of-fold recordings at **97.71% accepted accuracy / 96.46% selective balanced accuracy** and routes the rest to review. These are repeated laboratory measurements on one rig—not field sensitivity or certification.
- A separate CC BY 4.0 [axial-bearing dataset](https://data.mendeley.com/datasets/chwhh9n3bf/2) attacks the boundary. RotorNote issued **zero automatic conclusions on 4/4 foreign-rig records**, including healthy and seeded-spall captures.

The exact receipts are [`field/results/open-grouped-cross-validation.json`](field/results/open-grouped-cross-validation.json) and [`field/results/axial-bearing-boundary.json`](field/results/axial-bearing-boundary.json). Licenses and transformations are in [`DATA-LICENSES.md`](DATA-LICENSES.md).

## Complete loop

1. Send one sensor channel for a quick screen, or four synchronized channels for the validated aggregation path.
2. Include sample rate and operating RPM; order-aware features depend on both.
3. RotorNote runs FP32 and INT8 engines, checks signal quality, calibration-envelope coverage, and a 0.90 confidence floor, then abstains on disagreement or uncertainty.
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

The real classifier is a transparent 48→4 multinomial logistic model. FP32 weights and bias occupy 784 bytes; row-wise INT8 weights plus FP32 bias occupy 208 bytes—a **73.47% reduction**. Dynamic per-inference activation scaling and per-output weight scales achieved **99.7825% window label agreement, 100% recording-level agreement, and 0.02774 p99 probability drift** over all 40,000 real windows. The maximum isolated probability delta (0.42964) remains disclosed.

The WebAssembly SIMD kernel and native Arm dot-product proof remain reproducible, but earlier speed receipts belonged to the superseded larger model. New native throughput is yellow until the current model runs on the Arm workflow; x64 timing is never relabeled as Arm evidence.

## API boundary

`POST /api/analyze?engine=optimized` with `Content-Type: text/csv`.

- One channel: `amplitude` or `timestamp,amplitude`
- Four channels: `ch1,ch2,ch3,ch4` or `timestamp,ch1,ch2,ch3,ch4`
- 8,192–131,072 rows per channel; 256–100,000 Hz; 8 MiB maximum; finite amplitudes within ±1,000
- Field use should set `X-Machine-Id`, `X-Measurement-Point`, `X-Sensor-Axis`, `X-Operating-RPM`, and `X-Load-Percent`

Read [`INTEGRATION.md`](INTEGRATION.md), [`MODEL-CARD.md`](MODEL-CARD.md), and [`FIELD-VALIDATION.md`](FIELD-VALIDATION.md) before any operational pilot.

MIT licensed. Production runtime has zero third-party npm dependencies.
