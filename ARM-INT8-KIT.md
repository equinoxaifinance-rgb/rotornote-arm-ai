# Reusable Arm INT8 kit

RotorNote's optimized inference path is a reusable dense-ReLU compiler plus a
layer-count-independent runtime. It is deliberately small: no production npm
dependencies, no generated native addon, and no hidden calibration service.
The same compiler that produces RotorNote's variable-speed model is checked
against the production artifacts on every build.

## What it compiles

The input contract is JSON with:

- `format: "rotornote-dense-compile-input-v1"`
- `architecture`: positive integer layer sizes, for example `[48, 256, 128, 2]`; the runtime zero-pads SIMD input tails, so layer widths need not be multiples of 16
- `layers`: output-row-major weights and one bias per output
- `calibrationRows`: already-normalized representative vectors
- optional `labels` and stricter `parity` limits

The compiler creates deterministic FP32 and symmetric row-wise INT8 weight
artifacts, a hash-bound manifest, calibration-bank label agreement and
probability-delta receipts, hidden-unit utilization, parameter count, and
multiply-accumulate count. Compilation fails closed on malformed shapes or on
an INT8 parity miss. Calibration is a numerical-equivalence gate; it is not a
substitute for grouped model validation.

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run compile:dense -- --input ./my-model.json --output ./compiled-model
```

`src/dense-compiler.js` is also importable for a build pipeline. The runtime in
`src/model.js` allocates its WASM memory plan from the compiled layer
descriptors, so supported dense stacks are not hard-coded to RotorNote's layer
count. The SIMD kernel is `kernel/dense.wat`; the native Arm receipt separately
proves the equivalent Armv8.2-A `vdotq_s32` instruction path.

## Evidence boundary

The kit optimizes dense ReLU inference. It does not decide whether a model is
scientifically valid, choose a safe operating threshold, or certify a product.
Bring grouped validation that matches the independence boundary of your own
data, and keep that receipt separate from numerical parity and speed results.
