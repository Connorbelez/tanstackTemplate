# Chunk 01: Dispersal Core

- [x] T-001: Verify and normalize dispersal money and unit conventions against the current repo: payment amounts and `mortgages.principal` are integer cents, while ledger positions and `dealReroutes.fractionalShare` are ownership units out of `10_000`; preserve actual schema names (`lenderId`, `lenderAccountId`, `principal`, `ledger_accounts`).
- [x] T-002: Extend `convex/accrual/types.ts` and `convex/accrual/interestMath.ts` with a reusable `PositionShare` type and `calculateProRataShares(...)` largest-remainder helper keyed by `lenderId` and `ledger_accounts` IDs.
- [x] T-003: Fix and normalize `convex/dispersal/servicingFee.ts` and `convex/dispersal/__tests__/servicingFee.test.ts` so servicing fee math uses cents and matches `mortgages.principal` plus `annualServicingRate`.
- [x] T-004: Create `convex/dispersal/createDispersalEntries.ts` as the internal mutation that performs idempotency, loads mortgage and active positions, applies effective `dealReroutes`, calculates servicing fee and pro-rata shares, inserts `dispersalEntries` and `servicingFeeEntries`, and returns created or existing results.
- [x] T-005: Replace the current GT dispersal stub wiring so `OBLIGATION_SETTLED` schedules the real dispersal mutation with `{ obligationId, mortgageId, settledAmount, settledDate, idempotencyKey, source }` while preserving the existing effect path.
