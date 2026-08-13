# RotorNote submission copy — draft

RotorNote turns real vibration recordings into an Arm-optimized first-pass machine screen, a retest instruction, and an evidence object that can travel into maintenance workflow.

The product accepts one sensor or four synchronized sensors. It derives order-aware and broadband features, runs the same 48→4 learned classifier through transparent FP32 JavaScript and INT8 WebAssembly SIMD engines, checks both engines plus signal quality and the fitted real-data envelope, then either reports one of four supported signatures or refuses the conclusion.

Production training contains no generated fault signals. It uses a CC BY 4.0 mechanical-fault dataset with 20 independently reset physical tests and four accelerometers. Five-fold whole-test cross-validation records 76.3% four-channel balanced accuracy and 16/20 physical-test accuracy; healthy/misalignment separation is the primary gap. RotorNote therefore answers only above 0.90 confidence: 37.1% out-of-fold coverage at 97.71% accepted accuracy and 96.46% selective balanced accuracy. A second CC BY bearing dataset attacks cross-rig behavior: all four foreign records abstain, and no bearing capability is claimed.

The optimized artifact reduces model weight bytes from 784 to 208 (73.47%). Across all 40,000 real windows, INT8 preserves 99.7825% window labels, 100% four-channel recording labels, and a 0.02774 p99 probability delta. Native Arm throughput for this rebuilt smaller model must be remeasured before submission; historical numbers from the superseded model are not reused.

RotorNote is useful now as a local, zero-runtime-dependency screening companion to DAQ gateways, CMMS notes, and qualified analysts. It is not certified, not a safety controller, and not a diagnosis.
