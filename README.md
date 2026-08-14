# RotorNote

**Hear the machine before it stops.** RotorNote turns a single vibration channel into a broad variable-speed anomaly screen, then unlocks a narrower fault-family specialist when four synchronized channels satisfy that evidence contract. Both Arm-optimized paths produce a concrete retest and tamper-evident analysis passport. It is an advisory companion to an acquisition gateway, CMMS workflow, and qualified vibration analyst—not a shutdown controller or diagnosis.

![RotorNote hero](assets/gallery/01-hero.svg)

## What is real

- Production training uses **40,000 feature windows from physical experiments**, not generated fault signals.
- The source is the CC BY 4.0 [Mechanical faults in rotating machinery dataset](https://data.mendeley.com/datasets/zx8pfhdtnb/3): 20 independently reset tests, four accelerometers, 25 kHz, and four conditions.
- Five-fold grouped evaluation holds out one complete physical test per class in every fold. No recording or window from a held test enters its scaler or classifier fit.
- Across 20 physical tests, the **76.4%–99.1% Wilson 95% interval** is the uncertainty statement; the observed point estimate is **19/20 tests** and **94.0% four-channel recording balanced accuracy**. One complete misalignment test (test 10) was predicted healthy; that failure is preserved in the receipt and prevents a blanket misalignment-sensitivity claim. The five held-test folds span **85.5%–100%**. A nested calibration audit could not establish 95% selective accuracy on every inner split, so the 0.99 floor remains a conservative engineering rule—not a calibrated probability claim. These are repeated laboratory measurements on one rig, not field sensitivity or certification.
- The decision surface now exposes the complete observed grouped risk/coverage table instead of presenting a score cutoff alone. At the specialist's 0.99 rule, the pooled held-test receipt records 96.15% recording coverage and 95.84% accepted-recording accuracy; because the nested grouped audit did not meet its target in every fold, the UI explicitly refuses to turn that observation into a calibrated guarantee. The broad head likewise exposes its full held-sequence curve.
- Three independently published external sources attack the canonical one-channel boundary without entering training. The two CC BY 4.0 seeded-fault rigs contribute 28 axial-bearing records and 245 Zhenjiang RPM challenges. The public NASA IMS source adds three accelerated natural run-to-failure experiments: 12 bearing installations, 16 sensor trajectories, seven predeclared timestamps per run, and 112 sensor cases. RotorNote issued **zero automatic conclusions** and FP32/INT8 broad decisions agreed in every external case, including all six endpoint channels attached to the four bearings with documented natural failures. This proves fail-closed behavior, not cross-rig sensitivity.

The exact receipts are [`field/results/open-grouped-cross-validation.json`](field/results/open-grouped-cross-validation.json), [`field/results/axial-bearing-boundary.json`](field/results/axial-bearing-boundary.json), [`field/results/zhenjiang-bearing-boundary.json`](field/results/zhenjiang-bearing-boundary.json), and [`field/results/ims-natural-failure-boundary.json`](field/results/ims-natural-failure-boundary.json). Licenses, public-use terms, and transformations are in [`DATA-LICENSES.md`](DATA-LICENSES.md).

## Complete loop

1. Send one channel for the broad variable-speed anomaly screen, or four synchronized channels for the narrower fault-family specialist. The canonical endpoint routes by this evidence contract.
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

For the shortest complete evaluation route, use [`JUDGE-PATH.md`](JUDGE-PATH.md).

```bash
npm run gateway -- --url http://127.0.0.1:8787 --file samples/real-imbalance.csv --machine pump-7 --point drive-end-bearing --axis radial-horizontal --rate 25000 --rpm 1238 --load 74
```

## Arm optimization

RotorNote optimizes two deliberately different workloads: a materially nonlinear variable-speed front door and an interpretable four-fault specialist. Both run through the same deterministic FP32-to-INT8 compiler, dynamically planned WASM SIMD runtime, artifact-parity gates, and native Arm evidence workflow. The compiler is reusable outside RotorNote; see [`ARM-INT8-KIT.md`](ARM-INT8-KIT.md) and the executable example in `examples/dense-compile-input.json`.

The materially nonlinear workload is the fitted-unit-pruned **96→609→326→120→8** anomaly head. It preserves an ordered pair of temporal feature windows, performs **297,078 MACs per inference**, and reduces learned bytes from **1,192,564 FP32 bytes to 307,484 SIMD-row-padded INT8 bytes (74.22%)**. Its 100% full-bank label-parity gate has 0.000874 p99 and 0.007802 maximum probability drift. Inactive units are removed only when they never activate on any of 2,925 real signals; the exported graph contains no dead units added to inflate a benchmark.

The stronger Arm story is the reusable product path: `POST /api/compile` accepts a bounded dense ReLU model plus real calibration rows, deterministically emits downloadable FP32 and INT8 artifacts, reports hashes, utilization, byte reduction, and parity, and rejects unsafe or malformed compilation requests. RotorNote cross-checks that compiler byte-for-byte against its own production artifacts. Native Arm CI rebuilds and runs the exact current graph; workload-specific timing is reported only by that frozen workflow.

The real classifier is a transparent 48→4 linear discriminant model over the mean feature vector from four sensors and five windows per sensor. FP32 weights and bias occupy 784 bytes; row-wise INT8 weights plus FP32 bias occupy 208 bytes—a **73.47% reduction**. Dynamic per-inference activation scaling and per-output weight scales preserve **100% of production recording labels** across all 2,000 real recordings, with a 2.80e-10 p99 probability delta and 0.01996 maximum delta.

The four-sensor specialist remains in the product because its interpretable fault-family output is useful. The exact native receipt reports its median FP32 and INT8 throughput, paired speedup, and bootstrap interval beside the deep head instead of hiding the smaller workload. Its 192-MAC call is explicitly overhead sensitive, so the ratio is an end-to-end latency receipt rather than a claim of meaningful fleet compute savings. Each native run rebuilds the repository, executes the complete test suite, validates the artifact set, scans for secrets, and proves exact NEON `vdotq_s32` agreement. These are workload-specific receipts, not energy, fleet, or universal-device claims. [Inspect the current Arm evidence history](https://github.com/equinoxaifinance-rgb/rotornote-arm-ai/actions/workflows/native-arm64.yml).

To separate compute from dispatch, the same native job executes a kernel-only sweep from 16 through 16,384 MACs per call. It records 31 alternating-order trials per size, nanoseconds per MAC, and exact scalar/NEON equality, while excluding JS, Wasm dispatch, feature extraction, orchestration, and softmax. The 16,384-MAC point must prove compute-bound speedup above one. The model-call measurements remain explicitly end-to-end; the kernel sweep is explicitly not product throughput.

## API boundary

`POST /api/screen?engine=optimized` with `Content-Type: text/csv` is the canonical gateway and product boundary.

- One channel: `amplitude` or `timestamp,amplitude`
- Four channels: `ch1,ch2,ch3,ch4` or `timestamp,ch1,ch2,ch3,ch4`
- One channel needs at least 2,048 samples plus positive RPM and routes to the variable-speed anomaly head; four channels need at least 8,192 rows and route to the fault-family specialist
- Up to 131,072 rows per channel; 256–100,000 Hz; 8 MiB maximum; finite amplitudes within ±1,000
- Field use should set `X-Machine-Id`, `X-Measurement-Point`, `X-Sensor-Axis`, `X-Operating-RPM`, and `X-Load-Percent`

Read [`INTEGRATION.md`](INTEGRATION.md), [`MODEL-CARD.md`](MODEL-CARD.md), and [`FIELD-VALIDATION.md`](FIELD-VALIDATION.md) before any operational pilot.

MIT licensed. Production runtime has zero third-party npm dependencies. The deterministic in-repo SBOM and secret scan are independently cross-checked in CI by Syft, Grype, and the npm registry audit; third-party actions are pinned to full commit SHAs.

## Variable-speed anomaly lane

The separate 96->609->326->120->8 ReLU head uses the CC BY 4.0 [UPATRAS dataset](https://data.mendeley.com/datasets/42v3s74gf9/1): 2,925 real signals across 39 complete measurement sequences and 75 shaft speeds. Each signal preserves an ordered pair of temporal windows rather than averaging away change over time. Its learned representation preserves all eight observed laboratory conditions, but the product collapses them to `healthy`, `anomaly`, or `review_required`; it never presents a laboratory condition as a field diagnosis. Four-fold validation holds out whole sequences and observes 99.83% eight-condition balanced accuracy, 100% broad anomaly balanced accuracy, and 39/39 sequence accuracy (Wilson 95%: 91.0%-100%). Training starts at 96->768->384->128->8, then removes units never activated by any real training-bank signal; maximum fitted-bank logit drift is 3.82e-6 and every shipped hidden unit is exercised. The exported head performs 297,078 multiply-accumulates per inference without adding a synthetic sample or weakening the grouped holdout.

FP32 learned bytes are 1,192,564; SIMD-row-padded INT8 learned bytes are 307,484, a 74.22% reduction. Across the complete 2,925-signal bank the engines preserve 100% eight-condition label agreement, with 0.000874 p99 and 0.007802 maximum probability drift. [Inspect exact-commit native evidence](https://github.com/equinoxaifinance-rgb/rotornote-arm-ai/actions/workflows/native-arm64.yml); local x64 timing remains supporting evidence only. `POST /api/anomaly?engine=optimized` accepts one uniaxial channel plus sample rate and positive operating RPM. Its timing is never conflated with the linear head's range.

## One cascade

`POST /api/screen?engine=optimized` is the product boundary: one-channel captures route to the broad variable-speed anomaly head; four synchronized channels route to the narrower fault-family specialist. The response names the selected route and both paths emit the same hash-bound analysis passport. RotorNote never turns an anomaly-only result into a fault diagnosis.
