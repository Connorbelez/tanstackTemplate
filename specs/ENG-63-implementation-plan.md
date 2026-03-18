# Implementation Plan: ENG-63 - Attempt Execution Pipeline

## Issue
**Linear:** https://linear.app/fairlend/issue/ENG-63
**Title:** implement-attempt-execution-pipeline-emitpaymentreceived

## Status
- [ ] Not specced in Notion yet
- [x] Context gathered from ENG-61, ENG-56 specs + codebase

---

## Acceptance Criteria (from Issue Title)
1. Execute scheduled collection plan entries (attempt execution pipeline)
2. Emit payment received events when settlements complete

---

## Implementation Steps

### Step 1: Add settlement handler mutation
**File:** `convex/payments/collectionPlan/mutations.ts`

Create `handleSettlement` internal mutation that:
```typescript
export const handleSettlement = internalMutation({
  args: {
    planEntryId: v.id("collectionPlanEntries"),
    providerRef: v.string(),
    success: v.boolean(),
    settledAt: v.optional(v.number()),
    failureReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // 1. Load the collection attempt by planEntryId + providerRef
    // 2. Update attempt: set settledAt/failedAt, status
    // 3. If success: update each obligation's amountSettled
    // 4. Trigger evaluateRules with eventType
  },
});
```

### Step 2: Create execution action
**File:** `convex/payments/collectionPlan/actions.ts` (new file)

Create `executeScheduledEntries` internal action:
```typescript
export const executeScheduledEntries = internalAction({
  args: {},
  handler: async (ctx) => {
    // 1. Query planned entries where scheduledDate <= now
    const entries = await ctx.runQuery(
      internal.payments.collectionPlan.queries.getExecutableEntries
    );

    // 2. For each entry, create attempt and initiate payment
    for (const entry of entries) {
      // Create attempt
      const attemptId = await ctx.runMutation(
        internal.payments.collectionPlan.mutations.createAttempt,
        { planEntryId: entry._id, ... }
      );

      // Get payment method
      const method = getPaymentMethod(entry.method);

      // Initiate with injected scheduler
      const result = await method.initiate({
        amount: entry.amount,
        mortgageId: /* get from obligations */,
        borrowerId: /* get from obligations */,
        planEntryId: entry._id,
        method: entry.method,
      });

      // Update attempt with providerRef, status
      // Update plan entry to "executing"
    }
  },
});
```

### Step 3: Create getExecutableEntries query
**File:** `convex/payments/collectionPlan/queries.ts`

```typescript
export const getExecutableEntries = internalQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    return await ctx.db
      .query("collectionPlanEntries")
      .withIndex("by_scheduled_date", (q) =>
        q.lte("scheduledDate", now).eq("status", "planned")
      )
      .collect();
  },
});
```

### Step 4: Wire scheduler to settlement handler
**File:** `convex/payments/collectionPlan/scheduler.ts` (new file)

Create scheduler setup that connects MockPADMethod's callback to `handleSettlement`:
```typescript
export const setupPaymentScheduler = (ctx: ActionCtx) => {
  const scheduleSettlement: ScheduleSettlementFn = async (delayMs, params) => {
    await ctx.scheduler.runAfter(delayMs, internal.payments.collectionPlan.mutations.handleSettlement, {
      planEntryId: params.planEntryId,
      providerRef: params.providerRef,
      success: !params.shouldFail,
      settledAt: params.shouldFail ? undefined : Date.now(),
      failureReason: params.shouldFail ? "PROVIDER_REJECTED" : undefined,
    });
  };
  return scheduleSettlement;
};
```

### Step 5: Add cron job
**File:** `convex/crons.ts`

```typescript
crons hourly(
  "execute scheduled collection entries",
  { minuteUTC: 0 },
  internal.payments.collectionPlan.actions.executeScheduledEntries
);
```

---

## Integration Points

### From ENG-61 (Rules Engine)
```typescript
// Trigger rules on settlement
await ctx.runMutation(
  internal.payments.collectionPlan.engine.evaluateRules,
  {
    trigger: "event",
    eventType: "FUNDS_SETTLED", // or "COLLECTION_FAILED"
    eventPayload: {
      attemptId: attemptId,
      planEntryId: planEntryId,
      obligationIds: entry.obligationIds,
      amount: entry.amount,
    }
  }
);
```

### From ENG-56 (PaymentMethod)
```typescript
import { getPaymentMethod } from "../methods/registry";
// Used in executeScheduledEntries
```

---

## Dependencies
- [x] ENG-56: PaymentMethod interface (implemented)
- [x] ENG-61: Rules engine + evaluateRules (implemented)
- [ ] ENG-62: Collection attempt machine (placeholder - states need defining)

---

## Drift Report

| Spec Expects | Code Has | Impact | Recommendation |
|--------------|----------|--------|----------------|
| Full collection attempt machine | Placeholder with only `initiated` state | Settlement handler cannot properly transition states | Wait for ENG-62 to define states, or use simple status strings |

---

## File Map

| File | Action |
|------|--------|
| `convex/payments/collectionPlan/queries.ts` | Add `getExecutableEntries` |
| `convex/payments/collectionPlan/mutations.ts` | Add `createAttempt`, `handleSettlement` |
| `convex/payments/collectionPlan/actions.ts` | Create with `executeScheduledEntries` |
| `convex/payments/collectionPlan/scheduler.ts` | Create with scheduler setup |
| `convex/crons.ts` | Add hourly cron |

---

## Notes

- Amounts in **cents**, timestamps in **milliseconds**
- No `any` types - use proper TypeScript
- The machine placeholder (ENG-62) will need proper states before full integration
- ManualPaymentMethod returns `status: "confirmed"` immediately - handle this case (no scheduler needed)
