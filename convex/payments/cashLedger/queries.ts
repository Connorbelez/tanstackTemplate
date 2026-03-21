import { v } from "convex/values";
import { ledgerQuery } from "../../fluent";
import {
	findCashAccount,
	getCashAccountBalance,
	getControlAccountsBySubaccount,
	isCreditNormalFamily,
} from "./accounts";
import {
	getControlBalanceBySubaccount,
	getJournalSettledAmountForObligation,
	reconcileObligationSettlementProjectionInternal,
	validateControlNetZero,
} from "./reconciliation";

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

export const getAccountBalance = ledgerQuery
	.input({ accountId: v.id("cash_ledger_accounts") })
	.handler(async (ctx, args) => {
		const account = await ctx.db.get(args.accountId);
		if (!account) {
			throw new Error(`Cash ledger account not found: ${args.accountId}`);
		}
		return getCashAccountBalance(account);
	})
	.public();

export const getObligationBalance = ledgerQuery
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

export const getMortgageCashState = ledgerQuery
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

export const getLenderPayableBalance = ledgerQuery
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

export const getUnappliedCash = ledgerQuery
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

export const getSuspenseItems = ledgerQuery
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
			}))
			.filter((entry) => entry.balance > 0n);
	})
	.public();

export const getAccountBalanceAt = ledgerQuery
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

export const getObligationHistory = ledgerQuery
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

export const reconcileObligationSettlementProjection = ledgerQuery
	.input({ obligationId: v.id("obligations") })
	.handler(async (ctx, args) => {
		return reconcileObligationSettlementProjectionInternal(
			ctx,
			args.obligationId
		);
	})
	.public();

export const getJournalSettledAmount = ledgerQuery
	.input({ obligationId: v.id("obligations") })
	.handler(async (ctx, args) => {
		return getJournalSettledAmountForObligation(ctx, args.obligationId);
	})
	.public();

// ── CONTROL Subaccount Queries ────────────────────────────────

const subaccountValidator = v.union(
	v.literal("ACCRUAL"),
	v.literal("ALLOCATION"),
	v.literal("SETTLEMENT"),
	v.literal("WAIVER")
);

export const getControlAccounts = ledgerQuery
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

export const getControlBalance = ledgerQuery
	.input({ subaccount: subaccountValidator })
	.handler(async (ctx, args) => {
		return getControlBalanceBySubaccount(ctx, args.subaccount);
	})
	.public();

export const controlNetZeroCheck = ledgerQuery
	.input({ postingGroupId: v.string() })
	.handler(async (ctx, args) => {
		return validateControlNetZero(ctx, args.postingGroupId);
	})
	.public();
