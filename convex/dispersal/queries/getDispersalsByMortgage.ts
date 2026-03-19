import { v } from "convex/values";
import type { Doc } from "../../_generated/dataModel";
import { ledgerQuery } from "../../fluent";

export const getDispersalsByMortgage = ledgerQuery
	.input({
		mortgageId: v.id("mortgages"),
		fromDate: v.optional(v.string()),
		toDate: v.optional(v.string()),
	})
	.handler(async (ctx, args) => {
		const { fromDate, mortgageId, toDate } = args;
		let entries: Doc<"dispersalEntries">[];
		if (fromDate && toDate) {
			entries = await ctx.db
				.query("dispersalEntries")
				.withIndex("by_mortgage", (q) =>
					q
						.eq("mortgageId", mortgageId)
						.gte("dispersalDate", fromDate)
						.lte("dispersalDate", toDate)
				)
				.order("desc")
				.collect();
		} else if (fromDate) {
			entries = await ctx.db
				.query("dispersalEntries")
				.withIndex("by_mortgage", (q) =>
					q.eq("mortgageId", mortgageId).gte("dispersalDate", fromDate)
				)
				.order("desc")
				.collect();
		} else if (toDate) {
			entries = await ctx.db
				.query("dispersalEntries")
				.withIndex("by_mortgage", (q) =>
					q.eq("mortgageId", mortgageId).lte("dispersalDate", toDate)
				)
				.order("desc")
				.collect();
		} else {
			entries = await ctx.db
				.query("dispersalEntries")
				.withIndex("by_mortgage", (q) => q.eq("mortgageId", mortgageId))
				.order("desc")
				.collect();
		}

		const byLender: Record<string, number> = {};
		for (const entry of entries) {
			byLender[entry.lenderId] = (byLender[entry.lenderId] ?? 0) + entry.amount;
		}

		return {
			mortgageId,
			total: entries.reduce((total, entry) => total + entry.amount, 0),
			byLender,
			entries: entries.map((entry) => ({
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
