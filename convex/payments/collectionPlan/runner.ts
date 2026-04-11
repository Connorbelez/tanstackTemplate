import { v } from "convex/values";
import { internal } from "../../_generated/api";
import type { Doc } from "../../_generated/dataModel";
import { internalAction } from "../../_generated/server";

const DEFAULT_BATCH_SIZE = 25;
const MAX_BATCH_SIZE = 100;

function clampBatchSize(batchSize: number | undefined) {
	return Math.max(1, Math.min(batchSize ?? DEFAULT_BATCH_SIZE, MAX_BATCH_SIZE));
}

function buildSchedulerExecutionIdempotencyKey(planEntryId: string) {
	return `collection-plan-runner:${planEntryId}`;
}

interface DuePlanEntriesSummary {
	alreadyExecutedCount: number;
	attemptCreatedCount: number;
	attemptedCount: number;
	batchSize: number;
	handoffFailureCount: number;
	noopCount: number;
	notEligibleCount: number;
	rejectedCount: number;
	requestedAt: number;
	selectedCount: number;
}

export const processDuePlanEntries = internalAction({
	args: {
		asOf: v.optional(v.number()),
		batchSize: v.optional(v.number()),
		mortgageId: v.optional(v.id("mortgages")),
	},
	handler: async (ctx, args): Promise<DuePlanEntriesSummary> => {
		const requestedAt = args.asOf ?? Date.now();
		const batchSize = clampBatchSize(args.batchSize);
		const dueEntries: Doc<"collectionPlanEntries">[] = await ctx.runQuery(
			internal.payments.collectionPlan.queries.getDuePlannedEntries,
			{
				asOf: requestedAt,
				limit: batchSize,
				mortgageId: args.mortgageId,
			}
		);

		const summary: DuePlanEntriesSummary = {
			requestedAt,
			batchSize,
			selectedCount: dueEntries.length,
			attemptedCount: 0,
			attemptCreatedCount: 0,
			alreadyExecutedCount: 0,
			notEligibleCount: 0,
			rejectedCount: 0,
			noopCount: 0,
			handoffFailureCount: 0,
		};

		for (const entry of dueEntries) {
			summary.attemptedCount += 1;

			try {
				const result = await ctx.runAction(
					internal.payments.collectionPlan.execution.executePlanEntry,
					{
						planEntryId: entry._id,
						triggerSource: "system_scheduler",
						requestedAt,
						idempotencyKey: buildSchedulerExecutionIdempotencyKey(
							`${entry._id}`
						),
						requestedByActorType: "system",
						requestedByActorId: "collection-plan-runner",
					}
				);

				switch (result.outcome) {
					case "attempt_created":
						summary.attemptCreatedCount += 1;
						if (result.reasonCode === "transfer_handoff_failed") {
							summary.handoffFailureCount += 1;
						}
						break;
					case "already_executed":
						summary.alreadyExecutedCount += 1;
						break;
					case "not_eligible":
						summary.notEligibleCount += 1;
						break;
					case "rejected":
						summary.rejectedCount += 1;
						break;
					case "noop":
						summary.noopCount += 1;
						break;
					default:
						break;
				}
			} catch (error) {
				console.error(
					"[collection-plan-runner] failed to execute due plan entry",
					{
						error,
						planEntryId: `${entry._id}`,
					}
				);
			}
		}

		console.info(
			"[collection-plan-runner] processed due plan entries",
			summary
		);
		return summary;
	},
});
