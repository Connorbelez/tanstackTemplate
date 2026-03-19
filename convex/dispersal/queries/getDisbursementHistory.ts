import { v } from "convex/values";
import { ledgerQuery } from "../../fluent";

export const getDisbursementHistory = ledgerQuery
	.input({
		lenderId: v.id("lenders"),
		fromDate: v.optional(v.string()),
		toDate: v.optional(v.string()),
	})
	.handler(async (ctx, args) => {
		const entries = await ctx.db
			.query("dispersalEntries")
			.withIndex("by_lender", (q) => q.eq("lenderId", args.lenderId))
			.collect();
		const filteredEntries = entries.filter((entry) => {
			if (args.fromDate && entry.dispersalDate < args.fromDate) {
				return false;
			}
			if (args.toDate && entry.dispersalDate > args.toDate) {
				return false;
			}
			return true;
		});
		filteredEntries.sort((left, right) =>
			right.dispersalDate.localeCompare(left.dispersalDate)
		);

		return {
			lenderId: args.lenderId,
			entries: filteredEntries.map((entry) => ({
				id: entry._id,
				mortgageId: entry.mortgageId,
				obligationId: entry.obligationId,
				amount: entry.amount,
				dispersalDate: entry.dispersalDate,
				status: entry.status,
				calculationDetails: entry.calculationDetails,
			})),
			total: filteredEntries.reduce((total, entry) => total + entry.amount, 0),
		};
	})
	.public();
