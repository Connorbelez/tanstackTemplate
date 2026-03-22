# Chunk 02: Tests

## Tasks

### T-008: Unit tests for cash receipt edge cases
**File**: `convex/payments/cashLedger/__tests__/cashReceipt.test.ts` (NEW)

Test cases using `convex-test` pattern from existing `testUtils.ts`:

1. **Happy path**: Single obligation, full payment → CASH_RECEIVED posted with correct debit (TRUST_CASH) and credit (BORROWER_RECEIVABLE)
2. **Partial payment**: Payment < obligation amount → BORROWER_RECEIVABLE partially reduced, correct amount posted
3. **Overpayment**: Payment > obligation amount → excess routed to UNAPPLIED_CASH via `postOverpaymentToUnappliedCash`
4. **Multi-obligation with postingGroupId**: Payment across 2 obligations → all CASH_RECEIVED entries share the same postingGroupId
5. **Duplicate confirmation (idempotency)**: Same idempotency key → no duplicate entry, returns existing
6. **Already-settled obligation**: Payment to obligation with outstandingAmount=0 → amount stays in remainingAmount, routed to UNAPPLIED_CASH
7. **No matching receivable**: Missing BORROWER_RECEIVABLE account → returns null, logs warning (no throw)
8. **Overpayment idempotency**: Same attemptId overpayment → idempotent skip

### T-009: Integration tests for full confirmation flow
**File**: `convex/payments/cashLedger/__tests__/cashReceiptIntegration.test.ts` (NEW)

Integration tests covering the full flow using the effect handlers directly:

1. **Full flow**: Seed entities + obligation → call applyPayment with postingGroupId → verify CASH_RECEIVED entry exists with correct accounts, amounts, and postingGroupId
2. **Multi-obligation flow**: Seed 2 obligations → call emitPaymentReceived with amount covering both → verify 2 CASH_RECEIVED entries sharing postingGroupId
3. **Overpayment flow**: Seed 1 obligation (amount=50000) → call emitPaymentReceived with amount=75000 → verify CASH_RECEIVED for 50000 to BORROWER_RECEIVABLE AND CASH_RECEIVED for 25000 to UNAPPLIED_CASH, both sharing postingGroupId
4. **Already-settled flow**: Seed 1 obligation already fully settled (amountSettled=amount) → call emitPaymentReceived → verify entire amount routed to UNAPPLIED_CASH
