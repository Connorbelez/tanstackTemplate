# Chunk 2 Context: Engine + Rules

## Architecture

The rules engine is the intelligence layer between obligations and collection attempts. It evaluates data-driven rules to decide when and how to collect.

### Key Design Decisions
1. **Action-based engine**: `evaluateRules` is an `internalAction` because it orchestrates multiple DB reads and writes. Each rule handler calls `ctx.runQuery` and `ctx.runMutation`.
2. **Handler registry pattern (Strategy Pattern)**: A `Record<string, RuleHandler>` maps rule names to handlers. Adding a new rule = new handler file + registry entry.
3. **Idempotency over transactions**: Each rule handler is individually idempotent since Convex actions can't be transactional across mutations.
4. **Priority ordering**: Rules queried with `by_trigger` index which includes priority in ascending order. Lower numeric priority values execute first (e.g., priority 10 runs before priority 20).

## Schema Definitions

### obligations table
```typescript
obligations: defineTable({
  status: v.string(),
  machineContext: v.optional(v.any()),
  lastTransitionAt: v.optional(v.number()),
  mortgageId: v.id("mortgages"),
  borrowerId: v.id("borrowers"),
  paymentNumber: v.number(),
  type: v.union(
    v.literal("regular_interest"),
    v.literal("arrears_cure"),
    v.literal("late_fee"),
    v.literal("principal_repayment")
  ),
  amount: v.number(),
  amountSettled: v.number(),
  dueDate: v.number(),
  gracePeriodEnd: v.number(),
  sourceObligationId: v.optional(v.id("obligations")),
  settledAt: v.optional(v.number()),
  createdAt: v.number(),
})
  .index("by_status", ["status"])
  .index("by_mortgage", ["mortgageId", "status"])
  .index("by_mortgage_and_date", ["mortgageId", "dueDate"])
  .index("by_due_date", ["dueDate", "status"])
  .index("by_borrower", ["borrowerId"]),
```

### collectionPlanEntries table
```typescript
collectionPlanEntries: defineTable({
  obligationIds: v.array(v.id("obligations")),
  amount: v.number(),
  method: v.string(),
  scheduledDate: v.number(),
  status: v.union(
    v.literal("planned"),
    v.literal("executing"),
    v.literal("completed"),
    v.literal("cancelled"),
    v.literal("rescheduled")
  ),
  source: v.union(
    v.literal("default_schedule"),
    v.literal("retry_rule"),
    v.literal("late_fee_rule"),
    v.literal("admin")
  ),
  ruleId: v.optional(v.id("collectionRules")),
  rescheduledFromId: v.optional(v.id("collectionPlanEntries")),
  createdAt: v.number(),
})
  .index("by_scheduled_date", ["scheduledDate", "status"])
  .index("by_status", ["status"]),
```

### collectionRules table
```typescript
collectionRules: defineTable({
  name: v.string(),
  trigger: v.union(v.literal("schedule"), v.literal("event")),
  condition: v.optional(v.any()),
  action: v.string(),
  parameters: v.optional(v.any()),
  priority: v.number(),
  enabled: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
}).index("by_trigger", ["trigger", "enabled", "priority"]),
```

### collectionAttempts table
```typescript
collectionAttempts: defineTable({
  status: v.string(),
  machineContext: v.optional(v.any()),
  lastTransitionAt: v.optional(v.number()),
  planEntryId: v.id("collectionPlanEntries"),
  method: v.string(),
  amount: v.number(),
  providerRef: v.optional(v.string()),
  providerStatus: v.optional(v.string()),
  providerData: v.optional(v.any()),
  initiatedAt: v.number(),
  settledAt: v.optional(v.number()),
  failedAt: v.optional(v.number()),
  failureReason: v.optional(v.string()),
})
  .index("by_plan_entry", ["planEntryId"])
  .index("by_status", ["status"])
  .index("by_provider_ref", ["providerRef"]),
```

## T-005: Engine (convex/payments/collectionPlan/engine.ts)

### RuleHandler interface and RuleEvalContext type
```typescript
import type { ActionCtx } from "../../_generated/server";
import type { Doc } from "../../_generated/dataModel";

export interface RuleEvalContext {
  rule: Doc<"collectionRules">;
  mortgageId?: string;
  eventType?: string;
  eventPayload?: Record<string, unknown>;
}

export interface RuleHandler {
  evaluate(ctx: ActionCtx, evalCtx: RuleEvalContext): Promise<void>;
}
```

### Handler registry
```typescript
const ruleHandlerRegistry: Record<string, RuleHandler> = {
  schedule_rule: scheduleRuleHandler,
  retry_rule: retryRuleHandler,
  late_fee_rule: lateFeeRuleHandler,
};
```

### evaluateRules internalAction
```typescript
export const evaluateRules = internalAction({
  args: {
    trigger: v.union(v.literal("schedule"), v.literal("event")),
    mortgageId: v.optional(v.id("mortgages")),
    eventType: v.optional(v.string()),
    eventPayload: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    // Load enabled rules sorted by priority
    const rules = await ctx.runQuery(
      internal.payments.collectionPlan.queries.getEnabledRules,
      { trigger: args.trigger }
    );

    for (const rule of rules) {
      const ruleHandler = ruleHandlerRegistry[rule.name];
      if (!ruleHandler) {
        console.warn(`No handler for rule: ${rule.name}`);
        continue;
      }

      await ruleHandler.evaluate(ctx, {
        rule,
        mortgageId: args.mortgageId,
        eventType: args.eventType,
        eventPayload: args.eventPayload,
      });
    }
  },
});
```

**IMPORTANT**: Import the `internal` API reference from `../../_generated/api` for `ctx.runQuery` and `ctx.runMutation` calls within actions.

## T-006: ScheduleRule (convex/payments/collectionPlan/rules/scheduleRule.ts)

### Behavior
1. Read `delayDays` from `rule.parameters` (default 5)
2. Calculate scheduling window: now to now + delayDays * 86400000 ms
3. Query upcoming obligations due within window via `getUpcomingInWindow`
4. For each obligation, check idempotency via `getEntryForObligation`
5. If no existing entry, create plan entry:
   - `source: "default_schedule"`
   - `method: "manual"` (Phase 1 default — no preferredPaymentMethod on mortgage schema)
   - `scheduledDate: obligation.dueDate - delayDays * 86400000`
   - `status: "planned"`
   - `obligationIds: [obligation._id]`
   - `amount: obligation.amount`
   - `ruleId: rule._id`

### Notes
- If mortgageId provided, filter obligations to that mortgage. If not, scan all upcoming (cron mode).
- No `preferredPaymentMethod` on mortgage schema — default to `"manual"`.

## T-007: RetryRule (convex/payments/collectionPlan/rules/retryRule.ts)

### Behavior
1. Guard: if `eventType !== "COLLECTION_FAILED"` return
2. Read `maxRetries` (default 3) and `backoffBaseDays` (default 3) from rule.parameters
3. Extract `attemptId` from eventPayload — load the failed attempt
4. Get retry count from `eventPayload.retryCount` or the attempt's data (default 0)
5. If retryCount >= maxRetries, return
6. Calculate delay: `backoffBaseDays * Math.pow(2, retryCount)` days
7. Create new plan entry:
   - `source: "retry_rule"`
   - `rescheduledFromId`: the failed attempt's planEntryId
   - `scheduledDate: Date.now() + delayDays * 86400000`
   - `status: "planned"`
   - Same obligationIds and amount from the failed attempt's plan entry

### Backoff Pattern
- retryCount=0 → 3 * 2^0 = 3 days
- retryCount=1 → 3 * 2^1 = 6 days
- retryCount=2 → 3 * 2^2 = 12 days
- Note: Spec narrative says "3, 7, 14" but formula gives 3, 6, 12. Implementation uses formula.

### Loading the failed attempt
The RetryRule needs to load the failed collection attempt. Use `ctx.runQuery` with an internal query.
Since `collectionAttempts` queries may not exist yet, you may need to query directly. But since this is an action (not a mutation), you must use `ctx.runQuery`.

**Solution**: Create a minimal `getAttemptById` internal query inline or in a separate file if needed. Or, pass the necessary data through eventPayload (obligationIds, amount, method, planEntryId, retryCount) so the RetryRule doesn't need to load the attempt separately. **Prefer passing data through eventPayload** — this is the cleaner approach since the caller already has the attempt data.

Expected eventPayload shape for COLLECTION_FAILED:
```typescript
{
  attemptId: string; // the failed attempt ID
  planEntryId: string; // the plan entry that spawned the attempt
  obligationIds: string[]; // from the plan entry
  amount: number; // from the plan entry
  method: string; // payment method used
  retryCount: number; // current retry count (0-based)
}
```

## T-008: LateFeeRule (convex/payments/collectionPlan/rules/lateFeeRule.ts)

### Behavior
1. Guard: if `eventType !== "OBLIGATION_OVERDUE"` return
2. Read `feeAmountCents` (default 5000), `dueDays` (default 30), `graceDays` (default 45) from rule.parameters
3. Extract `obligationId` and `mortgageId` from eventPayload
4. Idempotency check: query `getLateFeeForObligation({ sourceObligationId: obligationId })`
5. If exists, return
6. Load source obligation to get `borrowerId`
7. Create new obligation:
   - `type: "late_fee"`
   - `amount: feeAmountCents`
   - `amountSettled: 0`
   - `dueDate: Date.now() + dueDays * 86400000`
   - `gracePeriodEnd: Date.now() + graceDays * 86400000`
   - `sourceObligationId: obligationId`
   - `status: "upcoming"`
   - `paymentNumber: 0` (late fees not part of regular sequence)
   - `mortgageId` from eventPayload
   - `borrowerId` from source obligation
   - `createdAt: Date.now()`

### Creating obligations from an action
LateFeeRule creates obligations, NOT plan entries. Must use `ctx.runMutation` with an internal mutation.
Need a `createObligation` internal mutation. Add this to `convex/payments/collectionPlan/mutations.ts` or create a separate obligations mutation file.

**Recommended**: Add `createObligation` as an internal mutation in `convex/obligations/mutations.ts` (create file if it doesn't exist). This mutation should accept all obligation fields and insert into the obligations table.

## Integration Points (from SPEC)

### evaluateRules contract (consumed by effects in ENG-57, ENG-59, ENG-63)
```typescript
internalAction({
  args: {
    trigger: v.union(v.literal("schedule"), v.literal("event")),
    mortgageId: v.optional(v.id("mortgages")),
    eventType: v.optional(v.string()),
    eventPayload: v.optional(v.any()),
  }
})
```

### createEntry contract (consumed by ENG-63 execution pipeline)
Creates `collectionPlanEntries` doc with `status: "planned"` for the execution pipeline to pick up.

## Import Patterns for Actions
```typescript
import { v } from "convex/values";
import { internalAction } from "../../_generated/server";
import { internal } from "../../_generated/api";
```

## Key Constraints
- evaluateRules is `internalAction` (not mutation) — orchestrates multiple mutations
- Rule handlers use `ctx.runQuery` and `ctx.runMutation` (action context)
- No `any` types in TypeScript code (schema `any` for parameters is acceptable)
- All amounts in cents
- Timestamps in milliseconds
