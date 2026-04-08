import { internal } from "../../../_generated/api";
import type { Id } from "../../../_generated/dataModel";
import type { ActionCtx } from "../../../_generated/server";
import type { RuleEvalContext, RuleHandler } from "../engine";
import { getScheduleRuleConfig } from "../ruleContract";

/**
 * ScheduleRule: scans upcoming obligations within a rolling window and
 * creates "planned" collection plan entries for each one that doesn't
 * already have an entry. Runs on the "schedule" trigger.
 */
export const scheduleRuleHandler: RuleHandler = {
	async evaluate(ctx: ActionCtx, evalCtx: RuleEvalContext): Promise<void> {
		const config = getScheduleRuleConfig(evalCtx.rule);
		if (!config) {
			console.warn(
				`[schedule-rule] Missing typed config for rule ${String(evalCtx.rule._id)}`
			);
			return;
		}

		await ctx.runMutation(
			internal.payments.collectionPlan.mutations.scheduleInitialEntries,
			{
				mortgageId: evalCtx.mortgageId as Id<"mortgages"> | undefined,
				delayDays: config.delayDays,
				createdByRuleId: evalCtx.rule._id,
			}
		);
	},
};
