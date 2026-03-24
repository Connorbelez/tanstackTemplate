# Chunk 02 Context: Integration (Queries, Mutation, Cron)

## Goal
Wire the core replay function into the system: public query for admin, internal query for cron, cursor advancement mutation, and daily reconciliation integration.

## Files to Modify
- `convex/payments/cashLedger/replayIntegrity.ts` — Add `advanceReplayCursor` internal mutation
- `convex/payments/cashLedger/queries.ts` — Add `journalReplayIntegrityCheck` public query
- `convex/payments/cashLedger/reconciliation.ts` — Add `runReplayIntegrityCheck` internal query
- `convex/engine/reconciliationAction.ts` — Add replay check to `dailyReconciliation` action

## T-006: advanceReplayCursor Internal Mutation

In `replayIntegrity.ts`, add an internal mutation that updates the `replay_integrity` cursor in `cash_ledger_cursors`. This is a separate mutation because the replay itself runs as a query (read-only).

```typescript
import { internalMutation } from "../../_generated/server";
import { v } from "convex/values";

export const advanceReplayCursor = internalMutation({
  args: {
    lastProcessedSequence: v.int64(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("cash_ledger_cursors")
      .withIndex("by_name", (q) => q.eq("name", "replay_integrity"))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        lastProcessedSequence: args.lastProcessedSequence,
        lastProcessedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("cash_ledger_cursors", {
        name: "replay_integrity",
        lastProcessedSequence: args.lastProcessedSequence,
        lastProcessedAt: Date.now(),
      });
    }
  },
});
```

## T-007: Public Query in queries.ts

Use `cashLedgerQuery` from `../../fluent` (requires `cash_ledger:view` permission). Pattern follows existing queries like `getAccountBalance`.

```typescript
import { replayJournalIntegrity } from "./replayIntegrity";

export const journalReplayIntegrityCheck = cashLedgerQuery
  .input({
    mode: v.union(v.literal("full"), v.literal("incremental")),
    accountId: v.optional(v.id("cash_ledger_accounts")),
    mortgageId: v.optional(v.id("mortgages")),
  })
  .handler(async (ctx, args) => {
    return replayJournalIntegrity(ctx, {
      mode: args.mode,
      accountId: args.accountId,
      mortgageId: args.mortgageId,
    });
  })
  .public();
```

## T-008: Internal Query in reconciliation.ts

For cron integration. Uses `internalQuery` (no auth). Always runs in `full` mode.

```typescript
import { replayJournalIntegrity } from "./replayIntegrity";

export const runReplayIntegrityCheck = internalQuery({
  args: {},
  handler: async (ctx) => {
    const result = await replayJournalIntegrity(ctx, { mode: "full" });
    // Return result as-is; fromSequence, toSequence, and missingSequences are already strings per ReplayResult
    return {
      ...result,
      fromSequence: result.fromSequence,
      toSequence: result.toSequence,
      mismatches: result.mismatches,
      missingSequences: result.missingSequences,
    };
  },
});
```

## T-009: Daily Reconciliation Integration

The daily reconciliation action at `convex/engine/reconciliationAction.ts` currently only does status-vs-journal checks. Add journal replay as an additional check.

**Current reconciliation action structure:**
```typescript
export const dailyReconciliation = internalAction({
  handler: async (ctx) => {
    const result = await ctx.runQuery(reconcileInternalRef, {});
    // ... log discrepancies
    return result;
  },
});
```

**Integration approach:**
1. Create a `makeFunctionReference` for the new `runReplayIntegrityCheck` internal query
2. Call it from `dailyReconciliation` after the existing status check
3. If `passed: false`, log as P0 error and create audit log entry
4. If `passed: true`, advance the cursor via `advanceReplayCursor` mutation

**Important:** The reconciliation action uses `makeFunctionReference` for type-safe internal references (see existing pattern in `reconciliationAction.ts`). Follow the same pattern for the replay check reference.

**Cursor advancement from action context:** Actions can call `ctx.runMutation()`. Create a `makeFunctionReference` for `advanceReplayCursor` and call it when replay passes.

## Existing Patterns to Follow

### cashLedgerQuery (from fluent.ts)
```typescript
export const cashLedgerQuery = authedQuery.use(requirePermission("cash_ledger:view"));
```

### internalQuery pattern (from reconciliation.ts)
```typescript
export const findNonZeroPostingGroupsInternal = internalQuery({
  args: {},
  handler: async (ctx) => { ... },
});
```

### safeBigintToNumber (from accounts.ts)
Use when converting bigint values for serialization across the action/query boundary:
```typescript
export function safeBigintToNumber(value: bigint): number {
  const num = Number(value);
  if (!Number.isSafeInteger(num)) {
    throw new Error(`BigInt value ${value} cannot be safely represented as a Number`);
  }
  return num;
}
```

## Constraints
- Run `bun check`, `bun typecheck`, and `bunx convex codegen` after all changes.
- No `any` types.
- Follow existing import patterns and file conventions.
