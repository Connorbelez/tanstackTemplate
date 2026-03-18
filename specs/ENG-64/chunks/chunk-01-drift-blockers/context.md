# Chunk 1 Context: Fix Drift Blockers

## What This Chunk Does
Before any cross-entity or E2E tests can work, the 3-machine chain (collectionAttempt → obligation → mortgage) must be wired up. Currently, the collection attempt machine declares 4 effects as placeholder no-ops that are NOT registered in the effect registry. Additionally, `emitObligationOverdue` calls a stub instead of the real rules engine.

## T-001: Create `emitPaymentReceived` Effect

**File**: `convex/engine/effects/collectionAttempt.ts` (NEW)

This effect fires when a collection attempt transitions to `confirmed` (FUNDS_SETTLED event). It bridges the attempt → obligation chain.

**Logic:**
1. Load the attempt entity by `args.entityId` from `collectionAttempts` table
2. Load the plan entry by `attempt.planEntryId` from `collectionPlanEntries` table
3. For each `obligationId` in `planEntry.obligationIds`:
   - Load the obligation to read its current `amountSettled` and `amount`
   - Call `executeTransition(ctx, { entityType: "obligation", entityId: obligationId, eventType: "PAYMENT_APPLIED", payload: { amount: attempt.amount, attemptId: args.entityId, currentAmountSettled: obligation.amountSettled, totalAmount: obligation.amount }, source: args.source })`
4. Must be an `internalMutation` (calls `executeTransition` which writes to DB)

**Pattern to follow** — `convex/engine/effects/obligation.ts`:
```typescript
import { v } from "convex/values";
import { internalMutation } from "../../_generated/server";
import { executeTransition } from "../transition";
import { effectPayloadValidator } from "../validators";

// Use the generic effectPayloadValidator with collectionAttempt-specific overrides
const collectionAttemptEffectValidator = {
  ...effectPayloadValidator,
  entityId: v.id("collectionAttempts"),
  entityType: v.literal("collectionAttempt"),
};
```

**Key constraint**: The `PAYMENT_APPLIED` event payload MUST include `currentAmountSettled` and `totalAmount` because the obligation machine's `isFullySettled` guard checks: `currentAmountSettled + amount >= totalAmount`.

## T-002: Create `emitCollectionFailed` Effect

**Same file**: `convex/engine/effects/collectionAttempt.ts`

Fires when attempt transitions to `permanent_fail` (MAX_RETRIES_EXCEEDED event). Triggers rules engine evaluation with COLLECTION_FAILED.

**Logic:**
1. Load attempt and plan entry
2. Schedule `internal.payments.collectionPlan.engine.evaluateRules` (it's an `internalAction`)
3. Use `ctx.scheduler.runAfter(0, ...)` since evaluateRules is an action and cannot be called directly from a mutation
4. Pass: `trigger: "event"`, `eventType: "COLLECTION_FAILED"`, and payload with `planEntryId`, `obligationIds`, `amount`, `method`, `retryCount`

**The RetryRule handler** (at `convex/payments/collectionPlan/rules/retryRule.ts`) expects this payload shape:
```typescript
interface CollectionFailedPayload {
  planEntryId: Id<"collectionPlanEntries">;
  obligationIds: Id<"obligations">[];
  amount: number;
  method: string;
  retryCount: number;
}
```

## T-003: Create `recordProviderRef` Effect

**Same file**: `convex/engine/effects/collectionAttempt.ts`

Simple patch mutation — writes providerRef onto the attempt entity.

```typescript
export const recordProviderRef = internalMutation({
  args: collectionAttemptEffectValidator,
  handler: async (ctx, args) => {
    const providerRef = args.payload?.providerRef;
    if (typeof providerRef === "string") {
      await ctx.db.patch(args.entityId, { providerRef });
    }
  },
});
```

## T-004: Create `notifyAdmin` Stub

**Same file**: `convex/engine/effects/collectionAttempt.ts`

Log-only stub for Phase 1:
```typescript
export const notifyAdmin = internalMutation({
  args: collectionAttemptEffectValidator,
  handler: async (_ctx, args) => {
    console.info(`[notifyAdmin] stub — permanent failure on attempt=${args.entityId}`);
  },
});
```

## T-005: Register Effects in Registry

**File**: `convex/engine/effects/registry.ts`

Add after the existing obligation effects block:
```typescript
// Collection Attempt effects (ENG-64)
emitPaymentReceived: internal.engine.effects.collectionAttempt.emitPaymentReceived,
emitCollectionFailed: internal.engine.effects.collectionAttempt.emitCollectionFailed,
recordProviderRef: internal.engine.effects.collectionAttempt.recordProviderRef,
notifyAdmin: internal.engine.effects.collectionAttempt.notifyAdmin,
```

**Current registry contents** (for placement context):
```
assignRole, notifyApplicantApproved, notifyApplicantRejected, notifyAdminNewRequest,
emitObligationOverdue, emitObligationSettled, createLateFeeObligation, applyPayment, recordWaiver,
notifyAllParties, notifyCancellation, createDocumentPackage, archiveSignedDocuments, confirmFundsReceipt,
reserveShares, commitReservation, voidReservation, prorateAccrualBetweenOwners, updatePaymentSchedule,
createDealAccess, revokeAllDealAccess, revokeLawyerAccess
```

## T-006: Fix evaluateRules Stub Reference

**File**: `convex/engine/effects/obligation.ts` — line 139

Change:
```typescript
// BEFORE:
internal.payments.collectionPlan.stubs.evaluateRules,
// AFTER:
internal.payments.collectionPlan.engine.evaluateRules,
```

**Important**: The `stubs.evaluateRules` is an `internalMutation` (no-op), while `engine.evaluateRules` is an `internalAction`. Both work with `ctx.scheduler.runAfter(0, ...)` which accepts either mutation or action references.

## T-007: Expand Test Factory Module Globs

**File**: `src/test/auth/helpers.ts`

Add these two lines to the `modules` const (after existing globs):
```typescript
...import.meta.glob("../../../convex/payments/**/*.*s"),
...import.meta.glob("../../../convex/obligations/**/*.*s"),
```

**Current globs** (for placement):
```typescript
const modules = {
  ...import.meta.glob("../../../convex/_generated/**/*.*s"),
  ...import.meta.glob("../../../convex/audit/**/*.*s"),
  ...import.meta.glob("../../../convex/auth/**/*.*s"),
  ...import.meta.glob("../../../convex/engine/**/*.*s"),
  ...import.meta.glob("../../../convex/ledger/**/*.*s"),
  ...import.meta.glob("../../../convex/onboarding/**/*.*s"),
  ...import.meta.glob("../../../convex/deals/**/*.*s"),
  ...import.meta.glob("../../../convex/seed/**/*.*s"),
  ...import.meta.glob("../../../convex/test/**/*.*s"),
  ...import.meta.glob("../../../convex/auditLog.ts"),
  ...import.meta.glob("../../../convex/constants.ts"),
  ...import.meta.glob("../../../convex/fluent.ts"),
};
```

## T-008: Quality Gate

Run in order:
```bash
bunx convex codegen
bun typecheck
bun check
```

All three must pass. The codegen step is critical because we created a new file under `convex/engine/effects/` which will add new entries to `convex/_generated/api.ts`.

## Key Reference Files

| File | Purpose |
|------|---------|
| `convex/engine/effects/obligation.ts` | Pattern to follow for effect structure |
| `convex/engine/effects/obligationPayment.ts` | Pattern for domain field patch effects |
| `convex/engine/effects/registry.ts` | Effect registry to modify |
| `convex/engine/validators.ts` | `effectPayloadValidator` definition |
| `convex/engine/transition.ts` | `executeTransition` function signature |
| `convex/payments/collectionPlan/engine.ts` | Real rules engine (evaluateRules action) |
| `convex/payments/collectionPlan/stubs.ts` | Stub to be replaced |
| `src/test/auth/helpers.ts` | Test factory with module globs |

## effectPayloadValidator Shape
```typescript
{
  entityId: v.string(),
  entityType: entityTypeValidator,  // union of entity type literals
  eventType: v.string(),
  journalEntryId: v.string(),
  effectName: v.string(),
  payload: v.optional(v.any()),
  source: v.object({
    channel: channelValidator,
    actorId: v.optional(v.string()),
    actorType: v.optional(actorTypeValidator),
    ip: v.optional(v.string()),
    sessionId: v.optional(v.string()),
  }),
}
```
