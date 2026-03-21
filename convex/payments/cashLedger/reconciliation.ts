import { v } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";
import { internalQuery, type QueryCtx } from "../../_generated/server";

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
