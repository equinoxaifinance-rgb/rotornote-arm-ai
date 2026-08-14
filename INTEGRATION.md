# Machine integration

RotorNote works alongside an accelerometer/DAQ gateway and a maintenance system:

```text
machine → calibrated sensors → gateway CSV → RotorNote → evidence/note → CMMS + qualified review
```

It never writes to a PLC or triggers shutdown.

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

The response contains the decision, channel quality, supported-class distribution, envelope coverage, FP32/INT8 agreement, acquisition context, and a deterministic evidence passport. Store that passport beside the work order; do not treat it as a cryptographic signature or maintenance authorization.

## Variable-speed anomaly route

`POST /api/anomaly?engine=optimized` is the explicit one-channel route for clients that do not want automatic routing. It accepts one uniaxial `text/csv` channel with 2,048-131,072 samples. Send `X-Sample-Rate` and a positive `X-Operating-RPM`. The response is limited to `healthy`, `anomaly`, or `review_required`, includes FP32/INT8 agreement and fitted-envelope status, and does not identify a fault family or severity. Multi-sensor payloads and missing RPM fail closed with structured 422 responses.

It selects `variable_speed_anomaly` for one-channel evidence and `four_sensor_specialist` for four synchronized channels, returns the selected route explicitly, and emits the same deterministic analysis-passport contract from either model. Route selection depends only on the validated sensor contract; it never promotes a broad anomaly into a named fault. `POST /api/analyze` remains the explicit specialist route; its single-channel behavior is retained only as a documented ablation and is not the canonical one-channel product path.
