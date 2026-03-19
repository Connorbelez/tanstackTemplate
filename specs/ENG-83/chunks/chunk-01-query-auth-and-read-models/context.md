# Chunk Context: query-auth-and-read-models

Source: Linear ENG-83, WS6 Notion requirement / feature / spec pages, and repo inspection.
This file and the accompanying tasks.md contain everything needed to implement this chunk.

## Linear Issue Excerpt

```md
## SPEC Ref: §7

Create all dispersal read queries under `dispersal/queries/`.

### Queries

1. `getUndisbursedBalance(investorId)` — sum of `pending` entries via `by_status` index
2. `getDisbursementHistory(investorId, fromDate?, toDate?)` — paginated via `by_investor` index
3. `getDispersalsByMortgage(mortgageId, fromDate?, toDate?)` — per-investor breakdown via `by_mortgage`
4. `getDispersalsByObligation(obligationId)` — all entries for one payment via `by_obligation`
5. `getServicingFeeHistory(mortgageId, fromDate?, toDate?)` — FairLend fees via `by_mortgage`

### Auth

All wrapped in `authedQuery`. Investors can only query their own data (resource ownership check).

### UC Coverage

* Admin queries investor undisbursed balance
* Admin views servicing fee history for a mortgage
```

## Requirement Excerpt

```md
Acceptance Criteria
1. Undisbursed: 3 entries (\$100+\$200+\$150) = \$450; empty = \$0
2. History: date range filtering returns correct subset
3. Cross-check: total accrual ≈ dispersals + fees (within 1-day tolerance)
4. All queries use authedQuery middleware
5. Pagination supported for large result sets
```

```md
Description
Five reconciliation queries must return accurate results: getUndisbursedBalance (sum of pending dispersal entries), getDisbursementHistory (date-filtered entries), getDispersalsByMortgage (per-investor breakdown), getDispersalsByObligation (all entries for one payment), getServicingFeeHistory (FairLend fees collected). All queries must use proper indexes and handle empty result sets.
```

## Feature / Use Case Excerpts

```md
## Reconciliation Queries
- `getUndisbursedBalance(investorId)` — total pending entries
- `getDisbursementHistory(investorId, dateRange)` — entries over period
- `getDispersalsByMortgage(mortgageId, dateRange)` — per-investor breakdown
- `getDispersalsByObligation(obligationId)` — all entries for one payment
- `getServicingFeeHistory(mortgageId, dateRange)` — FairLend fees collected
```

```md
Admin views disbursement history for an investor

1. Admin calls getDisbursementHistory(investorId, fromDate, toDate)
2. System queries dispersalEntries by investor with date range filter
3. Returns chronological list of entries with mortgage, amount, obligation, date, status
4. Includes running total

Edge Cases
- No entries in date range → empty list with \$0 total
- Entries span multiple mortgages → all included
- Pagination for large result sets
```

```md
Admin views servicing fee history for a mortgage

1. Admin calls `getServicingFeeHistory(mortgageId, fromDate, toDate)`
2. System queries `servicingFeeEntries` filtered by mortgage and date range
3. System returns individual entries and total fees collected

Alternate Paths
- No servicing fees in the date range → empty entries array and \$0.00 total
- Date range omitted → System returns all servicing fee entries for the mortgage
```

## Repo-Verified Schema & Auth Contracts

```ts
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
  createdAt: v.number(),
})
  .index("by_lender", ["lenderId", "dispersalDate"])
  .index("by_mortgage", ["mortgageId", "dispersalDate"])
  .index("by_obligation", ["obligationId"])
  .index("by_status", ["status", "lenderId"])
  .index("by_idempotency", ["idempotencyKey"]),

servicingFeeEntries: defineTable({
  mortgageId: v.id("mortgages"),
  obligationId: v.id("obligations"),
  amount: v.number(),
  annualRate: v.number(),
  principalBalance: v.number(),
  date: v.string(),
  createdAt: v.number(),
})
  .index("by_mortgage", ["mortgageId", "date"])
  .index("by_obligation", ["obligationId"]),
```

```ts
export const testDispersalQuery = authedQuery
  .use(requirePermission("dispersal:view"))
  .handler(async () => okResponse())
  .public();
```

```ts
export async function canAccessDispersal(
  _ctx: { db: QueryCtx["db"] },
  viewer: Viewer,
  investorId: string
): Promise<boolean> {
  if (viewer.isFairLendAdmin) {
    return true;
  }

  if (investorId === viewer.authId) {
    return true;
  }

  return false;
}
```

## Drift / Integration Notes

```md
The older ENG-68 spec pages still say `investorId`, `investorAccountId`, `by_investor`, and sometimes use `ledgerQuery`.
The current repo uses `lenderId`, `lenderAccountId`, `by_lender`, and has a dedicated `dispersal:view` permission plus `canAccessDispersal()`.
Follow the repo as the source of truth.
```

```md
ENG-86 (Tests: reconciliation queries) depends on ENG-83 and expects:
- `getUndisbursedBalance`
- `getDisbursementHistory`
- `getServicingFeeHistory`
to exist before its broader cross-check test can pass.
```

## File Structure Assumption

```md
The issue text says `dispersal/queries/`, but the repo convention is a domain-level `queries.ts` file (for example `convex/ledger/queries.ts`, `convex/deals/queries.ts`, `convex/onboarding/queries.ts`).
Prefer `convex/dispersal/queries.ts` unless implementation uncovers a concrete reason to split files.
```
