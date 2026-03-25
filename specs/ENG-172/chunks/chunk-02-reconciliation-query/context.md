# Chunk 2 Context: Reconciliation Query

## What You're Building

Add `findSettledObligationsWithNonZeroBalance()` to `reconciliation.ts` and expose it via query endpoints.

This query detects settled obligations where the journal-derived receivable balance is non-zero — the reversal indicator. Downstream consumers (ENG-180: corrective obligation creation) will use this to find obligations needing correction after a reversal.

## Function Signature

```typescript
export interface ReversalIndicator {
  obligationId: Id<"obligations">;
  journalSettledAmount: bigint;
  obligationAmount: number;
  expectedBalance: bigint; // obligationAmount - journalSettledAmount
}

export async function findSettledObligationsWithNonZeroBalance(
  ctx: QueryCtx
): Promise<ReversalIndicator[]>
```

## Logic

1. Query all obligations with `status === "settled"`.
2. For each, call existing `getJournalSettledAmountForObligation()` (which already handles REVERSAL subtraction — it sums CASH_RECEIVED entries and subtracts REVERSALs that reference CASH_RECEIVED originals).
3. Compare journal-derived balance to `obligation.amount`.
4. Return those where `BigInt(obligation.amount) - journalSettledAmount !== 0n` (non-zero receivable = reversal happened).

## Existing Code to Use

### getJournalSettledAmountForObligation() (in reconciliation.ts)
Already exists and already handles REVERSAL subtraction:
```typescript
export async function getJournalSettledAmountForObligation(
  ctx: QueryCtx,
  obligationId: Id<"obligations">
): Promise<bigint>
// Sums all CASH_RECEIVED entries for this obligation
// Subtracts REVERSAL entries that reference CASH_RECEIVED originals
```

### Querying settled obligations
Query the `obligations` table for `status === "settled"`. Use the appropriate index.

### Existing reconciliation patterns (reconciliation.ts)
- `reconcileObligationSettlementProjectionInternal()` — similar pattern of loading obligation + computing journal amounts
- `findNonZeroPostingGroups()` — similar "scan and filter" pattern returning alerts

## Query Endpoint Patterns

### Internal query wrapper (queries.ts or a separate file)
Follow the existing pattern in `queries.ts` which uses `cashLedgerQuery` builder:
```typescript
export const getSettledObligationsWithNonZeroBalance = cashLedgerQuery({
  args: {},
  handler: async (ctx) => {
    return findSettledObligationsWithNonZeroBalance(ctx);
  },
});
```

Or as an `internalQuery` if it should only be called by other Convex functions:
```typescript
export const findSettledWithNonZeroBalanceInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    return findSettledObligationsWithNonZeroBalance(ctx);
  },
});
```

## File Map
| File | Action | Purpose |
|------|--------|---------|
| `convex/payments/cashLedger/reconciliation.ts` | **Modify** | Add `findSettledObligationsWithNonZeroBalance()` + `ReversalIndicator` interface |
| `convex/payments/cashLedger/queries.ts` | **Modify** | Add public query endpoint |
