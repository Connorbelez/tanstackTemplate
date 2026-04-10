import { internal } from "../../../_generated/api";
import type { Id } from "../../../_generated/dataModel";
import type { ActionCtx } from "../../../_generated/server";
import type { RuleEvalContext, RuleHandler } from "../engine";
import { getRetryRuleConfig } from "../ruleContract";

const MS_PER_DAY = 86_400_000;

interface CollectionFailedPayload {
	amount: number;
	method: string;
	obligationIds: Id<"obligations">[];
	planEntryId: Id<"collectionPlanEntries">;
	retryCount: number;
	workoutPlanId?: Id<"workoutPlans">;
}

/**
 * RetryRule: on a COLLECTION_FAILED event, schedules a retry plan entry
 * with exponential backoff up to a configurable max retry count.
 *
 * Idempotent: queries for an existing retry entry rescheduled from the same
 * plan entry before inserting, so duplicate event deliveries are safe.
 */
export const retryRuleHandler: RuleHandler = {
	async evaluate(ctx: ActionCtx, evalCtx: RuleEvalContext): Promise<void> {
		if (evalCtx.eventType !== "COLLECTION_FAILED") {
			return;
		}

		const config = getRetryRuleConfig(evalCtx.rule);
		if (!config) {
			console.warn(
				`[retry-rule] Missing typed config for rule ${String(evalCtx.rule._id)}`
			);
			return;
		}
		const { backoffBaseDays, maxRetries } = config;

		const payload = evalCtx.eventPayload as
			| Partial<CollectionFailedPayload>
			| undefined;
		if (!payload || typeof payload !== "object") {
			console.warn("[retry-rule] Missing eventPayload for COLLECTION_FAILED");
			return;
		}

		if (
			typeof payload.planEntryId !== "string" ||
			!Array.isArray(payload.obligationIds) ||
			typeof payload.amount !== "number" ||
			typeof payload.method !== "string" ||
			(payload.retryCount !== undefined &&
				typeof payload.retryCount !== "number") ||
			(payload.workoutPlanId !== undefined &&
				typeof payload.workoutPlanId !== "string")
		) {
			console.warn(
				"[retry-rule] Invalid COLLECTION_FAILED payload: missing or malformed required fields",
				{
					hasPlanEntryId: typeof payload.planEntryId,
					hasObligationIds: Array.isArray(payload.obligationIds),
					hasAmount: typeof payload.amount,
					hasMethod: typeof payload.method,
					hasRetryCount: typeof payload.retryCount,
					hasWorkoutPlanId: typeof payload.workoutPlanId,
				}
			);
			return;
		}

		const {
			planEntryId,
			obligationIds,
			amount,
			method,
			retryCount = 0,
			workoutPlanId,
		} = payload as CollectionFailedPayload;

		if (retryCount >= maxRetries) {
			return;
		}

		// Idempotency: skip if a retry entry already exists for this plan entry
		const existingRetry = await ctx.runQuery(
			internal.payments.collectionPlan.queries.getRetryEntryForPlanEntry,
			{ planEntryId }
		);

		if (existingRetry) {
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
				createdByRuleId: evalCtx.rule._id,
				workoutPlanId,
				retryOfId: planEntryId,
			}
		);
	},
};
