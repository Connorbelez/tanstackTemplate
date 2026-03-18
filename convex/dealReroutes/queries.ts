import { v } from "convex/values";
import { internalQuery } from "../_generated/server";

/**
 * Returns the deal reroute record for a given deal, if it exists.
 * Used for idempotency checks in the updatePaymentSchedule effect.
 */
export const getByDealId = internalQuery({
	args: { dealId: v.id("deals") },
	handler: async (ctx, { dealId }) => {
		return await ctx.db
			.query("dealReroutes")
			.withIndex("by_deal", (q) => q.eq("dealId", dealId))
			.first();
	},
});
