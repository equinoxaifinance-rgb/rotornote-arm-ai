# Native Arm64 receipt

- Workflow: https://github.com/equinoxaifinance-rgb/rotornote-arm-ai/actions/runs/31674256739
- Measured commit: `99bc32463ed65c5221c036f71cf6d189a8dfed85`
- Runner architecture: `aarch64` / Node `v22.18.0`
- GitHub artifact digest: `sha256:db7d4a4a5ce3cf202fe36f93acf0decd26b28ecf6b01acebfc85060ac2ba4273`

`rotornote-native.zip` is the unmodified artifact downloaded from GitHub. Its
SHA-256 matches the digest displayed on the workflow page. The adjacent files
are its extracted contents for judge readability.

Primary result: 94.9591 ms FP32 median versus 76.2218 ms INT8/WASM-SIMD median
per 1,024-inference batch, or 1.2458× speedup, with 100% label agreement and
maximum probability delta 0.000375754.
