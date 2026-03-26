# Chunk 03: tests

- [ ] T-020: Create `convex/payments/obligations/__tests__/correctiveObligation.test.ts`. Test happy path: create a settled obligation (seed directly), call `createCorrectiveObligation`, verify new obligation has correct fields (`status: "upcoming"`, `sourceObligationId`, `amount`, same `type`/`mortgageId`/`borrowerId`/`paymentNumber`).
- [ ] T-021: Test idempotency: calling `createCorrectiveObligation` twice with same `originalObligationId` returns existing without creating duplicate. Verify `created: false` on second call.
- [ ] T-022: Test validation: calling with non-settled obligation throws `INVALID_CORRECTIVE_SOURCE`. Calling with zero/negative amount throws `INVALID_CORRECTIVE_AMOUNT`.
- [ ] T-023: Test cash ledger integration: after `createCorrectiveObligation`, verify `OBLIGATION_ACCRUED` journal entry exists for the corrective obligation with correct amount in BORROWER_RECEIVABLE.
- [ ] T-024: Test queryable link: `getCorrectiveObligations(originalId)` returns the corrective. Verify it doesn't return late_fee obligations for the same source.
- [ ] T-025: Test original unchanged: after corrective creation, original obligation remains in `settled` status with unchanged `amount` and `amountSettled`.
