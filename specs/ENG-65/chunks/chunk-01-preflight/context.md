# Chunk 1 Context: Pre-flight + Schema/Structure Verification

## Issue Context
ENG-65 is a verification + remediation issue for the complete payment system. ENG-64 (blocker) is Done — it delivered cross-entity/E2E tests and missing effects from ENG-63.

## Drift Report (from Implementation Plan)

### D1 — CRITICAL: Missing Collection Attempt effects in effect registry
- SPEC says: collectionAttempt machine actions fire as effects via the GT engine
- Code had: Machine declares no-op stubs, registry didn't register them
- **Likely resolved by ENG-64** which absorbed ENG-63's incomplete deliverables

### D2 — MEDIUM: evaluateRules stub vs real engine
- `emitObligationOverdue` calls `internal.payments.collectionPlan.stubs.evaluateRules` instead of `internal.payments.collectionPlan.engine.evaluateRules`
- **ENG-64 description says it fixes this** ("Fix: emitObligationOverdue calls stub evaluateRules instead of real engine")

### D3 — LOW: File structure divergence
- SPEC says: `convex/machines/`, `convex/effects/`
- Code has: `convex/engine/machines/`, `convex/engine/effects/`
- **Intentional** — document as accepted deviation

### D4 — LOW: Schema has fields beyond SPEC §9
- Obligations: Extra `borrowerId`, `paymentNumber`, `settledAt` fields and extra indexes
- CollectionPlanEntries: Extra `by_rescheduled_from` index; possibly missing `by_obligation` index
- `by_due_date` index order: SPEC says `["dueDate", "status"]`, code has `["status", "dueDate"]` — code is correct

### D5 — HIGH: No `collectionAttempts/execute.ts` pipeline
- **Check if ENG-64 delivered this or if execution pipeline was deferred**
- ENG-64 description says: "Execution pipeline deferred to a separate issue"

### D6 — LOW: No `payments/seed.ts`
- Seed logic handled by test harnesses directly — acceptable

## SPEC §9 — Schema Reference

### §9.1 obligations
```typescript
obligations: defineTable({
  status: v.string(),
  machineContext: v.optional(v.any()),
  lastTransitionAt: v.optional(v.number()),
  mortgageId: v.id("mortgages"),
  type: v.union(v.literal("regular_interest"), v.literal("arrears_cure"), v.literal("late_fee"), v.literal("principal_repayment")),
  amount: v.number(),
  amountSettled: v.number(),
  dueDate: v.number(),
  gracePeriodEnd: v.number(),
  sourceObligationId: v.optional(v.id("obligations")),
  createdAt: v.number(),
})
  .index("by_status", ["status"])
  .index("by_mortgage", ["mortgageId", "status"])
  .index("by_mortgage_and_date", ["mortgageId", "dueDate"])
  .index("by_due_date", ["dueDate", "status"]),
```

### §9.2 collectionPlanEntries
```typescript
collectionPlanEntries: defineTable({
  obligationIds: v.array(v.id("obligations")),
  amount: v.number(),
  method: v.string(),
  scheduledDate: v.number(),
  status: v.union(v.literal("planned"), v.literal("executing"), v.literal("completed"), v.literal("cancelled"), v.literal("rescheduled")),
  source: v.union(v.literal("default_schedule"), v.literal("retry_rule"), v.literal("late_fee_rule"), v.literal("admin")),
  ruleId: v.optional(v.id("collectionRules")),
  rescheduledFromId: v.optional(v.id("collectionPlanEntries")),
  createdAt: v.number(),
})
  .index("by_obligation", ["obligationIds"])
  .index("by_scheduled_date", ["scheduledDate", "status"])
  .index("by_status", ["status"]),
```

### §9.3 collectionRules
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
})
  .index("by_trigger", ["trigger", "enabled", "priority"]),
```

### §9.4 collectionAttempts
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

## SPEC §2 — Expected File Structure
```
convex/
  machines/                              → actual: convex/engine/machines/
    obligation.machine.ts                → convex/engine/machines/obligation.machine.ts
    collectionAttempt.machine.ts         → convex/engine/machines/collectionAttempt.machine.ts
    registry.ts                          → convex/engine/machines/registry.ts
    __tests__/
      obligation.test.ts                 → convex/engine/machines/__tests__/obligation.machine.test.ts
      collectionAttempt.test.ts          → convex/engine/machines/__tests__/collectionAttempt.test.ts
  effects/                               → actual: convex/engine/effects/
    payments.ts                          → convex/engine/effects/obligation.ts
    payments.overdue.ts                  → merged into obligation.ts
    payments.settled.ts                  → merged into obligation.ts
    payments.failed.ts                   → ⛔ Needs verification (ENG-64 may have delivered)
    payments.latefee.ts                  → convex/engine/effects/obligationLateFee.ts
  payments/
    schema.ts                            → merged into convex/schema.ts
    obligations/generate.ts              → convex/payments/obligations/generate.ts
    obligations/queries.ts               → convex/payments/obligations/queries.ts
    obligations/crons.ts                 → convex/payments/obligations/crons.ts
    collectionPlan/engine.ts             → convex/payments/collectionPlan/engine.ts
    collectionPlan/rules/scheduleRule.ts → convex/payments/collectionPlan/rules/scheduleRule.ts
    collectionPlan/rules/retryRule.ts    → convex/payments/collectionPlan/rules/retryRule.ts
    collectionPlan/rules/lateFeeRule.ts  → convex/payments/collectionPlan/rules/lateFeeRule.ts
    collectionPlan/queries.ts            → convex/payments/collectionPlan/queries.ts
    collectionAttempts/execute.ts        → ⛔ Possibly deferred
    collectionAttempts/queries.ts        → ⛔ Possibly deferred
    methods/interface.ts                 → convex/payments/methods/interface.ts
    methods/registry.ts                  → convex/payments/methods/registry.ts
    methods/manual.ts                    → convex/payments/methods/manual.ts
    methods/mockPAD.ts                   → convex/payments/methods/mockPAD.ts
    seed.ts                              → ⚠️ Seed via test harness
  payments/__tests__/
    generation.test.ts                   → convex/payments/__tests__/generation.test.ts
    rules.test.ts                        → convex/payments/__tests__/rules.test.ts
    crossEntity.test.ts                  → ⛔ Needs ENG-64 verification
    methods.test.ts                      → convex/payments/__tests__/methods.test.ts
    endToEnd.test.ts                     → ⛔ Needs ENG-64 verification
```
