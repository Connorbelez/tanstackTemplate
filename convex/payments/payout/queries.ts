import { v } from "convex/values";
import { internalQuery } from "../../_generated/server";

/**
 * T-004: Get all dispersal entries eligible for payout for a given lender.
 * Eligible = status is "pending" AND payoutEligibleAfter <= today (or undefined).
 */
export const getEligibleDispersalEntries = internalQuery({
	args: {
		lenderId: v.id("lenders"),
		today: v.string(),
	},
	handler: async (ctx, args) => {
		const entries = await ctx.db
			.query("dispersalEntries")
			.withIndex("by_status", (q) =>
				q.eq("status", "pending").eq("lenderId", args.lenderId)
			)
			.collect();

		return entries.filter((entry) => {
			if (entry.payoutEligibleAfter === undefined) {
				return true;
			}
			return entry.payoutEligibleAfter <= args.today;
		});
	},
});

/**
 * T-005: Get all active lenders (for batch payout processing).
 * Returns full lender documents so callers can check payoutFrequency,
 * lastPayoutDate, and minimumPayoutCents.
 */
export const getLendersWithPayableBalance = internalQuery({
	args: {},
	handler: async (ctx) => {
		return await ctx.db
			.query("lenders")
			.withIndex("by_status", (q) => q.eq("status", "active"))
			.collect();
	},
});
