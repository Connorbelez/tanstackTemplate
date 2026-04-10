import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";

type PlanEntryExecutionSafetyShape = Pick<
	Doc<"collectionPlanEntries">,
	| "_id"
	| "balancePreCheckDecision"
	| "balancePreCheckNextEvaluationAt"
	| "collectionAttemptId"
	| "scheduledDate"
>;

export function isPlanEntryDueForExecution(
	planEntry: Pick<
		Doc<"collectionPlanEntries">,
		| "balancePreCheckDecision"
		| "balancePreCheckNextEvaluationAt"
		| "scheduledDate"
	>,
	requestedAt: number
) {
	if (planEntry.scheduledDate > requestedAt) {
		return false;
	}

	if (
		planEntry.balancePreCheckDecision === "suppress" ||
		planEntry.balancePreCheckDecision === "require_operator_review"
	) {
		return false;
	}

	if (planEntry.balancePreCheckDecision === "defer") {
		return (
			planEntry.balancePreCheckNextEvaluationAt === undefined ||
			planEntry.balancePreCheckNextEvaluationAt <= requestedAt
		);
	}

	return true;
}

export async function findLinkedCollectionAttemptId(
	ctx: Pick<MutationCtx, "db">,
	planEntry: PlanEntryExecutionSafetyShape
): Promise<Id<"collectionAttempts"> | undefined> {
	if (planEntry.collectionAttemptId) {
		return planEntry.collectionAttemptId;
	}

	return (
		(
			await ctx.db
				.query("collectionAttempts")
				.withIndex("by_plan_entry", (q) => q.eq("planEntryId", planEntry._id))
				.first()
		)?._id ?? undefined
	);
}
