import { v } from "convex/values";
import { internalQuery } from "../_generated/server";

/**
 * Internal query to fetch a mortgage by ID.
 * Returns null if not found — callers handle the null case gracefully.
 * Used by effects that need mortgage data without auth checks.
 */
export const getInternalMortgage = internalQuery({
	args: { mortgageId: v.id("mortgages") },
	handler: async (ctx, { mortgageId }) => {
		return await ctx.db.get(mortgageId);
	},
});
