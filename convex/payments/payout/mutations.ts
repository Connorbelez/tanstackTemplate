import { v } from "convex/values";
import { internalMutation } from "../../_generated/server";

/**
 * T-006: Mark dispersal entries as disbursed after payout is posted.
 * Uses "disbursed" status (not "paid") per dispersalStatusValidator.
 */
export const markEntriesDisbursed = internalMutation({
	args: {
		entryIds: v.array(v.id("dispersalEntries")),
		payoutDate: v.string(),
	},
	handler: async (ctx, args) => {
		for (const id of args.entryIds) {
			await ctx.db.patch(id, { status: "disbursed" });
		}
	},
});

/**
 * T-007: Update the lender's lastPayoutDate after a payout round completes.
 */
export const updateLenderPayoutDate = internalMutation({
	args: {
		lenderId: v.id("lenders"),
		payoutDate: v.string(),
	},
	handler: async (ctx, args) => {
		await ctx.db.patch(args.lenderId, {
			lastPayoutDate: args.payoutDate,
		});
	},
});
