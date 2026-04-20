import { v } from "convex/values";
import { assertAccrualAccess } from "../authz/resourceAccess";
import { ledgerQuery } from "../fluent";
import { buildPortfolioAccrualBreakdown } from "./queryHelpers";

export const calculateInvestorPortfolioAccrual = ledgerQuery
	.input({
		fromDate: v.string(),
		lenderId: v.string(),
		toDate: v.string(),
	})
	.handler(async (ctx, args) => {
		await assertAccrualAccess(ctx, args.lenderId);

		return buildPortfolioAccrualBreakdown(
			ctx,
			args.lenderId,
			args.fromDate,
			args.toDate
		);
	})
	.public();
