import { v } from "convex/values";
import { ledgerQuery } from "../../fluent";

export const getDispersalsByObligation = ledgerQuery
	.input({ obligationId: v.id("obligations") })
	.handler(async (ctx, args) => {
		const entries = await ctx.db
			.query("dispersalEntries")
			.withIndex("by_obligation", (q) =>
				q.eq("obligationId", args.obligationId)
			)
			.collect();

		return {
			obligationId: args.obligationId,
			total: entries.reduce((total, entry) => total + entry.amount, 0),
			entries: entries.map((entry) => ({
				id: entry._id,
				mortgageId: entry.mortgageId,
				lenderId: entry.lenderId,
				lenderAccountId: entry.lenderAccountId,
				amount: entry.amount,
				dispersalDate: entry.dispersalDate,
				status: entry.status,
				calculationDetails: entry.calculationDetails,
			})),
		};
	})
	.public();
