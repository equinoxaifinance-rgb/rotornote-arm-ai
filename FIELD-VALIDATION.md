# Field validation and conformity path

## Current status

RotorNote is **certification-ready evidence infrastructure, not a certified diagnostic product**. No standards body, laboratory, machinery manufacturer, or vibration analyst has certified its field performance. The repository deliberately prevents that inference.

There is no universal single certificate for an AI vibration-screening application. Relevant standards govern the condition-monitoring program, vibration acquisition and analysis, machine-specific evaluation, personnel competence, software security, and AI risk management.

## Executed external-data boundary probe

`npm run validate:field` downloads four hash-pinned records directly from the [Case Western Reserve University Bearing Data Center](https://engineering.case.edu/bearingdatacenter/download-data-file), whose [apparatus page](https://engineering.case.edu/bearingdatacenter/apparatus-and-procedures) documents the motor, accelerometers, seeded faults, and acquisition rates. The probe uses one normal record and three 0.007-inch drive-end bearing-fault records, resamples only the drive-end channel from 12 kHz to RotorNote's 1,024 Hz contract, and does not train or recalibrate the model.

The current receipt at `field/results/cwru-cross-domain.json` records four of four as `review_required`, zero automatic conclusions, and a bearing review candidate for all three faulted records. The normal record also remained outside the fitted envelope; its unaccepted candidate was bearing. This demonstrates a useful fail-closed domain boundary, not sensitivity, specificity, field calibration, or certification. Raw CWRU records are fetched at run time and are not redistributed in this repository.

## Standards map

| Reference | What it covers | RotorNote evidence now | Remaining external work |
|---|---|---|---|
| [ISO 17359:2018](https://www.iso.org/standard/71194.html) | General procedures for a machine condition-monitoring program | Intended role, retest, escalation, context capture | Asset-specific program, responsibilities, alarms and maintenance process |
| [ISO 13373-1:2002](https://www.iso.org/standard/21831.html) | Vibration measurement and data collection practice | Sample-rate/context contract and repeatable measurement point | Calibrated sensors, installation procedure and traceable acquisition records |
| [ISO 13373-2:2016](https://www.iso.org/standard/68128.html) | Time/frequency processing, presentation and vibration-signature analysis | Waveform, FFT-derived features, spectrum, timeline and operating-condition retest | Independent expert review against the purchased standard and selected machine class |
| [ISO 20816-1:2016](https://www.iso.org/standard/63180.html) | General vibration measurement/evaluation and operational limits | No false claim of universal limits | Select the applicable machine-specific ISO 20816 part and configure validated limits |
| [ISO 18436-2:2014](https://www.iso.org/standard/50447.html) | Qualification/certification of vibration-analysis personnel | Explicit qualified-human escalation | Engage appropriately certified personnel; this standard certifies people, not RotorNote |
| [NIST AI RMF 1.0](https://doi.org/10.6028/NIST.AI.100-1) | Voluntary trustworthy-AI risk management | Model card, limits, abstention, integrity, measurement plan | Operational governance, monitoring, incident process and stakeholder review |
| [NIST SP 800-218](https://doi.org/10.6028/NIST.SP.800-218) | Secure Software Development Framework | Locked dependency, SBOM, hashes, tests, secret scan, non-root container | Organizational release, vulnerability-response and provenance controls |

An alignment table is not certification or a declaration of conformity.

## Pre-registered field study

1. **Scope one asset family.** Select one motor/pump/fan class, defined speed/load range, sensor type, mount and acquisition chain.
2. **Establish reference truth independently.** Labels must come from inspection, maintenance findings, controlled seeded faults where safe, and review by qualified vibration personnel—not from RotorNote output.
3. **Prevent leakage.** Split by physical machine and maintenance event, never by windows from the same recording. Freeze the test set before fitting.
4. **Capture operating strata.** Include healthy machines, each supported condition, different loads/speeds, mounts, environmental noise, sensor faults and unrelated external vibration.
5. **Pre-register primary measures.** Report per-class sensitivity/specificity, macro F1, calibration error, abstention rate, false-alerts per asset-day, time-to-detection and engine parity with confidence intervals.
6. **Acceptance gate.** For an advisory pilot, proposed—not certified—minimums are ≥0.90 lower-confidence-bound sensitivity for the selected critical condition, ≥0.95 specificity, 100% FP32/INT8 label agreement, zero automatic control actions, and documented review of every false negative. A qualified owner must revise these thresholds for the actual risk.
7. **Prospective shadow mode.** Run without influencing maintenance decisions, compare alerts to independent practice, investigate drift and sensor failures, then repeat after any model or acquisition change.
8. **Controlled release.** Only the exact hashed model, software and acquisition configuration that passed the study may inherit its evidence. Material changes trigger revalidation.

## Evidence package for an assessor

- Versioned intended-use statement and risk classification
- Sensor calibration and installation records
- Dataset provenance, consent/ownership and machine/event split manifest
- Frozen evaluation protocol and statistical analysis
- Raw predictions, abstentions and reference labels
- Confusion matrices and confidence intervals by operating stratum
- Model, source, container, SBOM and build-manifest hashes
- Security/threat assessment and incident-response owner
- Change-control and revalidation policy
- Signed review by the responsible organization and qualified domain personnel

Until that package contains real independent field evidence, the accurate claim remains **field-validation ready**, never “certified.”
