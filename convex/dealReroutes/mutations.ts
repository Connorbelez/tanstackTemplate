import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

/**
 * Creates a deal reroute record.
 * The dispersal engine reads this at dispersal time to route payments
 * from the seller to the buyer for the transferred share.
 */
export const insert = internalMutation({
	args: {
		dealId: v.id("deals"),
		mortgageId: v.id("mortgages"),
		fromOwnerId: v.string(),
		toOwnerId: v.string(),
		fractionalShare: v.number(),
		effectiveAfterDate: v.string(),
		createdAt: v.number(),
	},
	handler: async (ctx, args) => {
		return await ctx.db.insert("dealReroutes", args);
	},
});
