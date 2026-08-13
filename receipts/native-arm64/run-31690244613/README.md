# Current native Arm64 evidence

- Commit: `cb10849427e60b33483e24a4f1b105c25b939aa3`
- Workflow: https://github.com/equinoxaifinance-rgb/rotornote-arm-ai/actions/runs/31690244613
- Runner: native `aarch64`, Arm Neoverse-N2, Node 22.18.0
- Product benchmark: 3.1498× paired-median speedup; deterministic bootstrap 95% CI 3.1264×–3.1711×
- Throughput: 180,420.17 baseline vs 569,352.28 optimized median inferences/second
- Correctness: 100% label agreement on the benchmark bank; maximum probability delta 0.02013783
- NEON witness: exact scalar match; 16.4295× kernel-only median ratio (not the product throughput claim)
- Downloaded artifact SHA-256: `d253181f8b4e5afae9aba8774147c290f13d77c0d44854f0945c2eac7170432b`

The ZIP is preserved byte-for-byte beside this file. `artifact-sha256.txt` binds the shipped model, WebAssembly kernel, gallery, SBOM, lockfile, and benchmark receipt. This evidence supports only the defined workload on the recorded runner; it is not an energy or universal-device claim.
