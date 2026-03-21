# Chunk 02 Context: Queries & Reconciliation

## What Exists
- `accounts.ts` has `findCashAccount`, `getOrCreateCashAccount`, `getCashAccountBalance`, `requireCashAccount` — all support `subaccount` field
- `reconciliation.ts` has `getJournalSettledAmountForObligation` and `reconcileObligationSettlementProjectionInternal` for obligation settlement drift
- `queries.ts` has `getAccountBalance`, `getObligationBalance`, `getMortgageCashState`, `getLenderPayableBalance`, `getUnappliedCash`, `getSuspenseItems`, `getAccountBalanceAt`, `getObligationHistory`
- Queries use `ledgerQuery` from `../../fluent` (fluent-convex chainable builder)
- Schema index `by_posting_group` exists on `cash_ledger_journal_entries` for `["postingGroupId", "sequenceNumber"]`
- After chunk-01, `by_family_and_subaccount` index will exist on `cash_ledger_accounts`
- After chunk-01, `TRANSIENT_SUBACCOUNTS` set will exist in `types.ts`

## What's Missing

### T-004: getControlAccountsBySubaccount
Add to `convex/payments/cashLedger/accounts.ts`:
```typescript
export async function getControlAccountsBySubaccount(
  db: DbReader,
  subaccount: ControlSubaccount
): Promise<Doc<"cash_ledger_accounts">[]> {
  return db
    .query("cash_ledger_accounts")
    .withIndex("by_family_and_subaccount", (q) =>
      q.eq("family", "CONTROL").eq("subaccount", subaccount)
    )
    .collect();
}
```
Uses the new composite index from T-003 for O(1) lookup.

### T-005: getControlBalanceBySubaccount
Add to `convex/payments/cashLedger/reconciliation.ts`:
```typescript
export async function getControlBalanceBySubaccount(
  ctx: QueryCtx,
  subaccount: ControlSubaccount
): Promise<{ totalBalance: bigint; accountCount: number }> {
  const accounts = await getControlAccountsBySubaccount(ctx.db, subaccount);
  let totalBalance = 0n;
  for (const account of accounts) {
    totalBalance += getCashAccountBalance(account);
  }
  return { totalBalance, accountCount: accounts.length };
}
```
Import `getControlAccountsBySubaccount` from `./accounts` and `getCashAccountBalance` from `./accounts`.

### T-006: validateControlNetZero
Add to `convex/payments/cashLedger/reconciliation.ts`:
```typescript
interface ControlBalanceResult {
  subaccount: string;
  balance: bigint;
  valid: boolean;
}

export async function validateControlNetZero(
  ctx: QueryCtx,
  postingGroupId: string
): Promise<ControlBalanceResult[]> {
  const entries = await ctx.db
    .query("cash_ledger_journal_entries")
    .withIndex("by_posting_group", (q) => q.eq("postingGroupId", postingGroupId))
    .collect();

  const balances = new Map<string, bigint>();

  for (const entry of entries) {
    const debitAccount = await ctx.db.get(entry.debitAccountId);
    const creditAccount = await ctx.db.get(entry.creditAccountId);

    if (debitAccount?.family === "CONTROL" && debitAccount.subaccount) {
      const sub = debitAccount.subaccount;
      balances.set(sub, (balances.get(sub) ?? 0n) + entry.amount);
    }
    if (creditAccount?.family === "CONTROL" && creditAccount.subaccount) {
      const sub = creditAccount.subaccount;
      balances.set(sub, (balances.get(sub) ?? 0n) - entry.amount);
    }
  }

  const results: ControlBalanceResult[] = [];
  for (const sub of TRANSIENT_SUBACCOUNTS) {
    const balance = balances.get(sub) ?? 0n;
    results.push({ subaccount: sub, balance, valid: balance === 0n });
  }
  return results;
}
```
Import `TRANSIENT_SUBACCOUNTS` from `./types`.

Key design: uses `subaccount` field directly (top-level) rather than digging into metadata. Only checks TRANSIENT subaccounts — WAIVER is excluded.

### T-007: Export new queries
Add to `convex/payments/cashLedger/queries.ts`:
- `getControlBalance` query wrapping `getControlBalanceBySubaccount`
- `controlNetZeroCheck` query wrapping `validateControlNetZero`
- `getControlAccounts` query wrapping `getControlAccountsBySubaccount`

Use `ledgerQuery` pattern matching existing queries.

Validators needed:
```typescript
v.union(v.literal("ACCRUAL"), v.literal("ALLOCATION"), v.literal("SETTLEMENT"), v.literal("WAIVER"))
```

## Existing Pattern: ledgerQuery
```typescript
export const getAccountBalance = ledgerQuery
  .input({ accountId: v.id("cash_ledger_accounts") })
  .handler(async (ctx, args) => { ... })
  .public();
```

## File Paths
- `convex/payments/cashLedger/accounts.ts` — add getControlAccountsBySubaccount
- `convex/payments/cashLedger/reconciliation.ts` — add getControlBalanceBySubaccount, validateControlNetZero
- `convex/payments/cashLedger/queries.ts` — add public query exports
