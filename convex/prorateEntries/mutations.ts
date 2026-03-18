import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

const prorateEntryValidator = v.object({
	mortgageId: v.id("mortgages"),
	dealId: v.id("deals"),
	ownerId: v.string(),
	ownerRole: v.union(v.literal("seller"), v.literal("buyer")),
	amount: v.number(),
	days: v.number(),
	dailyRate: v.number(),
	periodStart: v.string(),
	periodEnd: v.string(),
	closingDate: v.string(),
	entryType: v.literal("prorate_credit"),
	createdAt: v.number(),
});

/**
 * Atomically inserts one or more prorate entries.
 * All-or-nothing: if any insert fails, the entire mutation rolls back.
 * This prevents partial writes and keeps the idempotency check simple
 * (check for any entries by dealId).
 */
export const insertProrateEntries = internalMutation({
	args: {
		entries: v.array(prorateEntryValidator),
	},
	handler: async (ctx, { entries }) => {
		const ids: string[] = [];
		for (const entry of entries) {
			ids.push(await ctx.db.insert("prorateEntries", entry));
		}
		return ids;
	},
});
