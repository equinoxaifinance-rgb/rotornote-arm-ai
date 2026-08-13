# Benchmarks and evidence gates

RotorNote compares executable implementations of the same learned workload:

- **baseline:** Float32 weights and scalar JavaScript dense loops;
- **optimized:** symmetric INT8 weights/activations and a WebAssembly SIMD dense kernel.

The feature vectors, network shape, test order, and outputs are held constant. The harness validates predicted-label agreement and records the maximum probability delta before reporting timing.

## Reproduce locally

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run build
npm test
npm run benchmark -- --output benchmark/results/local-x64.json --repetitions 51 --batch 2048 --warmups 16
```

The native protocol uses sixteen warmup batches. Fifty-one paired samples alternate engine order to reduce drift bias. Timing uses `process.hrtime.bigint()`. The JSON contains every raw duration and checksum, median and p95 latency, median throughput, a deterministic 10,000-resample 95% bootstrap interval for the paired median speedup, model/kernel hashes, Node version, CPU description, architecture, batch size, and evidence class.

The benchmark isolates model inference. FFT and CSV parsing are deliberately excluded because they are identical across engines; the product API separately returns end-to-end and inference timing for practical observation.

## Native Arm64 gate

Run **Native Arm64 evidence** in GitHub Actions. The workflow:

1. selects `ubuntu-24.04-arm`;
2. fails unless `uname -m` is exactly `aarch64`;
3. captures `uname`, `lscpu`, Node, tests, raw benchmark JSON, console summaries, and artifact hashes;
4. rebuilds generated files and fails on a diff;
5. compiles and runs an Armv8.2 NEON `vdotq_s32` microkernel against an exact scalar INT8 witness;
6. uploads one 90-day evidence artifact.

Exact command:

```bash
npm run benchmark -- --output benchmark/results/native-arm64.json --repetitions 51 --batch 2048 --warmups 16
```

## Current evidence state

| Claim/state | Status | Receipt |
|---|---|---|
| Generated FP32/INT8 artifacts and byte reduction | implemented and locally verified | `model/model.json`, local hashes |
| Unit/integration/hostile/failure/retry tests on x64 | locally tested | `receipts/LOCAL-VALIDATION.md` |
| Deterministic benchmark harness on x64 | locally run; not Arm evidence | `benchmark/results/local-x64.json` |
| Native Arm64 tests, full benchmark and Arm dot-product proof | **VERIFIED** | [run 31681199791](https://github.com/equinoxaifinance-rgb/rotornote-arm-ai/actions/runs/31681199791), `receipts/native-arm64/run-31681199791/` |
| Experimental cross-domain fail-closed probe | **VERIFIED** | `field/results/cwru-cross-domain.json` |
| Grouped real-data bearing/healthy validation | **LOCALLY EXECUTED; CI PENDING CURRENT COMMIT** | `field/results/cwru-grouped-validation.json` |
| Live Arm cloud deployment | **PENDING GATE** | requires a deployed URL and health receipt |

The verified GitHub artifact SHA-256 is `614a480387f264073f349ea9395e1bbf2d9453f7bddf61d91c0a0367a03de500`. On commit `a8bce54`, the four-vCPU native Arm64 runner recorded 190.8924 ms FP32 and 152.8758 ms INT8/WASM-SIMD medians per 2,048-inference batch: **1.2487×**. Fifty-one alternating-order paired samples produced a **1.2442–1.2519** bootstrap 95% interval for the paired median, with 74.3669% fewer weight bytes and 100% label agreement. The production claim leads with the byte reduction; this measured compute gain is real but modest. The separate Armv8.2 NEON `vdotq_s32` proof exactly matched scalar INT8 and measured **17.4637×** for its core dot product. Raw samples and the 21/21 native test receipt are preserved in the receipt directory.

## Interpreting results

Model byte reduction is deterministic: compare the recorded `bytes` fields. Speed is environment-dependent; inspect raw samples and the paired confidence interval rather than treating one median ratio as certainty. The native release gate now requires the 95% interval's lower endpoint to exceed 1.0. Energy is not measured, so RotorNote makes no energy claim.
