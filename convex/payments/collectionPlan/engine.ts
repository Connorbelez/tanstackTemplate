import { v } from "convex/values";
import { internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import type { ActionCtx } from "../../_generated/server";
import { internalAction } from "../../_generated/server";
import {
	type CollectionRuleKind,
	getCollectionRuleCode,
	getCollectionRuleKind,
} from "./ruleContract";
import { lateFeeRuleHandler } from "./rules/lateFeeRule";
import { retryRuleHandler } from "./rules/retryRule";
import { scheduleRuleHandler } from "./rules/scheduleRule";

// ─── Types ───────────────────────────────────────────────

export interface RuleEvalContext {
	eventPayload?: Record<string, unknown>;
	eventType?: string;
	mortgageId?: Id<"mortgages">;
	rule: Doc<"collectionRules">;
}

export interface RuleHandler {
	evaluate(ctx: ActionCtx, evalCtx: RuleEvalContext): Promise<void>;
}

// ─── Handler Registry ────────────────────────────────────

const ruleHandlerRegistry: Partial<Record<CollectionRuleKind, RuleHandler>> = {
	schedule: scheduleRuleHandler,
	retry: retryRuleHandler,
	late_fee: lateFeeRuleHandler,
};

// ─── Engine Action ───────────────────────────────────────

/**
 * Evaluates all enabled collection rules matching the given trigger.
 * Rules are executed in priority order (ascending) as returned by getEnabledRules.
 */
export const evaluateRules = internalAction({
	args: {
		trigger: v.union(v.literal("schedule"), v.literal("event")),
		mortgageId: v.optional(v.id("mortgages")),
		eventType: v.optional(v.string()),
		eventPayload: v.optional(v.any()),
	},
	handler: async (ctx, args) => {
		const rules = await ctx.runQuery(
			internal.payments.collectionPlan.queries.getEnabledRules,
			{
				asOfMs: Date.now(),
				mortgageId: args.mortgageId,
				trigger: args.trigger,
			}
		);

		for (const rule of rules) {
			const ruleKind = getCollectionRuleKind(rule);
			if (!ruleKind) {
				console.warn(
					`[rules-engine] Rule ${getCollectionRuleCode(rule)} has no resolvable kind`
				);
				continue;
			}

			const handler = ruleHandlerRegistry[ruleKind];
			if (!handler) {
				console.warn(
					`[rules-engine] No handler registered for kind=${ruleKind} code=${getCollectionRuleCode(rule)}`
				);
				continue;
			}

			await handler.evaluate(ctx, {
				rule,
				mortgageId: args.mortgageId,
				eventType: args.eventType,
				eventPayload: args.eventPayload as Record<string, unknown> | undefined,
			});
		}
	},
});
