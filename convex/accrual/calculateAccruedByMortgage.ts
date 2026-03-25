import { ConvexError, v } from "convex/values";
import { canAccessMortgage } from "../auth/resourceChecks";
import { ledgerQuery } from "../fluent";
import { buildMortgageAccrualBreakdown } from "./queryHelpers";

export const calculateAccruedByMortgage = ledgerQuery
	.input({
		fromDate: v.string(),
		mortgageId: v.id("mortgages"),
		toDate: v.string(),
	})
	.handler(async (ctx, args) => {
		const allowed = await canAccessMortgage(ctx, ctx.viewer, args.mortgageId);
		if (!allowed) {
			throw new ConvexError(
				`Forbidden: no mortgage access for ${String(args.mortgageId)}`
			);
		}

		return buildMortgageAccrualBreakdown(
			ctx,
			args.mortgageId,
			args.fromDate,
			args.toDate
		);
	})
	.public();
