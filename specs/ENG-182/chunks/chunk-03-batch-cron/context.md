# Chunk 03 Context: Batch Processing & Cron Registration

## T-009: Payout Batch Action

### File: `convex/payments/payout/batchPayout.ts` (NEW)

This is the core scheduling logic — a daily cron handler that evaluates which lenders are due for payout.

**Use `internalAction`** because it needs to call queries + mutations sequentially.

**Algorithm (from Implementation Plan Step 4):**
```
1. Get today's date as YYYY-MM-DD
2. Get all active lenders (via getLendersWithPayableBalance)
3. For each lender:
   a. Resolve frequency: lender.payoutFrequency ?? DEFAULT_PAYOUT_FREQUENCY
   b. Check if due: isPayoutDue(frequency, lender.lastPayoutDate, today)
   c. If not due, skip
   d. Get eligible dispersal entries (past hold period) via getEligibleDispersalEntries
   e. If no eligible entries, skip
   f. Group entries by mortgageId
   g. For each mortgage group:
      - Sum amounts
      - Check minimum threshold: totalAmount >= (lender.minimumPayoutCents ?? MINIMUM_PAYOUT_CENTS)
      - If below threshold, skip
      - Call postLenderPayout with idempotency key: `payout-batch:{today}:{lenderId}:{mortgageId}`
      - Call markEntriesDisbursed for the entries
   h. Call updateLenderPayoutDate
4. Log batch summary
```

**Key Imports:**
```typescript
import { internalAction } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { DEFAULT_PAYOUT_FREQUENCY, MINIMUM_PAYOUT_CENTS, isPayoutDue } from "./config";
import type { PayoutFrequency } from "./config";
import type { Id } from "../../_generated/dataModel";
```

**`postLenderPayout` signature** (called via `ctx.runMutation`):
```typescript
internal.payments.cashLedger.mutations.postLenderPayout
Args: {
    mortgageId: Id<"mortgages">,
    lenderId: Id<"lenders">,
    amount: number,         // cents, positive integer
    effectiveDate: string,  // YYYY-MM-DD
    idempotencyKey: string,
    source: { actorType: "system", channel: "cron" },
    reason?: string,
    postingGroupId?: string,
    dispersalEntryId?: Id<"dispersalEntries">,
    obligationId?: Id<"obligations">,
}
```

**Idempotency key convention** (from Notion spec):
- Format: `payout-batch:{today}:{lenderId}:{mortgageId}`
- This ensures running the batch twice on the same day is idempotent

**Posting group convention:**
- All payouts for a single lender in a single batch share: `payout-batch:{today}:{lenderId}`
- Each mortgage gets its own journal entry with unique idempotency key

**Batch size consideration (from Notion §9 OQ-5):**
- If a lender has many eligible entries, process all of them
- The grouping is by mortgage, so each payout is per-mortgage
- No explicit batch size limit needed for Phase 1 (early stage, limited data)

**Error handling:**
- If `postLenderPayout` throws (e.g., insufficient balance), log the error and continue with next mortgage/lender
- The idempotency key ensures partial failures can be retried safely
- Use try/catch around each mortgage's payout to prevent one failure from blocking all lenders

**Helper: groupBy utility**
Create a local `groupBy` helper or use a simple reduce pattern:
```typescript
function groupBy<T>(items: T[], key: keyof T): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = String(item[key]);
    const group = map.get(k) ?? [];
    group.push(item);
    map.set(k, group);
  }
  return map;
}
```

## T-010: Register Payout Cron

### File: `convex/crons.ts` (MODIFY)

**Current cron schedule:**
```
06:00 UTC — daily obligation transitions
07:00 UTC — daily reconciliation check
07:15 UTC — cash ledger reconciliation
Every 15 min — dispersal self-healing
Every 15 min — transfer reconciliation
```

**Add at 08:00 UTC** (after all reconciliation completes — Tech Design §7.1):

```typescript
// Lender payout scheduling: evaluates lender frequency thresholds
// and batches payout execution for eligible dispersal entries.
// Runs at 08:00 UTC (after reconciliation completes at 07:15).
// See Tech Design OQ-8 and ENG-182.
crons.daily(
    "lender payout batch",
    { hourUTC: 8, minuteUTC: 0 },
    internal.payments.payout.batchPayout.processPayoutBatch
);
```

**Placement**: Add before `export default crons;` at the end of the file.

**Import**: The `internal` import at the top of crons.ts already covers all internal functions.
