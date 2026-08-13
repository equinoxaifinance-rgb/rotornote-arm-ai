# RotorNote judge path

This is the shortest honest route through the working product and its Arm evidence. It takes about two minutes and requires no account or API key.

## 1. Run the product

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run build
npm test
npm start
```

Open `http://127.0.0.1:8787`.

## 2. Exercise both model contracts

1. Click **Run held-sequence demo**. This executes the real one-channel, 45,030-MAC variable-speed neural head through INT8 WASM SIMD and independently witnesses the broad answer with FP32.
2. Select **Real imbalance**, then **Screen recording**. This executes the narrower four-sensor specialist, exposes the retest instruction, and enables the evidence JSON and maintenance-note actions.
3. Upload a malformed, flatlined, or unsupported capture. RotorNote returns a bounded error or `review_required`; it does not manufacture a diagnosis.

The displayed percentages are uncalibrated model scores, not real-world failure probabilities. The product says so at the decision surface.

## 3. Inspect the exact Arm receipts

- [Native Arm64 workflow](https://github.com/equinoxaifinance-rgb/rotornote-arm-ai/actions/workflows/native-arm64.yml): rebuild, 33 tests, deterministic validation, secret scan, two alternating-order benchmarks, exact NEON dot-product witness, and a hardened native-Arm container run through both public HTTP routes.
- [External boundary workflow](https://github.com/equinoxaifinance-rgb/rotornote-arm-ai/actions/workflows/external-boundary.yml): downloads and hash-verifies the complete 28-record CC BY bearing archive, then runs every record through the canonical one-channel boundary.
- [Independent supply-chain workflow](https://github.com/equinoxaifinance-rgb/rotornote-arm-ai/actions/workflows/independent-supply-chain.yml): Syft SPDX, Grype, and npm registry audit. Every third-party action reference is pinned to a full commit SHA.

## 4. Read the boundaries before the claims

- `MODEL-CARD.md`: model scope, grouped validation, failure disclosure, score caveat.
- `BENCHMARKS.md`: workload-specific timing and artifact reductions.
- `FIELD-VALIDATION.md`: what is not yet field-proven and the prospective pilot protocol.
- `field/results/axial-bearing-boundary.json`: all 28 foreign-rig results, including the two contained FP32/INT8 disagreements.

RotorNote is a real local screening companion and reusable Arm INT8 developer kit. It is not a shutdown controller, field diagnosis, calibrated risk model, or certification.
