# Chunk 01 Context — ENG-52 Deal Closing Integration Tests

## What You're Building
Create `convex/machines/__tests__/deal.integration.test.ts` — integration tests driving the Transition Engine end-to-end for the deal closing machine. This chunk covers: scaffold, happy path tests, and cancellation tests.

## Key Contract: transitionMutation

```typescript
// convex/engine/transitionMutation.ts
import { commandArgsValidator } from "./validators";

export const transitionMutation = internalMutation({
  args: commandArgsValidator,
  handler: async (ctx, args) => {
    return executeTransition(ctx, {
      entityType: args.entityType as EntityType,
      entityId: args.entityId,
      eventType: args.eventType,
      payload: (args.payload as Record<string, unknown>) ?? {},
      source: args.source,
    });
  },
});
```

**Call via:** `t.mutation(internal.engine.transitionMutation.transitionMutation, { ... })`

**commandArgsValidator:**
```typescript
export const commandArgsValidator = {
  entityType: entityTypeValidator,  // v.union(v.literal("deal"), ...)
  entityId: v.string(),
  eventType: v.string(),
  payload: v.optional(v.any()),
  source: sourceValidator,          // v.object({ channel, actorId?, actorType?, ip?, sessionId? })
};
```

## Key Contract: TransitionResult

```typescript
export interface TransitionResult {
  success: boolean;
  previousState: string;
  newState: string;
  journalEntryId?: string;
  effectsScheduled?: string[];
  reason?: string;
}
```

## Key Contract: Deal Machine (from convex/engine/machines/deal.machine.ts)

State structure:
```
initiated
  ↓ DEAL_LOCKED (actions: reserveShares, notifyAllParties, createDocumentPackage)
lawyerOnboarding
  ├─ pending
  │   ↓ LAWYER_VERIFIED (actions: createDealAccess)
  ├─ verified
  │   ↓ REPRESENTATION_CONFIRMED (no actions)
  └─ complete [final] → onDone: documentReview (no actions on onDone)
documentReview
  ├─ pending
  │   ↓ LAWYER_APPROVED_DOCUMENTS (no actions)
  ├─ signed
  │   ↓ ALL_PARTIES_SIGNED (actions: archiveSignedDocuments)
  └─ complete [final] → onDone: fundsTransfer (no actions on onDone)
fundsTransfer
  ├─ pending
  │   ↓ FUNDS_RECEIVED (actions: confirmFundsReceipt)
  └─ complete [final] → onDone: confirmed (actions: commitReservation, prorateAccrualBetweenOwners, updatePaymentSchedule, revokeLawyerAccess)
confirmed [final]
failed [final]
```

DEAL_CANCELLED is defined on EACH non-terminal compound state (initiated, lawyerOnboarding, documentReview, fundsTransfer), NOT at root level. Terminal states (confirmed, failed) have NO event handlers.

DEAL_CANCELLED actions: ["voidReservation", "notifyCancellation", "revokeAllDealAccess"]

## Event Payload Types

```typescript
| { type: "DEAL_LOCKED"; closingDate: number }
| { type: "LAWYER_VERIFIED"; verificationId: string }
| { type: "REPRESENTATION_CONFIRMED" }
| { type: "LAWYER_APPROVED_DOCUMENTS" }
| { type: "ALL_PARTIES_SIGNED" }
| { type: "FUNDS_RECEIVED"; method: "vopay" | "wire_receipt" | "manual" }
| { type: "DEAL_CANCELLED"; reason: string }
```

## CRITICAL: extractScheduledEffects Behavior

The Transition Engine's `extractScheduledEffects` function ONLY reads `stateNode.on[eventType].actions` from the machine config. It does NOT read `onDone` actions. This means:

- For FUNDS_RECEIVED: `effectsScheduled` will include ["confirmFundsReceipt"] (from the event handler) but may NOT include ["commitReservation", "prorateAccrualBetweenOwners", "updatePaymentSchedule", "revokeLawyerAccess"] (from onDone).
- For REPRESENTATION_CONFIRMED and ALL_PARTIES_SIGNED: the auto-transition onDone effects are correctly expected to be [] since those onDone handlers have no actions.

**APPROACH:** Write the test to discover what actually happens. Use `expect(result.effectsScheduled).toContain(...)` for known event-handler effects. For onDone effects, check what's actually returned and adjust. If the onDone effects are missing from effectsScheduled, note this as a finding.

## Deals Table Schema

```typescript
deals: defineTable({
  status: v.string(),
  machineContext: v.optional(v.any()),
  lastTransitionAt: v.optional(v.number()),
  mortgageId: v.id("mortgages"),
  buyerId: v.string(),
  sellerId: v.string(),
  fractionalShare: v.number(),
  closingDate: v.optional(v.number()),
  lawyerId: v.optional(v.string()),
  reservationId: v.optional(v.id("ledger_reservations")),
  lawyerType: v.optional(v.union(v.literal("platform_lawyer"), v.literal("guest_lawyer"))),
  createdAt: v.number(),
  createdBy: v.string(),
})
```

## Audit Journal Schema

```typescript
auditJournal: defineTable({
  entityType: entityTypeValidator,
  entityId: v.string(),
  eventType: v.string(),
  payload: v.optional(v.any()),
  previousState: v.string(),
  newState: v.string(),
  outcome: v.union(v.literal("transitioned"), v.literal("rejected")),
  reason: v.optional(v.string()),
  actorId: v.string(),
  actorType: v.optional(actorTypeValidator),
  channel: channelValidator,
  ip: v.optional(v.string()),
  sessionId: v.optional(v.string()),
  machineVersion: v.optional(v.string()),
  effectsScheduled: v.optional(v.array(v.string())),
  timestamp: v.number(),
})
  .index("by_entity", ["entityType", "entityId", "timestamp"])
```

## Seed Pattern (from existing tests)

```typescript
const modules = import.meta.glob("/convex/**/*.ts");
type TestHarness = ReturnType<typeof convexTest>;

async function seedDeal(t: TestHarness, overrides?) {
  return t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      authId: "seed-user",
      email: "seed@test.com",
      firstName: "Seed",
      lastName: "User",
    });
    const propertyId = await ctx.db.insert("properties", {
      streetAddress: "123 Test St",
      city: "Toronto",
      province: "ON",
      postalCode: "M5V 1A1",
      propertyType: "residential",
      createdAt: Date.now(),
    });
    const brokerId = await ctx.db.insert("brokers", {
      status: "active",
      userId,
      createdAt: Date.now(),
    });
    const mortgageId = overrides?.mortgageId ?? await ctx.db.insert("mortgages", {
      status: "funded",
      propertyId,
      principal: 500_000,
      interestRate: 0.05,
      rateType: "fixed",
      termMonths: 60,
      amortizationMonths: 300,
      paymentAmount: 2908,
      paymentFrequency: "monthly",
      loanType: "conventional",
      lienPosition: 1,
      interestAdjustmentDate: "2026-01-01",
      termStartDate: "2026-01-01",
      maturityDate: "2031-01-01",
      firstPaymentDate: "2026-02-01",
      brokerOfRecordId: brokerId,
      createdAt: Date.now(),
    });
    const dealId = await ctx.db.insert("deals", {
      status: overrides?.status ?? "initiated",
      mortgageId,
      buyerId: overrides?.buyerId ?? "buyer-user-1",
      sellerId: overrides?.sellerId ?? "seller-user-1",
      fractionalShare: overrides?.fractionalShare ?? 5000,
      lawyerId: overrides?.lawyerId ?? "test-lawyer",
      lawyerType: overrides?.lawyerType ?? "platform_lawyer",
      ...(overrides?.closingDate !== undefined ? { closingDate: overrides.closingDate } : {}),
      ...(overrides?.reservationId !== undefined ? { reservationId: overrides.reservationId ?? undefined } : {}),
      createdAt: Date.now(),
      createdBy: "user_admin_integration",
    });
    return { dealId, mortgageId };
  });
}
```

## Existing Identity Fixture Pattern

```typescript
const ADMIN_SOURCE = {
  channel: "admin_dashboard" as const,
  actorId: "user_admin_integration",
  actorType: "admin" as const,
};
```

## Constraints
1. Use `convexTest(schema, modules)` with `import.meta.glob("/convex/**/*.ts")`
2. Call transitions via `t.mutation(internal.engine.transitionMutation.transitionMutation, {...})`
3. Query audit journal via `t.run(async (ctx) => ctx.db.query("auditJournal").withIndex("by_entity", q => q.eq("entityType", "deal").eq("entityId", dealId)).collect())`
4. Assert `result.effectsScheduled` — do NOT verify effect side-effects
5. No `any` types — all test data must be properly typed
6. `bun check`, `bun typecheck`, `bunx convex codegen` must pass
