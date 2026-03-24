# Chunk 4 Context: Tests

## Goal
Create `convex/payments/cashLedger/__tests__/reconciliationSuite.test.ts` with comprehensive tests for all 8 reconciliation checks, 2 conservation checks, filtering, and the cron action pattern.

## File to Create
`convex/payments/cashLedger/__tests__/reconciliationSuite.test.ts`

## Test Framework Pattern
Follow the existing test pattern from `testUtils.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { createHarness, seedMinimalEntities, createTestAccount, createSettledObligation, postTestEntry, SYSTEM_SOURCE } from "./testUtils";

const modules = import.meta.glob("/convex/**/*.ts");

describe("reconciliationSuite", () => {
  // Each test creates its own harness — Convex test isolation
  describe("checkUnappliedCash", () => {
    it("returns healthy when no unapplied cash", async () => {
      const t = createHarness(modules);
      // ... setup and assert
    });
  });
});
```

### Test Harness
- `createHarness(modules)` — creates a fresh Convex test environment
- `seedMinimalEntities(t)` — returns `{ borrowerId, lenderAId, lenderBId, mortgageId }` with a mortgage (monthly, 100_000 cents payment, 1% annual servicing rate, 60/40 lender split)
- `createTestAccount(t, spec)` — creates a cash_ledger_account with optional initial balances
- `createSettledObligation(t, { mortgageId, borrowerId, amount })` — creates settled obligation + pre-balanced BORROWER_RECEIVABLE + CONTROL:ALLOCATION
- `postTestEntry(t, input)` — posts a journal entry via the full pipeline

### Running within harness
Use `t.run(async (ctx) => { ... })` for direct DB access in tests.

### PostCashEntryInput shape
```typescript
interface PostCashEntryInput {
  entryType: CashEntryType;
  debitAccountId: Id<"cash_ledger_accounts">;
  creditAccountId: Id<"cash_ledger_accounts">;
  amount: number; // cents (stored as v.int64() internally; bigint used for cumulative balances)
  effectiveDate: string; // YYYY-MM-DD
  idempotencyKey: string;
  source: { actorType: string; actorId: string; channel: string };
  obligationId?: Id<"obligations">;
  mortgageId?: Id<"mortgages">;
  lenderId?: Id<"lenders">;
  borrowerId?: Id<"borrowers">;
  postingGroupId?: string;
  causedBy?: Id<"cash_ledger_journal_entries">;
  reason?: string;
}
```

## Test Scenarios per Check

### T-016: Tests for checks 1-4

**checkUnappliedCash**
1. Healthy: no UNAPPLIED_CASH accounts → `isHealthy: true, count: 0`
2. Unhealthy: create UNAPPLIED_CASH account with positive balance → returns item with balance and ageDays
3. Filters zero-balance accounts: create account with 0 balance → not included

**checkNegativePayables**
1. Healthy: LENDER_PAYABLE with positive balance → `isHealthy: true`
2. Unhealthy: LENDER_PAYABLE with debits > credits → returns negative balance item
3. Zero balance is healthy

**checkObligationBalanceDrift**
1. Healthy: settled obligation where `amountSettled` matches journal → no drift
2. Unhealthy: settled obligation where `amountSettled` differs from journal → drift item
3. Non-settled obligations are skipped

**checkControlNetZero**
1. Healthy: all CONTROL:ALLOCATION balances are zero → `isHealthy: true`
2. Unhealthy: non-zero CONTROL:ALLOCATION balance → returns alert item

### T-017: Tests for checks 5-8

**checkSuspenseItems**
1. Healthy: no SUSPENSE accounts → `isHealthy: true`
2. Unhealthy: SUSPENSE account with positive balance → returns item with ageDays
3. Aging calculation: verify days computed correctly

**checkOrphanedObligations**
1. Healthy: obligation with OBLIGATION_ACCRUED entry → not orphaned
2. Unhealthy: obligation without OBLIGATION_ACCRUED entry → orphaned
3. Generated obligations (pre-due) are skipped (check status filtering)

**checkStuckCollections**
1. Healthy: executing attempt < 7 days → `isHealthy: true`
2. Unhealthy: executing attempt > 7 days → returns stuck item
3. Non-executing attempts are skipped

**checkOrphanedUnappliedCash**
1. Healthy: UNAPPLIED_CASH < 7 days old → `isHealthy: true`
2. Unhealthy: UNAPPLIED_CASH > 7 days old → returns orphaned item

### T-018: Tests for conservation checks

**checkObligationConservation**
1. Healthy: dispersals + fees == obligation.amount → no violation
2. Unhealthy: dispersals + fees != obligation.amount → violation with difference
3. Obligations without dispersals (not yet dispersed) — should be flagged

**checkMortgageMonthConservation**
1. Healthy: monthly totals match
2. Unhealthy: monthly totals don't match

**Filtering**
- Test that `reconciliationUnappliedCash` with `mortgageId` filter only returns matching items
- Test date range filtering

### T-019: Tests for aggregation and cron

**runFullReconciliationSuite**
1. All healthy: returns `isHealthy: true, totalGapCount: 0`
2. Some unhealthy: returns `isHealthy: false` with correct `unhealthyCheckNames`

**Cron action pattern**
- Verify the `reconcileCashLedgerInternal` internalQuery can be called
- Verify results are serializable (no bigint in the response)

## Creating Test Data

### For obligation drift test
```typescript
// Create obligation with mismatched amountSettled
const obligationId = await t.run(async (ctx) => {
  return ctx.db.insert("obligations", {
    status: "settled",
    machineContext: {},
    mortgageId, borrowerId,
    paymentNumber: 1,
    type: "regular_interest",
    amount: 100_000,
    amountSettled: 90_000, // intentional mismatch
    dueDate: Date.parse("2026-03-01T00:00:00Z"),
    gracePeriodEnd: Date.parse("2026-03-16T00:00:00Z"),
    settledAt: Date.now(),
    createdAt: Date.now(),
  });
});
// Post a CASH_RECEIVED entry for 100_000 → journal says 100_000, record says 90_000
```

### For stuck collection test
```typescript
const attemptId = await t.run(async (ctx) => {
  // First create a collection plan entry
  const planEntryId = await ctx.db.insert("collectionPlanEntries", {
    // ... required fields
  });
  return ctx.db.insert("collectionAttempts", {
    status: "executing",
    planEntryId,
    method: "manual",
    amount: 50_000,
    initiatedAt: Date.now() - 8 * 24 * 60 * 60 * 1000, // 8 days ago
  });
});
```

### For conservation test
```typescript
// Create settled obligation with dispersal entries
const obligationId = await createSettledObligation(t, { mortgageId, borrowerId, amount: 100_000 });
await t.run(async (ctx) => {
  // Create dispersal entries that don't sum to obligation amount
  await ctx.db.insert("dispersalEntries", {
    mortgageId, lenderId: lenderAId,
    lenderAccountId: someAccountId,
    amount: 50_000, // only half!
    dispersalDate: "2026-03-01",
    obligationId,
    servicingFeeDeducted: 0,
    status: "pending",
    idempotencyKey: `test-dispersal-${obligationId}`,
    calculationDetails: { /* ... */ },
    createdAt: Date.now(),
  });
});
```

## Importing the Suite Functions
```typescript
import {
  checkUnappliedCash,
  checkNegativePayables,
  checkObligationBalanceDrift,
  checkControlNetZero,
  checkSuspenseItems,
  checkOrphanedObligations,
  checkStuckCollections,
  checkOrphanedUnappliedCash,
  checkObligationConservation,
  checkMortgageMonthConservation,
  runFullReconciliationSuite,
} from "../reconciliationSuite";
```

Call them inside `t.run(async (ctx) => { ... })` since they need `QueryCtx`.

## Constraints
- Use `vitest` (`describe`, `it`, `expect`)
- Each test creates its own `createHarness(modules)` — full isolation
- Run `bun run test convex/payments/cashLedger/__tests__/reconciliationSuite.test.ts` to verify
- Check for `collectionPlanEntries` schema before inserting test data — may need minimal required fields
- After all tests pass, run `bun check` for lint/format
