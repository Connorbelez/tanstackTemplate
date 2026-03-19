import { v } from "convex/values";
import { ledgerQuery } from "../../fluent";

export const getUndisbursedBalance = ledgerQuery
	.input({ lenderId: v.id("lenders") })
	.handler(async (ctx, args) => {
		const entries = await ctx.db
			.query("dispersalEntries")
			.withIndex("by_status", (q) =>
				q.eq("status", "pending").eq("lenderId", args.lenderId)
			)
			.collect();

		const undisbursedBalance = entries.reduce(
			(total, entry) => total + entry.amount,
			0
		);

		return {
			lenderId: args.lenderId,
			undisbursedBalance,
			entryCount: entries.length,
		};
	})
	.public();
