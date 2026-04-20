import { v } from "convex/values";
import { assertAccrualAccess } from "../authz/resourceAccess";
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
		await assertAccrualAccess(ctx, args.lenderId);

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
