import { internal } from "../../../_generated/api";
import type { Id } from "../../../_generated/dataModel";
import type { ActionCtx } from "../../../_generated/server";
import type { RuleEvalContext, RuleHandler } from "../engine";

const MS_PER_DAY = 86_400_000;

interface CollectionFailedPayload {
	amount: number;
	method: string;
	obligationIds: Id<"obligations">[];
	planEntryId: Id<"collectionPlanEntries">;
	retryCount: number;
}

/**
 * RetryRule: on a COLLECTION_FAILED event, schedules a retry plan entry
 * with exponential backoff up to a configurable max retry count.
 */
export const retryRuleHandler: RuleHandler = {
	async evaluate(ctx: ActionCtx, evalCtx: RuleEvalContext): Promise<void> {
		if (evalCtx.eventType !== "COLLECTION_FAILED") {
			return;
		}

		const params = evalCtx.rule.parameters as
			| { maxRetries?: number; backoffBaseDays?: number }
			| undefined;
		const maxRetries = params?.maxRetries ?? 3;
		const backoffBaseDays = params?.backoffBaseDays ?? 3;

		const payload = evalCtx.eventPayload as CollectionFailedPayload | undefined;
		if (!payload) {
			console.warn("[retry-rule] Missing eventPayload for COLLECTION_FAILED");
			return;
		}

		const {
			planEntryId,
			obligationIds,
			amount,
			method,
			retryCount = 0,
		} = payload;

		if (retryCount >= maxRetries) {
			return;
		}

		const delayMs = backoffBaseDays * 2 ** retryCount * MS_PER_DAY;

		await ctx.runMutation(
			internal.payments.collectionPlan.mutations.createEntry,
			{
				obligationIds,
				amount,
				method,
				scheduledDate: Date.now() + delayMs,
				status: "planned",
				source: "retry_rule",
				ruleId: evalCtx.rule._id,
				rescheduledFromId: planEntryId,
			}
		);
	},
};
