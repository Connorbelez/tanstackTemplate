# Chunk 1 Context: Foundation (Directories + Queries + Mutations)

## Schema Definitions (from convex/schema.ts)

### obligations table (lines 507-540)
```typescript
obligations: defineTable({
  // ─── GT fields ───
  status: v.string(),
  machineContext: v.optional(v.any()),
  lastTransitionAt: v.optional(v.number()),
  // ─── Relationships ───
  mortgageId: v.id("mortgages"),
  borrowerId: v.id("borrowers"),
  // ─── Payment identification ───
  paymentNumber: v.number(),
  // ─── Domain fields (all amounts in cents) ───
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

### collectionPlanEntries table (lines 546-569)
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

### collectionRules table (lines 571-581)
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

## Existing Obligation Queries (convex/obligations/queries.ts)
The file already has: `getSettledBeforeDate`, `getFirstAfterDate`, `getFirstOnOrAfterDate`.
All use `internalQuery` from `../_generated/server` and `v` from `convex/values`.

## T-002: Obligation Query Helpers

### getUpcomingInWindow
- `internalQuery` with args `{ mortgageId: v.optional(v.id("mortgages")), dueBefore: v.number() }`
- Find obligations with status "upcoming" and dueDate <= dueBefore
- If mortgageId provided, use `by_mortgage_and_date` index: `eq("mortgageId", mortgageId).lte("dueDate", dueBefore)` then filter status === "upcoming"
- If no mortgageId, use `by_due_date` index: `lte("dueDate", dueBefore)` then filter status === "upcoming"
- Return all matches (collect)

### getLateFeeForObligation
- `internalQuery` with args `{ sourceObligationId: v.id("obligations") }`
- Query obligations table, filter for `type === "late_fee"` AND `sourceObligationId === args.sourceObligationId`
- Use `by_status` index is not efficient here. Best approach: scan with filter since late fees are rare.
- Query all obligations, filter: `type === "late_fee" && sourceObligationId === args.sourceObligationId`
- Return first match or null

## T-003: Collection Plan Queries

### getEnabledRules
- `internalQuery` with args `{ trigger: v.union(v.literal("schedule"), v.literal("event")) }`
- Use `by_trigger` index: query collectionRules with `.withIndex("by_trigger", q => q.eq("trigger", args.trigger).eq("enabled", true))`
- The index is `[trigger, enabled, priority]` so this gives us priority-sorted results
- Collect and return

### getEntryForObligation
- `internalQuery` with args `{ obligationId: v.id("obligations") }`
- IMPORTANT: No by_obligation index that works for single obligation lookups (obligationIds is an array)
- Strategy: Query by_status with status "planned", then filter in-memory: `entry.obligationIds.includes(obligationId)`
- Return first match or null

### getPlanEntriesByStatus
- `internalQuery` with args `{ status: v.union(...status literals), scheduledBefore: v.optional(v.number()) }`
- Use `by_status` index
- If scheduledBefore provided, filter `.filter(q => q.lte(q.field("scheduledDate"), args.scheduledBefore))`
- Collect and return

## T-004: createEntry Mutation

### createEntry
- `internalMutation` with args matching collectionPlanEntries schema fields
- Args: `obligationIds`, `amount`, `method`, `scheduledDate`, `status`, `source`, `ruleId` (optional), `rescheduledFromId` (optional)
- Sets `createdAt: Date.now()` automatically
- Returns the new entry ID

## Import Patterns
```typescript
import { v } from "convex/values";
import { internalQuery, internalMutation } from "../_generated/server";
// For collectionPlan files:
import { internalQuery, internalMutation } from "../../_generated/server";
```

## Key Constraints
- No `any` types in TypeScript (schema `any` for parameters is acceptable)
- Run `bun check` before fixing lint errors
- All amounts are in cents (integers)
- Timestamps are unix timestamps in milliseconds
