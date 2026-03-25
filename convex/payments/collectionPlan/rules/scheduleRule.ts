import { internal } from "../../../_generated/api";
import type { ActionCtx } from "../../../_generated/server";
import type { RuleEvalContext, RuleHandler } from "../engine";

const MS_PER_DAY = 86_400_000;

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

		const dueBefore = Date.now() + delayDays * MS_PER_DAY;

		const obligations = await ctx.runQuery(
			internal.obligations.queries.getUpcomingInWindow,
			{ mortgageId: evalCtx.mortgageId, dueBefore }
		);

		if (obligations.length === 0) {
			return;
		}

		// Batch idempotency check: load planned entries once for all obligations
		const coveredObligations = await ctx.runQuery(
			internal.payments.collectionPlan.queries.getPlannedEntriesForObligations,
			{ obligationIds: obligations.map((o) => o._id) }
		);

		for (const obligation of obligations) {
			// Skip if a plan entry already covers this obligation
			if (obligation._id in coveredObligations) {
				continue;
			}

			await ctx.runMutation(
				internal.payments.collectionPlan.mutations.createEntry,
				{
					obligationIds: [obligation._id],
					amount: obligation.amount,
					method: "manual",
					scheduledDate: obligation.dueDate - delayDays * MS_PER_DAY,
					status: "planned",
					source: "default_schedule",
					ruleId: evalCtx.rule._id,
				}
			);
		}
	},
};
