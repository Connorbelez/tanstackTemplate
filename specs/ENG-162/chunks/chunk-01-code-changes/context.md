# Chunk 01 Context: Code Changes

## Goal
Enrich the `assertNonNegativeBalance` error message per REQ-251 and add `postingGroupId` support to `postLenderPayout` for batch payouts.

## File: `convex/payments/cashLedger/accounts.ts`

### Current `assertNonNegativeBalance` (lines 174-189):
```typescript
export function assertNonNegativeBalance(
	account: Pick<
		Doc<"cash_ledger_accounts">,
		"family" | "cumulativeDebits" | "cumulativeCredits"
	>,
	side: "debit" | "credit",
	amount: bigint,
	label: string
) {
	const projected = projectCashAccountBalance(account, side, amount);
	if (projected < 0n) {
		throw new ConvexError(
			`${label}: posting would make ${account.family} negative`
		);
	}
}
```

### Required change:
Add `currentBalance` computation using `getCashAccountBalance(account)` and include attempted amount, current balance, and projected balance in the error message:
```typescript
export function assertNonNegativeBalance(
	account: Pick<
		Doc<"cash_ledger_accounts">,
		"family" | "cumulativeDebits" | "cumulativeCredits"
	>,
	side: "debit" | "credit",
	amount: bigint,
	label: string
) {
	const currentBalance = getCashAccountBalance(account);
	const projected = projectCashAccountBalance(account, side, amount);
	if (projected < 0n) {
		throw new ConvexError(
			`${label}: posting would make ${account.family} negative ` +
			`(attempted: ${amount} cents, current balance: ${currentBalance} cents, ` +
			`projected: ${projected} cents)`
		);
	}
}
```

### Important notes:
- `getCashAccountBalance` is already exported from the same file — just call it
- The enriched message still contains the word "negative" so existing tests using `/negative/i` regex will still match
- This function is shared across ALL non-exempt entry types, not just payout — the enriched message benefits all callers

## File: `convex/payments/cashLedger/mutations.ts`

### Current `postLenderPayout` args (lines 7-16):
```typescript
export const postLenderPayout = internalMutation({
	args: {
		mortgageId: v.id("mortgages"),
		lenderId: v.id("lenders"),
		amount: v.number(),
		effectiveDate: v.string(),
		idempotencyKey: v.string(),
		source: sourceValidator,
		reason: v.optional(v.string()),
	},
```

### Required change:
Add `postingGroupId: v.optional(v.string())` to args and pass it through to `postCashEntryInternal`:
```typescript
args: {
	mortgageId: v.id("mortgages"),
	lenderId: v.id("lenders"),
	amount: v.number(),
	effectiveDate: v.string(),
	idempotencyKey: v.string(),
	source: sourceValidator,
	reason: v.optional(v.string()),
	postingGroupId: v.optional(v.string()),  // NEW: for batch payouts
},
```

And in the handler, add to the `postCashEntryInternal` call:
```typescript
return postCashEntryInternal(ctx, {
	entryType: "LENDER_PAYOUT_SENT",
	effectiveDate: args.effectiveDate,
	amount: args.amount,
	debitAccountId: lenderPayableAccount._id,
	creditAccountId: trustCashAccount._id,
	idempotencyKey: args.idempotencyKey,
	mortgageId: args.mortgageId,
	lenderId: args.lenderId,
	source: args.source,
	reason: args.reason,
	postingGroupId: args.postingGroupId,  // NEW
});
```

### Important notes:
- `PostCashEntryInput` already has `postingGroupId?: string` (line 37 of postEntry.ts)
- This is a non-breaking change — existing callers don't pass it (optional param)
- The `postCashEntryInternal` function already persists `postingGroupId` to the journal entry
