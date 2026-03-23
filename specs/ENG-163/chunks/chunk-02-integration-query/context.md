# Chunk 2 Context: Integration, Query, and Reconciliation

## Goal
Wire posting group validation into the existing allocation flow, add a query endpoint to retrieve posting group entries as a unit, and add reconciliation alerting for non-zero groups.

## Task Details

### T-004: Pre-validation in `postSettlementAllocation()`
**File:** `convex/payments/cashLedger/integrations.ts`
**Action:** Modify — add validation at the top of `postSettlementAllocation()` before any `postCashEntryInternal` calls.

Current signature:
```typescript
export async function postSettlementAllocation(
  ctx: MutationCtx,
  args: {
    obligationId: Id<"obligations">;
    mortgageId: Id<"mortgages">;
    settledDate: string;
    servicingFee: number;
    entries: Array<{
      dispersalEntryId: Id<"dispersalEntries">;
      lenderId: Id<"lenders">;
      amount: number;
    }>;
    source: CommandSource;
  }
)
```

**What to add** — after the obligation lookup (line ~363-366), before the CONTROL account creation (line ~368):
```typescript
import { validatePostingGroupAmounts } from "./postingGroups";

// Inside postSettlementAllocation, after obligation check:
validatePostingGroupAmounts(
  obligation.amount,
  args.entries.map((e) => e.amount),
  args.servicingFee
);
```

**Why this works atomically:** Convex mutations are transactional. Throwing before any writes means zero entries are persisted. No "rollback" needed.

**IMPORTANT:** The validation uses `obligation.amount` (the full obligation amount), NOT `args.settledAmount` — `postSettlementAllocation` doesn't have a `settledAmount` param. The obligation's `amount` field IS the expected total.

### T-005: `getPostingGroupEntries` query
**File:** `convex/payments/cashLedger/queries.ts`
**Action:** Add new public query.

```typescript
export const getPostingGroupEntries = cashLedgerQuery
  .input({ postingGroupId: v.string() })
  .handler(async (ctx, args) => {
    const entries = await ctx.db
      .query("cash_ledger_journal_entries")
      .withIndex("by_posting_group", (q) =>
        q.eq("postingGroupId", args.postingGroupId)
      )
      .collect();
    return entries.sort(compareSequence);
  })
  .public();
```

The `compareSequence` function already exists in `queries.ts` (lines 35-46):
```typescript
function compareSequence(
  left: { sequenceNumber: bigint },
  right: { sequenceNumber: bigint }
) {
  if (left.sequenceNumber < right.sequenceNumber) return -1;
  if (left.sequenceNumber > right.sequenceNumber) return 1;
  return 0;
}
```

### T-006: `findNonZeroPostingGroups()` in reconciliation
**File:** `convex/payments/cashLedger/reconciliation.ts`
**Action:** Add function + internal query wrapper.

Implementation approach:
1. Get all CONTROL:ALLOCATION accounts via `getControlAccountsBySubaccount(ctx.db, "ALLOCATION")`
2. Filter to accounts with non-zero balance (use `getCashAccountBalance`)
3. For each non-zero account, find associated posting group entries by querying journal entries via the obligation's posting group ID
4. Actually, simpler approach: query ALL journal entries that have a postingGroupId, collect unique group IDs, then check each with `getControlBalancesByPostingGroup()`
5. Even simpler: get all CONTROL:ALLOCATION accounts with non-zero balances. For each, their `obligationId` gives the posting group ID pattern `allocation:${obligationId}`. Run `getControlBalancesByPostingGroup()` on each.

**Best approach given existing infrastructure:**
```typescript
export interface PostingGroupReconciliationAlert {
  postingGroupId: string;
  controlAllocationBalance: bigint;
  entryCount: number;
  oldestEntryTimestamp: number;
  obligationId?: Id<"obligations">;
}

export async function findNonZeroPostingGroups(
  ctx: QueryCtx
): Promise<PostingGroupReconciliationAlert[]> {
  // Get all CONTROL:ALLOCATION accounts
  const allocationAccounts = await getControlAccountsBySubaccount(ctx.db, "ALLOCATION");

  const alerts: PostingGroupReconciliationAlert[] = [];

  for (const account of allocationAccounts) {
    const balance = getCashAccountBalance(account);
    if (balance === 0n) continue;

    // Derive posting group ID from obligation
    if (!account.obligationId) continue;
    const postingGroupId = `allocation:${account.obligationId}`;

    // Get entries for this posting group
    const entries = await ctx.db
      .query("cash_ledger_journal_entries")
      .withIndex("by_posting_group", (q) =>
        q.eq("postingGroupId", postingGroupId)
      )
      .collect();

    alerts.push({
      postingGroupId,
      controlAllocationBalance: balance,
      entryCount: entries.length,
      oldestEntryTimestamp: entries.length > 0
        ? Math.min(...entries.map((e) => e.timestamp))
        : 0,
      obligationId: account.obligationId,
    });
  }

  return alerts;
}
```

Plus an internal query wrapper:
```typescript
export const findNonZeroPostingGroupsInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    const alerts = await findNonZeroPostingGroups(ctx);
    // Convert bigint to number for serialization
    return alerts.map((a) => ({
      ...a,
      controlAllocationBalance: Number(a.controlAllocationBalance),
    }));
  },
});
```

## Existing Imports in Files

### integrations.ts current imports:
```typescript
import { ConvexError } from "convex/values";
import type { Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { auditLog } from "../../auditLog";
import type { CommandSource } from "../../engine/types";
import { findCashAccount, getOrCreateCashAccount } from "./accounts";
import { postCashEntryInternal } from "./postEntry";
import { buildIdempotencyKey } from "./types";
```

### queries.ts current imports:
```typescript
import { v } from "convex/values";
import type { Id } from "../../_generated/dataModel";
import { internalQuery } from "../../_generated/server";
import { cashLedgerQuery } from "../../fluent";
import { findCashAccount, getCashAccountBalance, getControlAccountsBySubaccount, isCreditNormalFamily } from "./accounts";
import { getControlBalanceBySubaccount, getControlBalancesByPostingGroup, getJournalSettledAmountForObligation, reconcileObligationSettlementProjectionInternal } from "./reconciliation";
```

### reconciliation.ts current imports:
```typescript
import { v } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";
import { internalQuery, type QueryCtx } from "../../_generated/server";
import { getCashAccountBalance, getControlAccountsBySubaccount } from "./accounts";
import type { ControlSubaccount } from "./types";
import { TRANSIENT_SUBACCOUNTS } from "./types";
```

## Quality Gate
After implementation, run:
- `bun check`
- `bun typecheck`
- `bunx convex codegen`
- Verify existing tests still pass: `bun run test -- convex/payments/cashLedger/__tests__/lenderPayableIntegration`
