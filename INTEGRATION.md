# Machine integration

RotorNote works alongside an accelerometer/DAQ gateway and a maintenance system:

```text
machine → calibrated sensors → gateway CSV → RotorNote → evidence/note → CMMS + qualified review
```

It never writes to a PLC or triggers shutdown.

The executable reference path now continues beyond a copied note: every canonical screen emits an evidence-bound advisory work order, and the optional delivery adapter sends its canonical JSON to a CMMS webhook with HMAC authentication, bounded retries, and an evidence-derived idempotency key.

The separate `POST /api/compile` JSON route is a developer tool, not a machine
decision route. It creates deterministic FP32 and INT8 dense-ReLU artifacts
under strict shape, size, and parity bounds; see `ARM-INT8-KIT.md`.

## CSV contract

- One channel: `amplitude` or `timestamp,amplitude`
- Four synchronized channels: `ch1,ch2,ch3,ch4` or `timestamp,ch1,ch2,ch3,ch4`
- 8,192–131,072 rows per channel, 256–100,000 Hz, finite amplitudes within ±1,000, maximum body 8 MiB

One channel enters the validated variable-speed anomaly head. Four synchronized channels enter the narrower fault-family specialist. Unsupported channel counts fail closed.

## Reference gateway

```bash
npm run gateway -- \
  --url https://rotornote.example \
  --file capture.csv \
  --machine pump-7 \
  --point drive-end-bearing \
  --axis radial-horizontal \
  --rate 25000 \
  --rpm 1238 \
  --load 74
```

Remote endpoints require HTTPS; localhost may use HTTP. The gateway has bounded timeout and retry behavior and is exercised against the real service in tests.

`POST /api/screen?engine=optimized` is the canonical `text/csv` product boundary and the reference gateway uses it. Field clients should send `X-Sample-Rate`, `X-Machine-Id`, `X-Measurement-Point`, `X-Sensor-Axis`, `X-Operating-RPM`, and `X-Load-Percent`. Repeat captures must preserve sensor, units, calibration, mount, point, axis, rate, speed, load, and operating state.

The response contains the decision, channel quality, supported-class distribution, envelope coverage, FP32/INT8 agreement, acquisition context, a deterministic evidence passport, and a deterministic `rotornote.cmms-work-order.v1` export. The work order requests qualified review; it never authorizes a shutdown or asserts a diagnosis.

## Signed CMMS delivery

`integrations/cmms-delivery.mjs` sends the canonical work-order JSON to an HTTPS webhook. It signs the exact body with HMAC-SHA256, binds retries to `externalId` through the `Idempotency-Key` header, retries only transient responses, and rejects short secrets. A receiver verifies `X-RotorNote-Signature` before parsing or accepting the body.

```bash
npm run proof:maintenance-loop
```

That proof starts the real RotorNote server and a reference CMMS receiver on loopback, screens the attributed imbalance capture through `/api/screen`, accepts the signed work order once, deduplicates a replay, and returns 401 for a tampered body. The native Arm workflow reruns it and uploads `maintenance-loop.json`. This proves the integration contract and its failure paths; it does not imply endorsement or compatibility certification from a commercial CMMS vendor.

## Variable-speed anomaly route

`POST /api/anomaly?engine=optimized` is the explicit one-channel route for clients that do not want automatic routing. It accepts one uniaxial `text/csv` channel with 2,048-131,072 samples. Send `X-Sample-Rate` and a positive `X-Operating-RPM`. The response is limited to `healthy`, `anomaly`, or `review_required`, includes FP32/INT8 agreement and fitted-envelope status, and does not identify a fault family or severity. Multi-sensor payloads and missing RPM fail closed with structured 422 responses.

It selects `variable_speed_anomaly` for one-channel evidence and `four_sensor_specialist` for four synchronized channels, returns the selected route explicitly, and emits the same deterministic analysis-passport contract from either model. Route selection depends only on the validated sensor contract; it never promotes a broad anomaly into a named fault. `POST /api/analyze` remains the explicit specialist route; its single-channel behavior is retained only as a documented ablation and is not the canonical one-channel product path.
