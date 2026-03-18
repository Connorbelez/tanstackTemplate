import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { internalAction } from "../../_generated/server";
import type { TransitionResult } from "../../engine/types";

/**
 * Batch size for processing obligations per phase.
 * Limits the number of obligations processed in a single cron invocation
 * to avoid exceeding Convex query result / CPU / cron timeout limits.
 * If more obligations remain, the cron will pick them up on its next run.
 */
const BATCH_SIZE = 100;

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

		let becameDueCount = 0;
		let becameDueRejectedCount = 0;
		for (const obligation of newlyDue) {
			try {
				const result: TransitionResult = await ctx.runMutation(
					internal.engine.commands.transitionObligation,
					{
						entityId: obligation._id as Id<"obligations">,
						eventType: "BECAME_DUE",
						payload: {},
						source,
					}
				);
				if (result.success) {
					becameDueCount++;
				} else {
					becameDueRejectedCount++;
					console.warn(
						`[Obligation Cron] BECAME_DUE rejected for ${obligation._id}: ${result.reason ?? "unknown reason"}`
					);
				}
			} catch (error) {
				console.error(
					`[Obligation Cron] Failed BECAME_DUE for ${obligation._id}:`,
					error
				);
			}
		}

		// ── Phase 2: due → overdue ───────────────────────────────────
		const allPastGrace = await ctx.runQuery(
			internal.payments.obligations.queries.getDuePastGrace,
			{ asOf: now }
		);

		// Limit to BATCH_SIZE to stay within Convex action limits
		const pastGrace = allPastGrace.slice(0, BATCH_SIZE);

		let gracePeriodExpiredCount = 0;
		let gracePeriodExpiredRejectedCount = 0;
		for (const obligation of pastGrace) {
			try {
				const result: TransitionResult = await ctx.runMutation(
					internal.engine.commands.transitionObligation,
					{
						entityId: obligation._id as Id<"obligations">,
						eventType: "GRACE_PERIOD_EXPIRED",
						payload: {},
						source,
					}
				);
				if (result.success) {
					gracePeriodExpiredCount++;
				} else {
					gracePeriodExpiredRejectedCount++;
					console.warn(
						`[Obligation Cron] GRACE_PERIOD_EXPIRED rejected for ${obligation._id}: ${result.reason ?? "unknown reason"}`
					);
				}
			} catch (error) {
				console.error(
					`[Obligation Cron] Failed GRACE_PERIOD_EXPIRED for ${obligation._id}:`,
					error
				);
			}
		}

		console.info(
			"[Obligation Cron] Completed: " +
				`${becameDueCount}/${newlyDue.length} BECAME_DUE succeeded` +
				(becameDueRejectedCount > 0
					? ` (${becameDueRejectedCount} rejected)`
					: "") +
				`, ${gracePeriodExpiredCount}/${pastGrace.length} GRACE_PERIOD_EXPIRED succeeded` +
				(gracePeriodExpiredRejectedCount > 0
					? ` (${gracePeriodExpiredRejectedCount} rejected)`
					: "") +
				(allNewlyDue.length > BATCH_SIZE || allPastGrace.length > BATCH_SIZE
					? ` [BATCH_SIZE=${BATCH_SIZE} applied — remaining obligations will be processed on next run]`
					: "")
		);
	},
});
