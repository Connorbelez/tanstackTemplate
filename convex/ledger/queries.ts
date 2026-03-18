import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { internalQuery } from "../_generated/server";
import { ledgerQuery } from "../fluent";
import { getAccountLenderId } from "./accountOwnership";
import { getPostedBalance } from "./accounts";
import { AUDIT_ONLY_ENTRY_TYPES, TOTAL_SUPPLY } from "./constants";

/**
 * Safely convert a journal entry amount to BigInt.
 * Throws a descriptive error if the amount is not a safe integer,
 * preventing opaque BigInt conversion failures on bad data.
 */
function safeBigIntAmount(amount: number, entryId: string): bigint {
	if (!Number.isSafeInteger(amount)) {
		throw new Error(
			`Journal entry ${entryId} has non-integer amount (${amount}). ` +
				"Ledger amounts must be whole numbers (safe integers)."
		);
	}
	return BigInt(amount);
}

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
		return getPostedBalance(account);
	})
	.public();

export const getPositions = ledgerQuery
	.input({ mortgageId: v.string() })
	.handler(async (ctx, args) => {
		const accounts = await ctx.db
			.query("ledger_accounts")
			.withIndex("by_type_and_mortgage", (q) =>
				q.eq("type", "POSITION").eq("mortgageId", args.mortgageId)
			)
			.collect();

		const nonZero = accounts.filter((a) => getPostedBalance(a) > 0n);

		const accountMissingLender = nonZero.find(
			(a) => getAccountLenderId(a) == null
		);
		if (accountMissingLender) {
			throw new Error(
				`POSITION account ${accountMissingLender._id} is missing lenderId`
			);
		}

		return nonZero.map((a) => ({
			lenderId: getAccountLenderId(a) as string,
			accountId: a._id,
			balance: getPostedBalance(a),
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
			.filter((a) => a.type === "POSITION" && getPostedBalance(a) > 0n)
			.map((a) => ({
				mortgageId: a.mortgageId ?? "",
				accountId: a._id,
				balance: getPostedBalance(a),
			}));
	})
	.public();

export const validateSupplyInvariant = ledgerQuery
	.input({ mortgageId: v.string() })
	.handler(async (ctx, args) => {
		const treasury = await ctx.db
			.query("ledger_accounts")
			.withIndex("by_type_and_mortgage", (q) =>
				q.eq("type", "TREASURY").eq("mortgageId", args.mortgageId)
			)
			.unique();

		const positions = await ctx.db
			.query("ledger_accounts")
			.withIndex("by_type_and_mortgage", (q) =>
				q.eq("type", "POSITION").eq("mortgageId", args.mortgageId)
			)
			.collect();

		const treasuryBalance = treasury ? getPostedBalance(treasury) : 0n;

		const positionBalances: Record<string, bigint> = {};
		let positionTotal = 0n;
		for (const p of positions) {
			const lenderId = getAccountLenderId(p);
			if (!lenderId) {
				throw new Error(`POSITION account ${p._id} is missing lenderId`);
			}
			const balance = getPostedBalance(p);
			if (balance > 0n) {
				positionBalances[lenderId] =
					(positionBalances[lenderId] ?? 0n) + balance;
			}
			positionTotal += balance;
		}

		const total = treasuryBalance + positionTotal;
		const isUnminted = treasury == null && positions.length === 0;
		const isBurned =
			treasury != null && treasuryBalance === 0n && positionTotal === 0n;

		return {
			valid: total === TOTAL_SUPPLY || (isUnminted && total === 0n) || isBurned,
			treasury: treasuryBalance,
			positions: positionBalances,
			total,
		};
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
			if (AUDIT_ONLY_ENTRY_TYPES.has(e.entryType)) {
				continue;
			}
			balance += safeBigIntAmount(e.amount, e._id);
		}
		for (const e of credits) {
			if (AUDIT_ONLY_ENTRY_TYPES.has(e.entryType)) {
				continue;
			}
			balance -= safeBigIntAmount(e.amount, e._id);
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

		// Sort entries by sequence number for same-millisecond determinism
		entries.sort(compareSequenceNumbers);

		// Collect unique account IDs and batch-fetch them upfront
		// Skip audit-only entries — no need to fetch accounts only referenced by skipped entries
		const accountIds = new Set<string>();
		for (const entry of entries) {
			if (AUDIT_ONLY_ENTRY_TYPES.has(entry.entryType)) {
				continue;
			}
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

		// Replay all entries tracking per-account balances (skip audit-only)
		const balances = new Map<string, bigint>();
		for (const entry of entries) {
			if (AUDIT_ONLY_ENTRY_TYPES.has(entry.entryType)) {
				continue;
			}
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
		const effectiveLimit = args.limit ?? 100;

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

		return unique.slice(0, effectiveLimit);
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
		const effectiveLimit = args.limit ?? 100;

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
		return entries.slice(0, effectiveLimit);
	})
	.public();

/**
 * Internal query: Get pending reservation by dealId.
 * Used by dealClosing effects to check for existing reservations.
 */
export const getReservationByDealId = internalQuery({
	args: { dealId: v.string() },
	handler: async (ctx, args) => {
		return await ctx.db
			.query("ledger_reservations")
			.withIndex("by_deal", (q) => q.eq("dealId", args.dealId))
			.filter((q) => q.eq(q.field("status"), "pending"))
			.first();
	},
});

/**
 * Internal query: Get a POSITION account by mortgageId and lenderId.
 * Used by dealClosing effects to find seller/buyer position accounts.
 */
export const getAccountByMortgageAndLender = internalQuery({
	args: {
		mortgageId: v.string(),
		lenderId: v.string(),
	},
	handler: async (ctx, args) => {
		return await ctx.db
			.query("ledger_accounts")
			.withIndex("by_mortgage_and_lender", (q) =>
				q.eq("mortgageId", args.mortgageId).eq("lenderId", args.lenderId)
			)
			.filter((q) => q.eq(q.field("type"), "POSITION"))
			.first();
	},
});

/**
 * Internal query: Get a reservation by its ID.
 * Used by dealClosing effects to check reservation status before voiding.
 */
export const getReservationById = internalQuery({
	args: { reservationId: v.id("ledger_reservations") },
	handler: async (ctx, args) => {
		return await ctx.db.get(args.reservationId);
	},
});
