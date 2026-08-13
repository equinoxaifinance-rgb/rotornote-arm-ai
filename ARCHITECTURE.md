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

For API requests, the alternate inference engine witnesses every window. A decision is accepted only when FP32 and INT8 labels agree for every window, signal-quality checks pass, and at least 60% of windows remain inside the committed fitted envelope. Machine ID, measurement point, axis, RPM and load travel with the result. `src/evidence.js` then emits a deterministic hash passport for the input, configuration, model artifacts and decision output; it is intentionally described as a hash receipt rather than a signature.

The model is loaded once and hash-verified. Concurrent first requests share one promise. If loading fails, the promise is cleared, the API returns `503` with `Retry-After: 1`, and a later request retries—covered by an integration test.

## Learned workload

The input contains:

- 32 log-scaled spectral energy bands;
- RMS, peak, crest factor, kurtosis, skew, zero crossings, mean absolute amplitude, and impulse factor;
- spectral centroid, spread, 85% rolloff, dominant frequency/ratio, and three broad-band ratios.

The classifier is a random-feature ridge network: two seeded random ReLU projections (48→256→128) followed by a multiclass linear head (128→5) fitted with a regularized least-squares solve. The build forms the normal equations, applies ridge regularization, performs a Cholesky factorization, and solves one target system per class. The final weights are learned from all 900 training rows; they are not class centroids or hand-authored rules.

There are 225 disjoint ordinary validation simulations plus 300 unseen-seed stress simulations. Both include variable severity, sensor gain/bias, speed modulation, nuisance harmonics, and secondary-fault blending; the stress split increases those shifts. `scripts/build-model.js` contains the entire generator, split, fitting, calibration, quantization, and artifact writer—there is no hidden notebook or downloaded checkpoint.

The modeled classes are deliberately phrased as pattern resemblance, not a mechanical diagnosis. Simulation validation cannot establish field performance.

## Baseline and optimized engines

The baseline in `src/model.js` reads row-major Float32 weights and executes ordinary scalar JavaScript loops. It is intentionally clear and portable.

The optimized path uses symmetric, per-layer INT8 weight quantization and calibrated INT8 activations. Biases stay Float32. `kernel/dense.wat` loads 16 signed bytes at a time, sign-extends low and high halves, accumulates `i32x4.dot_i16x8_s`, and writes Int32 outputs. JavaScript applies scales, bias, ReLU, and requantization between layers. All layer input widths are multiples of 16; no padded bytes or tail branch can contaminate a dot product.

`scripts/build-kernel.js` compiles readable WAT to a 247-byte WebAssembly module with `wabt`. The production SIMD program is architecture-neutral bytecode; V8 compiles it for the host. Native Arm product benefit is therefore an empirical CI question. The workflow records native architecture before timing and requires the lower endpoint of a paired 95% bootstrap speedup interval to exceed 1.0.

`native/arm-dotprod-bench.c` is a separate, architecture-specific proof of the dense-operation ceiling. On a native runner it compiles with `-march=armv8.2-a+dotprod`, uses NEON `vdotq_s32`, checks exact equality against a scalar INT8 implementation, alternates execution order across 31 trials, and fails if the Arm dot-product median is not faster. This microkernel receipt proves the ISA path; it is not silently substituted for the portable production runtime.

Primary references for the dependency behavior:

- WebAssembly SIMD proposal and instruction semantics: <https://github.com/WebAssembly/simd>
- V8's official WebAssembly SIMD overview: <https://v8.dev/features/simd>

## Artifact integrity and reproducibility

`model/model.json` records the deterministic seed, normalization arrays, activation/weight scales, byte offsets, sizes, and SHA-256 hashes. Runtime refuses a changed FP32 or INT8 artifact. The same metadata records class centroids in normalized feature space and a 99.5th-percentile training-distance threshold. `src/quality.js` independently checks flatline, repeated saturation, DC bias and sample dropout. These gates reduce unjustified confidence but cannot substitute for field calibration.

`npm run build` recreates:

- `dist/dense.wasm`;
- both model binaries and metadata;
- three sensor samples;
- three gallery SVGs.

CI rebuilds and uses `git diff --exit-code` on those outputs before testing. This catches a generator/artifact mismatch.

## Operational shape

The server is a single Node 22 process with no production npm dependencies. Core analysis is CPU-bound and synchronous by design; this keeps the benchmark honest and the deployment small. A higher-volume deployment should put multiple single-process replicas behind a load balancer or move analysis into worker threads. Request bodies are bounded before concatenation, and no upload is written to disk.

The container runs unprivileged and supports a read-only root filesystem. `GET /health` checks actual model and SIMD initialization, not merely process liveness.
