# RotorNote submission copy — draft

RotorNote turns real vibration recordings into an Arm-optimized first-pass
machine screen, a retest instruction, and a hash-bound evidence object that can
travel into a maintenance workflow.

One channel enters the broad variable-speed anomaly head. Four synchronized
channels unlock the narrower fault-family specialist. The canonical
`POST /api/screen` route selects that contract from the evidence actually
provided; it never turns an anomaly-only result into a field fault diagnosis.
Both paths run FP32 and INT8 engines, enforce signal quality and fitted-envelope
checks, and refuse a conclusion on uncertainty or disagreement.

The primary Arm workload is a fitted-unit-pruned 96->609->326->120->8 ReLU MLP with
297,078 multiply-accumulates per inference. It uses 2,925 real CC BY UPATRAS
signals spanning 39 complete physical measurement sequences and 75 speeds.
Its representation preserves all eight observed laboratory conditions, while
the product collapses them to healthy, anomaly, or review. Four-fold validation
holds out whole sequences and observes 99.8% eight-condition balanced accuracy,
100% broad anomaly balanced accuracy, and 39/39 sequence accuracy (Wilson 95%:
91.0%-100%).

SIMD-row-padded INT8 reduces learned bytes from 1,192,564 to 307,484 (74.22%)
while preserving 100% eight-condition label agreement over the complete signal
bank. The exact-commit native Arm64 workflow rebuilds and measures this graph;
local x64 timing is not promoted into an Arm claim. The same native receipt
reports full throughput and paired uncertainty for both this materially
nonlinear head and the 192-MAC specialist. The latter remains explicitly
call-overhead sensitive and is not presented as equivalent compute work.

The secondary four-fault specialist is a transparent 48->4 linear model over
four sensors. Its five-fold whole-test validation records 94.0% four-channel balanced
accuracy and 19/20 physical tests (Wilson 95%: 76.4%-99.1%). One complete
misalignment test—test 10—was predicted healthy; the receipt preserves that
failure and RotorNote makes no blanket misalignment-sensitivity claim.

Production training contains no generated fault signals. Two complete,
SHA-256-pinned CC BY seeded-fault datasets attack cross-rig behavior through the
canonical one-channel route: all 28 axial records and all 245 Zhenjiang RPM
challenges return `review_required`. A third public NASA source adds three
natural run-to-failure experiments, 12 bearing installations, 16 sensor trajectories,
and 112 predeclared sensor cases. Every case—including all endpoint channels on
the four documented failed bearings—returns `review_required`, with zero
uncontained engine disagreements. This is natural-failure abstention evidence,
not a sensitivity claim. A nested audit did not establish a
calibrated selective-accuracy claim, so the confidence floors remain
conservative engineering rules rather than field probabilities.
The result UI therefore exposes the complete observed grouped risk/coverage
curve at the decision surface, including the current operating point and the
failed nested-calibration status, rather than leaving a bare confidence score
for the operator to overinterpret.

RotorNote exposes its deterministic compiler, parity gate, utilization report,
and layer-count-independent WASM memory planner as a working developer kit.
The local UI calls `POST /api/compile` and downloads the emitted FP32 and INT8
artifacts rather than presenting a static code example.
The exact native workflow rebuilds the bytes, executes the complete product suite,
validates the required artifact set, scans for secrets, and exercises a
non-multiple-of-16 model through the actual SIMD kernel. Independent pinned
Syft, Grype, and npm-registry jobs cross-check the in-repo SBOM and scanner.

RotorNote is useful now as a local, zero-runtime-dependency screening companion
to DAQ gateways, CMMS notes, and qualified analysts. It is not certified, not a
safety controller, and not a diagnosis.
