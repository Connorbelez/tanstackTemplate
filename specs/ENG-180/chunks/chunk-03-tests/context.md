# Chunk Context: tests

Source: Linear ENG-180, Notion implementation plan + linked pages.
This file and the accompanying tasks.md contain everything needed to implement this chunk.

## Implementation Plan Excerpt

### Test Cases from Implementation Plan

1. **Happy path**: Settled obligation → reversal cascade → corrective obligation created with correct amount, type, and sourceObligationId
2. **Idempotency**: Calling `createCorrectiveObligation` twice for same original returns existing
3. **Non-settled source**: Attempting corrective on non-settled obligation throws `INVALID_CORRECTIVE_SOURCE`
4. **Invalid amount**: Zero or negative amount throws `INVALID_CORRECTIVE_AMOUNT`
5. **Cash ledger integration**: Corrective obligation creates `OBLIGATION_ACCRUED` entry in cash ledger
6. **Lifecycle entry**: Corrective obligation starts in `upcoming` and can transition through normal lifecycle
7. **Queryable link**: `getCorrectiveObligations(originalId)` returns the corrective
8. **Original unchanged**: Original obligation remains in `settled` state after corrective creation

## Testing Framework

This project uses **Vitest** with **convex-test** for testing Convex functions. Look at existing test files for patterns:

### Key Test Files to Reference

- `convex/payments/cashLedger/__tests__/reversalIntegration.test.ts` — Shows the full reversal flow test pattern including:
  - Setting up test data (mortgages, borrowers, obligations)
  - Using `postObligationAccrued`, `postCashReceiptForObligation`, etc.
  - Querying cash ledger journal entries
  - Verifying account balances

- `convex/payments/cashLedger/__tests__/reversalCascade.test.ts` — Shows reversal cascade testing

- `convex/payments/cashLedger/__tests__/cashReceipt.test.ts` — Shows cash receipt testing with obligation accrual

### convex-test Pattern

```typescript
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../../../schema";

describe("correctiveObligation", () => {
  it("creates corrective obligation from settled original", async () => {
    const t = convexTest(schema);
    await t.run(async (ctx) => {
      // Seed test data directly into the database
      const mortgageId = await ctx.db.insert("mortgages", { ... });
      const borrowerId = await ctx.db.insert("borrowers", { ... });
      const obligationId = await ctx.db.insert("obligations", {
        status: "settled",
        mortgageId,
        borrowerId,
        paymentNumber: 1,
        type: "regular_interest",
        amount: 100000, // $1000.00 in cents
        amountSettled: 100000,
        dueDate: Date.now() - 86400000,
        gracePeriodEnd: Date.now() - 86400000,
        createdAt: Date.now() - 86400000,
        settledAt: Date.now() - 86400000,
      });

      // Call the function under test
      // ... test assertions ...
    });
  });
});
```

## Schema Context

### Obligations Table Fields (all required for seeding test data)

```typescript
{
    status: v.string(),                                    // "settled" for test setup
    machineContext: v.optional(v.any()),                    // optional, can omit
    lastTransitionAt: v.optional(v.number()),              // optional
    mortgageId: v.id("mortgages"),                         // required
    borrowerId: v.id("borrowers"),                         // required
    paymentNumber: v.number(),                             // required
    type: v.union(                                         // required
        v.literal("regular_interest"),
        v.literal("arrears_cure"),
        v.literal("late_fee"),
        v.literal("principal_repayment")
    ),
    amount: v.number(),                                    // cents, required
    amountSettled: v.number(),                              // cents, required
    dueDate: v.number(),                                   // Unix ms, required
    gracePeriodEnd: v.number(),                             // Unix ms, required
    sourceObligationId: v.optional(v.id("obligations")),   // optional
    feeCode: v.optional(feeCodeValidator),                 // optional
    mortgageFeeId: v.optional(v.id("mortgageFees")),       // optional
    settledAt: v.optional(v.number()),                     // optional
    createdAt: v.number(),                                 // required
}
```

### Cash Ledger Journal Entries Fields (for verifying accrual)

```typescript
{
    entryType: "OBLIGATION_ACCRUED",  // what to look for
    obligationId: Id<"obligations">,  // should match corrective
    amount: v.int64(),                // should match obligation amount in cents
    debitAccountId: ...,              // BORROWER_RECEIVABLE
    creditAccountId: ...,             // CONTROL:ACCRUAL
}
```

## Functions Under Test

### createCorrectiveObligation (from chunk-01)

File: `convex/payments/obligations/createCorrectiveObligation.ts`

```typescript
export const createCorrectiveObligation = internalMutation({
  args: {
    originalObligationId: v.id("obligations"),
    reversedAmount: v.number(),
    reason: v.string(),
    postingGroupId: v.string(),
    source: v.object({ ... }),
  },
  handler: async (ctx, args) => {
    // Returns { obligationId: Id<"obligations">, created: boolean }
  },
});
```

### getCorrectiveObligations (from chunk-02)

File: `convex/payments/obligations/queries.ts`

```typescript
export const getCorrectiveObligations = internalQuery({
  args: {
    sourceObligationId: v.id("obligations"),
  },
  handler: async (ctx, args) => {
    // Returns obligations where sourceObligationId matches, excluding late_fee
  },
});
```

## Integration Points

### Cash Ledger Verification

To verify cash ledger entries, query `cash_ledger_journal_entries`:
```typescript
const entries = await ctx.db
    .query("cash_ledger_journal_entries")
    .withIndex("by_obligation", (q) =>
        q.eq("obligationId", correctiveObligationId).eq("entryType", "OBLIGATION_ACCRUED")
    )
    .collect();
```

### Cash Ledger Accounts

Cash ledger accounts are needed for the accrual. The `postObligationAccrued` function auto-creates them via `getOrCreateCashAccount`. Verify:
- BORROWER_RECEIVABLE account exists for the corrective obligation
- CONTROL (subaccount: ACCRUAL) account exists

## Constraints & Rules

- **Use convex-test**: All tests use `convexTest(schema)` pattern
- **Seed directly**: Insert test data directly via `ctx.db.insert()` — don't use mutation functions for test setup
- **Test the internalMutation directly**: Import and call `createCorrectiveObligation` handler directly in tests
- **Check cash_ledger_accounts and cash_ledger_journal_entries tables** for accrual verification
- **Verify the new `by_source_obligation` index works**: Query using it in the getCorrectiveObligations test
- **Amount validation**: All amounts are in cents (safe integers)

## File Structure

- New: `convex/payments/obligations/__tests__/correctiveObligation.test.ts`
- Reference: `convex/payments/cashLedger/__tests__/reversalIntegration.test.ts` for test patterns
- Reference: `convex/payments/cashLedger/__tests__/cashReceipt.test.ts` for accrual test patterns
