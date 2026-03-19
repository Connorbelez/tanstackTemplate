# Chunk 02 Context: Accrual Query API

Source: Linear `ENG-67`, Notion implementation plan + linked pages, and verified local code.

## Acceptance Criteria

> - Interest calculation (Actual/365)
> - Query API: single investor, per-mortgage, portfolio, daily snapshot

## Implementation Plan Excerpt

> `convex/accrual/calculateAccruedInterest.ts` — Single lender × mortgage × date range (ledgerQuery)
>
> `convex/accrual/calculateAccruedByMortgage.ts` — Per-lender breakdown for a mortgage (ledgerQuery)
>
> `convex/accrual/calculateInvestorPortfolio.ts` — Aggregate across all mortgages for a lender (ledgerQuery)
>
> `convex/accrual/calculateDailyAccrual.ts` — Single-day snapshot for all lenders on a mortgage (ledgerQuery)

## Feature / Requirement Excerpts

> Query API:
> - `calculateAccruedInterest(mortgageId, investorId, fromDate, toDate)`
> - `calculateAccruedByMortgage(mortgageId, fromDate, toDate)`
> - `calculateInvestorPortfolioAccrual(investorId, fromDate, toDate)`
> - `calculateDailyAccrual(mortgageId, date)`

> Interest accrual is computed on-demand by reading ownership periods from the ledger journal and applying mortgage contract terms. No materialized accrual table, no cron job.

> Daily accrual per investor = `(interestRate × ownershipFraction × principal) / 365`.

## Spec Excerpts

```typescript
export const calculateAccruedInterest = ledgerQuery({
  args: {
    mortgageId: v.id("mortgages"),
    lenderId: v.string(),
    fromDate: v.string(),
    toDate: v.string(),
  },
  handler: async (ctx, args) => {
    const mortgage = await ctx.db.get(args.mortgageId);
    if (!mortgage) throw new ConvexError("Mortgage not found");

    const periods = await getOwnershipPeriods(ctx, args.mortgageId, args.lenderId);
    const accrued = calculateAccrualForPeriods(
      periods, mortgage.interestRate, mortgage.principal,
      args.fromDate, args.toDate,
    );
```

```typescript
export const calculateAccruedByMortgage = ledgerQuery({
  args: {
    mortgageId: v.id("mortgages"),
    fromDate: v.string(),
    toDate: v.string(),
  },
  handler: async (ctx, args) => {
    const positionAccounts = await ctx.db
      .query("ledger_accounts")
      .withIndex("by_mortgage_and_lender", q =>
        q.eq("mortgageId", args.mortgageId)
      )
      .filter(q => q.eq(q.field("type"), "POSITION"))
      .collect();
```

## Verified Local Code Excerpts

```typescript
// convex/fluent.ts
export const ledgerQuery = authedQuery.use(requirePermission("ledger:view"));
```

```typescript
// convex/auth/resourceChecks.ts
export async function canAccessAccrual(
  ctx: { db: QueryCtx["db"] },
  viewer: Viewer,
  investorId: string
): Promise<boolean> {
  if (viewer.isFairLendAdmin) return true;
  if (investorId === viewer.authId) return true;
  const broker = await getBrokerByAuthId(ctx, viewer.authId);
  if (broker) {
    const targetLender = await getLenderByAuthId(ctx, investorId);
    if (targetLender && targetLender.brokerId === broker._id) {
      return true;
    }
  }
  return false;
}
```

```typescript
// convex/schema.ts
mortgages: defineTable({
  principal: v.number(),
  interestRate: v.number(),
  annualServicingRate: v.optional(v.number()),
});
```

```typescript
// convex/ledger/queries.ts
export const getLenderPositions = ledgerQuery
  .input({ lenderId: v.string() })
  .handler(async (ctx, args) => {
    const indexedAccounts = await ctx.db
      .query("ledger_accounts")
      .withIndex("by_lender", (q) => q.eq("lenderId", args.lenderId))
      .collect();

    return accounts
      .filter((a) => a.type === "POSITION" && getPostedBalance(a) > 0n)
      .map((a) => ({
        mortgageId: a.mortgageId ?? "",
        accountId: a._id,
        balance: getPostedBalance(a),
      }));
  })
  .public();
```

## Integration Points

> `mortgage.interestRate`, `mortgage.principal` (NOT `annualRate` / `principalBalance`)

> `ledgerQuery` from `../fluent`

> `by_mortgage_and_lender` index not `by_mortgage_and_investor`

## Constraints & Rules

> - **No new tables** — accrual is pure computation, zero persistence
> - **All queries use `ledgerQuery`**
> - **Use `lender` terminology** everywhere
> - **No rounding in accrual**

## File Structure

```text
convex/
  accrual/
    calculateAccruedInterest.ts
    calculateAccruedByMortgage.ts
    calculateInvestorPortfolio.ts
    calculateDailyAccrual.ts
```
