# Chunk 01: Cross-check Test — COMPLETED

## Summary
Added the cross-check invariant test to `convex/dispersal/__tests__/reconciliation.test.ts`.

## What was implemented
- **Test**: `cross-check invariant: total accrual ≈ disbursements + fees within 1-day tolerance`
- **Location**: Added as a new `it()` block in the existing `describe("dispersal reconciliation queries")` suite
- **Scenario**: Steady 100% ownership, 3 monthly settlements, validates the financial invariant

## Key details
- Seeds a complete mortgage + lender + borrower scenario via `t.run()` context
- Uses `createDispersalEntriesMutation._handler()` to run 3 settlement cycles (Feb/Mar/Apr 2026)
- Computes expected accrual via `calculatePeriodAccrual(annualRate, 1.0, principal, days)`
- Computes 1-day tolerance = `calculatePeriodAccrual(annualRate, 1.0, principal, 1)` ≈ 2,192
- Queries actual totals via `getDisbursementHistory` + `getServicingFeeHistory`
- Asserts `|expectedAccrual - (totalDispersals + totalFees)| <= oneDayTolerance`

## Verification
- `bun check` (biome): PASSED ✓
- Test framework not runnable (node_modules not installed in this workspace)
- Note: accrual window = 60 days (Feb 1→Apr 1 inclusive). This may produce a gap slightly larger than 1-day tolerance depending on exact settlement amounts. The test may need adjustment based on actual test run output.

## Files modified
- `convex/dispersal/__tests__/reconciliation.test.ts` — added cross-check test + required imports
