# Chunk 01 Context: Collection Plan Queries + Seed Mutation

## Issue: ENG-66

Implement payment seed mutations + obligation and plan entry queries.

## Acceptance Criteria (verbatim)

### Seed
- `seedPaymentData(mortgageId)`: calls `generateObligations`, then evaluates ScheduleRule to create initial plan entries
- Seed produces realistic state: some obligations upcoming, some due, some with plan entries

### Obligation Queries (ALREADY DONE — do NOT reimplement)
All 5 obligation queries already exist in `convex/payments/obligations/queries.ts`:
- `getObligationsByMortgage`, `getUpcomingDue`, `getDuePastGrace`, `getOverdue`, `getLateFeeForObligation`

### Collection Plan Queries (NEEDS IMPLEMENTATION)
- `getEntryForObligation(obligationId)` — check if plan entry already exists
- `getPlanEntriesByStatus(status, scheduledBefore?)` — for execution cron

---

## Schema Context

### obligations table (from schema.ts lines 507-540)
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

### collectionPlanEntries table (from schema.ts lines 546-569)
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

### mortgages table (relevant fields for generation, from schema.ts lines 415-471)
```typescript
mortgages: defineTable({
    status: v.string(),
    machineContext: v.optional(v.any()),
    lastTransitionAt: v.optional(v.number()),
    propertyId: v.id("properties"),
    principal: v.number(),
    // Interest rate stored as decimal (e.g., 0.12 = 12%)
    interestRate: v.number(),
    rateType: v.union(v.literal("fixed"), v.literal("variable")),
    termMonths: v.number(),
    amortizationMonths: v.number(),
    paymentAmount: v.number(),
    paymentFrequency: v.union(
        v.literal("monthly"),
        v.literal("bi_weekly"),
        v.literal("accelerated_bi_weekly"),
        v.literal("weekly")
    ),
    // ... other fields ...
    interestAdjustmentDate: v.string(),
    termStartDate: v.string(),
    maturityDate: v.string(),
    firstPaymentDate: v.string(),
    brokerOfRecordId: v.id("brokers"),
    // ...
    createdAt: v.number(),
})
```

---

## Existing Code to Reference

### T-001/T-002: Existing `generateObligations` (convex/payments/obligations/generate.ts)

This is the file you need to refactor. Extract the core logic into a shared function.

```typescript
import { ConvexError, v } from "convex/values";
import type { Id } from "../../_generated/dataModel";
import { internalMutation } from "../../_generated/server";

const PERIODS_PER_YEAR: Record<string, number> = {
    monthly: 12,
    bi_weekly: 26,
    accelerated_bi_weekly: 26,
    weekly: 52,
};

const GRACE_PERIOD_DAYS = 15;
const MS_PER_DAY = 86_400_000;

function advanceMonth(date: Date): Date {
    const result = new Date(date);
    const targetMonth = result.getMonth() + 1;
    result.setMonth(targetMonth);
    if (result.getMonth() !== targetMonth % 12) {
        result.setDate(0);
    }
    return result;
}

export const generateObligations = internalMutation({
    args: {
        mortgageId: v.id("mortgages"),
    },
    handler: async (ctx, args) => {
        const mortgage = await ctx.db.get(args.mortgageId);
        if (!mortgage) {
            throw new ConvexError(`Mortgage not found: ${args.mortgageId as string}`);
        }
        const existing = await ctx.db
            .query("obligations")
            .withIndex("by_mortgage", (q) => q.eq("mortgageId", args.mortgageId))
            .first();
        if (existing) {
            return { generated: 0, obligations: [], skipped: true };
        }
        const borrowerLink = await ctx.db
            .query("mortgageBorrowers")
            .withIndex("by_mortgage", (q) => q.eq("mortgageId", args.mortgageId))
            .first();
        if (!borrowerLink) {
            throw new ConvexError(
                `No borrower found for mortgage: ${args.mortgageId as string}`
            );
        }
        const borrowerId = borrowerLink.borrowerId;
        const firstPaymentTs = new Date(mortgage.firstPaymentDate).getTime();
        const maturityTs = new Date(mortgage.maturityDate).getTime();
        const periodsPerYear = PERIODS_PER_YEAR[mortgage.paymentFrequency];
        if (!periodsPerYear) {
            throw new ConvexError(
                `Unknown payment frequency: ${mortgage.paymentFrequency}`
            );
        }
        const periodAmount = Math.round(
            (mortgage.interestRate * mortgage.principal) / periodsPerYear
        );
        const obligations: Id<"obligations">[] = [];
        let currentDate = new Date(firstPaymentTs);
        let index = 0;
        while (currentDate.getTime() <= maturityTs) {
            const currentTimestamp = currentDate.getTime();
            const now = Date.now();
            const id = await ctx.db.insert("obligations", {
                status: "upcoming",
                machineContext: { obligationId: "", paymentsApplied: 0 },
                lastTransitionAt: now,
                mortgageId: args.mortgageId,
                borrowerId,
                paymentNumber: index + 1,
                type: "regular_interest",
                amount: periodAmount,
                amountSettled: 0,
                dueDate: currentTimestamp,
                gracePeriodEnd: currentTimestamp + GRACE_PERIOD_DAYS * MS_PER_DAY,
                createdAt: now,
            });
            await ctx.db.patch(id, {
                machineContext: { obligationId: id, paymentsApplied: 0 },
            });
            obligations.push(id);
            index++;
            if (mortgage.paymentFrequency === "monthly") {
                currentDate = advanceMonth(currentDate);
            } else if (
                mortgage.paymentFrequency === "bi_weekly" ||
                mortgage.paymentFrequency === "accelerated_bi_weekly"
            ) {
                currentDate = new Date(currentDate.getTime() + 14 * MS_PER_DAY);
            } else {
                currentDate = new Date(currentDate.getTime() + 7 * MS_PER_DAY);
            }
        }
        return { generated: obligations.length, obligations };
    },
});
```

**Refactoring plan for T-001/T-002:**
1. Create `convex/payments/obligations/generateImpl.ts` with:
   - Exported constants: `PERIODS_PER_YEAR`, `GRACE_PERIOD_DAYS`, `MS_PER_DAY`
   - Exported function: `advanceMonth(date: Date): Date`
   - Exported function: `generateObligationsImpl(ctx: MutationCtx, params: GenerateObligationsParams)` — the core loop
   - The params interface should take already-resolved values (mortgageId, borrowerId, interestRate, principal, paymentFrequency, firstPaymentDate, maturityDate) so it doesn't need to do DB lookups
2. Refactor `generate.ts` to: load mortgage, resolve borrower, idempotency check, then call `generateObligationsImpl()`
3. `seedPaymentData.ts` will also call `generateObligationsImpl()` after its own loading/resolution

#### GenerateObligationsParams Interface

```typescript
interface GenerateObligationsParams {
    mortgageId: Id<"mortgages">;
    borrowerId: Id<"borrowers">;
    interestRate: number; // decimal format (e.g., 0.12 = 12%)
    principal: number;
    paymentFrequency: "monthly" | "bi_weekly" | "accelerated_bi_weekly" | "weekly";
    firstPaymentDate: string; // ISO date string
    maturityDate: string; // ISO date string
}
```

### T-003/T-004: Collection Plan Query Design

**`getEntryForObligation(obligationId)`**:
- `obligationIds` is an array — Convex cannot index arrays
- Must scan `collectionPlanEntries` and filter in JS
- Exclude cancelled entries (only look for active/planned ones)
- Return the first matching entry or null

**`getPlanEntriesByStatus(status, scheduledBefore?)`**:
- The `by_scheduled_date` index is `[scheduledDate, status]` — Convex requires equality prefix before range
- The `by_status` index is `[status]`
- For status-only queries: use `by_status` index
- For status + scheduledBefore: use `by_status` index + filter on scheduledDate (since the composite index ordering doesn't support status equality + scheduledDate range)
- Both should be `internalQuery`

### T-005: seedPaymentData Design

The seed mutation should:
1. Load the mortgage and resolve borrower
2. Check if obligations already exist (idempotency)
3. If not, call `generateObligationsImpl()` to create them
4. Collect all obligations for the mortgage
5. For obligations due within a scheduling window (default 5 days from now), create `collectionPlanEntries` with status "planned", source "default_schedule", method "manual"
6. Check idempotency for plan entries too (don't create duplicates)
7. Return summary: { mortgageId, obligationsGenerated, obligationsTotal, planEntriesCreated }

Two exports:
- `seedPaymentDataInternal` — `internalMutation` for use by `seedAll`
- `seedPaymentData` — `adminMutation` (fluent chain) for dashboard use

Follow the same pattern as existing seeds in `convex/seed/`:
- Use `adminMutation` from `convex/fluent.ts` for the public version
- Use `internalMutation` from `convex/_generated/server` for the internal version
- Keep a shared `Impl` function for both

#### SeedPaymentDataResult Type

```typescript
interface SeedPaymentDataResult {
    mortgageId: Id<"mortgages">;
    obligationsGenerated: number;
    obligationsTotal: number;
    planEntriesCreated: number;
    skipped: boolean;
}
```

### T-006: seedAll.ts Wiring

The existing `seedAll.ts` uses `makeFunctionReference` to call seed mutations from an `adminAction`. Add `seedPaymentData` after the existing `obligations` step.

```typescript
// Add after obligations step:
const seedPaymentDataRef = makeFunctionReference<
    "mutation",
    { mortgageId: Id<"mortgages"> },
    SeedPaymentDataResult
>("seed/seedPaymentData:seedPaymentDataInternal");

// In handler, after obligations:
const paymentDataResults = [];
for (const mortgageId of mortgages.mortgageIds) {
    const result = await ctx.runMutation(seedPaymentDataRef, { mortgageId });
    paymentDataResults.push(result);
}
```

Add to the return object and summary.

---

## Fluent Middleware Patterns

The project uses fluent-convex for auth. Key chains from `convex/fluent.ts`:

```typescript
export const adminMutation = convex
    .mutation()
    .use(authMiddleware)
    .use(requireFairLendAdmin);

export const adminAction = authedAction.use(requireFairLendAdminAction);
```

For seed mutations:
```typescript
export const seedPaymentData = adminMutation
    .input({ mortgageId: v.id("mortgages") })
    .handler(async (ctx, args) => {
        // Implementation
    })
    .public();
```

---

## Existing Seed Patterns

Reference `convex/seed/seedObligation.ts` for the canonical seed pattern:
- Import `adminMutation` from `../fluent`
- `.input({...})` for args validation
- `.handler(async (ctx, args) => {...})` for implementation
- `.public()` to expose

Reference `convex/seed/seedAll.ts` for orchestrator pattern:
- Uses `makeFunctionReference` with explicit type params
- Chains mutations sequentially via `ctx.runMutation`
- Returns structured summary

---

## Index Usage Notes

**CRITICAL**: Convex composite indexes require equality constraints on all prefix fields before using range constraints on the last field. For index `[A, B]`:
- ✅ `.eq("A", val)` then `.eq("B", val)` — both equality
- ✅ `.eq("A", val)` — prefix equality only
- ❌ `.lte("A", val).eq("B", val)` — range on prefix, equality on suffix (WRONG)

For `by_scheduled_date: ["scheduledDate", "status"]`:
- Can do: `.eq("scheduledDate", exact).eq("status", val)` — both equality
- Can do: range on scheduledDate only (without status constraint)
- CANNOT do: range on scheduledDate + equality on status

So `getPlanEntriesByStatus` with `scheduledBefore` should use `by_status` index + `.filter()` on scheduledDate.

---

## Quality Checks (from CLAUDE.md)

After all tasks, run:
```bash
bunx convex codegen && bun check && bun typecheck
```

All three must pass before the chunk is considered complete.
