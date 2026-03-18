# Chunk 2 Context: Test Helpers + Cross-Entity Chain Tests

## What This Chunk Does
Creates shared test helpers for the payment test suite and implements the 3 cross-entity chain tests that verify the full 3-machine communication chain (collectionAttempt → obligation → mortgage).

## T-009: Test Helper Infrastructure

**File**: `src/test/convex/payments/helpers.ts` (NEW)

Build on the existing engine helpers pattern. Import from existing helpers:

```typescript
import { internal } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { GovernedTestConvex } from "../onboarding/helpers";
import {
  createGovernedTestConvex,
  seedDefaultGovernedActors,
} from "../onboarding/helpers";
import {
  seedBorrowerProfile,
  seedBrokerProfile,
  seedMortgage,
  seedObligation,
} from "../engine/helpers";
```

### Required Helpers

**`seedCollectionRules(t)`** — Seeds 3 rules: schedule_rule, retry_rule, late_fee_rule
```typescript
// Schema for collectionRules table:
// name: string, trigger: "schedule" | "event", action: string,
// parameters: any, priority: number, enabled: boolean,
// createdAt: number, updatedAt: number

// schedule_rule: trigger="schedule", action="create_plan_entry", params={delayDays:5}, priority=10
// retry_rule: trigger="event", action="create_retry_entry", params={maxRetries:3, backoffBaseDays:3}, priority=20
// late_fee_rule: trigger="event", action="create_late_fee", params={feeAmountCents:5000, dueDays:30, graceDays:45}, priority=30
```

**`seedPlanEntry(t, opts)`** — Creates a collectionPlanEntries row
```typescript
// Schema: obligationIds: Id<"obligations">[], amount: number, method: string,
// scheduledDate: number, status: "planned"|"executing"|"completed"|"cancelled"|"rescheduled",
// source: "default_schedule"|"retry_rule"|"late_fee_rule"|"admin",
// ruleId?: Id<"collectionRules">, rescheduledFromId?: Id<"collectionPlanEntries">,
// createdAt: number
```

**`seedCollectionAttempt(t, opts)`** — Creates a collectionAttempts row
```typescript
// Schema: status: string, machineContext: any, lastTransitionAt: number,
// planEntryId: Id<"collectionPlanEntries">, method: string, amount: number,
// providerRef?: string, providerStatus?: string, providerData?: any,
// initiatedAt: number, settledAt?: number, failedAt?: number, failureReason?: string
```

**`fireTransition(t, entityType, entityId, eventType, payload?)`** — Wrapper around transitionMutation
```typescript
return t.mutation(internal.engine.transitionMutation.transitionMutation, {
  entityType,
  entityId,
  eventType,
  payload: payload ?? {},
  source: { actorType: "system", channel: "scheduler" },
});
```

**`buildEffectArgs(entityId, entityType, effectName, payload?)`** — Builds effect invocation args
```typescript
// Pattern from existing crossEntity.test.ts:
return {
  entityId,
  entityType,
  eventType: "TEST",
  journalEntryId: `test-${effectName}`,
  effectName,
  payload,
  source: { actorType: "system" as const, channel: "scheduler" as const },
};
```

**`drainScheduledWork(t)`** — Re-export from onboarding helpers for convenience

## T-010: AC1 — Full Payment Chain Test

**File**: `src/test/convex/payments/crossEntity.test.ts` (NEW)

Test: `plan entry → attempt initiated → confirmed → PAYMENT_RECEIVED → obligation settled → OBLIGATION_SETTLED → mortgage cure`

**Setup:**
1. `createGovernedTestConvex()` + `seedDefaultGovernedActors(t)`
2. Seed mortgage (active), borrower, obligation (due, amount=333_333)
3. Seed plan entry (planned, obligationIds=[obligationId], method="manual")
4. Seed collection attempt (initiated, planEntryId, method="manual", amount=333_333, machineContext={attemptId:"", retryCount:0, maxRetries:3})

**Execution (manual effect invocation pattern):**
1. `fireTransition(t, "collectionAttempt", attemptId, "FUNDS_SETTLED", { settledAt: Date.now() })`
   - Assert: attempt status = "confirmed"
   - Assert: result.effectsScheduled includes "emitPaymentReceived"
2. Invoke `emitPaymentReceived` effect manually:
   ```typescript
   await t.mutation(internal.engine.effects.collectionAttempt.emitPaymentReceived, buildEffectArgs(attemptId, "collectionAttempt", "emitPaymentReceived"));
   ```
   - This fires PAYMENT_APPLIED to obligation
   - Assert: obligation status = "settled" (full amount)
   - Assert: the transition result included "applyPayment" and "emitObligationSettled" in effectsScheduled
3. Invoke `applyPayment` effect:
   ```typescript
   await t.mutation(internal.engine.effects.obligationPayment.applyPayment, buildEffectArgs(obligationId, "obligation", "applyPayment", { amount: 333_333 }));
   ```
   - Assert: obligation.amountSettled = 333_333
4. Invoke `emitObligationSettled` effect:
   ```typescript
   await t.mutation(internal.engine.effects.obligation.emitObligationSettled, buildEffectArgs(obligationId, "obligation", "emitObligationSettled", { amount: 333_333 }));
   ```
   - Assert: mortgage status = "active" (was active, cure is no-op for non-delinquent)

**Audit Journal Verification:**
- Query auditJournal for attempt: `initiated → confirmed`
- Query auditJournal for obligation: `due → settled`
- Both should have `outcome: "transitioned"`

**Important**: The `emitPaymentReceived` effect calls `executeTransition` which WRITES to the obligation, changing its status and scheduling its own effects. The test then needs to invoke those effects manually too. This is the "manual effect invocation pattern" used by the existing crossEntity.test.ts.

## T-011: AC2 — Failure Chain Test

Test: `attempt failed → COLLECTION_FAILED → RetryRule creates new plan entry`

**Setup:** Same base entities + seedCollectionRules(t) with retry_rule enabled

**Execution:**
1. `fireTransition(t, "collectionAttempt", attemptId, "DRAW_INITIATED", { providerRef: "test-ref" })`
   - Assert: status = "pending"
2. `fireTransition(t, "collectionAttempt", attemptId, "DRAW_FAILED", { reason: "NSF", code: "R01" })`
   - Assert: status = "failed"
3. `fireTransition(t, "collectionAttempt", attemptId, "MAX_RETRIES_EXCEEDED", {})`
   - Assert: status = "permanent_fail"
   - Assert: effectsScheduled includes "emitCollectionFailed" and "notifyAdmin"
4. Invoke `emitCollectionFailed` effect (schedules evaluateRules action via runAfter)
5. `await t.finishAllScheduledFunctions(() => vi.runAllTimers())` — drain scheduled work
   - This runs `evaluateRules` which invokes RetryRule
6. Assert: new collectionPlanEntries row exists with:
   - `source: "retry_rule"`
   - `rescheduledFromId: originalPlanEntryId`
   - `status: "planned"`
   - `scheduledDate` ≈ `Date.now() + 6 * MS_PER_DAY` (backoff for retryCount=1 after DRAW_FAILED, baseDays=3)

**Note on draining**: The `emitCollectionFailed` effect uses `ctx.scheduler.runAfter(0, evaluateRules, ...)`. The `evaluateRules` is an `internalAction` that calls `ctx.runMutation(createEntry, ...)`. We need `finishAllScheduledFunctions` to execute the chain.

**RetryRule payload requirements** (from `convex/payments/collectionPlan/rules/retryRule.ts`):
```typescript
{
  planEntryId: Id<"collectionPlanEntries">,
  obligationIds: Id<"obligations">[],
  amount: number,
  method: string,
  retryCount: number,
}
```

## T-012: AC3 — Overdue Chain Test

Test: `obligation overdue → OBLIGATION_OVERDUE → mortgage delinquent + LateFeeRule creates late_fee obligation`

**Setup:** Same base entities + seedCollectionRules(t) with late_fee_rule enabled

**Execution:**
1. `fireTransition(t, "obligation", obligationId, "GRACE_PERIOD_EXPIRED", {})`
   - Assert: status = "overdue"
   - Assert: effectsScheduled includes "emitObligationOverdue" and "createLateFeeObligation"
2. Invoke `emitObligationOverdue` effect:
   - Assert: mortgage status = "delinquent"
   - Assert: mortgage.machineContext.missedPayments = 1
   - This also schedules `evaluateRules` with OBLIGATION_OVERDUE event
3. Invoke `createLateFeeObligation` effect:
   - Assert: new obligation exists with type = "late_fee"
   - Assert: sourceObligationId = overdue obligation's ID
   - Assert: amount = 5000 (default $50)
4. Drain scheduled work (evaluateRules + LateFeeRule)
   - The LateFeeRule should find the existing late_fee and skip (idempotency)
   - No duplicate late_fee obligation created

**createLateFeeObligation effect** is at `convex/engine/effects/obligationLateFee.ts`.
**emitObligationOverdue effect** is at `convex/engine/effects/obligation.ts` — after Chunk 1 fix, it calls real `engine.evaluateRules`.

## T-013: Quality Gate

```bash
bunx convex codegen && bun typecheck && bun check
bun run test -- src/test/convex/payments/crossEntity.test.ts
```

## Existing Test Pattern Reference

From `src/test/convex/engine/crossEntity.test.ts`:
```typescript
// Test factory
const t = createGovernedTestConvex();
await seedDefaultGovernedActors(t);

// Seed entities via t.run
const mortgageId = await t.run(async (ctx) => ctx.db.insert("mortgages", {...}));

// Fire transitions
const result = await t.mutation(internal.engine.transitionMutation.transitionMutation, {
  entityType, entityId, eventType, payload, source
});
expect(result.success).toBe(true);
expect(result.newState).toBe("expected_state");

// Invoke effects manually
await t.mutation(effectRef, effectArgs(entityId, "effectName", payload));

// Verify state
const entity = await t.run(async (ctx) => ctx.db.get(entityId));
expect(entity?.status).toBe("expected");

// Verify audit journal
const journal = await t.run(async (ctx) =>
  ctx.db.query("auditJournal")
    .withIndex("by_entity", (q) => q.eq("entityType", type).eq("entityId", id))
    .collect()
);
```

## Effect References (from registry after Chunk 1)
```typescript
// Collection Attempt effects
internal.engine.effects.collectionAttempt.emitPaymentReceived
internal.engine.effects.collectionAttempt.emitCollectionFailed
internal.engine.effects.collectionAttempt.recordProviderRef
internal.engine.effects.collectionAttempt.notifyAdmin

// Obligation effects
internal.engine.effects.obligation.emitObligationOverdue
internal.engine.effects.obligation.emitObligationSettled
internal.engine.effects.obligationPayment.applyPayment
internal.engine.effects.obligationLateFee.createLateFeeObligation
internal.engine.effects.obligationWaiver.recordWaiver
```

## Obligation Machine States & Events
```
upcoming → BECAME_DUE → due
due → GRACE_PERIOD_EXPIRED → overdue [actions: emitObligationOverdue, createLateFeeObligation]
due → PAYMENT_APPLIED (full) → settled [guard: isFullySettled, actions: applyPayment, emitObligationSettled]
due → PAYMENT_APPLIED (partial) → partially_settled [actions: applyPayment]
overdue → PAYMENT_APPLIED (full) → settled [guard: isFullySettled, actions: applyPayment, emitObligationSettled]
partially_settled → PAYMENT_APPLIED (full) → settled [guard: isFullySettled, actions: applyPayment, emitObligationSettled]
```

## Collection Attempt Machine States & Events
```
initiated → DRAW_INITIATED → pending [actions: recordProviderRef]
initiated → FUNDS_SETTLED → confirmed [actions: emitPaymentReceived]
pending → FUNDS_SETTLED → confirmed [actions: emitPaymentReceived]
pending → DRAW_FAILED → failed [actions: incrementRetryCount]
failed → RETRY_ELIGIBLE (canRetry) → retry_scheduled [actions: scheduleRetryEntry]
failed → MAX_RETRIES_EXCEEDED → permanent_fail [actions: emitCollectionFailed, notifyAdmin]
```

## isFullySettled Guard
The guard checks: `currentAmountSettled + amount >= totalAmount`. These values MUST be passed in the PAYMENT_APPLIED event payload:
```typescript
payload: {
  amount: attempt.amount,          // the payment amount
  attemptId: attempt._id,
  currentAmountSettled: obligation.amountSettled,  // read from obligation
  totalAmount: obligation.amount,                   // read from obligation
}
```
