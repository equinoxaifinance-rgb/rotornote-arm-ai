# RotorNote submission copy — draft

RotorNote turns real vibration recordings into an Arm-optimized first-pass machine screen, a retest instruction, and an evidence object that can travel into maintenance workflow.

The product screens four synchronized sensors. It derives order-aware and broadband features, runs the same 48→4 learned classifier through transparent FP32 JavaScript and INT8 WebAssembly SIMD engines, checks both engines plus signal quality and the fitted real-data envelope, then either reports one of four supported signatures or refuses the conclusion. One-channel input is accepted only as a fail-closed ablation.

Production training contains no generated fault signals. It uses a CC BY 4.0 mechanical-fault dataset with 20 independently reset physical tests and four accelerometers. Five-fold whole-test cross-validation records 94.0% four-channel balanced accuracy, an 85.5%–100% fold range, and 19/20 physical-test accuracy. Nested grouped calibration selects a 0.99 threshold without seeing each outer fold; those outer folds show 96.15% coverage at 95.84% accepted accuracy. A second CC BY bearing dataset attacks cross-rig behavior: all four foreign records abstain, and no bearing capability is claimed.

The optimized artifact reduces model weight bytes from 784 to 208 (73.47%). Across all 2,000 real four-channel recordings, INT8 preserves 100% of production labels with a 2.80e-10 p99 probability delta and a 0.01996 maximum delta. Native Arm throughput is measured and frozen again after every model change; the current receipt is linked from `BENCHMARKS.md` and the product UI.

RotorNote is useful now as a local, zero-runtime-dependency screening companion to DAQ gateways, CMMS notes, and qualified analysts. It is not certified, not a safety controller, and not a diagnosis.
