import { v } from "convex/values";
import { internalQuery } from "../_generated/server";

/**
 * Returns all prorate entries for a given deal.
 * Used for idempotency checks in the prorateAccrualBetweenOwners effect.
 */
export const getByDealId = internalQuery({
	args: { dealId: v.id("deals") },
	handler: async (ctx, { dealId }) => {
		return await ctx.db
			.query("prorateEntries")
			.withIndex("by_deal", (q) => q.eq("dealId", dealId))
			.collect();
	},
});
