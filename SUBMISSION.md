# Devpost submission copy

## Project name

RotorNote

## Tagline

Hear the machine before it stops: Arm-optimized vibration screening with a fault timeline and a field retest.

## Problem

Small maintenance teams often collect vibration traces but lack the time, connectivity, or specialist tools to interpret every recording. A single summary score is not enough: technicians need to know *when* a pattern changed and what controlled measurement to take next. Sending plant traces to a remote model can also add cost and operational friction.

## Solution

RotorNote is a concise browser workbench for rotating equipment. A technician drops a sensor CSV, chooses the optimized or baseline engine, and receives a window-by-window screen for healthy motion, imbalance, misalignment, looseness, and bearing-like impacts. The report pairs its waveform and condition timeline with one specific field retest. Everything—including the learned model—runs in a small, secret-free Node service.

The memorable demo is **Shift change**: one recording visibly transitions from the learned healthy envelope into an imbalance-like pattern. RotorNote shows the transition rather than hiding it behind an average.

## How it works

RotorNote validates and segments the recording into overlapping 2,048-sample windows. For each window it computes 48 time- and frequency-domain features, then runs a 48→256→128→5 supervised extreme-learning network. Window probabilities become the colored timeline; their aggregate becomes the primary screen. The report also includes confidence, signal statistics, the strongest spectral peak, machine context, dual-engine agreement, fitted-envelope coverage, a fail-closed review state, and a reproducible analysis passport.

The entire training set is original and deterministic. Physics-inspired signal generators model shaft harmonics, subharmonics, impulsive looseness, and damped high-frequency impacts. The model builder, quantizer, artifacts, hashes, samples, and validation split all ship in the repository.

## Arm-specific implementation

The transparent baseline stores FP32 weights and evaluates scalar JavaScript dense loops. The optimized path quantizes weights and calibrated activations to INT8, reducing the committed weight artifact from 184,340 to 47,252 bytes (74.37%). A hand-written WebAssembly SIMD kernel loads 16 signed values per vector and performs vector dot accumulation. V8 compiles that portable SIMD for the Arm64 host.

The repository's `ubuntu-24.04-arm` action treats architecture as a hard gate, rebuilds deterministic artifacts, runs all tests, alternates both engines across raw benchmark samples, records machine/dependency details, and uploads hashes. On public commit `99bc324`, the native run recorded a **1.2458× median inference speedup**, 74.37% fewer weight bytes, 100% label agreement, and a 0.000376 maximum probability delta. The workflow URL and downloaded artifact are linked in `BENCHMARKS.md`.

## Challenges

The hardest engineering problem was making the optimization honest. A different model, feature path, or hard-coded answer would make a comparison meaningless. RotorNote keeps one set of features and one learned network, checks artifact integrity at runtime, validates engine agreement, alternates benchmark order, and records every sample—even if INT8 does not win on a particular machine.

The second challenge was responsible product language. Synthetic validation can prove the pipeline is repeatable; it cannot prove industrial diagnostic accuracy. The UI therefore describes pattern resemblance, asks for a like-for-like retest, and never triggers maintenance automatically.

## Accomplishments

- Built the complete drop→screen→timeline→retest loop with no secrets or remote services.
- Created original deterministic signal data, model fitting, INT8 calibration, a readable SIMD kernel, and hashed artifacts.
- Reduced weight bytes by 74.37% while preserving all held-out simulated labels in the generated model receipt.
- Covered malformed input, method/media boundaries, tampered models, dependency failure, retry, recovery, and both engines.
- Produced a responsive, keyboard-usable interface and three original 1600×900 gallery assets.
- Packaged an unprivileged, health-checked container and a strict native Arm64 evidence workflow.
- Added a tested sensor-gateway path, machine/acquisition context, signal-quality and out-of-distribution abstention, dual-engine witnessing, and deterministic evidence receipts.
- Shipped an SPDX SBOM, byte-level build manifest, model card, and standards-aligned field-validation plan without claiming certification that has not occurred.

## What we learned

Optimization evidence is a product feature. Exposing the engine toggle made model parity understandable to judges and forced the implementation to stay coherent. We also learned that a time-localized answer is much more actionable than a single label: the shift-change timeline naturally leads to a repeatable field measurement.

## What's next

The next external milestone is the pre-registered field study in `FIELD-VALIDATION.md`: consented, independently labeled recordings across machines, mounts, loads, speeds and sensor orientations. RotorNote now has out-of-distribution abstention and acquisition context; the study must calibrate them against reality before expanding fault classes. On the platform side, worker-thread isolation and per-tenant encrypted storage could support teams—but only after authentication and retention controls. Native runner data will guide whether to tune batch size, fuse requantization into WebAssembly, or use Arm-specific dot-product instructions through a native addon.

## Built with

Node.js 22, JavaScript, WebAssembly Text, WebAssembly SIMD, INT8 quantization, FFT signal features, calibrated abstention, HTML, CSS, Canvas, Docker, GitHub Actions, SPDX, and `wabt`.

## Setup

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run build
npm test
npm start
```

Open `http://127.0.0.1:8787`. Docker alternative: `docker compose up --build`.

## Judge testing instructions

1. Select **Shift change** and keep **INT8 SIMD** selected.
2. Screen the recording; inspect the healthy-to-imbalance timeline and field retest.
3. Switch to **FP32 baseline** and screen the same recording; confirm the same primary result.
4. Select **Bearing pulse** to see periodic impacts and the inspection guidance.
5. Check `/health` for the actual process architecture and initialized engines.
6. Review the raw benchmark JSON and workflow artifact before accepting any native performance claim.

Core judge path requires no credentials. RotorNote is a screening aid, not a certified diagnosis or safety controller.

## Gallery assets

1. `assets/gallery/01-hero.svg` — product promise and intake
2. `assets/gallery/02-analysis.svg` — waveform and fault timeline
3. `assets/gallery/03-arm-optimization.svg` — honest baseline/optimized comparison

All three are original deterministic SVGs generated by `npm run gallery`.

## Optional demo video script / shot list

**0:00–0:08 — Problem.** Close shot of a motor and a vibration CSV. Voiceover: “A trace is easy to collect. Knowing what changed—and what to measure next—is harder.”

**0:08–0:20 — Product promise.** Open RotorNote. Select **Shift change**. Voiceover: “RotorNote turns one recording into a condition timeline, entirely on the Arm cloud CPU.”

**0:20–0:38 — Complete loop.** Click **Screen recording**. Pan from waveform to the green/orange timeline and read the balance retest. Voiceover: “It catches the moment the learned pattern changes and gives the technician a controlled retest.”

**0:38–0:54 — Differentiator.** Toggle FP32 and INT8, rerun, and show agreement. Voiceover: “The same network has an inspectable FP32 baseline and a 74% smaller INT8 SIMD path—not a different answer disguised as optimization.”

**0:54–1:05 — Evidence.** Show the Arm64 workflow, architecture gate, raw JSON, and hashes. Voiceover: “Native results stay gated until `aarch64` is recorded. Every timing sample ships as an artifact.”

**1:05–1:12 — Close.** Return to the retest card. Voiceover: “RotorNote: hear the machine before it stops.”

Do not record or upload a video for this submission unless contest strategy changes.
