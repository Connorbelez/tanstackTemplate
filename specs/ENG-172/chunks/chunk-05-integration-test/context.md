# Chunk 05 Context: Integration Test — End-to-End Reversal Flow

## What You're Building

Test file: `convex/payments/cashLedger/__tests__/reversalIntegration.test.ts`

This is the full end-to-end test that exercises the complete lifecycle: obligation accrual → cash receipt → dispersal allocation → (optional payout) → reversal cascade → reconciliation detection.

## Test Infrastructure

```typescript
import { describe, expect, it } from "vitest";
import { getCashAccountBalance, findCashAccount, getOrCreateCashAccount } from "../accounts";
import {
  postObligationAccrued,
  postCashReceiptForObligation,
  postSettlementAllocation,
  postPaymentReversalCascade,
} from "../integrations";
import { postCashEntryInternal } from "../postEntry";
import {
  getPostingGroupSummary,
  isPostingGroupComplete,
} from "../postingGroups";
import {
  findSettledObligationsWithNonZeroBalance,
  getJournalSettledAmountForObligation,
} from "../reconciliation";
import {
  createHarness,
  seedMinimalEntities,
  SYSTEM_SOURCE,
} from "./testUtils";

const modules = import.meta.glob("/convex/**/*.ts");
```

## Test Flow

### T-017: Full pipeline

```
1. seedMinimalEntities → { borrowerId, lenderAId, lenderBId, mortgageId }
2. Create obligation (status: "settled", amount: 100_000)
3. Create collectionAttempt record (for attemptId foreign key)
4. Create dispersalEntry records (for dispersalEntryId foreign keys)
5. postObligationAccrued → OBLIGATION_ACCRUED entry
6. postCashReceiptForObligation → CASH_RECEIVED entry
7. postSettlementAllocation → LENDER_PAYABLE_CREATED ×2 + SERVICING_FEE_RECOGNIZED
8. (Optional) postLenderPayout for clawback variant
9. postPaymentReversalCascade → REVERSAL entries
```

### T-018: Account balance verification

After the full reversal, verify:
- **BORROWER_RECEIVABLE**: Balance should be back to the accrued amount (obligation.amount). The cash receipt credited it (reduced), the reversal debited it (restored).
- **TRUST_CASH**: Balance should be 0 (received then reversed out).
- **LENDER_PAYABLE** (each lender): Balance should be 0 (created then reversed).
- **SERVICING_REVENUE**: Balance should be 0 (recognized then reversed).
- **CONTROL:ALLOCATION**: Balance should be 0 (debited for allocation, credited for reversal).
- **CONTROL:ACCRUAL**: Unchanged from accrual (not reversed by payment reversal).

### T-019: Posting group validation

```typescript
// Check the reversal posting group
const reversalSummary = await getPostingGroupSummary(ctx, result.postingGroupId);
// The reversal posting group's CONTROL:ALLOCATION should net to zero
// because lender payable reversals credit CONTROL:ALLOCATION and
// servicing fee reversal credits CONTROL:ALLOCATION
expect(reversalSummary.controlAllocationBalance).toBe(0n);

// Also check the original allocation posting group
const allocationSummary = await getPostingGroupSummary(ctx, `allocation:${obligationId}`);
// The original allocation group remains balanced (it was balanced before reversal)
expect(allocationSummary.controlAllocationBalance).toBe(0n);
```

### T-020: Reconciliation detection

```typescript
const indicators = await findSettledObligationsWithNonZeroBalance(ctx);
const found = indicators.find(i => i.obligationId === obligationId);
expect(found).toBeDefined();
expect(found!.outstandingBalance).toBe(BigInt(obligation.amount));
```

## Creating Required Entity Records

You need `collectionAttempts` and `dispersalEntries` records. Check the schema for required fields:

```typescript
// Collection attempt
const attemptId = await ctx.db.insert("collectionAttempts", {
  status: "confirmed",
  mortgageId,
  obligationId,
  amount: 100_000,
  machineContext: {},
  lastTransitionAt: Date.now(),
  createdAt: Date.now(),
});

// Dispersal entries (one per lender)
const dispersalAId = await ctx.db.insert("dispersalEntries", {
  mortgageId,
  obligationId,
  lenderId: lenderAId,
  amount: 54_000,
  status: "pending",
  createdAt: Date.now(),
});
```

**CHECK SCHEMA** for exact required fields on these tables before creating records.

## Integration Function Signatures (for reference)

```typescript
// postObligationAccrued(ctx, { obligationId, source })
// postCashReceiptForObligation(ctx, { obligationId, amount, idempotencyKey, effectiveDate?, attemptId?, postingGroupId?, source })
// postSettlementAllocation(ctx, { obligationId, mortgageId, settledDate, servicingFee, entries: [{ dispersalEntryId, lenderId, amount }], source, feeMetadata? })
// postPaymentReversalCascade(ctx, { attemptId?, transferRequestId?, obligationId, mortgageId, effectiveDate, source, reason })
```

## Constraints

- Use `createHarness(modules)` with hash chain disabled
- All operations within `t.run()` blocks
- Verify both positive case (reversal detected) and negative case (non-reversed obligation not flagged) in same test suite
