# Native Arm64 receipt — run 31680834809

- Workflow: https://github.com/equinoxaifinance-rgb/rotornote-arm-ai/actions/runs/31680834809
- Source commit: `fc5549198d979c3be0a1a670e99884bdf34b0f52`
- GitHub artifact digest: `sha256:ef664f1c5e16d13c6bb7cb13481889e4a80951e0c1eaecf81b1769f868b109ac`
- Downloaded artifact SHA-256: `ef664f1c5e16d13c6bb7cb13481889e4a80951e0c1eaecf81b1769f868b109ac`

The native four-vCPU Neoverse-N2 runner recorded 192.9697 ms FP32 and 156.6625 ms INT8/WASM-SIMD medians per 2,048-inference batch: **1.2318×** ratio. Fifty-one alternating-order paired samples produced a **1.2311–1.2344** deterministic bootstrap 95% interval for the paired median. The correctness gate recorded 100% label agreement and a maximum probability delta of `0.011563996290320289`.

The separate Armv8.2 dot-product proof compiled with `-march=armv8.2-a+dotprod`, executed NEON `vdotq_s32`, exactly matched the scalar INT8 result, and recorded 86.2268 ns versus 5.1028 ns medians across 31 trials: **16.8979×**. This is an architecture-specific dense-kernel ceiling receipt, not a substitute for the full portable-runtime timing above.

The exact downloaded zip, raw benchmark samples, model metadata, compiler/machine details, test output, and artifact hashes are preserved here.
