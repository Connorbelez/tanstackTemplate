# Chunk 01 Context: Query Fixes

## Bug Description

The current `getBalanceAt` and `getPositionsAt` implementations replay ALL journal entries, including audit-only entries (`SHARES_RESERVED`, `SHARES_VOIDED`). This causes double-counting in the Reserve → Commit scenario:

1. `SHARES_RESERVED` (audit-only): journal entry debit buyer +X, credit seller -X — cumulatives NOT updated
2. `SHARES_COMMITTED` (normal): journal entry debit buyer +X, credit seller -X — cumulatives ARE updated

Current replay result: buyer +2X, seller -2X. **Correct result: buyer +X, seller -X.**

**Fix:** Filter out entries where `entryType` is in `AUDIT_ONLY_ENTRY_TYPES` during replay.

## File: `convex/ledger/constants.ts` (relevant excerpt)

```typescript
/**
 * AUDIT_ONLY entry types create journal entries but do NOT update
 * cumulativeDebits/cumulativeCredits on the accounts.
 * SHARES_COMMITTED updates cumulatives normally and is intentionally excluded.
 */
export const AUDIT_ONLY_ENTRY_TYPES: ReadonlySet<string> = new Set([
	"SHARES_RESERVED",
	"SHARES_VOIDED",
]);
```

## File: `convex/ledger/queries.ts` — Current `getBalanceAt` (lines 155-190)

```typescript
export const getBalanceAt = ledgerQuery
	.input({
		accountId: v.id("ledger_accounts"),
		asOf: v.number(),
	})
	.handler(async (ctx, args) => {
		const account = await ctx.db.get(args.accountId);
		if (!account) {
			throw new Error(`Account ${args.accountId} not found`);
		}

		const debits = await ctx.db
			.query("ledger_journal_entries")
			.withIndex("by_debit_account", (q) =>
				q.eq("debitAccountId", args.accountId).lte("timestamp", args.asOf)
			)
			.collect();

		const credits = await ctx.db
			.query("ledger_journal_entries")
			.withIndex("by_credit_account", (q) =>
				q.eq("creditAccountId", args.accountId).lte("timestamp", args.asOf)
			)
			.collect();

		let balance = 0n;
		for (const e of debits) {
			balance += safeBigIntAmount(e.amount, e._id);
		}
		for (const e of credits) {
			balance -= safeBigIntAmount(e.amount, e._id);
		}
		return balance;
	})
	.public();
```

## File: `convex/ledger/queries.ts` — Current `getPositionsAt` (lines 192-246)

```typescript
export const getPositionsAt = ledgerQuery
	.input({
		mortgageId: v.string(),
		asOf: v.number(),
	})
	.handler(async (ctx, args) => {
		const entries = await ctx.db
			.query("ledger_journal_entries")
			.withIndex("by_mortgage_and_time", (q) =>
				q.eq("mortgageId", args.mortgageId).lte("timestamp", args.asOf)
			)
			.collect();

		// Collect unique account IDs and batch-fetch them upfront
		const accountIds = new Set<string>();
		for (const entry of entries) {
			accountIds.add(entry.debitAccountId);
			accountIds.add(entry.creditAccountId);
		}
		const accountInfo = new Map<
			string,
			{ lenderId: string | undefined; type: string }
		>();
		const accountFetches = [...accountIds].map(async (id) => {
			const acc = await ctx.db.get(id as Id<"ledger_accounts">);
			if (acc) {
				accountInfo.set(id, {
					lenderId: getAccountLenderId(acc),
					type: acc.type,
				});
			}
		});
		await Promise.all(accountFetches);

		// Replay all entries tracking per-account balances
		const balances = new Map<string, bigint>();
		for (const entry of entries) {
			const amt = safeBigIntAmount(entry.amount, entry._id);
			const prevDebit = balances.get(entry.debitAccountId) ?? 0n;
			balances.set(entry.debitAccountId, prevDebit + amt);

			const prevCredit = balances.get(entry.creditAccountId) ?? 0n;
			balances.set(entry.creditAccountId, prevCredit - amt);
		}

		const results: Array<{ lenderId: string; balance: bigint }> = [];
		for (const [accountId, balance] of balances) {
			const info = accountInfo.get(accountId);
			if (info?.type === "POSITION" && info.lenderId && balance > 0n) {
				results.push({ lenderId: info.lenderId, balance });
			}
		}
		return results;
	})
	.public();
```

## Utilities already available in queries.ts

```typescript
function safeBigIntAmount(amount: number, entryId: string): bigint { ... }
function compareSequenceNumbers(left: { sequenceNumber: bigint }, right: { sequenceNumber: bigint }) { ... }
```

```typescript
// From accountOwnership.ts
import { getAccountLenderId } from "./accountOwnership";
```

## Changes Required

### getBalanceAt
Add `AUDIT_ONLY_ENTRY_TYPES` import and filter in both replay loops:
```typescript
for (const e of debits) {
    if (AUDIT_ONLY_ENTRY_TYPES.has(e.entryType)) continue;
    balance += safeBigIntAmount(e.amount, e._id);
}
for (const e of credits) {
    if (AUDIT_ONLY_ENTRY_TYPES.has(e.entryType)) continue;
    balance -= safeBigIntAmount(e.amount, e._id);
}
```

### getPositionsAt
1. Add `entries.sort(compareSequenceNumbers)` after collect
2. Filter audit-only entries from accountIds collection:
```typescript
for (const entry of entries) {
    if (AUDIT_ONLY_ENTRY_TYPES.has(entry.entryType)) continue;
    accountIds.add(entry.debitAccountId);
    accountIds.add(entry.creditAccountId);
}
```
3. Filter audit-only entries from replay loop:
```typescript
for (const entry of entries) {
    if (AUDIT_ONLY_ENTRY_TYPES.has(entry.entryType)) continue;
    // ... rest of replay
}
```
