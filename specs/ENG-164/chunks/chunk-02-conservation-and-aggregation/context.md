# Chunk 2 Context: Conservation Checks and Aggregation

## Goal
Add conservation of money checks and a `runFullReconciliationSuite` aggregator to `convex/payments/cashLedger/reconciliationSuite.ts` (created in chunk 1).

## File to Modify
`convex/payments/cashLedger/reconciliationSuite.ts`

## Conservation Check Data Structures

Add to existing types in the file:

```typescript
export interface ConservationViolation {
  obligationId: Id<"obligations">;
  obligationAmount: number;
  dispersalTotal: number;
  servicingFeeTotal: number;
  differenceCents: number;
}

export interface MortgageMonthConservationViolation {
  mortgageId: Id<"mortgages">;
  month: string; // YYYY-MM
  settledTotal: number;
  dispersalTotal: number;
  feeTotal: number;
  differenceCents: number;
}

export interface FullReconciliationResult {
  isHealthy: boolean;
  checkedAt: number;
  checkResults: ReconciliationCheckResult<unknown>[];
  conservationResults: ReconciliationCheckResult<unknown>[];
  unhealthyCheckNames: string[];
  totalGapCount: number;
}
```

## Conservation Check Details

### T-010: checkObligationConservation
Per settled obligation: `SUM(dispersalEntries.amount) + SUM(servicingFeeEntries.amount) == obligation.amount`

**Tables involved:**
- `obligations` — query `by_status` with status = "settled"
- `dispersalEntries` — query `by_obligation` index → `["obligationId"]`
  - Schema: `{ mortgageId, lenderId, amount (number, cents), obligationId, servicingFeeDeducted, status, dispersalDate }`
- `servicingFeeEntries` — query `by_obligation` index → `["obligationId"]`
  - Schema: `{ mortgageId, obligationId, amount (number, cents), date }`

**Logic:**
```typescript
for each settled obligation:
  dispersals = await ctx.db.query("dispersalEntries").withIndex("by_obligation", q => q.eq("obligationId", obligation._id)).collect()
  feeEntries = await ctx.db.query("servicingFeeEntries").withIndex("by_obligation", q => q.eq("obligationId", obligation._id)).collect()
  dispersalTotal = dispersals.reduce((sum, d) => sum + d.amount, 0)
  feeTotal = feeEntries.reduce((sum, f) => sum + f.amount, 0)
  if (dispersalTotal + feeTotal !== obligation.amount) → violation
```

### T-011: checkMortgageMonthConservation
Per mortgage per month: `SUM(settled obligation amounts) == SUM(dispersal amounts) + SUM(servicing fees)`

**Logic:**
- Query all settled obligations
- Group by `mortgageId` + month derived from `dueDate` (Unix ms → YYYY-MM)
- For each group, sum obligation amounts
- Query dispersalEntries and servicingFeeEntries for those obligations
- Compare totals

**Date handling:**
- `obligation.dueDate` is Unix ms → convert to YYYY-MM: `new Date(dueDate).toISOString().slice(0, 7)`
- This check is more expensive; for the cron, limit to last 3 months

### T-012: runFullReconciliationSuite
```typescript
export async function runFullReconciliationSuite(ctx: QueryCtx): Promise<FullReconciliationResult> {
  // Run all 8 checks
  const checkResults = await Promise.all([
    checkUnappliedCash(ctx),
    checkNegativePayables(ctx),
    checkObligationBalanceDrift(ctx),
    checkControlNetZero(ctx),
    checkSuspenseItems(ctx),
    checkOrphanedObligations(ctx),
    checkStuckCollections(ctx),
    checkOrphanedUnappliedCash(ctx),
  ]);

  // Run conservation checks
  const conservationResults = await Promise.all([
    checkObligationConservation(ctx),
    checkMortgageMonthConservation(ctx),
  ]);

  const allResults = [...checkResults, ...conservationResults];
  const unhealthyCheckNames = allResults
    .filter(r => !r.isHealthy)
    .map(r => r.checkName);

  return {
    isHealthy: unhealthyCheckNames.length === 0,
    checkedAt: Date.now(),
    checkResults,
    conservationResults,
    unhealthyCheckNames,
    totalGapCount: allResults.reduce((sum, r) => sum + r.count, 0),
  };
}
```

## Constraints
- Use `number` (not `bigint`) in result types — convert with `safeBigintToNumber`
- `dispersalEntries.amount` and `servicingFeeEntries.amount` are already `number` (cents)
- `obligation.amount` is `number` (cents)
- After completing, run `bun typecheck` to verify
