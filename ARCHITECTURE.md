# Architecture

```text
four synchronized CSV channels + RPM (one channel abstains)
  → bounded parser and acquisition-context validation
  → 8,192-sample windows (50% overlap)
  → 16 shaft-order + 16 log-band + 16 time/spectral features
  → standard scaling
  → FP32 48×4 linear classifier
       ↕ exact alternate-engine witness
    dynamic-input/per-output-weight INT8 WASM SIMD
  → per-channel quality and real-training-envelope checks
  → mean four-channel recording feature representation
  → screen or review_required
  → evidence JSON + maintenance note
```

`src/csv.js` is the untrusted-input boundary. `src/analyze.js` is the decision boundary. `src/model.js` hash-verifies artifacts and owns both inference engines. `src/server.js` exposes the static interface, samples, health endpoint, and analysis API. The browser contains no second classifier.

The model is a fixed linear discriminant specification with a 1e-8 numerical covariance ridge, selected through grouped experiments and then refit on all real training tests. It consumes the mean 48-feature representation from four synchronized sensors and five windows per sensor. The feature extractor uses operating RPM to represent 0.5×–15× shaft orders plus broadband/time statistics. Missing RPM forces review.

FP32 stores 192 weights plus four biases. INT8 uses dynamic symmetric input scaling and one symmetric scale per output row; biases remain FP32. Build-time parity is measured over all 2,000 real four-channel recording representations and gates the production decision path. The WASM kernel performs signed vector dot accumulation; JavaScript applies scales, bias, and softmax.

The server runs as one unprivileged Node 22 process with no production npm dependencies. Uploads are bounded and processed in memory. A high-volume deployment should use authenticated gateways and multiple replicas or worker threads; RotorNote never writes to a PLC.

## Variable-speed anomaly lane

```text
one 3,500-sample uniaxial signal + RPM
  -> two deterministic 2,048-sample windows
  -> mean 48-feature representation
  -> standard scaling
  -> FP32 48->253->126->8 ReLU MLP (five inactive fitted units pruned)
  -> collapse eight observed laboratory-condition probabilities to healthy | anomaly
       <-> exact alternate-engine witness
     dynamic-input/per-output-weight INT8 WASM SIMD
  -> training-envelope + confidence + engine-agreement gates
  -> healthy | anomaly | review_required
```

This second head deliberately answers a broader but shallower question. It was trained on 2,925 real UPATRAS speed signals across 39 complete physical measurement sequences. Four-fold validation holds out whole sequences, so neither another speed nor another window from a held sequence can leak into training. It never maps those states onto RotorNote's four fault-family labels and never estimates severity.

`POST /api/screen` makes the two heads one bounded cascade. A single uniaxial capture routes to the broad variable-speed screen. Four synchronized channels route to the specialist. Both paths run FP32 and INT8 witnesses, apply their own training envelope, and emit a hash-bound analysis passport; the server returns the chosen route so no consumer has to infer which claim was made.
