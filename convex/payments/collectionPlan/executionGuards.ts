import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import {
	buildNotEligibleResult,
	buildRejectedResult,
	type ExecutePlanEntryArgs,
	type ExecutePlanEntryResult,
	type PlanEntryStatus,
} from "./executionContract";

const COLLECTIBLE_OBLIGATION_STATUSES = new Set([
	"due",
	"overdue",
	"partially_settled",
]);

export interface LoadedExecutionPlanEntry {
	currentPlanEntryStatus: PlanEntryStatus;
	existingAttempt: Doc<"collectionAttempts"> | null;
	obligations: Doc<"obligations">[];
	planEntry: Doc<"collectionPlanEntries">;
}

export async function loadExecutionPlanEntry(
	ctx: MutationCtx,
	planEntryId: Id<"collectionPlanEntries">
): Promise<LoadedExecutionPlanEntry | null> {
	const planEntry = await ctx.db.get(planEntryId);
	if (!planEntry) {
		return null;
	}

	let existingAttempt: Doc<"collectionAttempts"> | null = null;
	if (planEntry.collectionAttemptId) {
		existingAttempt = await ctx.db.get(planEntry.collectionAttemptId);
	}

	if (!existingAttempt) {
		existingAttempt =
			(await ctx.db
				.query("collectionAttempts")
				.withIndex("by_plan_entry", (q) => q.eq("planEntryId", planEntryId))
				.first()) ?? null;
	}

	const obligations: Doc<"obligations">[] = [];
	for (const obligationId of planEntry.obligationIds) {
		const obligation = await ctx.db.get(obligationId);
		if (!obligation) {
			return {
				planEntry,
				obligations: [],
				existingAttempt,
				currentPlanEntryStatus: planEntry.status,
			};
		}
		obligations.push(obligation);
	}

	return {
		planEntry,
		obligations,
		existingAttempt,
		currentPlanEntryStatus: planEntry.status,
	};
}

export function classifyExecutionEligibility(args: {
	executionRecordedAt: number;
	idempotencyKey: string;
	loaded: LoadedExecutionPlanEntry;
	request: ExecutePlanEntryArgs;
}): ExecutePlanEntryResult | null {
	const { executionRecordedAt, idempotencyKey, loaded, request } = args;
	const { existingAttempt, obligations, planEntry } = loaded;

	if (obligations.length !== planEntry.obligationIds.length) {
		return buildRejectedResult({
			executionRecordedAt,
			idempotencyKey,
			planEntryId: planEntry._id,
			planEntryStatusAfter: planEntry.status,
			reasonCode: "obligation_not_found",
			reasonDetail:
				"One or more obligations linked to the collection plan entry could not be loaded.",
		});
	}

	if (existingAttempt) {
		return null;
	}

	if (request.dryRun) {
		return null;
	}

	if (planEntry.status !== "planned") {
		return buildNotEligibleResult({
			executionRecordedAt,
			idempotencyKey,
			planEntryId: planEntry._id,
			planEntryStatusAfter: planEntry.status,
			reasonCode: "plan_entry_not_executable_state",
			reasonDetail: `Plan entry is in status "${planEntry.status}" and cannot be executed.`,
		});
	}

	if (planEntry.scheduledDate > request.requestedAt) {
		return buildNotEligibleResult({
			executionRecordedAt,
			idempotencyKey,
			planEntryId: planEntry._id,
			planEntryStatusAfter: planEntry.status,
			reasonCode: "plan_entry_not_due",
			reasonDetail:
				"Plan entry is scheduled for a future time and is not yet executable.",
		});
	}

	const nonCollectible = obligations.find(
		(obligation) => !COLLECTIBLE_OBLIGATION_STATUSES.has(obligation.status)
	);
	if (nonCollectible) {
		return buildNotEligibleResult({
			executionRecordedAt,
			idempotencyKey,
			planEntryId: planEntry._id,
			planEntryStatusAfter: planEntry.status,
			reasonCode: "obligation_not_collectible",
			reasonDetail: `Obligation ${nonCollectible._id} is in status "${nonCollectible.status}" and is not collectible.`,
		});
	}

	return null;
}
