# Chunk 3 Context: Tests

## Goal
Write unit tests for the posting group validation module and integration tests for the end-to-end flow including atomic rejection and reconciliation alerts.

## Task Details

### T-007: Unit tests for `postingGroups.ts`
**File:** `convex/payments/cashLedger/__tests__/postingGroups.test.ts`

Test cases:
1. **`validatePostingGroupAmounts` — valid sum passes silently**
   - `validatePostingGroupAmounts(100_000, [60_000, 39_167], 833)` should not throw
2. **`validatePostingGroupAmounts` — mismatched sum throws POSTING_GROUP_SUM_MISMATCH**
   - `validatePostingGroupAmounts(100_000, [60_000, 30_000], 833)` should throw ConvexError with code `POSTING_GROUP_SUM_MISMATCH`
3. **`validatePostingGroupAmounts` — zero servicing fee is valid**
   - `validatePostingGroupAmounts(50_000, [30_000, 20_000], 0)` should not throw
4. **`getPostingGroupSummary` — returns correct structure with entry count and CONTROL balance**
   - Seed obligation + CONTROL:ALLOCATION account, post entries via `postCashEntryInternal`, call summary
   - Verify `entryCount`, `controlAllocationBalance`, and `entries` array
5. **`getPostingGroupSummary` — complete group has zero CONTROL:ALLOCATION balance**
   - Post full allocation (all lender payables + servicing fee), verify `isComplete: true`
6. **`isPostingGroupComplete` — true when net-zero and entries > 0**
7. **`isPostingGroupComplete` — false when non-zero balance**
8. **`isPostingGroupComplete` — false when zero entries**

### T-008: Integration tests
**File:** `convex/payments/cashLedger/__tests__/postingGroupIntegration.test.ts`

Test cases:
1. **Dispersal with correct amounts → all entries posted, CONTROL:ALLOCATION nets to zero**
   - Use `createDispersalEntries._handler()` (same pattern as `lenderPayableIntegration.test.ts`)
   - After dispersal, call `getPostingGroupSummary()` and verify `isComplete: true`
2. **Dispersal with mismatched amounts → ConvexError thrown, zero entries persisted**
   - Manually call `postSettlementAllocation()` with amounts that don't sum correctly
   - Expect `ConvexError` with `POSTING_GROUP_SUM_MISMATCH`
   - Verify no entries exist for the posting group ID
3. **`getPostingGroupEntries` returns all entries in sequence order**
   - After successful dispersal, call the query and verify entries are sorted by sequence number
4. **`findNonZeroPostingGroups` returns alert for incomplete group**
   - Post only SOME entries in a group (e.g., 1 of 2 lender payables, no fee)
   - Verify alert returned with correct posting group ID
5. **`findNonZeroPostingGroups` does NOT return alert for complete group**
   - After full dispersal, verify empty alerts array

## Test Patterns (from existing tests)

### Harness setup
```typescript
import { describe, expect, it } from "vitest";
import { createHarness, seedMinimalEntities, SYSTEM_SOURCE, type TestHarness } from "./testUtils";

const modules = import.meta.glob("/convex/**/*.ts");
```

### Creating a settled obligation (from lenderPayableIntegration.test.ts)
```typescript
async function createSettledObligation(
  t: TestHarness,
  args: {
    mortgageId: Id<"mortgages">;
    borrowerId: Id<"borrowers">;
    amount: number;
  }
) {
  return t.run(async (ctx) => {
    const obligationId = await ctx.db.insert("obligations", {
      status: "settled",
      machineContext: {},
      lastTransitionAt: Date.now(),
      mortgageId: args.mortgageId,
      borrowerId: args.borrowerId,
      paymentNumber: 1,
      type: "regular_interest",
      amount: args.amount,
      amountSettled: args.amount,
      dueDate: Date.parse("2026-03-01T00:00:00Z"),
      gracePeriodEnd: Date.parse("2026-03-16T00:00:00Z"),
      settledAt: Date.parse("2026-03-01T00:00:00Z"),
      createdAt: Date.now(),
    });

    // Pre-create BORROWER_RECEIVABLE with balanced debits/credits (fully settled)
    await ctx.db.insert("cash_ledger_accounts", {
      family: "BORROWER_RECEIVABLE",
      mortgageId: args.mortgageId,
      obligationId,
      borrowerId: args.borrowerId,
      cumulativeDebits: BigInt(args.amount),
      cumulativeCredits: BigInt(args.amount),
      createdAt: Date.now(),
    });

    // Pre-create CONTROL:ALLOCATION for the dispersal
    await ctx.db.insert("cash_ledger_accounts", {
      family: "CONTROL",
      mortgageId: args.mortgageId,
      obligationId,
      subaccount: "ALLOCATION",
      cumulativeDebits: 0n,
      cumulativeCredits: 0n,
      createdAt: Date.now(),
    });

    return obligationId;
  });
}
```

### Calling postSettlementAllocation directly (for mismatch test)
```typescript
import { postSettlementAllocation } from "../integrations";

// Inside t.run():
await expect(
  postSettlementAllocation(ctx, {
    obligationId,
    mortgageId,
    settledDate: "2026-03-01",
    servicingFee: 833,
    entries: [
      { dispersalEntryId: dummyId1, lenderId: lenderAId, amount: 50_000 },
      { dispersalEntryId: dummyId2, lenderId: lenderBId, amount: 30_000 },
    ],
    source: SYSTEM_SOURCE,
  })
).rejects.toThrow(); // or use try/catch with ConvexError check
```

### Calling `createDispersalEntries._handler` (for E2E tests)
```typescript
import { createDispersalEntries } from "../../../dispersal/createDispersalEntries";

const createDispersalEntriesMutation = createDispersalEntries as unknown as {
  _handler: (ctx: MutationCtx, args: {
    obligationId: Id<"obligations">;
    mortgageId: Id<"mortgages">;
    settledAmount: number;
    settledDate: string;
    idempotencyKey: string;
    source: typeof SYSTEM_SOURCE;
  }) => Promise<{ created: boolean; entries: Array<{ id: Id<"dispersalEntries">; lenderId: Id<"lenders">; amount: number; }>; servicingFeeEntryId: Id<"servicingFeeEntries"> | null; }>;
};
```

### Calling query helpers inside t.run
```typescript
import { getPostingGroupSummary, isPostingGroupComplete } from "../postingGroups";
import { findNonZeroPostingGroups } from "../reconciliation";

await t.run(async (ctx) => {
  const summary = await getPostingGroupSummary(ctx, `allocation:${obligationId}`);
  expect(isPostingGroupComplete(summary)).toBe(true);
  expect(summary.controlAllocationBalance).toBe(0n);

  const alerts = await findNonZeroPostingGroups(ctx);
  expect(alerts).toHaveLength(0);
});
```

### For testing partial groups (incomplete allocation)
Use `postCashEntryInternal` directly to post only some entries:
```typescript
import { postCashEntryInternal } from "../postEntry";
import { getOrCreateCashAccount } from "../accounts";
import { buildIdempotencyKey } from "../types";

// Post only one lender payable, no servicing fee
await t.run(async (ctx) => {
  const controlAccount = await getOrCreateCashAccount(ctx, {
    family: "CONTROL", mortgageId, obligationId, subaccount: "ALLOCATION",
  });
  const payableAccount = await getOrCreateCashAccount(ctx, {
    family: "LENDER_PAYABLE", mortgageId, lenderId: lenderAId,
  });

  await postCashEntryInternal(ctx, {
    entryType: "LENDER_PAYABLE_CREATED",
    effectiveDate: "2026-03-01",
    amount: 60_000,
    debitAccountId: controlAccount._id,
    creditAccountId: payableAccount._id,
    idempotencyKey: buildIdempotencyKey("lender-payable", "test-partial"),
    mortgageId,
    obligationId,
    lenderId: lenderAId,
    postingGroupId: `allocation:${obligationId}`,
    source: SYSTEM_SOURCE,
  });
});
```

### Dummy dispersal entry IDs for direct postSettlementAllocation calls
Create them with `ctx.db.insert("dispersalEntries", { ... })` or use existing ones from the seeded data.

## Quality Gate
After implementation, run:
- `bun run test -- convex/payments/cashLedger/__tests__/postingGroups`
- `bun run test -- convex/payments/cashLedger/__tests__/postingGroupIntegration`
- `bun run test` (full suite — verify no regressions)
- `bun check`
- `bun typecheck`
