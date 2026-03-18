import { v } from "convex/values";
import { internalMutation } from "../../_generated/server";

export const createDispersalEntry = internalMutation({
	args: {
		mortgageId: v.id("mortgages"),
		obligationId: v.id("obligations"),
		amount: v.number(),
	},
	handler: async (_ctx, args) => {
		console.info(
			`[stub] createDispersalEntry — mortgage=${args.mortgageId}, obligation=${args.obligationId}, amount=${args.amount} (real implementation in Project 6)`
		);
	},
});
