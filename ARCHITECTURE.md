# Architecture

```text
one or four synchronized CSV channels + RPM
  → bounded parser and acquisition-context validation
  → 8,192-sample windows (50% overlap)
  → 16 shaft-order + 16 log-band + 16 time/spectral features
  → standard scaling
  → FP32 48×4 linear classifier
       ↕ exact alternate-engine witness
    dynamic-input/per-output-weight INT8 WASM SIMD
  → per-channel quality and real-training-envelope checks
  → four-channel probability aggregation when supplied
  → screen or review_required
  → evidence JSON + maintenance note
```

`src/csv.js` is the untrusted-input boundary. `src/analyze.js` is the decision boundary. `src/model.js` hash-verifies artifacts and owns both inference engines. `src/server.js` exposes the static interface, samples, health endpoint, and analysis API. The browser contains no second classifier.

The model is a fixed multinomial logistic specification selected before grouped cross-validation, then refit on all real training tests. The feature extractor uses operating RPM to represent 0.5×–15× shaft orders plus broadband/time statistics. Missing RPM forces review.

FP32 stores 192 weights plus four biases. INT8 uses dynamic symmetric input scaling and one symmetric scale per output row; biases remain FP32. Build-time parity is measured over all 40,000 real windows and gates both window and four-channel recording decisions. The WASM kernel performs signed vector dot accumulation; JavaScript applies scales, bias, and softmax.

The server runs as one unprivileged Node 22 process with no production npm dependencies. Uploads are bounded and processed in memory. A high-volume deployment should use authenticated gateways and multiple replicas or worker threads; RotorNote never writes to a PLC.
