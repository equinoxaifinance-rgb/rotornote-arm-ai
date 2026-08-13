# Machine integration

RotorNote's tested boundary is a vibration recording, not a machine-control bus. A field installation keeps acquisition and control separate:

```text
machine bearing housing
  -> mounted accelerometer
  -> calibrated acquisition device / Arm64 gateway
  -> RotorNote HTTPS API
  -> screen + abstention + evidence receipt
  -> qualified human review and controlled retest
```

RotorNote never writes to a PLC and must not trigger a shutdown. The initial deployment role is advisory screening.

## Reference gateway

The included gateway converts an existing sensor CSV into a contextualized API request:

```bash
npm run gateway -- \
  --url https://rotornote.example \
  --file capture.csv \
  --machine pump-7 \
  --point drive-end-bearing \
  --axis radial-horizontal \
  --rate 1024 \
  --rpm 1800 \
  --load 74
```

Remote endpoints must use HTTPS; plaintext HTTP is permitted only for localhost testing. The gateway has bounded timeouts and retry behavior. Its full path is covered by a test that starts the real service, sends the bundled shift-change recording, and verifies machine context, dual-engine agreement, and the returned evidence ID.

## Direct API contract

`POST /api/analyze?engine=optimized` with `Content-Type: text/csv` and these headers:

| Header | Required | Bounds |
|---|---|---|
| `X-Sample-Rate` | Yes in field use | 256–5,000 Hz |
| `X-Machine-Id` | Yes in field use | 1–64 safe identifier characters |
| `X-Measurement-Point` | Recommended | 1–64 characters |
| `X-Sensor-Axis` | Recommended | axial, radial-horizontal, radial-vertical, or unknown |
| `X-Operating-RPM` | Recommended | 0–120,000 |
| `X-Load-Percent` | Recommended | 0–100 |

The response carries the captured context, signal-quality assessment, calibration-envelope coverage, FP32/INT8 label agreement, and an analysis passport hashing the input, configuration, model artifacts, and deterministic decision output.

## Acquisition requirements

Before treating a capture as comparable, record the sensor, calibration date, units, mount, axis, measurement point, sample rate, machine speed, load, and operating state. Use the same configuration for the retest. RotorNote accepts raw amplitude units but does not convert or infer units; a field program must define them explicitly at acquisition.

The software currently accepts batches of 2,048–131,072 samples. Continuous installations should let the acquisition gateway create bounded recordings and send them on an interval. High-volume deployment also needs authentication, device identity, rate limiting, encrypted storage policy if retention is added, and tenant isolation.

