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

The primary Arm workload is a fitted-unit-pruned 48->253->126->8 ReLU MLP with
45,030 multiply-accumulates per inference. It uses 2,925 real CC BY UPATRAS
signals spanning 39 complete physical measurement sequences and 75 speeds.
Its representation preserves all eight observed laboratory conditions, while
the product collapses them to healthy, anomaly, or review. Four-fold validation
holds out whole sequences and observes 99.8% eight-condition balanced accuracy,
100% broad anomaly balanced accuracy, and 39/39 sequence accuracy (Wilson 95%:
91.0%-100%).

SIMD-row-padded INT8 reduces learned bytes from 181,668 to 46,972 (74.14%)
while preserving 100% eight-condition label agreement over the complete signal
bank. The frozen native Arm64 run measures a 1.2737x paired median with a
[1.2718, 1.2749] deterministic bootstrap 95% interval over 51
alternating-order samples of 1,024 inferences. This materially nonlinear head,
not the tiny specialist, is the optimization headline.

The secondary four-fault specialist is a transparent 48->4 linear model over
four sensors. It is only a 192-MAC micro-workload, so its 3.2x-3.4x native band
is disclosed separately and not presented as the primary proof of practical
payoff. Its five-fold whole-test validation records 94.0% four-channel balanced
accuracy and 19/20 physical tests (Wilson 95%: 76.4%-99.1%). One complete
misalignment test—test 10—was predicted healthy; the receipt preserves that
failure and RotorNote makes no blanket misalignment-sensitivity claim.

Production training contains no generated fault signals. A separate CC BY
bearing dataset attacks cross-rig behavior: all four foreign records abstain,
and no bearing capability is claimed. A nested audit did not establish a
calibrated selective-accuracy claim, so the confidence floors remain
conservative engineering rules rather than field probabilities.

RotorNote exposes its deterministic compiler, parity gate, utilization report,
and layer-count-independent WASM memory planner as a reusable developer kit.
The exact native workflow rebuilds the bytes, executes 33 product tests,
validates 65 required artifacts, scans for secrets, and exercises a
non-multiple-of-16 model through the actual SIMD kernel. Independent pinned
Syft, Grype, and npm-registry jobs cross-check the in-repo SBOM and scanner.

RotorNote is useful now as a local, zero-runtime-dependency screening companion
to DAQ gateways, CMMS notes, and qualified analysts. It is not certified, not a
safety controller, and not a diagnosis.
