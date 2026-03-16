import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { ledgerQuery } from "../fluent";
import { getAccountLenderId } from "./accountOwnership";
import { computeBalance } from "./internal";

function compareSequenceNumbers(
	left: { sequenceNumber: bigint },
	right: { sequenceNumber: bigint }
) {
	if (left.sequenceNumber < right.sequenceNumber) {
		return -1;
	}
	if (left.sequenceNumber > right.sequenceNumber) {
		return 1;
	}
	return 0;
}

export const getBalance = ledgerQuery
	.input({ accountId: v.id("ledger_accounts") })
	.handler(async (ctx, args) => {
		const account = await ctx.db.get(args.accountId);
		if (!account) {
			throw new Error(`Account ${args.accountId} not found`);
		}
		return computeBalance(account);
	})
	.public();

export const getPositions = ledgerQuery
	.input({ mortgageId: v.string() })
	.handler(async (ctx, args) => {
		const accounts = await ctx.db
			.query("ledger_accounts")
			.withIndex("by_mortgage", (q) => q.eq("mortgageId", args.mortgageId))
			.collect();

		const positionAccounts = accounts.filter(
			(a) => a.type === "POSITION" && computeBalance(a) > 0n
		);

		const accountMissingLender = positionAccounts.find(
			(a) => getAccountLenderId(a) == null
		);
		if (accountMissingLender) {
			throw new Error(
				`POSITION account ${accountMissingLender._id} is missing lenderId`
			);
		}

		return positionAccounts.map((a) => ({
			lenderId: getAccountLenderId(a) as string,
			accountId: a._id,
			balance: computeBalance(a),
		}));
	})
	.public();

export const getLenderPositions = ledgerQuery
	.input({ lenderId: v.string() })
	.handler(async (ctx, args) => {
		const indexedAccounts = await ctx.db
			.query("ledger_accounts")
			.withIndex("by_lender", (q) => q.eq("lenderId", args.lenderId))
			.collect();
		const legacyAccounts = (
			await ctx.db.query("ledger_accounts").collect()
		).filter(
			(account) =>
				account.type === "POSITION" &&
				getAccountLenderId(account) === args.lenderId
		);
		const accounts = Array.from(
			new Map(
				[...indexedAccounts, ...legacyAccounts].map((account) => [
					account._id,
					account,
				])
			).values()
		);

		return accounts
			.filter((a) => a.type === "POSITION" && computeBalance(a) > 0n)
			.map((a) => ({
				mortgageId: a.mortgageId ?? "",
				accountId: a._id,
				balance: computeBalance(a),
			}));
	})
	.public();

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

		// Replay journal entries up to asOf timestamp
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
			balance += BigInt(e.amount);
		}
		for (const e of credits) {
			balance -= BigInt(e.amount);
		}
		return balance;
	})
	.public();

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
			const amt = BigInt(entry.amount);
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

export const getAccountHistory = ledgerQuery
	.input({
		accountId: v.id("ledger_accounts"),
		from: v.optional(v.number()),
		to: v.optional(v.number()),
		limit: v.optional(v.number()),
	})
	.handler(async (ctx, args) => {
		const lo = args.from ?? 0;
		const hi = args.to ?? Number.MAX_SAFE_INTEGER;

		const debits = await ctx.db
			.query("ledger_journal_entries")
			.withIndex("by_debit_account", (q) =>
				q
					.eq("debitAccountId", args.accountId)
					.gte("timestamp", lo)
					.lte("timestamp", hi)
			)
			.collect();

		const credits = await ctx.db
			.query("ledger_journal_entries")
			.withIndex("by_credit_account", (q) =>
				q
					.eq("creditAccountId", args.accountId)
					.gte("timestamp", lo)
					.lte("timestamp", hi)
			)
			.collect();

		// Merge, deduplicate, sort by sequence number
		const seen = new Set<string>();
		const unique = [...debits, ...credits].filter((e) => {
			if (seen.has(e._id)) {
				return false;
			}
			seen.add(e._id);
			return true;
		});
		unique.sort(compareSequenceNumbers);

		if (args.limit) {
			return unique.slice(0, args.limit);
		}
		return unique;
	})
	.public();

export const getMortgageHistory = ledgerQuery
	.input({
		mortgageId: v.string(),
		from: v.optional(v.number()),
		to: v.optional(v.number()),
		limit: v.optional(v.number()),
	})
	.handler(async (ctx, args) => {
		const lo = args.from ?? 0;
		const hi = args.to ?? Number.MAX_SAFE_INTEGER;

		const entries = await ctx.db
			.query("ledger_journal_entries")
			.withIndex("by_mortgage_and_time", (q) =>
				q
					.eq("mortgageId", args.mortgageId)
					.gte("timestamp", lo)
					.lte("timestamp", hi)
			)
			.collect();

		entries.sort(compareSequenceNumbers);
		if (args.limit) {
			return entries.slice(0, args.limit);
		}
		return entries;
	})
	.public();
