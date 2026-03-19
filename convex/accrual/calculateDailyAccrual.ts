import { ConvexError, v } from "convex/values";
import { canAccessMortgage } from "../auth/resourceChecks";
import { ledgerQuery } from "../fluent";
import { buildDailyAccrualBreakdown } from "./queryHelpers";

export const calculateDailyAccrual = ledgerQuery
	.input({
		date: v.string(),
		mortgageId: v.id("mortgages"),
	})
	.handler(async (ctx, args) => {
		const allowed = await canAccessMortgage(ctx, ctx.viewer, args.mortgageId);
		if (!allowed) {
			throw new ConvexError(
				`Forbidden: no mortgage access for ${String(args.mortgageId)}`
			);
		}

		return buildDailyAccrualBreakdown(ctx, args.mortgageId, args.date);
	})
	.public();
