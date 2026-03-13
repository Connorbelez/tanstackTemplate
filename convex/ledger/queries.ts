import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { query } from "../_generated/server";
import { computeBalance } from "./internal";

export const getBalance = query({
	args: { accountId: v.id("ledger_accounts") },
	handler: async (ctx, args) => {
		const account = await ctx.db.get(args.accountId);
		if (!account) {
			throw new Error(`Account ${args.accountId} not found`);
		}
		return computeBalance(account);
	},
});

export const getPositions = query({
	args: { mortgageId: v.string() },
	handler: async (ctx, args) => {
		const accounts = await ctx.db
			.query("ledger_accounts")
			.withIndex("by_mortgage", (q) => q.eq("mortgageId", args.mortgageId))
			.collect();

		const positionAccounts = accounts.filter(
			(a) => a.type === "POSITION" && computeBalance(a) > 0n
		);

		const accountMissingInvestor = positionAccounts.find(
			(a) => a.investorId == null
		);
		if (accountMissingInvestor) {
			throw new Error(
				`POSITION account ${accountMissingInvestor._id} is missing investorId`
			);
		}

		return positionAccounts.map((a) => ({
			investorId: a.investorId as string,
			accountId: a._id,
			balance: computeBalance(a),
		}));
	},
});

export const getInvestorPositions = query({
	args: { investorId: v.string() },
	handler: async (ctx, args) => {
		const accounts = await ctx.db
			.query("ledger_accounts")
			.withIndex("by_investor", (q) => q.eq("investorId", args.investorId))
			.collect();

		return accounts
			.filter((a) => a.type === "POSITION" && computeBalance(a) > 0n)
			.map((a) => ({
				mortgageId: a.mortgageId ?? "",
				accountId: a._id,
				balance: computeBalance(a),
			}));
	},
});

export const getBalanceAt = query({
	args: {
		accountId: v.id("ledger_accounts"),
		asOf: v.float64(),
	},
	handler: async (ctx, args) => {
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
			balance += e.amount;
		}
		for (const e of credits) {
			balance -= e.amount;
		}
		return balance;
	},
});

export const getPositionsAt = query({
	args: {
		mortgageId: v.string(),
		asOf: v.float64(),
	},
	handler: async (ctx, args) => {
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
			{ investorId: string | undefined; type: string }
		>();
		const accountFetches = [...accountIds].map(async (id) => {
			const acc = await ctx.db.get(id as Id<"ledger_accounts">);
			if (acc) {
				accountInfo.set(id, { investorId: acc.investorId, type: acc.type });
			}
		});
		await Promise.all(accountFetches);

		// Replay all entries tracking per-account balances
		const balances = new Map<string, bigint>();
		for (const entry of entries) {
			const prevDebit = balances.get(entry.debitAccountId) ?? 0n;
			balances.set(entry.debitAccountId, prevDebit + entry.amount);

			const prevCredit = balances.get(entry.creditAccountId) ?? 0n;
			balances.set(entry.creditAccountId, prevCredit - entry.amount);
		}

		const results: Array<{ investorId: string; balance: bigint }> = [];
		for (const [accountId, balance] of balances) {
			const info = accountInfo.get(accountId);
			if (info?.type === "POSITION" && info.investorId && balance > 0n) {
				results.push({ investorId: info.investorId, balance });
			}
		}
		return results;
	},
});

export const getAccountHistory = query({
	args: {
		accountId: v.id("ledger_accounts"),
		from: v.optional(v.float64()),
		to: v.optional(v.float64()),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
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
		unique.sort((a, b) =>
			a.sequenceNumber < b.sequenceNumber
				? -1
				: a.sequenceNumber > b.sequenceNumber
					? 1
					: 0
		);

		if (args.limit) {
			return unique.slice(0, args.limit);
		}
		return unique;
	},
});

export const getMortgageHistory = query({
	args: {
		mortgageId: v.string(),
		from: v.optional(v.float64()),
		to: v.optional(v.float64()),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
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

		entries.sort((a, b) =>
			a.sequenceNumber < b.sequenceNumber
				? -1
				: a.sequenceNumber > b.sequenceNumber
					? 1
					: 0
		);
		if (args.limit) {
			return entries.slice(0, args.limit);
		}
		return entries;
	},
});
