import { v } from "convex/values";
import { internal } from "../../_generated/api";
import { internalAction } from "../../_generated/server";
import { effectPayloadValidator } from "../validators";

const dealEffectPayloadValidator = {
	...effectPayloadValidator,
	entityId: v.id("deals"),
	entityType: v.literal("deal"),
};

/**
 * Effect: creates a deal reroute record to redirect future payment dispersals.
 *
 * Fires on fundsTransfer.onDone → confirmed transition.
 *
 * Instead of modifying existing dispersalEntries (which are append-only),
 * creates a dealReroutes record that the dispersal engine reads at dispersal time
 * to route the transferred share's payments from the seller to the buyer.
 *
 * Idempotent: checks for existing reroute by dealId before inserting.
 */
export const updatePaymentSchedule = internalAction({
	args: dealEffectPayloadValidator,
	handler: async (ctx, args) => {
		const dealId = args.entityId;

		const deal = await ctx.runQuery(internal.deals.queries.getInternalDeal, {
			dealId,
		});

		if (!deal) {
			console.error(`[updatePaymentSchedule] Deal not found: ${dealId}`);
			return;
		}

		// Idempotency: check if reroute already exists for this deal
		const existing = await ctx.runQuery(
			internal.dealReroutes.queries.getByDealId,
			{ dealId }
		);
		if (existing) {
			console.info(
				`[updatePaymentSchedule] Reroute already exists for deal ${dealId} — skipping`
			);
			return;
		}

		if (!deal.closingDate) {
			console.error(`[updatePaymentSchedule] No closingDate on deal ${dealId}`);
			return;
		}

		const effectiveAfterDate = new Date(deal.closingDate)
			.toISOString()
			.split("T")[0];

		try {
			await ctx.runMutation(internal.dealReroutes.mutations.insert, {
				dealId,
				mortgageId: deal.mortgageId,
				fromOwnerId: deal.sellerId,
				toOwnerId: deal.buyerId,
				fractionalShare: deal.fractionalShare,
				effectiveAfterDate,
				createdAt: Date.now(),
			});

			console.info(
				`[updatePaymentSchedule] Created reroute for deal ${dealId}: ${deal.fractionalShare} units from ${deal.sellerId} to ${deal.buyerId} after ${effectiveAfterDate}`
			);
		} catch (error) {
			console.error(
				`[updatePaymentSchedule] Failed to create reroute for deal ${dealId}: ${
					error instanceof Error ? error.message : String(error)
				}`
			);
			throw error;
		}
	},
});
