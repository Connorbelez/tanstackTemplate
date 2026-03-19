import { v } from "convex/values";
import { ledgerQuery } from "../../fluent";

export const getDisbursementHistory = ledgerQuery
	.input({
		lenderId: v.id("lenders"),
		fromDate: v.optional(v.string()),
		toDate: v.optional(v.string()),
	})
	.handler(async (ctx, args) => {
		const { fromDate, toDate, lenderId } = args;
		const entries = await (async () => {
			if (fromDate && toDate) {
				return ctx.db
					.query("dispersalEntries")
					.withIndex("by_lender", (q) =>
						q
							.eq("lenderId", lenderId)
							.gte("dispersalDate", fromDate)
							.lte("dispersalDate", toDate)
					)
					.order("desc")
					.collect();
			}
			if (fromDate) {
				return ctx.db
					.query("dispersalEntries")
					.withIndex("by_lender", (q) =>
						q.eq("lenderId", lenderId).gte("dispersalDate", fromDate)
					)
					.order("desc")
					.collect();
			}
			if (toDate) {
				return ctx.db
					.query("dispersalEntries")
					.withIndex("by_lender", (q) =>
						q.eq("lenderId", lenderId).lte("dispersalDate", toDate)
					)
					.order("desc")
					.collect();
			}
			return ctx.db
				.query("dispersalEntries")
				.withIndex("by_lender", (q) => q.eq("lenderId", lenderId))
				.order("desc")
				.collect();
		})();

		return {
			lenderId,
			entries: entries.map((entry) => ({
				id: entry._id,
				mortgageId: entry.mortgageId,
				obligationId: entry.obligationId,
				amount: entry.amount,
				dispersalDate: entry.dispersalDate,
				status: entry.status,
				calculationDetails: entry.calculationDetails,
			})),
			total: entries.reduce((total, entry) => total + entry.amount, 0),
		};
	})
	.public();
