# Chunk 1: Test Helpers & Infrastructure

- [ ] T-001: Create `convex/payments/cashLedger/__tests__/e2eHelpers.ts` with `assertObligationConservation(t, obligationId)` — asserts settled amount = SUM(dispersal amounts) + servicing fee using BigInt only
- [ ] T-002: Add `assertPostingGroupComplete(t, postingGroupId)` — asserts CONTROL:ALLOCATION balance is zero for a posting group
- [ ] T-003: Add `assertAccountIntegrity(t, mortgageId)` — asserts all accounts have non-negative cumulativeDebits and cumulativeCredits
- [ ] T-004: Add `assertSettlementReconciles(t, obligationId)` — asserts journal-derived settled amount matches obligation.amountSettled
- [ ] T-005: Add `assertFullConservation(t, { obligationId, mortgageId, allocationPostingGroupId })` — runs all 4 assertion helpers
- [ ] T-006: Add `createDueObligation(t, { mortgageId, borrowerId, amount, paymentNumber? })` to `testUtils.ts` — creates obligation in `due` state without pre-created accounts
