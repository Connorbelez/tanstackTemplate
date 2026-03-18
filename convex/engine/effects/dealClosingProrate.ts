import { v } from "convex/values";
import { internal } from "../../_generated/api";
import { internalAction } from "../../_generated/server";
import { effectPayloadValidator } from "../validators";

const dealEffectPayloadValidator = {
	...effectPayloadValidator,
	entityId: v.id("deals"),
	entityType: v.literal("deal"),
};

/** Calculate days between two ISO date strings (YYYY-MM-DD). Uses UTC to avoid timezone issues. */
function daysBetween(startDate: string, endDate: string): number {
	const start = new Date(`${startDate}T00:00:00Z`);
	const end = new Date(`${endDate}T00:00:00Z`);
	return Math.round((end.getTime() - start.getTime()) / (86_400 * 1000));
}

/**
 * Effect: calculates and writes prorate credit entries for seller and buyer on deal confirmation.
 *
 * Fires on fundsTransfer.onDone → confirmed transition.
 *
 * Formula:
 *   fractionalRate = deal.fractionalShare / 10000
 *   dailyRate = (mortgage.interestRate × fractionalRate × mortgage.principal) / 365
 *   sellerDays = daysBetween(lastPaymentDate, closingDate)
 *   buyerDays = daysBetween(closingDate, nextPaymentDate)
 *
 * Idempotent: checks for existing prorate entries by dealId before writing.
 * Writes atomically via insertProrateEntries (all-or-nothing).
 */
export const prorateAccrualBetweenOwners = internalAction({
	args: dealEffectPayloadValidator,
	handler: async (ctx, args) => {
		const dealId = args.entityId;

		const deal = await ctx.runQuery(internal.deals.queries.getInternalDeal, {
			dealId,
		});

		if (!deal) {
			console.error(`[prorateAccrual] Deal not found: ${dealId}`);
			return;
		}

		// Idempotency: check if prorate entries already exist for this deal
		const existing = await ctx.runQuery(
			internal.prorateEntries.queries.getByDealId,
			{ dealId }
		);
		if (existing.length > 0) {
			console.info(
				`[prorateAccrual] Prorate entries already exist for deal ${dealId} — skipping`
			);
			return;
		}

		// Load mortgage for interest rate and principal
		const mortgage = await ctx.runQuery(
			internal.mortgages.queries.getInternalMortgage,
			{ mortgageId: deal.mortgageId }
		);

		if (!mortgage) {
			console.error(`[prorateAccrual] Mortgage not found: ${deal.mortgageId}`);
			return;
		}

		if (!deal.closingDate) {
			console.error(`[prorateAccrual] No closingDate on deal ${dealId}`);
			return;
		}

		const closingDateStr = new Date(deal.closingDate)
			.toISOString()
			.split("T")[0];

		// Derive last payment date from settled obligations
		const lastSettled = await ctx.runQuery(
			internal.obligations.queries.getSettledBeforeDate,
			{
				mortgageId: deal.mortgageId,
				beforeDate: closingDateStr,
			}
		);
		const lastPaymentDate = lastSettled
			? lastSettled.dueDate
			: mortgage.termStartDate;

		// Derive next payment date from future obligations
		const nextObligation = await ctx.runQuery(
			internal.obligations.queries.getFirstAfterDate,
			{
				mortgageId: deal.mortgageId,
				afterDate: closingDateStr,
			}
		);

		if (!nextObligation) {
			console.error(
				`[prorateAccrual] No future obligations found for mortgage ${deal.mortgageId} — cannot determine next payment date`
			);
			return;
		}
		const nextPaymentDate = nextObligation.dueDate;

		// Calculate daily rate
		const fractionalRate = deal.fractionalShare / 10_000;
		const dailyRate =
			(mortgage.interestRate * fractionalRate * mortgage.principal) / 365;

		const sellerDays = daysBetween(lastPaymentDate, closingDateStr);
		const buyerDays = daysBetween(closingDateStr, nextPaymentDate);

		const now = Date.now();
		const entries: Array<{
			mortgageId: typeof deal.mortgageId;
			dealId: typeof dealId;
			ownerId: string;
			ownerRole: "seller" | "buyer";
			amount: number;
			days: number;
			dailyRate: number;
			periodStart: string;
			periodEnd: string;
			closingDate: string;
			entryType: "prorate_credit";
			createdAt: number;
		}> = [];

		if (sellerDays > 0) {
			entries.push({
				mortgageId: deal.mortgageId,
				dealId,
				ownerId: deal.sellerId,
				ownerRole: "seller",
				amount: Math.round(dailyRate * sellerDays * 100) / 100,
				days: sellerDays,
				dailyRate,
				periodStart: lastPaymentDate,
				periodEnd: closingDateStr,
				closingDate: closingDateStr,
				entryType: "prorate_credit",
				createdAt: now,
			});
		}

		if (buyerDays > 0) {
			entries.push({
				mortgageId: deal.mortgageId,
				dealId,
				ownerId: deal.buyerId,
				ownerRole: "buyer",
				amount: Math.round(dailyRate * buyerDays * 100) / 100,
				days: buyerDays,
				dailyRate,
				periodStart: closingDateStr,
				periodEnd: nextPaymentDate,
				closingDate: closingDateStr,
				entryType: "prorate_credit",
				createdAt: now,
			});
		}

		if (entries.length === 0) {
			console.info(
				`[prorateAccrual] Deal ${dealId}: both seller and buyer days are zero — no entries to write`
			);
			return;
		}

		// Atomic insert — all-or-nothing
		try {
			await ctx.runMutation(
				internal.prorateEntries.mutations.insertProrateEntries,
				{ entries }
			);

			const sellerAmount =
				sellerDays > 0 ? (dailyRate * sellerDays).toFixed(2) : "0.00";
			const buyerAmount =
				buyerDays > 0 ? (dailyRate * buyerDays).toFixed(2) : "0.00";

			console.info(
				`[prorateAccrual] Deal ${dealId}: seller=${sellerDays}d ($${sellerAmount}), buyer=${buyerDays}d ($${buyerAmount})`
			);
		} catch (error) {
			console.error(
				`[prorateAccrual] Failed to insert prorate entries for deal ${dealId}: ${
					error instanceof Error ? error.message : String(error)
				}`
			);
		}
	},
});
