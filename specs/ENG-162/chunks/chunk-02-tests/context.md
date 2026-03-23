# Chunk 02 Context: Acceptance Criteria Tests

## Goal
Create a dedicated test file `convex/payments/cashLedger/__tests__/lenderPayoutPosting.test.ts` that covers all 5 acceptance criteria from the Linear issue plus DR-3 (batch payout) and DR-4 (unknown lender).

## Test Cases

### AC-1: "LENDER_PAYOUT_SENT reduces LENDER_PAYABLE and TRUST_CASH"
- Create LENDER_PAYABLE account with 100,000 balance (credit-normal: set initialCreditBalance=100_000n)
- Create TRUST_CASH account with 100,000 balance (debit-normal: set initialDebitBalance=100_000n)
- Post payout of 60,000
- Assert: LENDER_PAYABLE balance = 40,000 (via getCashAccountBalance)
- Assert: TRUST_CASH balance = 40,000 (via getCashAccountBalance)
- Assert: Journal entry has entryType "LENDER_PAYOUT_SENT"

### AC-2: "Payout exceeding payable is rejected with explicit error"
- Create LENDER_PAYABLE with 50,000 balance, TRUST_CASH with 100,000 balance
- Attempt payout of 75,000
- Assert: Throws ConvexError matching `/negative/`
- Assert: Error message contains "attempted:" and "current balance:" (DR-1: enriched error)
- Assert: No journal entry created

### AC-3: "Partial payouts leave correct remaining balance"
- Create LENDER_PAYABLE with 100,000 balance, TRUST_CASH with 100,000 balance
- Post first payout of 30,000, then second payout of 25,000
- Assert: LENDER_PAYABLE balance = 45,000
- Assert: Two journal entries exist

### AC-4: "LENDER_PAYABLE balance never goes negative"
- Create LENDER_PAYABLE with 10,000 balance, TRUST_CASH with 20,000 balance
- Exact payout of 10,000 — should succeed (balance = 0)
- Attempt another payout of 1 — should be rejected

### AC-5: "Idempotent on payoutId + lenderId"
- Post payout with idempotency key
- Post same payout again with same key
- Assert: Only one journal entry exists
- Assert: Second call returns the existing entry

### DR-3: Batch payout with shared postingGroupId
- Create payables for two lenders
- Post payouts with shared postingGroupId
- Assert: Both journal entries have the same postingGroupId

### DR-4: Unknown lender rejection
- Attempt payout for a lender with no LENDER_PAYABLE account
- Assert: Throws ConvexError with "cash account not found" message

## Test Patterns (from existing tests)

### Harness setup:
```typescript
const modules = import.meta.glob("/convex/**/*.ts");

// Type for postLenderPayout handler access
interface PostLenderPayoutHandler {
	_handler: (
		ctx: MutationCtx,
		args: {
			mortgageId: Id<"mortgages">;
			lenderId: Id<"lenders">;
			amount: number;
			effectiveDate: string;
			idempotencyKey: string;
			source: typeof SYSTEM_SOURCE;
			reason?: string;
			postingGroupId?: string;  // NEW field
		}
	) => Promise<unknown>;
}
```

### Account creation pattern:
```typescript
// LENDER_PAYABLE is credit-normal: balance = credits - debits
// To set a 100,000 balance, use initialCreditBalance: 100_000n
const payableAccount = await createTestAccount(t, {
	family: "LENDER_PAYABLE",
	mortgageId: seeded.mortgageId,
	lenderId: seeded.lenderAId,
	initialCreditBalance: 100_000n,
});

// TRUST_CASH is debit-normal: balance = debits - credits
// To set a 100,000 balance, use initialDebitBalance: 100_000n
const trustCashAccount = await createTestAccount(t, {
	family: "TRUST_CASH",
	mortgageId: seeded.mortgageId,
	initialDebitBalance: 100_000n,
});
```

### Posting via mutation handler:
```typescript
const postLenderPayoutMutation =
	postLenderPayout as unknown as PostLenderPayoutHandler;

await t.run(async (ctx) => {
	await postLenderPayoutMutation._handler(ctx, {
		mortgageId: seeded.mortgageId,
		lenderId: seeded.lenderAId,
		amount: 60_000,
		effectiveDate: "2026-03-15",
		idempotencyKey: "cash-ledger:lender-payout-sent:payout-1:lender-a",
		source: SYSTEM_SOURCE,
	});
});
```

### Balance assertion:
```typescript
import { getCashAccountBalance } from "../accounts";

const updatedAccount = await ctx.db.get(payableAccount._id);
expect(getCashAccountBalance(updatedAccount!)).toBe(40_000n);
```

### Error assertion pattern:
```typescript
await expect(
	postLenderPayoutMutation._handler(ctx, { ...overBudgetArgs })
).rejects.toThrow(/negative/i);
```

### Journal entry query:
```typescript
const entries = await ctx.db
	.query("cash_ledger_journal_entries")
	.withIndex("by_idempotency", (q) =>
		q.eq("idempotencyKey", "the-key")
	)
	.collect();
expect(entries).toHaveLength(1);
```

## Imports needed:
```typescript
import { describe, expect, it } from "vitest";
import type { Id } from "../../../_generated/dataModel";
import type { MutationCtx } from "../../../_generated/server";
import { getCashAccountBalance } from "../accounts";
import { postLenderPayout } from "../mutations";
import {
	createHarness,
	createTestAccount,
	SYSTEM_SOURCE,
	seedMinimalEntities,
} from "./testUtils";
```

## Quality gates after tests:
```bash
bun check
bun typecheck
bunx convex codegen
bun run test convex/payments/cashLedger/__tests__/lenderPayoutPosting.test.ts
bun run test convex/payments/cashLedger/__tests__/
```
