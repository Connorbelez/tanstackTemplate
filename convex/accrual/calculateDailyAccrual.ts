import { v } from "convex/values";
import { assertMortgageAccess } from "../authz/resourceAccess";
import { ledgerQuery } from "../fluent";
import { buildDailyAccrualBreakdown } from "./queryHelpers";

export const calculateDailyAccrual = ledgerQuery
	.input({
		date: v.string(),
		mortgageId: v.id("mortgages"),
	})
	.handler(async (ctx, args) => {
		await assertMortgageAccess(ctx, args.mortgageId);

		return buildDailyAccrualBreakdown(ctx, args.mortgageId, args.date);
	})
	.public();
