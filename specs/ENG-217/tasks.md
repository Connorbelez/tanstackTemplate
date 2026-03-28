# ENG-217: Design Servicing Fee Deduction Model — Tasks

## Summary
Resolve Tech Design §10 Open Decision 2 (when/from-what/principal-basis for servicing fees)
and address Foot Gun 7 (implicit principal basis). All three decisions confirm the current
implementation is correct — the work is documentation, a regression test, and downstream updates.

## Tasks

### Chunk 1: Code Documentation + Principal-Sensitivity Test

- [x] T-001: Add JSDoc to `calculateServicingFee()` in `convex/dispersal/servicingFee.ts` documenting:
  - `principalCents` is **current outstanding principal** at time of settlement (not original loan amount)
  - Decision reference: ENG-217
  - As principal is repaid, servicing fee decreases proportionally (standard amortizing behavior)

- [x] T-002: Add inline comment in `calculateServicingSplit()` in `convex/dispersal/createDispersalEntries.ts` at the fee calculation call site (line ~197-200) documenting:
  - Fee basis is current outstanding principal (`mortgage.principal`)
  - Fees decrease as principal is repaid
  - The `principalBalance` used is stored in `servicingFeeEntries` for audit verification
  - Decision reference: ENG-217

- [x] T-003: Add principal-sensitivity test in `convex/dispersal/__tests__/createDispersalEntries.test.ts`:
  - Create two dispersals for the same mortgage, first with `mortgage.principal = 10_000_000` (100k), second with `mortgage.principal = 8_000_000` (80k)
  - Assert: second `servicingFeeEntry.feeDue` is lower than first
  - Assert: each `servicingFeeEntry.principalBalance` matches the mortgage's principal at that point
  - This documents expected behavior and catches regressions against Foot Gun 7

### Chunk 2: Downstream Updates (non-code, handled in main conversation)

- [x] T-004: Update ENG-206 Linear issue description with fee model clarification (paste into ENG-206 if not already there):
  - Servicing fees deducted at dispersal time (pre-disbursement), NOT at transfer time
  - Bridge reads `dispersalEntries` with net amounts (post-fee)
  - Bridge does NOT need any fee logic
  - `SERVICING_FEE_RECOGNIZED` cash ledger posting happens at dispersal time

- [x] T-005: Verify no transfer type taxonomy change needed:
  - Confirm `convex/payments/transfers/types.ts` has no `servicing_fee_deduction` type
  - This is correct — the fee is an allocation entry, not a transfer
