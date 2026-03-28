# Chunk 01 — Code docs + principal-sensitivity test

**Status:** complete

## Completed

- T-001: JSDoc on `calculateServicingFee` in `servicingFee.ts` (ENG-217, current principal basis).
- T-002: Inline comment at fee calculation in `calculateServicingSplit` in `createDispersalEntries.ts`.
- T-003: Test `computes lower servicing fee when mortgage principal decreases (ENG-217)`; lint-clean (no non-null assertions).

## Additional fixes (quality gate)

- `servicingFeeDeducted` on dispersal rows remains `0` per `dispersal/types.ts` (compatibility field; fee canonical on `servicingFeeEntries` / `calculationDetails`).
- `postSettlementAllocation` accepts optional `settledAmount` for posting-group validation when gross settlement ≠ `obligation.amount` (fee-exceeds-cash / partial settlement). `createDispersalEntries` passes `args.settledAmount`.

## Verification

- `bun check` (warnings only, pre-existing complexity).
- `bun run test -- convex/dispersal/__tests__/createDispersalEntries.test.ts convex/payments/cashLedger/__tests__/postingGroupIntegration.test.ts` — all tests passed.
