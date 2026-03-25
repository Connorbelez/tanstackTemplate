import { ConvexError, v } from "convex/values";
import { canAccessAccrual } from "../auth/resourceChecks";
import { ledgerQuery } from "../fluent";
import { buildLenderAccrualResult, toLedgerMortgageId } from "./queryHelpers";

export const calculateAccruedInterest = ledgerQuery
	.input({
		fromDate: v.string(),
		lenderId: v.string(),
		mortgageId: v.id("mortgages"),
		toDate: v.string(),
	})
	.handler(async (ctx, args) => {
		const allowed = await canAccessAccrual(ctx, ctx.viewer, args.lenderId);
		if (!allowed) {
			throw new ConvexError(
				`Forbidden: no accrual access for lender ${args.lenderId}`
			);
		}

		const result = await buildLenderAccrualResult(
			ctx,
			args.mortgageId,
			args.lenderId,
			args.fromDate,
			args.toDate
		);

		return {
			...result,
			mortgageId: toLedgerMortgageId(args.mortgageId),
		};
	})
	.public();
