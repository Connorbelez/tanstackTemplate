import { v } from "convex/values";
import { ledgerQuery } from "../../fluent";

export const getServicingFeeHistory = ledgerQuery
	.input({
		mortgageId: v.id("mortgages"),
		fromDate: v.optional(v.string()),
		toDate: v.optional(v.string()),
	})
	.handler(async (ctx, args) => {
		const { fromDate, mortgageId, toDate } = args;
		const entries = await (async () => {
			if (fromDate && toDate) {
				return ctx.db
					.query("servicingFeeEntries")
					.withIndex("by_mortgage", (q) =>
						q
							.eq("mortgageId", mortgageId)
							.gte("date", fromDate)
							.lte("date", toDate)
					)
					.order("desc")
					.collect();
			}
			if (fromDate) {
				return ctx.db
					.query("servicingFeeEntries")
					.withIndex("by_mortgage", (q) =>
						q.eq("mortgageId", mortgageId).gte("date", fromDate)
					)
					.order("desc")
					.collect();
			}
			if (toDate) {
				return ctx.db
					.query("servicingFeeEntries")
					.withIndex("by_mortgage", (q) =>
						q.eq("mortgageId", mortgageId).lte("date", toDate)
					)
					.order("desc")
					.collect();
			}
			return ctx.db
				.query("servicingFeeEntries")
				.withIndex("by_mortgage", (q) => q.eq("mortgageId", mortgageId))
				.order("desc")
				.collect();
		})();

		return {
			mortgageId,
			totalFees: entries.reduce((total, entry) => total + entry.amount, 0),
			entries,
		};
	})
	.public();
