# Chunk 02 Context: Reconciliation Detection Query

## What You're Building

A reconciliation query in `convex/payments/cashLedger/reconciliation.ts` that detects settled obligations where the journal-derived receivable balance is non-zero — the reversal indicator. This is consumed by ENG-180 (corrective obligation creation).

## T-004: findSettledObligationsWithNonZeroBalance()

### Interface

```typescript
export interface ReversalIndicator {
  obligationId: Id<"obligations">;
  journalSettledAmount: bigint;
  obligationAmount: number;
  /** obligationAmount - journalSettledAmount — non-zero means reversal happened */
  outstandingBalance: bigint;
}

export async function findSettledObligationsWithNonZeroBalance(
  ctx: QueryCtx
): Promise<ReversalIndicator[]>
```

### Logic

1. Query all obligations with `status === "settled"`.
   - Use: `ctx.db.query("obligations").withIndex("by_status", q => q.eq("status", "settled")).collect()`
   - **CHECK INDEX:** Verify `by_status` index exists on `obligations` table. If not, you may need to use a different approach or filter after collection.
2. For each settled obligation, call `getJournalSettledAmountForObligation(ctx, obligationId)` — this function already exists and handles REVERSAL subtraction correctly.
3. Compute `outstandingBalance = BigInt(obligation.amount) - journalSettledAmount`.
4. Return those where `outstandingBalance !== 0n`.

### Existing Function: getJournalSettledAmountForObligation

Already implemented in `reconciliation.ts` (lines 26-49):
```typescript
export async function getJournalSettledAmountForObligation(ctx, obligationId) {
  const entries = await loadObligationEntries(ctx, obligationId);
  let journalSettledAmount = 0n;
  for (const entry of entries) {
    if (entry.entryType === "CASH_RECEIVED") {
      journalSettledAmount += entry.amount;
      continue;
    }
    if (entry.entryType !== "REVERSAL" || !entry.causedBy) continue;
    const original = await ctx.db.get(entry.causedBy);
    if (original?.entryType === "CASH_RECEIVED") {
      journalSettledAmount -= entry.amount;
    }
  }
  return journalSettledAmount;
}
```

This already handles the reversal subtraction — when a REVERSAL entry's `causedBy` points to a CASH_RECEIVED, it subtracts the amount.

## T-005: internalQuery wrapper

```typescript
export const findSettledObligationsWithNonZeroBalanceInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    const result = await findSettledObligationsWithNonZeroBalance(ctx);
    return result.map((r) => ({
      ...r,
      journalSettledAmount: safeBigintToNumber(r.journalSettledAmount),
      outstandingBalance: safeBigintToNumber(r.outstandingBalance),
    }));
  },
});
```

Uses `safeBigintToNumber` from `./accounts` (already imported in reconciliation.ts).

## Existing Imports in reconciliation.ts

Already available:
- `v` from "convex/values"
- `Doc`, `Id` from dataModel
- `internalQuery`, `QueryCtx` from server
- `createAccountCache`, `getCashAccountBalance`, `getControlAccountsBySubaccount`, `safeBigintToNumber` from "./accounts"
- `replayJournalIntegrity` from "./replayIntegrity"
- `ControlSubaccount`, `TRANSIENT_SUBACCOUNTS` from "./types"

## Constraints

- This is a read-only query — no mutations.
- Must handle the case where no settled obligations exist (return empty array).
- The `getJournalSettledAmountForObligation` function does N+1 queries (one per REVERSAL entry to check causedBy). This is acceptable for reconciliation (batch, not real-time).
