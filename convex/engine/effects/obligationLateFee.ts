import { v } from "convex/values";
import { internal } from "../../_generated/api";
import { internalMutation } from "../../_generated/server";
import { effectPayloadValidator } from "../validators";

const obligationLateFeeValidator = {
	...effectPayloadValidator,
	entityId: v.id("obligations"),
	entityType: v.literal("obligation"),
};

/**
 * Compatibility shim: late-fee creation is rule-driven in v1.
 * If this effect is invoked directly, it delegates to collection-rule
 * evaluation instead of creating obligations imperatively.
 */
export const createLateFeeObligation = internalMutation({
	args: obligationLateFeeValidator,
	handler: async (ctx, args) => {
		const obligation = await ctx.db.get(args.entityId);
		if (!obligation) {
			throw new Error(
				`[createLateFeeObligation] Source obligation not found: ${args.entityId}`
			);
		}

		await ctx.scheduler.runAfter(
			0,
			internal.payments.collectionPlan.engine.evaluateRules,
			{
				trigger: "event" as const,
				mortgageId: obligation.mortgageId,
				eventType: "OBLIGATION_OVERDUE",
				eventPayload: {
					obligationId: args.entityId,
					mortgageId: obligation.mortgageId,
				},
			}
		);
	},
});
