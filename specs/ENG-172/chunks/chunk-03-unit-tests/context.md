# Chunk 3 Context: Unit Tests

## What You're Building

Unit tests for `postPaymentReversalCascade()`, `postTransferReversal()`, and `assertReversalAmountValid()`.

**File:** `convex/payments/cashLedger/__tests__/reversalCascade.test.ts` (new)

## Test Infrastructure

### Test Harness
The cash ledger tests use `convex-test` with a custom harness:

```typescript
import { convexTest } from "convex-test";
import { modules } from "../../../test.setup"; // or similar
import { describe, it, expect, beforeEach } from "vitest";
```

Look at existing test files like `corrections.test.ts`, `postEntry.test.ts`, or `postingGroupIntegration.test.ts` for the exact import patterns and harness setup.

### Test Utilities (testUtils.ts)
Available helpers:
- `createTestAccount(ctx, spec)` — creates a cash account with given spec
- `postTestEntry(ctx, input)` — posts a journal entry through the full pipeline
- `ADMIN_SOURCE` — `{ actorType: "admin", actorId: "test-admin", channel: "test" }`
- `SYSTEM_SOURCE` — `{ actorType: "system", actorId: "system", channel: "test" }`

### Setting Up Test State
To test reversals, you need to first set up a full settlement flow:
1. Create accounts (BORROWER_RECEIVABLE, TRUST_CASH, LENDER_PAYABLE per lender, SERVICING_REVENUE, CONTROL:ALLOCATION)
2. Post OBLIGATION_ACCRUED entry
3. Post CASH_RECEIVED entry
4. Post LENDER_PAYABLE_CREATED entries (one per lender) + SERVICING_FEE_RECOGNIZED
5. (Optionally) Post LENDER_PAYOUT_SENT for clawback scenario

Use the existing integration functions:
- `postObligationAccrued()`
- `postCashReceiptForObligation()`
- `postSettlementAllocation()`
- The lender payout mutation

## Test Cases

### T-008: Full reversal cascade
1. Set up: accrue obligation → receive cash → allocate to 2 lenders + fee
2. Call `postPaymentReversalCascade()`
3. Assert: 4 REVERSAL entries created (1 CASH_RECEIVED + 2 LENDER_PAYABLE + 1 SERVICING_FEE)
4. Assert: each entry has correct debit/credit accounts (swapped from original)
5. Assert: each entry has correct amount (matches original)

### T-009: Cascade with clawback
1. Set up: full flow + send lender payout
2. Call `postPaymentReversalCascade()`
3. Assert: 5+ REVERSAL entries (includes LENDER_PAYOUT_SENT reversal)
4. Assert: `clawbackRequired === true`

### T-010: Cascade without clawback
1. Set up: full flow without payout
2. Call `postPaymentReversalCascade()`
3. Assert: `clawbackRequired === false`

### T-011: Idempotency
1. Set up flow and call cascade
2. Call cascade again with same arguments
3. Assert: same entries returned, no new entries created

### T-012: Amount validation
1. Attempt reversal where amount > original
2. Assert: throws ConvexError with code "REVERSAL_EXCEEDS_ORIGINAL"

### T-013: causedBy linkage
1. Run cascade
2. For each reversal entry, load the `causedBy` entry
3. Assert: causedBy exists, has matching entryType that was being reversed

### T-014: Posting group integrity
1. Run cascade
2. Assert: all reversal entries share the same `postingGroupId`
3. Assert: `postingGroupId` follows pattern `reversal-group:{attemptId}`

### T-015: postTransferReversal
1. Post a CASH_RECEIVED entry with transferRequestId
2. Call `postTransferReversal()`
3. Assert: REVERSAL entry created with swapped accounts, correct causedBy, correct idempotencyKey

## Existing Test Patterns

Look at `corrections.test.ts` for:
- How to set up accounts and entries before testing corrections/reversals
- How to assert on entry fields
- How to test idempotency

Look at `postingGroupIntegration.test.ts` for:
- How to test multi-entry posting groups
- How to verify CONTROL:ALLOCATION balances

## File Map
| File | Action | Purpose |
|------|--------|---------|
| `convex/payments/cashLedger/__tests__/reversalCascade.test.ts` | **Create** | Unit tests for cascade function |
