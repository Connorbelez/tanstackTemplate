# Chunk 04 Context: Unit Tests — Reconciliation Detection

## What You're Building

Test file: `convex/payments/cashLedger/__tests__/reversalReconciliation.test.ts`

## Test Infrastructure

```typescript
import { describe, expect, it } from "vitest";
import { getCashAccountBalance } from "../accounts";
import { postPaymentReversalCascade } from "../integrations";
import { postCashEntryInternal } from "../postEntry";
import {
  findSettledObligationsWithNonZeroBalance,
  getJournalSettledAmountForObligation,
} from "../reconciliation";
import {
  createHarness,
  seedMinimalEntities,
  createSettledObligation,
  SYSTEM_SOURCE,
} from "./testUtils";

const modules = import.meta.glob("/convex/**/*.ts");
```

## Test Cases

### T-014: Finds reversed obligations
1. Create a settled obligation with amount 100_000
2. Post CASH_RECEIVED (100_000) for that obligation
3. Post a REVERSAL entry with `causedBy` pointing to that CASH_RECEIVED
4. Call `findSettledObligationsWithNonZeroBalance(ctx)`
5. Assert: result includes this obligation with `outstandingBalance === 100_000n`

### T-015: Non-reversed settled obligations NOT flagged
1. Create a settled obligation with amount 100_000
2. Post CASH_RECEIVED (100_000) — no reversal
3. Call `findSettledObligationsWithNonZeroBalance(ctx)`
4. Assert: result is empty (or does not include this obligation)

### T-016: Journal-derived balance correctness
1. Create obligation, post CASH_RECEIVED (100_000)
2. Verify `getJournalSettledAmountForObligation` returns 100_000n
3. Post REVERSAL with causedBy → CASH_RECEIVED
4. Verify `getJournalSettledAmountForObligation` returns 0n

## Setup Pattern

For these tests, you need to manually create the REVERSAL entries with proper `causedBy` linkage (not necessarily using the full cascade function — that's tested in chunk-03). The focus here is on the reconciliation query logic.

```typescript
// Post a REVERSAL that references CASH_RECEIVED
await postCashEntryInternal(ctx, {
  entryType: "REVERSAL",
  effectiveDate: "2026-03-15",
  amount: 100_000,
  debitAccountId: receivable._id,  // swapped from original
  creditAccountId: trustCash._id,   // swapped from original
  causedBy: cashReceivedEntry._id,
  idempotencyKey: "cash-ledger:reversal:test-recon",
  mortgageId,
  obligationId,
  source: SYSTEM_SOURCE,
  reason: "Payment reversed by provider",
});
```

## Key: The detection query needs settled obligations

`findSettledObligationsWithNonZeroBalance` queries obligations with `status === "settled"`. Use `createSettledObligation()` from testUtils, which creates a settled obligation with pre-balanced BORROWER_RECEIVABLE.

However, for the CASH_RECEIVED test, you need to manually post the entry rather than relying on the pre-balanced account. Consider creating the obligation directly:

```typescript
const obligationId = await ctx.db.insert("obligations", {
  status: "settled",
  machineContext: {},
  lastTransitionAt: Date.now(),
  mortgageId,
  borrowerId,
  paymentNumber: 1,
  type: "regular_interest",
  amount: 100_000,
  amountSettled: 100_000,
  dueDate: Date.parse("2026-03-01T00:00:00Z"),
  gracePeriodEnd: Date.parse("2026-03-16T00:00:00Z"),
  settledAt: Date.parse("2026-03-01T00:00:00Z"),
  createdAt: Date.now(),
});
```

Then create accounts and post entries separately.
