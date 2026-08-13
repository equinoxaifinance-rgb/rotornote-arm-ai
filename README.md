# RotorNote

**Hear the machine before it stops.** RotorNote turns a vibration CSV into a window-by-window machine-health screen and a concrete field retest. It is a self-contained Cloud AI entry for the Arm Create: AI Optimization Challenge.

![RotorNote hero](assets/gallery/01-hero.svg)

## The complete loop

1. Drop a one-column `amplitude` CSV (or `timestamp,amplitude`) and set its sample rate.
2. Choose the scalar FP32 baseline or the INT8 WebAssembly SIMD engine.
3. Review the learned condition, confidence, waveform, spectrum, and fault timeline.
4. Follow the condition-specific retest prompt and capture a like-for-like reading.

Each API analysis now witnesses the selected engine with the alternate engine, checks signal quality, measures how much of the recording remains inside the fitted calibration envelope, and abstains with `review_required` when those gates fail. A tamper-evident analysis passport binds the input bytes, machine context, configuration, model hashes, and deterministic decision output.

The bundled **Shift change** recording is the fastest judge path: it starts inside the learned healthy envelope and ends with an imbalance-like pattern. No API key, login, network model download, or external service is required.

## Run locally

Prerequisite: Node.js 22.x and npm.

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run build
npm test
npm start
```

Open <http://127.0.0.1:8787>, select **Shift change**, and click **Screen recording**. The generated artifacts are committed; `npm run build` deterministically recreates the SIMD kernel, model, samples, and gallery.

Useful commands:

```bash
npm run test:coverage
npm run benchmark -- --output benchmark/results/local-x64.json
npm run validate
npm run secret-scan
```

## Connect a machine gateway

RotorNote includes a tested, dependency-free gateway for an accelerometer/DAQ or Arm64 collector that already exports CSV:

```bash
npm run gateway -- --url http://127.0.0.1:8787 --file samples/shift-change.csv --machine pump-7 --point drive-end-bearing --axis radial-horizontal --rate 1024 --rpm 1800 --load 74
```

Remote targets must use HTTPS. Read [`INTEGRATION.md`](INTEGRATION.md) for the sensor-to-API contract, [`MODEL-CARD.md`](MODEL-CARD.md) for intended use and limits, and [`FIELD-VALIDATION.md`](FIELD-VALIDATION.md) for the standards-aligned path from contest prototype to a field-validated product.

## Arm optimization

Both paths run the same 48→256→128→5 learned network and the same signal features.

| Path | Weights | Compute |
|---|---:|---|
| Baseline | FP32, 184,340-byte artifact | scalar JavaScript dense loops |
| Optimized | symmetric INT8, 47,252-byte artifact | WebAssembly SIMD `v128` loads and dot products |

The optimized artifact uses 74.37% fewer weight bytes. On exact public commit `3cc999a`, [native Arm64 workflow run 31678380107](https://github.com/equinoxaifinance-rgb/rotornote-arm-ai/actions/runs/31678380107) recorded `aarch64`, 21/21 passing tests, 100% label agreement, a 0.000376 maximum probability delta, and a **1.2418× median inference speedup** (95.5562 ms to 76.9482 ms per 1,024-inference batch). The downloaded artifact hash matched GitHub's published digest and is preserved under [`receipts/native-arm64/run-31678380107`](receipts/native-arm64/run-31678380107).

**Evidence status:** local x64 validation is available in [`receipts/LOCAL-VALIDATION.md`](receipts/LOCAL-VALIDATION.md); native Arm64 is verified by the linked workflow and downloaded artifact. x64 timing is never presented as native Arm evidence.

## Model and data

RotorNote uses a deterministic random-feature network with a genuinely ridge-fitted multiclass head for five patterns: healthy, imbalance, misalignment, looseness, and bearing-like impacts. Runtime features combine 32 normalized spectral bands, eight time-domain measures, and eight spectral-shape measures across 2,048-sample windows with 50% overlap.

The committed metadata records seed, architecture, ridge regularization, calibration scales, artifact hashes, ordinary held-out results, and an unseen-seed stress result with heavier noise, gain/bias shift, speed modulation, nuisance harmonics, and mixed faults. Those results validate controlled synthetic consistency only; they are **not field accuracy**. RotorNote is a screening aid, not a safety controller or diagnosis.

`npm run validate:field` is a separate cross-domain safety probe. It downloads four hash-pinned experimental records from the official Case Western Reserve University Bearing Data Center, resamples the drive-end channel, and verifies that uncalibrated recordings fail closed. The committed receipt reports 100% abstention, zero automatic conclusions, and a bearing review candidate for all three faulted records. This is useful external evidence of the boundary—not certification or a field-accuracy estimate.

The model also commits a 99.5th-percentile training envelope in normalized feature space. This is an abstention mechanism, not evidence of real-world calibration: recordings outside that simulated envelope are sent to review instead of receiving an unqualified conclusion.

## API

```bash
curl -fsS http://127.0.0.1:8787/health
curl -fsS -X POST \
  -H 'content-type: text/csv' \
  -H 'x-sample-rate: 1024' \
  --data-binary @samples/bearing-pulse.csv \
  'http://127.0.0.1:8787/api/analyze?engine=optimized'
```

Limits: UTF-8 CSV, 2 MiB, 2,048–131,072 samples, 256–5,000 Hz, finite amplitude within ±1,000. Errors are structured JSON with a request ID. Uploads are processed in memory and not retained.

## Deploy

The judge path needs no secrets:

```bash
docker compose up --build
curl -fsS http://127.0.0.1:8787/health
```

The image builds on `node:22-alpine`, runs as the unprivileged `node` user, exposes port 8787, and includes a health check. Set `HOST=0.0.0.0` and `PORT` as required on any Arm cloud VM/container service. Deployment has not been claimed in this repository without a live URL receipt.

## Repository map

- `src/` — CSV boundary, signal features, inference runtime, analysis, HTTP server
- `kernel/` and `dist/` — readable WAT source and generated SIMD WebAssembly
- `model/` — hashed FP32/INT8 artifacts and transparent metadata
- `web/` — responsive, keyboard-usable interface with reduced-motion support
- `tests/` — unit, integration, hostile-input, integrity, dependency-failure, retry/recovery tests
- `integrations/` — tested HTTPS edge gateway with machine and acquisition context
- `benchmark/` — deterministic, alternating-order benchmark with raw samples
- `FIELD-VALIDATION.md` — exact evidence and independent work required before any certification claim
- `sbom.spdx.json` and `dist/build-manifest.json` — deterministic supply-chain and byte-level provenance artifacts
- `assets/gallery/` — three original, deterministic 1600×900 SVG gallery assets

Read [ARCHITECTURE.md](ARCHITECTURE.md), [SECURITY.md](SECURITY.md), [MODEL-CARD.md](MODEL-CARD.md), [FIELD-VALIDATION.md](FIELD-VALIDATION.md), [BENCHMARKS.md](BENCHMARKS.md), and [SUBMISSION.md](SUBMISSION.md) for the technical, validation, and submission details.

MIT licensed. The only npm dependency is the Apache-2.0-licensed `wabt` build tool; production runtime has zero third-party npm dependencies.
