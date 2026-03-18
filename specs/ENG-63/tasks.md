# Implementation Plan: ENG-63 - Attempt Execution Pipeline

## Issue
- **Linear:** https://linear.app/fairlend/issue/ENG-63
- **Title:** Implement attempt execution pipeline + emitPaymentReceived + emitCollectionFailed effects
- **Project:** WS5: Payment Rail Abstractions & Collection System

## Context Sources
- SPEC 1.5 — Payment Rails (Sections 4.2, 8.1)
- UC-47 — Healthy monthly payment
- Admin collects payment via ManualPaymentMethod
- ENG-61: Rules engine
- ENG-56: PaymentMethod interface

---

## Acceptance Criteria

- [ ] `executeCollectionEntry(planEntryId)`: creates Collection Attempt in `initiated`, resolves PaymentMethod from registry, calls `initiate()`
- [ ] ManualPaymentMethod path: initiate returns "confirmed" → immediately fires FUNDS_SETTLED → attempt transitions to confirmed → emitPaymentReceived fires PAYMENT_APPLIED to Obligation
- [ ] MockPADMethod path: initiate returns "pending" → fires DRAW_INITIATED → schedules delayed confirmation/failure
- [ ] Plan entry status updated to "executing" on attempt creation, "completed" on confirmation
- [ ] `emitPaymentReceived` effect: loads attempt → plan entry → obligations, fires PAYMENT_APPLIED to each with correct amounts
- [ ] `emitCollectionFailed` effect: triggers rules engine evaluation with COLLECTION_FAILED event
- [ ] Both effects registered in Effect Registry

---

## Tasks

### Phase 1: Foundation

#### T-001: Add getExecutableEntries query
**File:** `convex/payments/collectionPlan/queries.ts`

Query that returns planned entries where `scheduledDate <= now`:
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

#### T-002: Add createAttempt mutation
**File:** `convex/payments/collectionPlan/mutations.ts`

Create collection attempt when executing a plan entry:
```typescript
export const createAttempt = internalMutation({
  args: {
    planEntryId: v.id("collectionPlanEntries"),
    method: v.string(),
    amount: v.number(),
  },
  handler: async (ctx, args) => {
    const attemptId = await ctx.db.insert("collectionAttempts", {
      planEntryId: args.planEntryId,
      method: args.method,
      amount: args.amount,
      status: "initiated",
      initiatedAt: Date.now(),
    });
    return attemptId;
  },
});
```

#### T-003: Add updatePlanEntryStatus mutation
**File:** `convex/payments/collectionPlan/mutations.ts`

Update plan entry status:
```typescript
export const updatePlanEntryStatus = internalMutation({
  args: {
    planEntryId: v.id("collectionPlanEntries"),
    status: v.union(
      v.literal("planned"),
      v.literal("executing"),
      v.literal("completed"),
      v.literal("cancelled"),
      v.literal("rescheduled")
    ),
  },
  handler: async (ctx, { planEntryId, status }) => {
    await ctx.db.patch(planEntryId, { status });
  },
});
```

#### T-004: Add updateAttemptStatus mutation
**File:** `convex/payments/collectionPlan/mutations.ts`

Update attempt status and provider info:
```typescript
export const updateAttemptStatus = internalMutation({
  args: {
    attemptId: v.id("collectionAttempts"),
    status: v.string(),
    providerRef: v.optional(v.string()),
    providerStatus: v.optional(v.string()),
    settledAt: v.optional(v.number()),
    failedAt: v.optional(v.number()),
    failureReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { attemptId, ...updates } = args;
    await ctx.db.patch(attemptId, updates);
  },
});
```

---

### Phase 2: Effects

#### T-005: Implement emitPaymentReceived effect
**File:** `convex/engine/effects/collection.ts` (new file)

Cross-entity effect that fires PAYMENT_APPLIED to each obligation:
```typescript
import { effectPayloadValidator } from "../validators";

// Narrow entityId to collectionAttempts for these effects
const collectionEffectPayloadValidator = {
  ...effectPayloadValidator,
  entityId: v.id("collectionAttempts"),
  entityType: v.literal("collectionAttempt"),
};

export const emitPaymentReceived = internalMutation({
  args: collectionEffectPayloadValidator,
  handler: async (ctx, args) => {
    // 1. Load collection attempt
    const attempt = await ctx.db.get(args.entityId);
    if (!attempt) throw new Error(`Attempt not found: ${args.entityId}`);

    // 2. Load plan entry to get obligationIds
    const planEntry = await ctx.db.get(attempt.planEntryId);
    if (!planEntry) throw new Error(`Plan entry not found: ${attempt.planEntryId}`);

    // 3. For each obligation, fire PAYMENT_APPLIED
    for (const obligationId of planEntry.obligationIds) {
      const obligation = await ctx.db.get(obligationId);
      if (!obligation) continue;

      const amountToApply = Math.min(attempt.amount, obligation.amount - obligation.amountSettled);

      await executeTransition(ctx, {
        entityType: "obligation",
        entityId: obligationId,
        eventType: "PAYMENT_APPLIED",
        payload: {
          amount: amountToApply,
          paidAt: attempt.settledAt ?? Date.now(),
          attemptId: attempt._id,
        },
        source: args.source,
      });
    }
  },
});
```

#### T-006: Implement emitCollectionFailed effect
**File:** `convex/engine/effects/collection.ts`

Effect that triggers rules engine with COLLECTION_FAILED:
```typescript
export const emitCollectionFailed = internalAction({
  args: collectionEffectPayloadValidator,
  handler: async (ctx, args) => {
    // 1. Load the attempt and plan entry to build the full payload
    //    that retryRule expects (planEntryId, obligationIds, amount, method, retryCount)
    const attempt = await ctx.runQuery(
      internal.payments.collectionPlan.queries.getAttempt,
      { attemptId: args.entityId }
    );
    if (!attempt) throw new Error(`Attempt not found: ${args.entityId}`);

    const planEntry = await ctx.runQuery(
      internal.payments.collectionPlan.queries.getPlanEntry,
      { planEntryId: attempt.planEntryId }
    );
    if (!planEntry) throw new Error(`Plan entry not found: ${attempt.planEntryId}`);

    // 2. Trigger rules engine with full COLLECTION_FAILED eventPayload
    //    retryRule expects: planEntryId, obligationIds, amount, method, retryCount
    await ctx.runAction(
      internal.payments.collectionPlan.engine.evaluateRules,
      {
        trigger: "event",
        eventType: "COLLECTION_FAILED",
        eventPayload: {
          planEntryId: planEntry._id,
          obligationIds: planEntry.obligationIds,
          amount: planEntry.amount,
          method: planEntry.method,
          retryCount: planEntry.retryCount ?? 0,
        },
      }
    );
  },
});
```

#### T-007: Register effects in Effect Registry
**File:** `convex/engine/effects/registry.ts`

Add:
```typescript
emitPaymentReceived: internal.engine.effects.collection.emitPaymentReceived,
emitCollectionFailed: internal.engine.effects.collection.emitCollectionFailed,
```

---

### Phase 3: Execution Pipeline

#### T-008: Implement executeCollectionEntry mutation
**File:** `convex/payments/collectionPlan/mutations.ts`

Main execution mutation (uses `internalMutation` since it needs direct DB access via `ctx.db.*`):
```typescript
export const executeCollectionEntry = internalMutation({
  args: {
    planEntryId: v.id("collectionPlanEntries"),
  },
  handler: async (ctx, { planEntryId }) => {
    // 1. Load plan entry
    const planEntry = await ctx.db.get(planEntryId);
    if (!planEntry) throw new Error(`Plan entry not found: ${planEntryId}`);
    if (planEntry.status !== "planned") {
      console.warn(`Plan entry ${planEntryId} not planned, status: ${planEntry.status}`);
      return;
    }

    // 2. Update plan entry to executing
    await ctx.db.patch(planEntryId, { status: "executing" });

    // 3. Get mortgageId and borrowerId from obligations
    const firstObligation = await ctx.db.get(planEntry.obligationIds[0]);
    if (!firstObligation) throw new Error("No obligations in plan entry");
    const mortgageId = firstObligation.mortgageId;
    const borrowerId = firstObligation.borrowerId;

    // 4. Create attempt
    const attemptId = await ctx.db.insert("collectionAttempts", {
      planEntryId: planEntry._id,
      method: planEntry.method,
      amount: planEntry.amount,
      status: "initiated",
      initiatedAt: Date.now(),
    });

    // 5. Get payment method with scheduler
    const paymentMethod = createPaymentMethodRegistry({
      scheduleSettlement: async (delayMs, params) => {
        await ctx.scheduler.runAfter(
          delayMs,
          internal.payments.collectionPlan.mutations.handleSettlement,
          {
            attemptId: attemptId,
            providerRef: params.providerRef,
            shouldFail: params.shouldFail,
          }
        );
      },
    }).get(planEntry.method);

    // 6. Initiate payment
    const result = await paymentMethod.initiate({
      amount: planEntry.amount,
      mortgageId,
      borrowerId,
      planEntryId: planEntry._id,
      method: planEntry.method,
    });

    // 7. Update attempt with provider ref
    await ctx.db.patch(attemptId, {
      providerRef: result.providerRef,
    });

    // 8. Handle immediate confirmation (ManualPaymentMethod)
    if (result.status === "confirmed") {
      // Fire FUNDS_SETTLED event via executeTransition
      await executeTransition(ctx, {
        entityType: "collectionAttempt",
        entityId: attemptId,
        eventType: "FUNDS_SETTLED",
        payload: { providerRef: result.providerRef },
        source: { type: "system", channel: "payment_collection" },
      });
    } else {
      // Fire DRAW_INITIATED (MockPADMethod pending)
      await executeTransition(ctx, {
        entityType: "collectionAttempt",
        entityId: attemptId,
        eventType: "DRAW_INITIATED",
        payload: { providerRef: result.providerRef },
        source: { type: "system", channel: "payment_collection" },
      });
    }
  },
});
```

#### T-009: Implement handleSettlement mutation
**File:** `convex/payments/collectionPlan/mutations.ts`

Handle delayed settlement from scheduler:
```typescript
export const handleSettlement = internalMutation({
  args: {
    attemptId: v.id("collectionAttempts"),
    providerRef: v.string(),
    shouldFail: v.boolean(),
  },
  handler: async (ctx, { attemptId, providerRef, shouldFail }) => {
    const attempt = await ctx.db.get(attemptId);
    if (!attempt) throw new Error(`Attempt not found: ${attemptId}`);

    if (shouldFail) {
      // Update attempt to failed
      await ctx.db.patch(attemptId, {
        status: "failed",
        providerRef,
        providerStatus: "rejected",
        failedAt: Date.now(),
        failureReason: "PROVIDER_REJECTED",
      });

      // Fire COLLECTION_FAILED
      await executeTransition(ctx, {
        entityType: "collectionAttempt",
        entityId: attemptId,
        eventType: "COLLECTION_FAILED",
        payload: { providerRef, failureReason: "PROVIDER_REJECTED" },
        source: { type: "system", channel: "payment_collection" },
      });
    } else {
      // Update attempt to confirmed
      await ctx.db.patch(attemptId, {
        status: "confirmed",
        providerRef,
        providerStatus: "settled",
        settledAt: Date.now(),
      });

      // Fire FUNDS_SETTLED
      await executeTransition(ctx, {
        entityType: "collectionAttempt",
        entityId: attemptId,
        eventType: "FUNDS_SETTLED",
        payload: { providerRef },
        source: { type: "system", channel: "payment_collection" },
      });
    }
  },
});
```

#### T-010: Implement executeScheduledEntries action (cron target)
**File:** `convex/payments/collectionPlan/actions.ts`

Cron job target:
```typescript
export const executeScheduledEntries = internalAction({
  args: {},
  handler: async (ctx) => {
    const entries = await ctx.runQuery(
      internal.payments.collectionPlan.queries.getExecutableEntries
    );

    console.info(`[executeScheduledEntries] Found ${entries.length} executable entries`);

    for (const entry of entries) {
      try {
        await ctx.runMutation(
          internal.payments.collectionPlan.mutations.executeCollectionEntry,
          { planEntryId: entry._id }
        );
      } catch (error) {
        console.error(`[executeScheduledEntries] Failed for ${entry._id}:`, error);
      }
    }
  },
});
```

---

### Phase 4: Cron Job

#### T-011: Add hourly cron job
**File:** `convex/crons.ts`

```typescript
crons.hourly(
  "execute scheduled collection entries",
  { minuteUTC: 0 },
  internal.payments.collectionPlan.actions.executeScheduledEntries
);
```

---

## Integration Points

### From ENG-56 (PaymentMethod)
```typescript
import { createPaymentMethodRegistry } from "../methods/registry";
```

### From ENG-61 (Rules Engine)
```typescript
import { evaluateRules } from "./engine";
// Called by emitCollectionFailed effect
```

### From ENG-14 (Effects)
```typescript
import { effectPayloadValidator } from "../validators";
import { executeTransition } from "../transition";
```

---

## Dependencies

- [x] ENG-56: PaymentMethod interface (implemented)
- [x] ENG-61: Rules engine + evaluateRules (implemented)
- [x] ENG-14: Effects framework (implemented)
- [ ] ENG-62: Collection attempt machine states (needs update for FUNDS_SETTLED, DRAW_INITIATED, COLLECTION_FAILED events)

---

## Drift Report

| Spec Expects | Code Has | Impact | Recommendation |
|--------------|----------|--------|----------------|
| Full collection attempt machine states | Placeholder with only `initiated` | Need to update machine to handle FUNDS_SETTLED, DRAW_INITIATED, COLLECTION_FAILED events | Update machine in ENG-62 first, or use direct status strings |

---

## File Map

| File | Action |
|------|--------|
| `convex/payments/collectionPlan/queries.ts` | Add `getExecutableEntries` |
| `convex/payments/collectionPlan/mutations.ts` | Add `createAttempt`, `updatePlanEntryStatus`, `updateAttemptStatus`, `handleSettlement`, `executeCollectionEntry` |
| `convex/payments/collectionPlan/actions.ts` | Create with `executeScheduledEntries` |
| `convex/engine/effects/collection.ts` | Create with `emitPaymentReceived`, `emitCollectionFailed` |
| `convex/engine/effects/registry.ts` | Add effect entries |
| `convex/crons.ts` | Add hourly cron |

---

## Notes

- Amounts in **cents**, timestamps in **milliseconds**
- No `any` types - use proper TypeScript
- The collection attempt machine (ENG-62) will need states for FUNDS_SETTLED, DRAW_INITIATED, COLLECTION_FAILED before full integration
- Use `effectPayloadValidator` from `convex/engine/validators.ts`
- Source channel: `{ type: "system", channel: "payment_collection" }`
