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

		const eligible: typeof entries = [];
		let legacyWithoutPayoutEligibleAfter = 0;
		for (const entry of entries) {
			if (entry.transferRequestId) {
				continue;
			}
			if (entry.payoutEligibleAfter === undefined) {
				legacyWithoutPayoutEligibleAfter += 1;
				eligible.push(entry);
			} else if (entry.payoutEligibleAfter <= args.today) {
				eligible.push(entry);
			}
		}
		if (legacyWithoutPayoutEligibleAfter > 0) {
			console.warn(
				`[payout] Found ${legacyWithoutPayoutEligibleAfter} legacy dispersalEntries without payoutEligibleAfter for lender ${args.lenderId} on ${args.today} — bypassing hold period check for these entries`
			);
		}
		return eligible;
	},
});

/**
 * T-005: Get all active lenders (for batch payout processing).
 * Returns full lender documents so callers can check payoutFrequency,
 * lastPayoutDate, and minimumPayoutCents.
 */
export const getActiveLenders = internalQuery({
	args: {},
	handler: async (ctx) => {
		return await ctx.db
			.query("lenders")
			.withIndex("by_status", (q) => q.eq("status", "active"))
			.collect();
	},
});

/**
 * Get a single lender by ID. Used by adminPayout for efficient
 * single-lender lookup instead of fetching all active lenders.
 */
export const getLenderById = internalQuery({
	args: {
		lenderId: v.id("lenders"),
	},
	handler: async (ctx, args) => {
		return await ctx.db.get(args.lenderId);
	},
});
