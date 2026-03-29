# Chunk 01: Schema & Backend Changes

## Tasks
- [x] T-001: Add `ownershipSnapshotDate` and `reroutesAppliedCount` to `calculationDetailsValidator` in `convex/dispersal/validators.ts`
- [x] T-002: Add new fields to `CalculationDetails` interface in `convex/dispersal/types.ts`
- [x] T-003: Modify `applyDealReroutes()` return type + write new fields in `createDispersalEntries` handler
- [x] T-004: Add MISSING_CALCULATION_DETAILS assertion in `disbursementBridge.ts` processSingleDisbursement
- [x] T-005: Add AMOUNT_EXCEEDS_DISTRIBUTABLE assertion in `disbursementBridge.ts` processSingleDisbursement
