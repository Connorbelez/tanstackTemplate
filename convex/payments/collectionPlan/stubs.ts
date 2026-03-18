import { v } from "convex/values";
import { internalMutation } from "../../_generated/server";

export const evaluateRules = internalMutation({
	args: {
		trigger: v.union(v.literal("schedule"), v.literal("event")),
		mortgageId: v.optional(v.id("mortgages")),
		eventType: v.optional(v.string()),
		eventPayload: v.optional(v.any()),
	},
	handler: async (_ctx, args) => {
		console.info(
			`[stub] evaluateRules — trigger=${args.trigger}, eventType=${args.eventType ?? "none"} (real implementation in ENG-61)`
		);
	},
});
