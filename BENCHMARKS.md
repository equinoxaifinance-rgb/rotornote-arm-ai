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
npm run benchmark -- --output benchmark/results/local-x64.json --repetitions 15 --batch 512
```

Each engine receives four warmup batches. Recorded batches alternate engine order to reduce drift bias. Timing uses `process.hrtime.bigint()`. The JSON contains every raw duration and checksum, median and p95 latency, median throughput, model/kernel hashes, Node version, CPU description, architecture, batch size, and evidence class.

The benchmark isolates model inference. FFT and CSV parsing are deliberately excluded because they are identical across engines; the product API separately returns end-to-end and inference timing for practical observation.

## Native Arm64 gate

Run **Native Arm64 evidence** in GitHub Actions. The workflow:

1. selects `ubuntu-24.04-arm`;
2. fails unless `uname -m` is exactly `aarch64`;
3. captures `uname`, `lscpu`, Node, tests, raw benchmark JSON, console summaries, and artifact hashes;
4. rebuilds generated files and fails on a diff;
5. uploads one 90-day evidence artifact.

Exact command:

```bash
npm run benchmark -- --output benchmark/results/native-arm64.json --repetitions 25 --batch 1024
```

## Current evidence state

| Claim/state | Status | Receipt |
|---|---|---|
| Generated FP32/INT8 artifacts and byte reduction | implemented and locally verified | `model/model.json`, local hashes |
| Unit/integration/hostile/failure/retry tests on x64 | locally tested | `receipts/LOCAL-VALIDATION.md` |
| Deterministic benchmark harness on x64 | locally run; not Arm evidence | `benchmark/results/local-x64.json` |
| Native Arm64 tests and benchmark | **PENDING GATE** | requires a successful workflow artifact |
| Live Arm cloud deployment | **PENDING GATE** | requires a deployed URL and health receipt |

Do not copy local x64 timing into a native-Arm claim. When the action succeeds, download the artifact, verify its SHA-256, commit or link the unedited `native-arm64.json`, and update this table with the workflow run URL and commit SHA.

## Interpreting results

Model byte reduction is deterministic: compare the recorded `bytes` fields. Speed is environment-dependent; use medians for the primary comparison and inspect all raw samples for jitter. A speedup below 1.0 is a valid result, not a harness failure. Energy is not measured, so RotorNote makes no energy claim.
