import { ConvexError, v } from "convex/values";
import { canAccessAccrual } from "../auth/resourceChecks";
import { ledgerQuery } from "../fluent";
import { buildPortfolioAccrualBreakdown } from "./queryHelpers";

export const calculateInvestorPortfolioAccrual = ledgerQuery
	.input({
		fromDate: v.string(),
		lenderId: v.string(),
		toDate: v.string(),
	})
	.handler(async (ctx, args) => {
		const allowed = await canAccessAccrual(ctx, ctx.viewer, args.lenderId);
		if (!allowed) {
			throw new ConvexError(
				`Forbidden: no accrual access for lender ${args.lenderId}`
			);
		}

		return buildPortfolioAccrualBreakdown(
			ctx,
			args.lenderId,
			args.fromDate,
			args.toDate
		);
	})
	.public();
