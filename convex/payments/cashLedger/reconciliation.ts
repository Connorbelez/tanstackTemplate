import { v } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";
import { internalQuery, type QueryCtx } from "../../_generated/server";
import {
	getCashAccountBalance,
	getControlAccountsBySubaccount,
} from "./accounts";
import type { ControlSubaccount } from "./types";
import { TRANSIENT_SUBACCOUNTS } from "./types";

async function loadObligationEntries(
	ctx: QueryCtx,
	obligationId: Id<"obligations">
): Promise<Doc<"cash_ledger_journal_entries">[]> {
	return ctx.db
		.query("cash_ledger_journal_entries")
		.withIndex("by_obligation_and_sequence", (q) =>
			q.eq("obligationId", obligationId)
		)
		.collect();
}

export async function getJournalSettledAmountForObligation(
	ctx: QueryCtx,
	obligationId: Id<"obligations">
) {
	const entries = await loadObligationEntries(ctx, obligationId);
	let journalSettledAmount = 0n;

	for (const entry of entries) {
		if (entry.entryType === "CASH_RECEIVED") {
			journalSettledAmount += entry.amount;
			continue;
		}

		if (entry.entryType !== "REVERSAL" || !entry.causedBy) {
			continue;
		}

		const original = await ctx.db.get(entry.causedBy);
		if (original?.entryType === "CASH_RECEIVED") {
			journalSettledAmount -= entry.amount;
		}
	}

	return journalSettledAmount;
}

export async function reconcileObligationSettlementProjectionInternal(
	ctx: QueryCtx,
	obligationId: Id<"obligations">
) {
	const obligation = await ctx.db.get(obligationId);
	if (!obligation) {
		throw new Error(`Obligation not found: ${obligationId}`);
	}

	const journalSettledAmount = await getJournalSettledAmountForObligation(
		ctx,
		obligationId
	);
	const projectedSettledAmount = BigInt(obligation.amountSettled);
	const driftAmount = projectedSettledAmount - journalSettledAmount;

	return {
		obligationId,
		projectedSettledAmount,
		journalSettledAmount,
		driftAmount,
		hasDrift: driftAmount !== 0n,
	};
}

/**
 * Internal query wrapper for getJournalSettledAmountForObligation.
 * Returns a number (not bigint) for use in actions via ctx.runQuery.
 */
export const getJournalSettledAmountForObligationInternal = internalQuery({
	args: { obligationId: v.id("obligations") },
	handler: async (ctx, { obligationId }) => {
		const amount = await getJournalSettledAmountForObligation(
			ctx,
			obligationId
		);
		return Number(amount);
	},
});

// ── CONTROL Subaccount Reconciliation ─────────────────────────

export interface ControlBalanceResult {
	balance: bigint;
	subaccount: string;
	valid: boolean;
}

export async function validateControlNetZero(
	ctx: QueryCtx,
	postingGroupId: string
): Promise<ControlBalanceResult[]> {
	const entries = await ctx.db
		.query("cash_ledger_journal_entries")
		.withIndex("by_posting_group", (q) =>
			q.eq("postingGroupId", postingGroupId)
		)
		.collect();

	const balances = new Map<string, bigint>();

	for (const entry of entries) {
		const [debitAccount, creditAccount] = await Promise.all([
			ctx.db.get(entry.debitAccountId),
			ctx.db.get(entry.creditAccountId),
		]);

		if (debitAccount?.family === "CONTROL" && debitAccount.subaccount) {
			const sub = debitAccount.subaccount;
			balances.set(sub, (balances.get(sub) ?? 0n) + entry.amount);
		}
		if (creditAccount?.family === "CONTROL" && creditAccount.subaccount) {
			const sub = creditAccount.subaccount;
			balances.set(sub, (balances.get(sub) ?? 0n) - entry.amount);
		}
	}

	const results: ControlBalanceResult[] = [];
	for (const sub of TRANSIENT_SUBACCOUNTS) {
		const balance = balances.get(sub) ?? 0n;
		results.push({ subaccount: sub, balance, valid: balance === 0n });
	}
	return results;
}

export async function getControlBalanceBySubaccount(
	ctx: QueryCtx,
	subaccount: ControlSubaccount
): Promise<{ totalBalance: bigint; accountCount: number }> {
	const accounts = await getControlAccountsBySubaccount(ctx.db, subaccount);
	let totalBalance = 0n;
	for (const account of accounts) {
		totalBalance += getCashAccountBalance(account);
	}
	return { totalBalance, accountCount: accounts.length };
}
