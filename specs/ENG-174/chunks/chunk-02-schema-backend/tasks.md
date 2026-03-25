# Chunk 02: Schema & Backend Integration

## Tasks

### T-005: Extend `dispersalStatusValidator` to union
**File:** `convex/dispersal/validators.ts` (modify)

Change:
```typescript
export const dispersalStatusValidator = v.literal("pending");
```
To:
```typescript
export const dispersalStatusValidator = v.union(
  v.literal("pending"),
  v.literal("eligible"),
  v.literal("disbursed"),
  v.literal("failed"),
);
```

Update the comment above to reflect Phase 5 changes.

### T-006: Add hold period fields + index to dispersalEntries schema
**File:** `convex/schema.ts` (modify)

Add two optional fields to the `dispersalEntries` table definition:
```typescript
payoutEligibleAfter: v.optional(v.string()),  // YYYY-MM-DD business date
paymentMethod: v.optional(v.string()),         // Resolved from collection attempt
```

Add new index:
```typescript
.index("by_eligibility", ["status", "payoutEligibleAfter"])
```

The fields are `v.optional()` for backward compatibility — existing entries without these fields are treated as immediately eligible.

### T-007: Update DispersalEntry type interface
**File:** `convex/dispersal/types.ts` (modify)

Update the `DispersalEntry` interface:
- Change `status: "pending"` to `status: "pending" | "eligible" | "disbursed" | "failed"`
- Add `payoutEligibleAfter?: string`
- Add `paymentMethod?: string`

### T-008: Update createDispersalEntries to set hold fields
**File:** `convex/dispersal/createDispersalEntries.ts` (modify)

1. Import `calculatePayoutEligibleDate` from `./holdPeriod`
2. Add optional `paymentMethod` arg to the mutation args (v.optional(v.string()))
3. Resolve the payment method:
   - If `args.paymentMethod` is provided, use it directly
   - Otherwise, query `collectionPlanEntries` to find entries containing this obligationId, get the method from matching plan entry's associated confirmed collectionAttempt
   - If no match found, default to `"manual"` (0 hold = backward compatible)
4. Calculate `payoutEligibleAfter` using `calculatePayoutEligibleDate(args.settledDate, method)`
5. Include both fields in the `ctx.db.insert("dispersalEntries", { ... })` call

Key: The `paymentMethod` resolution must handle the case where the obligation was settled via admin/manual flow (no collection plan entry exists).

### T-009: Add `getPayoutEligibleEntries` query
**File:** `convex/dispersal/queries.ts` (modify)

Add a new admin-only query:
```typescript
export const getPayoutEligibleEntries = dispersalQuery
  .input({
    asOfDate: v.string(),  // YYYY-MM-DD "today"
    lenderId: v.optional(v.id("lenders")),
    limit: v.optional(v.number()),
  })
  .handler(async (ctx, args) => {
    assertAdminScopedDispersalAccess(ctx.viewer);
    // Query pending entries using by_eligibility index
    // Filter where payoutEligibleAfter <= asOfDate OR payoutEligibleAfter is undefined (legacy entries)
    // Optionally filter by lenderId
    // Group by lender for batch payout
    // Return with summary stats
  })
  .public();
```

This query is the key interface ENG-182 (payout scheduling) will consume.

### T-010: Final quality gate
Run in order:
1. `bunx convex codegen`
2. `bun check`
3. `bun typecheck`
All must pass.
