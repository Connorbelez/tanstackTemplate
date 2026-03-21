import type { GenericActionCtx, GenericDataModel } from "convex/server";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { internalAction } from "../../_generated/server";
import type { TransitionResult } from "../../engine/types";
import { unixMsToBusinessDate } from "../../lib/businessDates";

/**
 * Batch size for processing obligations per phase.
 * Limits the number of obligations processed in a single cron invocation
 * to avoid exceeding Convex query result / CPU / cron timeout limits.
 * If more obligations remain, the cron will pick them up on its next run.
 */
const BATCH_SIZE = 100;
const JOB_NAME = "daily obligation transitions";
type CronActionCtx = Pick<GenericActionCtx<GenericDataModel>, "runMutation">;
interface CronSource {
	actorType: "system";
	channel: "scheduler";
}

async function processTransitionBatch(
	ctx: CronActionCtx,
	obligations: Array<{ _id: Id<"obligations"> }>,
	eventType: "BECAME_DUE" | "GRACE_PERIOD_EXPIRED",
	source: CronSource
) {
	let successCount = 0;
	let rejectedCount = 0;

	for (const obligation of obligations) {
		try {
			const result: TransitionResult = await ctx.runMutation(
				internal.engine.commands.transitionObligation,
				{
					entityId: obligation._id,
					eventType,
					payload: {},
					source,
				}
			);
			if (result.success) {
				successCount++;
			} else {
				rejectedCount++;
				console.warn(
					`[Obligation Cron] ${eventType} rejected for ${obligation._id}: ${result.reason ?? "unknown reason"}`
				);
			}
		} catch (error) {
			console.error(
				`[Obligation Cron] Failed ${eventType} for ${obligation._id}:`,
				error
			);
		}
	}

	return { successCount, rejectedCount };
}

function logOverflowWarnings(args: {
	allNewlyDueCount: number;
	allPastGraceCount: number;
	batchSize: number;
	businessDate: string;
	newlyDueOverflow: boolean;
	pastGraceOverflow: boolean;
	newlyDueOverflowStreak: number;
	pastGraceOverflowStreak: number;
}) {
	if (args.newlyDueOverflow) {
		console.warn(
			`[Obligation Cron] BECAME_DUE batch overflow on ${args.businessDate}: ${args.allNewlyDueCount} obligations exceeded BATCH_SIZE=${args.batchSize} (streak=${args.newlyDueOverflowStreak})`
		);
	}
	if (args.pastGraceOverflow) {
		console.warn(
			`[Obligation Cron] GRACE_PERIOD_EXPIRED batch overflow on ${args.businessDate}: ${args.allPastGraceCount} obligations exceeded BATCH_SIZE=${args.batchSize} (streak=${args.pastGraceOverflowStreak})`
		);
	}
}

function logOverflowAlerts(args: {
	businessDate: string;
	newlyDueOverflowStreak: number;
	pastGraceOverflowStreak: number;
}) {
	if (args.newlyDueOverflowStreak > 3) {
		console.error(
			`[Obligation Cron] ALERT: BECAME_DUE overflow persisted for ${args.newlyDueOverflowStreak} consecutive UTC business days (job=${JOB_NAME}, businessDate=${args.businessDate})`
		);
	}
	if (args.pastGraceOverflowStreak > 3) {
		console.error(
			`[Obligation Cron] ALERT: GRACE_PERIOD_EXPIRED overflow persisted for ${args.pastGraceOverflowStreak} consecutive UTC business days (job=${JOB_NAME}, businessDate=${args.businessDate})`
		);
	}
}

function formatCompletionLog(args: {
	becameDueCount: number;
	newlyDueLength: number;
	becameDueRejectedCount: number;
	gracePeriodExpiredCount: number;
	pastGraceLength: number;
	gracePeriodExpiredRejectedCount: number;
	allNewlyDueCount: number;
	allPastGraceCount: number;
	businessDate: string;
}) {
	return (
		"[Obligation Cron] Completed: " +
		`${args.becameDueCount}/${args.newlyDueLength} BECAME_DUE succeeded` +
		(args.becameDueRejectedCount > 0
			? ` (${args.becameDueRejectedCount} rejected)`
			: "") +
		`, ${args.gracePeriodExpiredCount}/${args.pastGraceLength} GRACE_PERIOD_EXPIRED succeeded` +
		(args.gracePeriodExpiredRejectedCount > 0
			? ` (${args.gracePeriodExpiredRejectedCount} rejected)`
			: "") +
		(args.allNewlyDueCount > BATCH_SIZE || args.allPastGraceCount > BATCH_SIZE
			? ` [BATCH_SIZE=${BATCH_SIZE} applied — remaining obligations will be processed on next run]`
			: "") +
		` [businessDate=${args.businessDate}]`
	);
}

/**
 * Daily cron handler: transitions obligations through lifecycle stages.
 *
 * Phase 1: upcoming → due (BECAME_DUE) for obligations where dueDate <= now
 * Phase 2: due → overdue (GRACE_PERIOD_EXPIRED) for obligations where gracePeriodEnd <= now
 *
 * Each transition fires independently through the GT engine. Failures are
 * logged but do not abort the batch. Note that the GT engine records a
 * rejected audit journal entry and returns `success: false` for events sent
 * to obligations in an incompatible state — these rejections are tracked
 * and logged separately from thrown errors.
 */
export const processObligationTransitions = internalAction({
	handler: async (ctx) => {
		const now = Date.now();
		const businessDate = unixMsToBusinessDate(now);
		const source = {
			channel: "scheduler" as const,
			actorType: "system" as const,
		};

		// ── Phase 1: upcoming → due ──────────────────────────────────
		const allNewlyDue = await ctx.runQuery(
			internal.payments.obligations.queries.getUpcomingDue,
			{ asOf: now }
		);

		// Limit to BATCH_SIZE to stay within Convex action limits
		const newlyDue = allNewlyDue.slice(0, BATCH_SIZE);
		const {
			successCount: becameDueCount,
			rejectedCount: becameDueRejectedCount,
		} = await processTransitionBatch(ctx, newlyDue, "BECAME_DUE", source);

		// ── Phase 2: due → overdue ───────────────────────────────────
		const allPastGrace = await ctx.runQuery(
			internal.payments.obligations.queries.getDuePastGrace,
			{ asOf: now }
		);

		// Limit to BATCH_SIZE to stay within Convex action limits
		const pastGrace = allPastGrace.slice(0, BATCH_SIZE);
		const {
			successCount: gracePeriodExpiredCount,
			rejectedCount: gracePeriodExpiredRejectedCount,
		} = await processTransitionBatch(
			ctx,
			pastGrace,
			"GRACE_PERIOD_EXPIRED",
			source
		);

		const overflowMetrics = await ctx.runMutation(
			internal["payments/obligations/monitoring"].recordBatchOverflowMetrics,
			{
				jobName: JOB_NAME,
				businessDate,
				batchSize: BATCH_SIZE,
				newlyDueCount: allNewlyDue.length,
				pastGraceCount: allPastGrace.length,
			}
		);

		logOverflowWarnings({
			allNewlyDueCount: allNewlyDue.length,
			allPastGraceCount: allPastGrace.length,
			batchSize: BATCH_SIZE,
			businessDate,
			newlyDueOverflow: overflowMetrics.newlyDueOverflow,
			pastGraceOverflow: overflowMetrics.pastGraceOverflow,
			newlyDueOverflowStreak: overflowMetrics.newlyDueOverflowStreak,
			pastGraceOverflowStreak: overflowMetrics.pastGraceOverflowStreak,
		});

		if (!overflowMetrics.isSameBusinessDate) {
			logOverflowAlerts({
				businessDate,
				newlyDueOverflowStreak: overflowMetrics.newlyDueOverflowStreak,
				pastGraceOverflowStreak: overflowMetrics.pastGraceOverflowStreak,
			});
		}

		console.info(
			formatCompletionLog({
				becameDueCount,
				newlyDueLength: newlyDue.length,
				becameDueRejectedCount,
				gracePeriodExpiredCount,
				pastGraceLength: pastGrace.length,
				gracePeriodExpiredRejectedCount,
				allNewlyDueCount: allNewlyDue.length,
				allPastGraceCount: allPastGrace.length,
				businessDate,
			})
		);
	},
});
