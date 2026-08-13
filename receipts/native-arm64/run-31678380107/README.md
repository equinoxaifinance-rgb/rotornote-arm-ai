# Native Arm64 receipt — run 31678380107

- Workflow: https://github.com/equinoxaifinance-rgb/rotornote-arm-ai/actions/runs/31678380107
- Measured commit: `3cc999a512cdd585ccba326bcbfd65781bf435f9`
- Runner evidence: `aarch64`, Linux, Node v22.18.0, four CPUs
- GitHub artifact digest: `sha256:225dad3a9485f78efdc0a0b347954d1ae76a0ca2c51c8c0dc1fe56ff839f9c4b`
- Downloaded ZIP SHA-256: `225dad3a9485f78efdc0a0b347954d1ae76a0ca2c51c8c0dc1fe56ff839f9c4b`
- Native tests: 21 passed, 0 failed

Primary result: 95.5562 ms FP32 median versus 76.9482 ms INT8/WASM-SIMD median per 1,024-inference batch, or 1.2418× speedup. The correctness gate recorded 100% label agreement and maximum probability delta `0.00037575424676650204`.

`benchmark/results/native-arm64.json` contains all 25 timing samples per engine. The preserved ZIP is the exact browser-downloaded workflow artifact; its hash independently matches the digest shown by GitHub.

