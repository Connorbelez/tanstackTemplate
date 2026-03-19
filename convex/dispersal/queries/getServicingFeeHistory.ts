import { v } from "convex/values";
import { ledgerQuery } from "../../fluent";

export const getServicingFeeHistory = ledgerQuery
	.input({
		mortgageId: v.id("mortgages"),
		fromDate: v.optional(v.string()),
		toDate: v.optional(v.string()),
	})
	.handler(async (ctx, args) => {
		const entries = await ctx.db
			.query("servicingFeeEntries")
			.withIndex("by_mortgage", (q) => q.eq("mortgageId", args.mortgageId))
			.collect();
		const filteredEntries = entries.filter((entry) => {
			if (args.fromDate && entry.date < args.fromDate) {
				return false;
			}
			if (args.toDate && entry.date > args.toDate) {
				return false;
			}
			return true;
		});
		filteredEntries.sort((left, right) => right.date.localeCompare(left.date));

		return {
			mortgageId: args.mortgageId,
			totalFees: filteredEntries.reduce(
				(total, entry) => total + entry.amount,
				0
			),
			entries: filteredEntries,
		};
	})
	.public();
