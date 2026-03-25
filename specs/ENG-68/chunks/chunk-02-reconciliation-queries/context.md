# Chunk Context: reconciliation-queries

Source: Linear `ENG-68`, Notion implementation plan v2, SPEC 1.6, and verified local code.
This file and the accompanying `tasks.md` contain everything needed to implement this chunk.

## Implementation Plan Excerpt

```md
#### 3. Reconciliation Queries — `convex/dispersal/queries/`
Create directory `convex/dispersal/queries/` with these files:
- `getUndisbursedBalance.ts`
- `getDisbursementHistory.ts`
- `getDispersalsByMortgage.ts`
- `getDispersalsByObligation.ts`
- `getServicingFeeHistory.ts`
```

```md
## ✅ Acceptance Criteria (from Linear Issue)
6. `getUndisbursedBalance` returns correct total pending amount per lender
7. `getDisbursementHistory` filters correctly by date range
8. `getDispersalsByMortgage` returns per-lender breakdown
9. `getDispersalsByObligation` returns all entries for single payment
10. `getServicingFeeHistory` returns fee records for a mortgage
11. All reconciliation queries return correct totals
```

## Feature Page Excerpt

```md
## Reconciliation Queries
- `getUndisbursedBalance(investorId)` — total pending entries
- `getDisbursementHistory(investorId, dateRange)` — entries over period
- `getDispersalsByMortgage(mortgageId, dateRange)` — per-investor breakdown
- `getDispersalsByObligation(obligationId)` — all entries for one payment
- `getServicingFeeHistory(mortgageId, dateRange)` — FairLend fees collected
```

## SPEC Excerpt

```ts
// dispersal/queries/getUndisbursedBalance.ts
export const getUndisbursedBalance = ledgerQuery({
  args: { lenderId: v.id("lenders") },
  handler: async (ctx, args) => {
    const entries = await ctx.db
      .query("dispersalEntries")
      .withIndex("by_status", q =>
        q.eq("status", "pending").eq("lenderId", args.lenderId)
      )
      .collect();
    return {
      lenderId: args.lenderId,
      undisbursedBalance: Math.round(entries.reduce((s, e) => s + e.amount, 0) * 100) / 100,
      entryCount: entries.length,
    };
  },
});
```

```ts
// dispersal/queries/getDisbursementHistory.ts
export const getDisbursementHistory = ledgerQuery({
  args: {
    lenderId: v.id("lenders"),
    fromDate: v.optional(v.string()),
    toDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let query = ctx.db
      .query("dispersalEntries")
      .withIndex("by_lender", q => {
        let q2 = q.eq("lenderId", args.lenderId);
        if (args.fromDate) q2 = q2.gte("dispersalDate", args.fromDate);
        if (args.toDate) q2 = q2.lte("dispersalDate", args.toDate);
        return q2;
      })
      .order("desc");
    const entries = await query.collect();
    return {
      lenderId: args.lenderId,
      entries: entries.map(e => ({
        id: e._id, mortgageId: e.mortgageId, amount: e.amount,
        dispersalDate: e.dispersalDate, obligationId: e.obligationId, status: e.status,
      })),
      total: entries.reduce((s, e) => s + e.amount, 0),
    };
  },
});
```

```ts
// dispersal/queries/getServicingFeeHistory.ts
export const getServicingFeeHistory = authedQuery({
  args: {
    mortgageId: v.id("mortgages"),
    fromDate: v.optional(v.string()),
    toDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let query = ctx.db
      .query("servicingFeeEntries")
      .withIndex("by_mortgage", q => {
        let q2 = q.eq("mortgageId", args.mortgageId);
        if (args.fromDate) q2 = q2.gte("date", args.fromDate);
        if (args.toDate) q2 = q2.lte("date", args.toDate);
        return q2;
      })
      .order("desc");
    const entries = await query.collect();
    return {
      mortgageId: args.mortgageId, entries,
      totalFees: entries.reduce((s, e) => s + e.amount, 0),
    };
  },
});
```

## ENG-86 Excerpt

```md
### Queries Under Test
- `getUndisbursedBalance(lenderId)` — sums pending dispersalEntries for a lender
- `getDisbursementHistory(lenderId, fromDate?, toDate?)` — date-filtered history
- `getServicingFeeHistory(mortgageId, fromDate?, toDate?)` — fee entries for a mortgage
```

```md
### Drift Report
- SPEC queries use `investorId` parameter → actual should be `lenderId`
- `getUndisbursedBalance` reads `by_status` index with `status: "pending", lenderId`
- `getDisbursementHistory` reads `by_lender` index with `lenderId, dispersalDate`
```

## Repo Verification Snippets

```ts
// convex/schema.ts
dispersalEntries: defineTable({
  ...
})
  .index("by_lender", ["lenderId", "dispersalDate"])
  .index("by_mortgage", ["mortgageId", "dispersalDate"])
  .index("by_obligation", ["obligationId"])
  .index("by_status", ["status", "lenderId"])

servicingFeeEntries: defineTable({
  ...
})
  .index("by_mortgage", ["mortgageId", "date"])
  .index("by_obligation", ["obligationId"])
```

```ts
// convex/fluent.ts
export const authedQuery = convex.query().use(authMiddleware);
export const ledgerQuery = authedQuery.use(requirePermission("ledger:view"));
```

```ts
// convex/ledger/queries.ts
export const getPositions = ledgerQuery
  .input({ mortgageId: v.string() })
  .handler(async (ctx, args) => {
    ...
  })
  .public();
```

## Constraints & Rules

```md
- Queries that expose ledger-like financial data should follow existing auth conventions (`ledgerQuery` when appropriate).
- WorkOS AuthKit is the canonical source of truth.
- `bun check`, `bun typecheck` and `bunx convex codegen` must pass before considering tasks completed.
```
