# Security and responsible-use notes

## Trust boundaries

RotorNote is a public, unauthenticated screening demo. There is intentionally no user account or privileged route in the core judge path. Its authorization boundary is therefore simple: every exposed operation is read-only except in-memory analysis, and no operation changes server state or launches a process.

Untrusted inputs are the URL, headers, and CSV body. Static routes and sample IDs use fixed allowlists; they are never joined from a request path. Analysis accepts only `text/csv`, only the `baseline` or `optimized` engine, and bounded numeric values.

## Controls

- Body bytes are rejected above 8 MiB using both declared length and streaming counts.
- Sample counts are capped at 131,072 per channel; the minimum is 8,192.
- Rates are limited to 256–100,000 Hz; amplitudes must be finite and within ±1,000.
- Two-column timestamps must increase strictly; changing column counts are rejected.
- Model artifacts are SHA-256 verified before either engine becomes available.
- Every API decision is witnessed by the alternate engine and receives an analysis passport binding input, context, configuration, model and output hashes.
- Machine-context headers use bounded values and strict allowlists where applicable.
- Dependency failure yields a generic request ID and retry contract, not a filesystem path or stack trace.
- CSP, frame denial, MIME sniffing denial, same-origin opener, and no-referrer headers ship on responses.
- Uploads remain in process memory and are neither logged nor persisted.
- The container uses a non-root user; `compose.yaml` adds a read-only filesystem and `no-new-privileges`.
- The production server has zero third-party npm dependencies. `wabt` is build-only and locked.
- A deterministic SPDX 2.3 SBOM and source/artifact build manifest ship with the repository.

## Availability

FFT and inference are CPU work. Size/sample caps bound one request but do not replace edge rate limiting. A public deployment should add per-IP rate limits, request timeouts, TLS, concurrency isolation, and resource quotas at the load balancer or container platform. Because the demo has no identity boundary, adding stored recordings or team history would require authentication, tenant isolation, retention controls, and deletion routes first.

## Model limitations

The training data contains real experimental vibration from one documented laboratory rig; it is not a certified or multi-machine field dataset. A high score does not prove a component fault; mounting, sensor orientation, speed, load, aliasing, and unrelated impacts can change the pattern. The interface uses “resembles,” provides a controlled retest, and tells users to involve a qualified technician. RotorNote must not trigger automatic shutdowns or replace a safety program.

Signal-quality and calibration-envelope abstention reduce one class of misuse; they do not establish field accuracy. `FIELD-VALIDATION.md` defines the independent evidence required before stronger claims.

## Supply chain and secrets

`package-lock.json` pins the build dependency. No credential is required or read. `npm run secret-scan` checks common private-key, AWS, GitHub, OpenAI, and Slack signatures while excluding generated binary/dependency directories. CI should also enable dependency review and code scanning when the repository is published.

Dependency licenses:

- RotorNote source and original generated assets: MIT (`LICENSE`).
- `wabt` 1.0.37 build tool: Apache-2.0, as declared in its locked npm package metadata.

Report a vulnerability privately to the repository owner before opening a public issue. Rotate and remove any accidentally committed credential immediately; history rewriting alone does not revoke it.

## Second-model boundary

The variable-speed anomaly head has independent FP32 and INT8 hashes and must load before readiness. Its endpoint requires a positive RPM, rejects multi-sensor misuse, checks the fitted training envelope, witnesses every answer through both engines, and cannot return a fault family or severity. Its second laboratory rig broadens the measured speed range but is not multi-machine field evidence.
