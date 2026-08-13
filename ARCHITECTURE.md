# Architecture

RotorNote has one job: turn a vibration trace into a condition timeline and a field retest without sending the trace to another service.

```text
CSV upload
   │  validate size, shape, rate, finiteness
   ▼
2,048-sample windows (50% overlap)
   │  FFT + temporal/spectral descriptors
   ▼
48 normalized features per window
   ├──────── FP32 scalar JavaScript ────────┐
   └── INT8 WebAssembly SIMD (Arm path) ────┤
                                             ▼
       five probabilities → timeline → aggregate → retest
```

## Product spine

`src/server.js` exposes the static application, bundled samples, `GET /health`, and `POST /api/analyze`. `src/csv.js` is the untrusted-input boundary. `src/analyze.js` creates features, calls the selected engine for every window, aggregates probabilities, and returns only downsampled display data. The browser renders that response; it does not contain a second classifier.

The model is loaded once and hash-verified. Concurrent first requests share one promise. If loading fails, the promise is cleared, the API returns `503` with `Retry-After: 1`, and a later request retries—covered by an integration test.

## Learned workload

The input contains:

- 32 log-scaled spectral energy bands;
- RMS, peak, crest factor, kurtosis, skew, zero crossings, mean absolute amplitude, and impulse factor;
- spectral centroid, spread, 85% rolloff, dominant frequency/ratio, and three broad-band ratios.

The classifier is a supervised extreme learning machine (ELM): two seeded random ReLU projections (48→256→128) followed by a learned nearest-centroid linear head (128→5). The head is fitted from 900 original deterministic simulations; 225 disjoint simulations are retained for pipeline validation. `scripts/build-model.js` contains the entire data generator, fitting, calibration, quantization, and artifact writer—there is no hidden notebook or downloaded checkpoint.

The modeled classes are deliberately phrased as pattern resemblance, not a mechanical diagnosis. Simulation validation cannot establish field performance.

## Baseline and optimized engines

The baseline in `src/model.js` reads row-major Float32 weights and executes ordinary scalar JavaScript loops. It is intentionally clear and portable.

The optimized path uses symmetric, per-layer INT8 weight quantization and calibrated INT8 activations. Biases stay Float32. `kernel/dense.wat` loads 16 signed bytes at a time, sign-extends low and high halves, accumulates `i32x4.dot_i16x8_s`, and writes Int32 outputs. JavaScript applies scales, bias, ReLU, and requantization between layers. All layer input widths are multiples of 16; no padded bytes or tail branch can contaminate a dot product.

`scripts/build-kernel.js` compiles readable WAT to a 247-byte WebAssembly module with `wabt`. The SIMD program is architecture-neutral bytecode; V8 compiles it for the host. Native Arm benefit is therefore an empirical CI question. The workflow records native architecture before timing and never fails merely because the optimized path is slower.

Primary references for the dependency behavior:

- WebAssembly SIMD proposal and instruction semantics: <https://github.com/WebAssembly/simd>
- V8's official WebAssembly SIMD overview: <https://v8.dev/features/simd>

## Artifact integrity and reproducibility

`model/model.json` records the deterministic seed, normalization arrays, activation/weight scales, byte offsets, sizes, and SHA-256 hashes. Runtime refuses a changed FP32 or INT8 artifact. `npm run build` recreates:

- `dist/dense.wasm`;
- both model binaries and metadata;
- three sensor samples;
- three gallery SVGs.

CI rebuilds and uses `git diff --exit-code` on those outputs before testing. This catches a generator/artifact mismatch.

## Operational shape

The server is a single Node 22 process with no production npm dependencies. Core analysis is CPU-bound and synchronous by design; this keeps the benchmark honest and the deployment small. A higher-volume deployment should put multiple single-process replicas behind a load balancer or move analysis into worker threads. Request bodies are bounded before concatenation, and no upload is written to disk.

The container runs unprivileged and supports a read-only root filesystem. `GET /health` checks actual model and SIMD initialization, not merely process liveness.
