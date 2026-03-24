# Chunk 3 Context: Public Queries and Cron

## Goal
1. Create `convex/payments/cashLedger/reconciliationQueries.ts` — public filterable query endpoints
2. Create `convex/payments/cashLedger/reconciliationCron.ts` — cron action with audit logging
3. Modify `convex/crons.ts` — wire in the cash ledger reconciliation at 07:15 UTC

## File Map
| File | Action |
|------|--------|
| `convex/payments/cashLedger/reconciliationQueries.ts` | Create |
| `convex/payments/cashLedger/reconciliationCron.ts` | Create |
| `convex/crons.ts` | Modify |

## T-013: Public Query Endpoints

### Pattern to Follow
Use `cashLedgerQuery` from `../../fluent` (same pattern as existing `queries.ts`):

```typescript
import { v } from "convex/values";
import { cashLedgerQuery } from "../../fluent";
```

### Queries to Expose
Each wraps the corresponding check from `reconciliationSuite.ts`:

1. `reconciliationUnappliedCash` — calls `checkUnappliedCash`, applies filters
2. `reconciliationNegativePayables` — calls `checkNegativePayables`, applies filters
3. `reconciliationObligationDrift` — calls `checkObligationBalanceDrift`, applies filters
4. `reconciliationControlNetZero` — calls `checkControlNetZero`
5. `reconciliationSuspenseItems` — calls `checkSuspenseItems`, applies filters
6. `reconciliationOrphanedObligations` — calls `checkOrphanedObligations`, applies filters
7. `reconciliationStuckCollections` — calls `checkStuckCollections`
8. `reconciliationOrphanedUnapplied` — calls `checkOrphanedUnappliedCash`, applies filters
9. `reconciliationObligationConservation` — calls `checkObligationConservation`
10. `reconciliationMortgageMonthConservation` — calls `checkMortgageMonthConservation`, applies filters
11. `reconciliationFullSuite` — calls `runFullReconciliationSuite`

### Filter Pattern
Each query accepts optional filters and applies them as in-memory post-filters on the check results:

```typescript
export const reconciliationUnappliedCash = cashLedgerQuery
  .input({
    mortgageId: v.optional(v.id("mortgages")),
    fromDate: v.optional(v.string()),
    toDate: v.optional(v.string()),
  })
  .handler(async (ctx, args) => {
    const result = await checkUnappliedCash(ctx);
    let items = result.items;
    if (args.mortgageId) {
      items = items.filter(i => i.mortgageId === args.mortgageId);
    }
    // Date filtering: filter by account age if fromDate/toDate provided
    // ... apply date filters
    return {
      ...result,
      items,
      count: items.length,
      totalAmountCents: items.reduce((s, i) => s + i.balance, 0),
    };
  })
  .public();
```

### Important: BigInt serialization
The check functions return `number` (not `bigint`) in their result types — this is already handled in chunk 1. The public queries can return the results directly.

## T-014: Cron Action

### Pattern to Follow
Mirror the existing GT reconciliation pattern in `convex/engine/reconciliationAction.ts`:
- `internalQuery` — runs the reconciliation suite
- `internalMutation` — logs discrepancies via `auditLog`
- `internalAction` — orchestrates: runs query, if unhealthy runs mutation

```typescript
// convex/payments/cashLedger/reconciliationCron.ts
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "../../_generated/server";
import { auditLog } from "../../auditLog";

// Internal query to run the full suite
export const reconcileCashLedgerInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    // Import and call runFullReconciliationSuite
    // Must convert any bigint values to numbers for serialization
    // Return the full suite result
  },
});

// Internal mutation to log unhealthy results via audit trail
export const logCashLedgerReconciliationAlerts = internalMutation({
  args: {
    checkedAt: v.number(),
    unhealthyCheckNames: v.array(v.string()),
    totalGapCount: v.number(),
    // Include serialized check details
    checkDetails: v.any(),
  },
  handler: async (ctx, args) => {
    await auditLog.log(ctx, {
      action: "cash_ledger_reconciliation.gaps_found",
      actorId: "system",
      resourceType: "reconciliation",
      resourceId: "cash-ledger-daily",
      severity: "error",
      metadata: {
        checkedAt: args.checkedAt,
        unhealthyCheckNames: args.unhealthyCheckNames,
        totalGapCount: args.totalGapCount,
        checkDetails: args.checkDetails,
      },
    });
  },
});

// Cron entry point
export const cashLedgerReconciliation = internalAction({
  handler: async (ctx) => {
    // Use makeFunctionReference for typed cross-function calls
    const result = await ctx.runQuery(reconcileCashLedgerInternalRef, {});
    if (result.isHealthy) {
      console.info("[CASH LEDGER RECONCILIATION] Daily check passed.");
    } else {
      console.error(`[CASH LEDGER RECONCILIATION P0] ${result.totalGapCount} gaps found`);
      await ctx.runMutation(logCashLedgerReconciliationAlertsRef, { ... });
    }
    return result;
  },
});
```

### Important: Actions cannot read the DB directly
The cron `internalAction` must call `ctx.runQuery` for the reconciliation suite, NOT access `ctx.db`. This is a Convex constraint. The pattern is:
1. `internalAction` → calls `ctx.runQuery(reconcileCashLedgerInternal)`
2. If unhealthy → calls `ctx.runMutation(logCashLedgerReconciliationAlerts)`

### Important: auditLog.log() requires MutationCtx
`auditLog.log()` can only be called from mutations, not actions. That's why we need the separate `internalMutation`.

### Function Reference Pattern
Use `makeFunctionReference` for typed references (same pattern as existing `reconciliationAction.ts`):
```typescript
import type { FunctionReference, FunctionType } from "convex/server";
import { makeFunctionReference } from "convex/server";

function makeInternalRef<
  Type extends FunctionType,
  Args extends Record<string, unknown>,
  ReturnType,
>(name: string) {
  return makeFunctionReference<Type, Args, ReturnType>(
    name
  ) as unknown as FunctionReference<Type, "internal", Args, ReturnType>;
}
```

## T-015: Wire into crons.ts

### Current crons.ts
```typescript
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily(
  "daily reconciliation check",
  { hourUTC: 7, minuteUTC: 0 },
  internal.engine.reconciliationAction.dailyReconciliation
);

crons.daily(
  "daily obligation transitions",
  { hourUTC: 6, minuteUTC: 0 },
  internal.payments.obligations.crons.processObligationTransitions
);

crons.interval(
  "dispersal self-healing",
  { minutes: 15 },
  internal.dispersal.selfHealing.dispersalSelfHealingCron
);

export default crons;
```

### Add this entry
```typescript
crons.daily(
  "cash ledger reconciliation",
  { hourUTC: 7, minuteUTC: 15 },
  internal.payments.cashLedger.reconciliationCron.cashLedgerReconciliation
);
```

Schedule at 07:15 UTC (15 minutes after GT reconciliation) to avoid overlap.

## Constraints
- Run `bunx convex codegen` after creating the new files to generate types
- Run `bun typecheck` to verify
- No `any` types except in `auditLog.log()` metadata (which accepts `v.any()`)
