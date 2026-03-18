import { internalAction } from "../../_generated/server";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";

/**
 * Daily cron handler: transitions obligations through lifecycle stages.
 *
 * Phase 1: upcoming → due (BECAME_DUE) for obligations where dueDate <= now
 * Phase 2: due → overdue (GRACE_PERIOD_EXPIRED) for obligations where gracePeriodEnd <= now
 *
 * Each transition fires independently through the GT engine. Failures are
 * logged but do not abort the batch — the GT engine's idempotency guarantees
 * that re-running on the same obligation in the wrong state is a safe no-op.
 */
export const processObligationTransitions = internalAction({
	handler: async (ctx) => {
		const now = Date.now();
		const source = {
			channel: "scheduler" as const,
			actorType: "system" as const,
		};

		// ── Phase 1: upcoming → due ──────────────────────────────────
		const newlyDue = await ctx.runQuery(
			internal.payments.obligations.queries.getUpcomingDue,
			{ asOf: now }
		);

		let becameDueCount = 0;
		for (const obligation of newlyDue) {
			try {
				await ctx.runMutation(
					internal.engine.commands.transitionObligation,
					{
						entityId: obligation._id as Id<"obligations">,
						eventType: "BECAME_DUE",
						payload: {},
						source,
					}
				);
				becameDueCount++;
			} catch (error) {
				console.error(
					`[Obligation Cron] Failed BECAME_DUE for ${obligation._id}:`,
					error
				);
			}
		}

		// ── Phase 2: due → overdue ───────────────────────────────────
		const pastGrace = await ctx.runQuery(
			internal.payments.obligations.queries.getDuePastGrace,
			{ asOf: now }
		);

		let gracePeriodExpiredCount = 0;
		for (const obligation of pastGrace) {
			try {
				await ctx.runMutation(
					internal.engine.commands.transitionObligation,
					{
						entityId: obligation._id as Id<"obligations">,
						eventType: "GRACE_PERIOD_EXPIRED",
						payload: {},
						source,
					}
				);
				gracePeriodExpiredCount++;
			} catch (error) {
				console.error(
					`[Obligation Cron] Failed GRACE_PERIOD_EXPIRED for ${obligation._id}:`,
					error
				);
			}
		}

		console.info(
			`[Obligation Cron] Completed: ${becameDueCount}/${newlyDue.length} BECAME_DUE, ` +
				`${gracePeriodExpiredCount}/${pastGrace.length} GRACE_PERIOD_EXPIRED`
		);
	},
});
