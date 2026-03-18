import { ConvexError, v } from "convex/values";
import { internalQuery } from "../_generated/server";

/**
 * Internal query to fetch a mortgage by ID.
 * Used by effects that need mortgage data without auth checks.
 */
export const getInternalMortgage = internalQuery({
	args: { mortgageId: v.id("mortgages") },
	handler: async (ctx, { mortgageId }) => {
		const mortgage = await ctx.db.get(mortgageId);
		if (!mortgage) {
			throw new ConvexError("MORTGAGE_NOT_FOUND");
		}
		return mortgage;
	},
});
