# Machine integration

RotorNote works alongside an accelerometer/DAQ gateway and a maintenance system:

```text
machine → calibrated sensors → gateway CSV → RotorNote → evidence/note → CMMS + qualified review
```

It never writes to a PLC or triggers shutdown.

## CSV contract

- One channel: `amplitude` or `timestamp,amplitude`
- Four synchronized channels: `ch1,ch2,ch3,ch4` or `timestamp,ch1,ch2,ch3,ch4`
- 8,192–131,072 rows per channel, 256–100,000 Hz, finite amplitudes within ±1,000, maximum body 8 MiB

Four channels are the validated aggregation path. One channel remains useful for triage but has lower grouped evidence.

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

`POST /api/analyze?engine=optimized` accepts `text/csv`. Field clients should send `X-Sample-Rate`, `X-Machine-Id`, `X-Measurement-Point`, `X-Sensor-Axis`, `X-Operating-RPM`, and `X-Load-Percent`. Repeat captures must preserve sensor, units, calibration, mount, point, axis, rate, speed, load, and operating state.

The response contains the decision, channel quality, supported-class distribution, envelope coverage, FP32/INT8 agreement, acquisition context, and a deterministic evidence passport. Store that passport beside the work order; do not treat it as a cryptographic signature or maintenance authorization.
