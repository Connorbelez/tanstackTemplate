# Chunk 4 Context: Financial Conservation Test Suite

## What You're Building
A `describe("financial conservation invariants", ...)` block at the end of `e2eLifecycle.test.ts`.
These tests set up complete lifecycles and then verify mathematical properties.

## File: `convex/payments/cashLedger/__tests__/e2eLifecycle.test.ts` (MODIFY — add conservation describe block)

## Test Structure

```typescript
describe("financial conservation invariants", () => {
  // Each test sets up a complete lifecycle, then verifies the invariant

  it("per obligation: settled = dispersals + servicing fee", ...);
  it("CONTROL:ALLOCATION nets to zero per posting group", ...);
  it("no negative LENDER_PAYABLE outside active reversals", ...);
  it("point-in-time reconstruction matches running balances", ...);
  it("idempotent replay: posting same entries twice = same state", ...);
});
```

## T-016: Settled = Dispersals + Servicing Fee

Set up a complete lifecycle (accrue → receive → allocate). Then:
```typescript
await t.run(async (ctx) => {
  const obligation = await ctx.db.get(obligationId);
  const obligationAmount = BigInt(obligation!.amount);

  // Get all entries in the allocation posting group
  const summary = await getPostingGroupSummary(ctx, `allocation:${obligationId}`);

  let totalDispersal = 0n;
  let totalFee = 0n;
  for (const entry of summary.entries) {
    if (entry.entryType === "LENDER_PAYABLE_CREATED") {
      totalDispersal += entry.amount;
    } else if (entry.entryType === "SERVICING_FEE_RECOGNIZED") {
      totalFee += entry.amount;
    }
  }

  expect(totalDispersal + totalFee).toBe(obligationAmount);
});
```

## T-017: CONTROL:ALLOCATION Nets to Zero

After a complete allocation:
```typescript
await t.run(async (ctx) => {
  const summary = await getPostingGroupSummary(ctx, `allocation:${obligationId}`);
  expect(isPostingGroupComplete(summary)).toBe(true);
  expect(summary.controlAllocationBalance).toBe(0n);
});
```

Also verify via `findNonZeroPostingGroups`:
```typescript
await t.run(async (ctx) => {
  const result = await findNonZeroPostingGroups(ctx);
  expect(result.alerts).toHaveLength(0);
  expect(result.orphaned).toHaveLength(0);
});
```

## T-018: No Negative LENDER_PAYABLE

After payouts, verify lender payable balances are >= 0:
```typescript
await t.run(async (ctx) => {
  const lenderPayableAccounts = await ctx.db
    .query("cash_ledger_accounts")
    .withIndex("by_family_and_mortgage", (q) =>
      q.eq("family", "LENDER_PAYABLE").eq("mortgageId", mortgageId)
    )
    .collect();

  for (const account of lenderPayableAccounts) {
    const balance = getCashAccountBalance(account);
    expect(balance).toBeGreaterThanOrEqual(0n);
  }
});
```

## T-019: Point-in-Time Reconstruction Matches Running Balances

Use `replayJournalIntegrity` from `../replayIntegrity.ts`:
```typescript
import { replayJournalIntegrity } from "../replayIntegrity";

await t.run(async (ctx) => {
  const result = await replayJournalIntegrity(ctx, { mode: "full" });
  expect(result.status).toBe("ok");
  expect(result.mismatches).toHaveLength(0);
});
```

If `replayJournalIntegrity` is not directly importable, use the internal query:
```typescript
// Alternative: query through reconciliation
import { reconcileObligationSettlementProjectionInternal } from "../reconciliation";

await t.run(async (ctx) => {
  const result = await reconcileObligationSettlementProjectionInternal(ctx, obligationId);
  expect(result.hasDrift).toBe(false);
  expect(result.driftAmount).toBe(0n);
});
```

## T-020: Idempotent Replay

Post the same entries twice with the same idempotency keys. Verify state doesn't change:
```typescript
it("idempotent replay: posting same entries twice = same state", async () => {
  // 1. Complete lifecycle
  // ... accrue, receive, allocate ...

  // 2. Capture state
  const balancesBefore = await captureAccountBalances(t, mortgageId);

  // 3. Replay all operations with same idempotency keys
  await t.run(async (ctx) => {
    // Re-post accrual (same idempotency key → idempotent return)
    await postObligationAccrued(ctx, { obligationId, source: SYSTEM_SOURCE });
    // Re-post cash receipt (same idempotency key)
    await postCashReceiptForObligation(ctx, {
      obligationId, amount: 100_000,
      idempotencyKey: buildIdempotencyKey("cash-received", obligationId),
      source: SYSTEM_SOURCE,
    });
    // Re-post allocation (same keys)
    // ... etc
  });

  // 4. Verify state unchanged
  const balancesAfter = await captureAccountBalances(t, mortgageId);
  expect(balancesAfter).toEqual(balancesBefore);
});
```

Helper for capturing balances:
```typescript
async function captureAccountBalances(t: TestHarness, mortgageId: Id<"mortgages">) {
  return t.run(async (ctx) => {
    const accounts = await ctx.db
      .query("cash_ledger_accounts")
      .withIndex("by_family_and_mortgage", (q) =>
        q.eq("family", "BORROWER_RECEIVABLE").eq("mortgageId", mortgageId)
      )
      .collect();
    // Capture all families
    const allAccounts = await ctx.db.query("cash_ledger_accounts").collect();
    const mortgageAccounts = allAccounts.filter(a =>
      a.mortgageId === mortgageId || a.obligationId !== undefined
    );
    return mortgageAccounts.map(a => ({
      id: a._id,
      family: a.family,
      cumulativeDebits: a.cumulativeDebits,
      cumulativeCredits: a.cumulativeCredits,
    }));
  });
}
```

## T-021: Quality Gate

After all tests are written, run:
```bash
bun check          # lint + format (auto-fixes)
bun typecheck      # TypeScript type checking
bunx convex codegen  # Convex codegen
```

All must pass.

## Key Imports
```typescript
import { getPostingGroupSummary, isPostingGroupComplete } from "../postingGroups";
import { findNonZeroPostingGroups, getJournalSettledAmountForObligation, reconcileObligationSettlementProjectionInternal } from "../reconciliation";
import { getCashAccountBalance } from "../accounts";
import { replayJournalIntegrity } from "../replayIntegrity";
```

## Constraints
- ALL monetary assertions use BigInt comparisons
- No `Number` comparisons for cent amounts
- No floating-point arithmetic anywhere
- Each conservation test is self-contained (seeds its own data)
- Use existing reconciliation queries — don't reimplement
