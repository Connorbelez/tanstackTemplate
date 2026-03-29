# ENG-219: Enforce Effective-Date Ownership Snapshot — Master Task List

## Chunk 1: Schema & Backend Changes
- [x] T-001: Add `ownershipSnapshotDate` and `reroutesAppliedCount` to `calculationDetailsValidator`
- [x] T-002: Add new fields to `CalculationDetails` interface
- [x] T-003: Modify `applyDealReroutes()` return type + write new fields in handler
- [x] T-004: Add MISSING_CALCULATION_DETAILS assertion in disbursementBridge
- [x] T-005: Add AMOUNT_EXCEEDS_DISTRIBUTABLE assertion in disbursementBridge

## Chunk 2: Tests
- [x] T-006: Edge-case test — reroute after dispersal, before disbursement
- [x] T-007: Bridge assertion tests — MISSING_CALCULATION_DETAILS + AMOUNT_EXCEEDS_DISTRIBUTABLE
- [x] T-008: Snapshot metadata tests — ownershipSnapshotDate + reroutesAppliedCount
- [x] T-009: Quality gate — codegen, check, typecheck, tests
