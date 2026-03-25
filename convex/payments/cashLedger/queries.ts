import { v } from "convex/values";
import type { Id } from "../../_generated/dataModel";
import { internalQuery } from "../../_generated/server";
import { cashLedgerQuery } from "../../fluent";
import {
	findCashAccount,
	getCashAccountBalance,
	getControlAccountsBySubaccount,
	isCreditNormalFamily,
	safeBigintToNumber,
} from "./accounts";
import {
	findSettledObligationsWithNonZeroBalance,
	getControlBalanceBySubaccount,
	getControlBalancesByPostingGroup,
	getJournalSettledAmountForObligation,
	reconcileObligationSettlementProjectionInternal,
} from "./reconciliation";
import { replayJournalIntegrity } from "./replayIntegrity";

/** Matches YYYY-MM-DD format strictly. */
const BUSINESS_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function compareSequence(
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

export const getAccountBalance = cashLedgerQuery
	.input({ accountId: v.id("cash_ledger_accounts") })
	.handler(async (ctx, args) => {
		const account = await ctx.db.get(args.accountId);
		if (!account) {
			throw new Error(`Cash ledger account not found: ${args.accountId}`);
		}
		return getCashAccountBalance(account);
	})
	.public();

export const getObligationBalance = cashLedgerQuery
	.input({ obligationId: v.id("obligations") })
	.handler(async (ctx, args) => {
		const account = await findCashAccount(ctx.db, {
			family: "BORROWER_RECEIVABLE",
			obligationId: args.obligationId,
		});
		const reconciliation =
			await reconcileObligationSettlementProjectionInternal(
				ctx,
				args.obligationId
			);

		return {
			outstandingBalance: account ? getCashAccountBalance(account) : 0n,
			...reconciliation,
		};
	})
	.public();

export const getMortgageCashState = cashLedgerQuery
	.input({ mortgageId: v.id("mortgages") })
	.handler(async (ctx, args) => {
		const accounts = await ctx.db
			.query("cash_ledger_accounts")
			.withIndex("by_mortgage", (q) => q.eq("mortgageId", args.mortgageId))
			.collect();

		const balancesByFamily: Record<string, bigint> = {};
		for (const account of accounts) {
			balancesByFamily[account.family] =
				(balancesByFamily[account.family] ?? 0n) +
				getCashAccountBalance(account);
		}

		return {
			mortgageId: args.mortgageId,
			balancesByFamily,
		};
	})
	.public();

export const getLenderPayableBalance = cashLedgerQuery
	.input({ lenderId: v.id("lenders") })
	.handler(async (ctx, args) => {
		const accounts = await ctx.db
			.query("cash_ledger_accounts")
			.withIndex("by_lender", (q) => q.eq("lenderId", args.lenderId))
			.collect();

		return accounts
			.filter((account) => account.family === "LENDER_PAYABLE")
			.reduce((sum, account) => sum + getCashAccountBalance(account), 0n);
	})
	.public();

export const getUnappliedCash = cashLedgerQuery
	.handler(async (ctx) => {
		const accounts = await ctx.db
			.query("cash_ledger_accounts")
			.withIndex("by_family", (q) => q.eq("family", "UNAPPLIED_CASH"))
			.collect();

		return accounts
			.map((account) => ({
				accountId: account._id,
				mortgageId: account.mortgageId,
				balance: getCashAccountBalance(account),
			}))
			.filter((entry) => entry.balance > 0n);
	})
	.public();

export const getSuspenseItems = cashLedgerQuery
	.handler(async (ctx) => {
		const accounts = await ctx.db
			.query("cash_ledger_accounts")
			.withIndex("by_family", (q) => q.eq("family", "SUSPENSE"))
			.collect();

		return accounts
			.map((account) => ({
				accountId: account._id,
				mortgageId: account.mortgageId,
				obligationId: account.obligationId,
				balance: getCashAccountBalance(account),
				metadata: account.metadata,
				createdAt: account._creationTime,
			}))
			.filter((entry) => entry.balance > 0n);
	})
	.public();

export const getAccountBalanceAt = cashLedgerQuery
	.input({
		accountId: v.id("cash_ledger_accounts"),
		asOf: v.number(),
	})
	.handler(async (ctx, args) => {
		const [debits, credits] = await Promise.all([
			ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_debit_account_and_timestamp", (q) =>
					q.eq("debitAccountId", args.accountId).lte("timestamp", args.asOf)
				)
				.collect(),
			ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_credit_account_and_timestamp", (q) =>
					q.eq("creditAccountId", args.accountId).lte("timestamp", args.asOf)
				)
				.collect(),
		]);

		const account = await ctx.db.get(args.accountId);
		if (!account) {
			throw new Error(`Cash ledger account not found: ${args.accountId}`);
		}

		const entries = [...debits, ...credits].sort(compareSequence);
		let balance = 0n;

		for (const entry of entries) {
			if (entry.debitAccountId === args.accountId) {
				balance += isCreditNormalFamily(account.family)
					? -entry.amount
					: entry.amount;
			}
			if (entry.creditAccountId === args.accountId) {
				balance += isCreditNormalFamily(account.family)
					? entry.amount
					: -entry.amount;
			}
		}

		return balance;
	})
	.public();

export const getObligationHistory = cashLedgerQuery
	.input({ obligationId: v.id("obligations") })
	.handler(async (ctx, args) => {
		return ctx.db
			.query("cash_ledger_journal_entries")
			.withIndex("by_obligation_and_sequence", (q) =>
				q.eq("obligationId", args.obligationId)
			)
			.collect();
	})
	.public();

export const reconcileObligationSettlementProjection = cashLedgerQuery
	.input({ obligationId: v.id("obligations") })
	.handler(async (ctx, args) => {
		return reconcileObligationSettlementProjectionInternal(
			ctx,
			args.obligationId
		);
	})
	.public();

export const getJournalSettledAmount = cashLedgerQuery
	.input({ obligationId: v.id("obligations") })
	.handler(async (ctx, args) => {
		return getJournalSettledAmountForObligation(ctx, args.obligationId);
	})
	.public();

// ── Reversal Indicator Queries ────────────────────────────────

export const getSettledObligationsWithNonZeroBalance = cashLedgerQuery
	.handler(async (ctx) => {
		const indicators = await findSettledObligationsWithNonZeroBalance(ctx);
		// Serialize bigint values to strings for transport
		return indicators.map((indicator) => ({
			obligationId: indicator.obligationId,
			journalSettledAmount: indicator.journalSettledAmount.toString(),
			obligationAmount: indicator.obligationAmount,
			expectedBalance: indicator.expectedBalance.toString(),
		}));
	})
	.internal();

// ── CONTROL Subaccount Queries ────────────────────────────────

const subaccountValidator = v.union(
	v.literal("ACCRUAL"),
	v.literal("ALLOCATION"),
	v.literal("SETTLEMENT"),
	v.literal("WAIVER")
);

export const getControlAccounts = cashLedgerQuery
	.input({ subaccount: subaccountValidator })
	.handler(async (ctx, args) => {
		const accounts = await getControlAccountsBySubaccount(
			ctx.db,
			args.subaccount
		);
		return accounts.map((account) => ({
			accountId: account._id,
			mortgageId: account.mortgageId,
			obligationId: account.obligationId,
			balance: getCashAccountBalance(account),
		}));
	})
	.public();

export const getControlBalance = cashLedgerQuery
	.input({ subaccount: subaccountValidator })
	.handler(async (ctx, args) => {
		return getControlBalanceBySubaccount(ctx, args.subaccount);
	})
	.public();

export const controlNetZeroCheck = cashLedgerQuery
	.input({ postingGroupId: v.string() })
	.handler(async (ctx, args) => {
		return getControlBalancesByPostingGroup(ctx, args.postingGroupId);
	})
	.public();

// ── Posting Group Queries ─────────────────────────────────────

export const getPostingGroupEntries = cashLedgerQuery
	.input({ postingGroupId: v.string() })
	.handler(async (ctx, args) => {
		const entries = await ctx.db
			.query("cash_ledger_journal_entries")
			.withIndex("by_posting_group", (q) =>
				q.eq("postingGroupId", args.postingGroupId)
			)
			.collect();
		return entries.sort(compareSequence);
	})
	.public();

// ── Date Range Queries ───────────────────────────────────────

export const getAccountBalanceRange = cashLedgerQuery
	.input({
		accountId: v.id("cash_ledger_accounts"),
		fromDate: v.string(),
		toDate: v.string(),
	})
	.handler(async (ctx, args) => {
		if (!BUSINESS_DATE_PATTERN.test(args.fromDate)) {
			throw new Error(
				`Invalid fromDate "${args.fromDate}": expected YYYY-MM-DD format`
			);
		}
		if (!BUSINESS_DATE_PATTERN.test(args.toDate)) {
			throw new Error(
				`Invalid toDate "${args.toDate}": expected YYYY-MM-DD format`
			);
		}
		if (args.fromDate > args.toDate) {
			throw new Error(
				`fromDate "${args.fromDate}" must be <= toDate "${args.toDate}"`
			);
		}

		const account = await ctx.db.get(args.accountId);
		if (!account) {
			throw new Error(`Cash ledger account not found: ${args.accountId}`);
		}

		// NOTE: This loads all journal entries for the account and filters
		// in-memory. For Phase 1 this is acceptable given expected data volumes
		// and the Convex 8 MB query size limit provides a natural ceiling. If
		// entry counts grow significantly, cursor-based pagination should be
		// introduced.
		const [debits, credits] = await Promise.all([
			ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_debit_account_and_timestamp", (q) =>
					q.eq("debitAccountId", args.accountId)
				)
				.collect(),
			ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_credit_account_and_timestamp", (q) =>
					q.eq("creditAccountId", args.accountId)
				)
				.collect(),
		]);

		const seen = new Set<string>();
		const all = [...debits, ...credits].filter((e) => {
			const key = e._id as string;
			if (seen.has(key)) {
				return false;
			}
			seen.add(key);
			return true;
		});
		all.sort(compareSequence);

		const creditNormal = isCreditNormalFamily(account.family);
		let openingRaw = 0n;
		const inRange: typeof all = [];

		for (const entry of all) {
			let delta = 0n;
			if (entry.debitAccountId === args.accountId) {
				delta += entry.amount;
			}
			if (entry.creditAccountId === args.accountId) {
				delta -= entry.amount;
			}

			if (entry.effectiveDate < args.fromDate) {
				openingRaw += delta;
			} else if (entry.effectiveDate <= args.toDate) {
				inRange.push(entry);
			}
		}

		let closingRaw = openingRaw;
		for (const entry of inRange) {
			let delta = 0n;
			if (entry.debitAccountId === args.accountId) {
				delta += entry.amount;
			}
			if (entry.creditAccountId === args.accountId) {
				delta -= entry.amount;
			}
			closingRaw += delta;
		}

		const sign = creditNormal ? -1n : 1n;

		return {
			openingBalance: openingRaw * sign,
			closingBalance: closingRaw * sign,
			entries: inRange,
			entryCount: inRange.length,
		};
	})
	.public();

// ── Dimension Aggregation Queries ────────────────────────────

export const getBorrowerBalance = cashLedgerQuery
	.input({ borrowerId: v.id("borrowers") })
	.handler(async (ctx, args) => {
		const accounts = await ctx.db
			.query("cash_ledger_accounts")
			.withIndex("by_borrower", (q) => q.eq("borrowerId", args.borrowerId))
			.collect();

		const receivables = accounts.filter(
			(a) => a.family === "BORROWER_RECEIVABLE"
		);

		let total = 0n;
		const grouped = new Map<Id<"obligations">, bigint>();

		for (const acct of receivables) {
			if (!acct.obligationId) {
				continue;
			}
			const bal = getCashAccountBalance(acct);
			total += bal;
			grouped.set(
				acct.obligationId,
				(grouped.get(acct.obligationId) ?? 0n) + bal
			);
		}

		const obligations: Array<{
			obligationId: Id<"obligations">;
			balance: bigint;
		}> = [];
		for (const [obligationId, balance] of grouped) {
			obligations.push({ obligationId, balance });
		}

		return { total, obligations };
	})
	.public();

export const getBalancesByFamily = cashLedgerQuery
	.input({
		mortgageId: v.id("mortgages"),
	})
	.handler(async (ctx, args) => {
		const accounts = await ctx.db
			.query("cash_ledger_accounts")
			.withIndex("by_mortgage", (q) => q.eq("mortgageId", args.mortgageId))
			.collect();

		const balancesByFamily: Record<string, bigint> = {};
		for (const account of accounts) {
			const bal = getCashAccountBalance(account);
			balancesByFamily[account.family] =
				(balancesByFamily[account.family] ?? 0n) + bal;
		}

		return balancesByFamily;
	})
	.public();

// ── Internal Query Variants (for downstream Convex functions) ─

export const internalGetObligationBalance = internalQuery({
	args: { obligationId: v.id("obligations") },
	handler: async (ctx, args) => {
		const account = await findCashAccount(ctx.db, {
			family: "BORROWER_RECEIVABLE",
			obligationId: args.obligationId,
		});
		if (!account) {
			return 0;
		}
		return safeBigintToNumber(getCashAccountBalance(account));
	},
});

export const internalGetLenderPayableBalance = internalQuery({
	args: { lenderId: v.id("lenders") },
	handler: async (ctx, args) => {
		const accounts = await ctx.db
			.query("cash_ledger_accounts")
			.withIndex("by_lender", (q) => q.eq("lenderId", args.lenderId))
			.collect();

		const total = accounts
			.filter((a) => a.family === "LENDER_PAYABLE")
			.reduce((sum, a) => sum + getCashAccountBalance(a), 0n);

		return safeBigintToNumber(total);
	},
});

export const internalGetMortgageCashState = internalQuery({
	args: { mortgageId: v.id("mortgages") },
	handler: async (ctx, args) => {
		const accounts = await ctx.db
			.query("cash_ledger_accounts")
			.withIndex("by_mortgage", (q) => q.eq("mortgageId", args.mortgageId))
			.collect();

		const state: Record<string, number> = {};
		for (const account of accounts) {
			const bal = safeBigintToNumber(getCashAccountBalance(account));
			state[account.family] = (state[account.family] ?? 0) + bal;
		}

		return state;
	},
});

// ── Replay Integrity Check ──────────────────────────────────

export const journalReplayIntegrityCheck = cashLedgerQuery
	.input({
		mode: v.union(v.literal("full"), v.literal("incremental")),
		accountId: v.optional(v.id("cash_ledger_accounts")),
		mortgageId: v.optional(v.id("mortgages")),
	})
	.handler(async (ctx, args) => {
		return replayJournalIntegrity(ctx, {
			mode: args.mode,
			accountId: args.accountId,
			mortgageId: args.mortgageId,
		});
	})
	.public();
