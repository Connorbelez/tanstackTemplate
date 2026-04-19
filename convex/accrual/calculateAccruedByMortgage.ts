import { v } from "convex/values";
import { assertMortgageAccess } from "../authz/resourceAccess";
import { ledgerQuery } from "../fluent";
import { buildMortgageAccrualBreakdown } from "./queryHelpers";

export const calculateAccruedByMortgage = ledgerQuery
	.input({
		fromDate: v.string(),
		mortgageId: v.id("mortgages"),
		toDate: v.string(),
	})
	.handler(async (ctx, args) => {
		await assertMortgageAccess(ctx, args.mortgageId);

		return buildMortgageAccrualBreakdown(
			ctx,
			args.mortgageId,
			args.fromDate,
			args.toDate
		);
	})
	.public();
