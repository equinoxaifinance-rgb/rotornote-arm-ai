# Native Arm64 receipt 31703346390

This directory preserves the raw GitHub Actions artifact for commit
`c740ee98dcb54a65c66ed6a3c6c5b04a5a11f912` and workflow run
<https://github.com/equinoxaifinance-rgb/rotornote-arm-ai/actions/runs/31703346390>.

- Runner: Linux `aarch64`, Node 22.18.0
- Product tests: 33/33 passing
- Linear head: 3.2637x paired median, deterministic bootstrap 95% interval
  [3.2333, 3.2965], 100% label agreement
- Variable-speed head: 1.2737x paired median, deterministic bootstrap 95%
  interval [1.2718, 1.2749], 100% eight-condition label agreement
- Arm ISA witness: scalar and NEON results exactly equal; `vdotq_s32` median
  speedup 16.3456x
- Downloaded artifact ZIP SHA-256:
  `28b4614fb6ec8f6c69f2531116ce2af9fd6333774c18581cbaa34aa794a015b2`

The JSON and text files are authoritative. These are workload-specific
measurements, not universal device, energy, or fleet claims.
