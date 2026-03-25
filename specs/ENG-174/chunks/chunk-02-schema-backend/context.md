# Chunk 02 Context: Schema & Backend Integration

## Current State of Files to Modify

### convex/dispersal/validators.ts (current)
```typescript
import { v } from "convex/values";
import { feeCodeValidator } from "../fees/validators";

// ── Dispersal entry status ──────────────────────────────────────
// Phase 1: always "pending". Phase 2 will add "disbursed" | "failed".
export const dispersalStatusValidator = v.literal("pending");

// ... (calculationDetailsValidator follows — DO NOT MODIFY)
```

### convex/schema.ts — dispersalEntries table (lines 961-979)
```typescript
dispersalEntries: defineTable({
    mortgageId: v.id("mortgages"),
    lenderId: v.id("lenders"),
    lenderAccountId: v.id("ledger_accounts"),
    amount: v.number(),
    dispersalDate: v.string(),
    obligationId: v.id("obligations"),
    servicingFeeDeducted: v.number(),
    status: dispersalStatusValidator,
    idempotencyKey: v.string(),
    calculationDetails: calculationDetailsValidator,
    mortgageFeeId: v.optional(v.id("mortgageFees")),
    feeCode: v.optional(feeCodeValidator),
    createdAt: v.number(),
  })
    .index("by_lender", ["lenderId", "dispersalDate"])
    .index("by_mortgage", ["mortgageId", "dispersalDate"])
    .index("by_obligation", ["obligationId"])
    .index("by_status", ["status", "lenderId"]),
```

### convex/dispersal/types.ts — DispersalEntry interface
```typescript
export interface DispersalEntry {
  _id: Id<"dispersalEntries">;
  amount: number;
  calculationDetails: CalculationDetails;
  createdAt: number;
  dispersalDate: string;
  feeCode?: "servicing" | "late_fee" | "nsf";
  idempotencyKey: string;
  lenderAccountId: Id<"ledger_accounts">;
  lenderId: Id<"lenders">;
  mortgageFeeId?: Id<"mortgageFees">;
  mortgageId: Id<"mortgages">;
  obligationId: Id<"obligations">;
  servicingFeeDeducted: number;
  status: "pending";
}
```

### convex/dispersal/createDispersalEntries.ts — insert call (lines 398-426)
```typescript
const entryId = await ctx.db.insert("dispersalEntries", {
    mortgageId: args.mortgageId,
    lenderId: share.lenderId,
    lenderAccountId: share.lenderAccountId,
    amount: share.amount,
    dispersalDate: args.settledDate,
    obligationId: args.obligationId,
    servicingFeeDeducted: feeCashApplied,
    status: "pending",
    idempotencyKey: `${args.idempotencyKey}:${share.lenderId}`,
    calculationDetails: { /* ... */ },
    createdAt,
});
```

The mutation args (line 317-324):
```typescript
args: {
    obligationId: v.id("obligations"),
    mortgageId: v.id("mortgages"),
    settledAmount: v.number(),
    settledDate: v.string(),
    idempotencyKey: v.string(),
    source: sourceValidator,
},
```

### convex/dispersal/queries.ts — existing query patterns
- Uses `dispersalQuery` (authedQuery with dispersal:view permission)
- `assertAdminScopedDispersalAccess(ctx.viewer)` for admin-only queries
- `assertLenderScopedDispersalAccess(ctx, args.lenderId)` for lender-scoped queries
- Uses `by_status` index: `.withIndex("by_status", (q) => q.eq("status", "pending").eq("lenderId", args.lenderId))`
- Returns summary objects with entryCount, totals, byLender breakdowns

### Collection attempt chain (payment method resolution)
```typescript
// collectionPlanEntries schema:
{
  obligationIds: v.array(v.id("obligations")),
  method: v.string(), // "manual", "mock_pad", "rotessa_pad"
  // ...
}
// Indexes: by_scheduled_date, by_status, by_rescheduled_from

// collectionAttempts schema:
{
  planEntryId: v.id("collectionPlanEntries"),
  method: v.string(),
  status: v.string(), // GT-managed
  // ...
}
// Indexes: by_plan_entry, by_status, by_provider_ref
```

**Resolution strategy**: Since there's no direct obligation→collectionAttempt index, the cleanest approach is:
1. Accept optional `paymentMethod` arg in createDispersalEntries
2. If not provided, query collectionPlanEntries and filter for entries containing this obligationId
3. If found, use the plan entry's method
4. Default to `"manual"` if no match (backward compatible — 0 hold days)

## Integration Points

### Upstream: ENG-162 (Done ✅)
`postLenderPayout()` posts LENDER_PAYOUT_SENT entries. This is the payout execution side.
Our hold period enforcement gates WHEN those payouts can execute.

### Downstream: ENG-182 (Blocked by us)
Payout scheduling reads hold period config + the `getPayoutEligibleEntries` query to determine which entries are ready for payout. Our eligibility query is the key interface they consume.

## Constraints
- `payoutEligibleAfter` and `paymentMethod` must be `v.optional()` for backward compatibility
- Existing entries without `payoutEligibleAfter` are treated as immediately eligible (no hold)
- The payout cron itself is NOT in scope — that's ENG-182
- Business dates are YYYY-MM-DD strings (Tech Design §7.2)
- The `dispersalStatusValidator` change is additive — existing "pending" entries remain valid

## Schema Change Safety
The changes are purely additive:
- New optional fields don't break existing data
- New index doesn't break existing queries
- Extending validator from `v.literal("pending")` to `v.union(...)` still accepts "pending"
- Existing queries using `by_status` with `"pending"` continue to work
