# Chunk 02 Context: Tests

## Testing Patterns

### Test Framework
- `convex-test` for Convex function testing
- `vitest` as test runner
- Module glob: `const modules = import.meta.glob("/convex/**/*.ts");`

### Existing Test Utilities (`testUtils.ts`)
```typescript
import { convexTest } from "convex-test";
import schema from "../../../schema";

const modules = import.meta.glob("/convex/**/*.ts");

export const SYSTEM_SOURCE = {
  channel: "scheduler" as const,
  actorId: "system",
  actorType: "system" as const,
};

export function createHarness() {
  return convexTest(schema, modules);
}

export type TestHarness = ReturnType<typeof convexTest>;

// seedMinimalEntities — creates broker, borrower, 2 lenders, property, mortgage, ownership ledger accounts
// createTestAccount — creates cash_ledger_account with optional initial balances
// postTestEntry — convenience wrapper around postCashEntryInternal
```

### How to Call Convex Internal Mutations in Tests
The existing integration tests cast internal mutations to access their handler:
```typescript
interface ApplyPaymentHandler {
  _handler: (ctx: MutationCtx, args: { ... }) => Promise<void>;
}
const applyPaymentMutation = applyPayment as unknown as ApplyPaymentHandler;

// Then in test:
await t.run(async (ctx) => {
  await applyPaymentMutation._handler(ctx, { ... });
});
```

### Key Imports for Tests
```typescript
import { describe, expect, it } from "vitest";
import type { Id } from "../../../_generated/dataModel";
import type { MutationCtx } from "../../../_generated/server";
import { getOrCreateCashAccount, findCashAccount } from "../accounts";
import { postCashReceiptForObligation, postOverpaymentToUnappliedCash } from "../integrations";
import { postCashEntryInternal } from "../postEntry";
import { applyPayment } from "../../../engine/effects/obligationPayment";
import { emitPaymentReceived } from "../../../engine/effects/collectionAttempt";
import { createHarness, seedMinimalEntities, SYSTEM_SOURCE } from "./testUtils";
```

### Creating Test Obligations
```typescript
const obligationId = await ctx.db.insert("obligations", {
  mortgageId,
  borrowerId,
  type: "interest",
  amount: 100_000,  // cents
  amountSettled: 0,
  status: "due",
  dueDate: Date.now(),
  gracePeriodDays: 5,
  createdAt: Date.now(),
});
```

### Creating Collection Attempts and Plan Entries
```typescript
const planEntryId = await ctx.db.insert("planEntries", {
  mortgageId,
  obligationIds: [obligationId],
  status: "scheduled",
  scheduledDate: "2026-03-15",
  amount: 100_000,
  method: "manual",
  createdAt: Date.now(),
});

const attemptId = await ctx.db.insert("collectionAttempts", {
  planEntryId,
  amount: 100_000,
  method: "manual",
  status: "confirmed",
  machineContext: {},
  createdAt: Date.now(),
});
```

### Verifying Journal Entries
```typescript
// Query by idempotency key
const entry = await ctx.db
  .query("cash_ledger_journal_entries")
  .withIndex("by_idempotency", q => q.eq("idempotencyKey", expectedKey))
  .first();

expect(entry).toBeTruthy();
expect(entry!.entryType).toBe("CASH_RECEIVED");
expect(entry!.amount).toBe(BigInt(expectedAmount));
expect(entry!.postingGroupId).toBe(expectedGroupId);

// Query by posting group
const groupEntries = await ctx.db
  .query("cash_ledger_journal_entries")
  .withIndex("by_posting_group", q => q.eq("postingGroupId", groupId))
  .collect();
```

### Verifying Account Balances
```typescript
const account = await ctx.db.get(accountId);
expect(account!.cumulativeDebits).toBe(BigInt(expectedDebits));
expect(account!.cumulativeCredits).toBe(BigInt(expectedCredits));
```

## Functions Under Test (After Chunk 01)
1. `postCashReceiptForObligation` — now accepts postingGroupId, returns null if no receivable
2. `postOverpaymentToUnappliedCash` — NEW, posts excess to UNAPPLIED_CASH
3. `applyPayment` — now passes postingGroupId through
4. `emitPaymentReceived` — now generates postingGroupId, routes overpayment

## Acceptance Criteria (from Linear Issue)
- CASH_RECEIVED entry posted for every confirmed collection
- BORROWER_RECEIVABLE reduced by confirmed amount
- Partial payments reduce balance proportionally
- Overpayments route excess to UNAPPLIED_CASH
- Idempotent on attemptId

## Constraints
- Tests use `convex-test` for unit tests, Vitest for test runner
- Follow existing patterns in `testUtils.ts` for harness creation and seeding
- All amounts in cents (safe integers)
- Use SYSTEM_SOURCE for test command sources
