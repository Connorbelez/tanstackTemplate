import { v } from "convex/values";
import { ledgerQuery } from "../../fluent";

export const getDispersalsByMortgage = ledgerQuery
	.input({
		mortgageId: v.id("mortgages"),
		fromDate: v.optional(v.string()),
		toDate: v.optional(v.string()),
	})
	.handler(async (ctx, args) => {
		const entries = await ctx.db
			.query("dispersalEntries")
			.withIndex("by_mortgage", (q) => q.eq("mortgageId", args.mortgageId))
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

		const byLender: Record<string, number> = {};
		for (const entry of filteredEntries) {
			byLender[entry.lenderId] = (byLender[entry.lenderId] ?? 0) + entry.amount;
		}

		return {
			mortgageId: args.mortgageId,
			total: filteredEntries.reduce((total, entry) => total + entry.amount, 0),
			byLender,
			entries: filteredEntries.map((entry) => ({
				id: entry._id,
				lenderId: entry.lenderId,
				lenderAccountId: entry.lenderAccountId,
				obligationId: entry.obligationId,
				amount: entry.amount,
				dispersalDate: entry.dispersalDate,
				status: entry.status,
				calculationDetails: entry.calculationDetails,
			})),
		};
	})
	.public();
