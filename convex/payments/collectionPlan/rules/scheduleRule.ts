import { internal } from "../../../_generated/api";
import type { Id } from "../../../_generated/dataModel";
import type { ActionCtx } from "../../../_generated/server";
import type { RuleEvalContext, RuleHandler } from "../engine";

/**
 * ScheduleRule: scans upcoming obligations within a rolling window and
 * creates "planned" collection plan entries for each one that doesn't
 * already have an entry. Runs on the "schedule" trigger.
 */
export const scheduleRuleHandler: RuleHandler = {
	async evaluate(ctx: ActionCtx, evalCtx: RuleEvalContext): Promise<void> {
		const params = evalCtx.rule.parameters as
			| { delayDays?: number }
			| undefined;
		const delayDays = params?.delayDays ?? 5;

		await ctx.runMutation(
			internal.payments.collectionPlan.mutations.scheduleInitialEntries,
			{
				mortgageId: evalCtx.mortgageId as Id<"mortgages"> | undefined,
				delayDays,
				ruleId: evalCtx.rule._id,
			}
		);
	},
};
