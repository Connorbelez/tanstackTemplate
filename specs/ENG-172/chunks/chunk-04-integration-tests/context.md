# Chunk 4 Context: Integration Tests

## What You're Building

End-to-end integration tests that exercise the full accrual → receipt → allocation → reversal pipeline and verify:
- All account balances are correct after reversal
- Reconciliation detection works
- Posting group integrity holds

**File:** `convex/payments/cashLedger/__tests__/reversalIntegration.test.ts` (new)

## Test Infrastructure

Same as Chunk 3 — uses `convex-test` harness. See existing `postingGroupIntegration.test.ts` for the full integration test pattern.

## Test Cases

### T-016: E2E full reversal without payout
1. Create a mortgage, obligation, borrower, 2 lenders
2. `postObligationAccrued()` → verify BORROWER_RECEIVABLE balance increases
3. `postCashReceiptForObligation()` → verify TRUST_CASH increases, BORROWER_RECEIVABLE decreases
4. `postSettlementAllocation()` → verify LENDER_PAYABLE accounts created, CONTROL:ALLOCATION nets to zero
5. `postPaymentReversalCascade()` → verify:
   - BORROWER_RECEIVABLE balance restored to pre-receipt level
   - TRUST_CASH balance restored
   - LENDER_PAYABLE balances zeroed
   - CONTROL:ALLOCATION still nets to zero (reversal posting group also nets to zero independently)
   - SERVICING_REVENUE zeroed

### T-017: E2E reversal with payout (clawback)
1. Same as T-016 but also post LENDER_PAYOUT_SENT for one lender
2. Reverse
3. Verify:
   - LENDER_PAYABLE for paid lender goes negative (clawback receivable)
   - TRUST_CASH reflects both original receipt and payout reversal
   - `clawbackRequired === true`

### T-018: Reconciliation detection
1. Create obligation, settle it (mark as settled in obligations table)
2. Post full settlement flow in cash ledger
3. Post reversal cascade
4. Call `findSettledObligationsWithNonZeroBalance()`
5. Assert: returns the reversed obligation with correct amounts

### T-019: Posting group validation
1. Run full cascade
2. Call `validatePostingGroupEntries()` on the reversal posting group
3. Assert: `isPostingGroupComplete()` returns true (CONTROL:ALLOCATION nets to zero)

### T-020: Quality Gate
Run `bun check`, `bun typecheck`, `bunx convex codegen` and fix any errors.

## Existing Patterns

Look at `postingGroupIntegration.test.ts` for:
- How E2E tests are structured
- How to verify account balances after complex multi-step flows
- How to use `getCashAccountBalance()` for assertions

Look at `reconciliationSuite.test.ts` for:
- How reconciliation functions are tested
- How to set up settled obligations for testing

## File Map
| File | Action | Purpose |
|------|--------|---------|
| `convex/payments/cashLedger/__tests__/reversalIntegration.test.ts` | **Create** | E2E integration tests |
