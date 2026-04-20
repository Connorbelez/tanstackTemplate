import type { GenericActionCtx, GenericDataModel } from "convex/server";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { internalAction } from "../../_generated/server";
import type { TransitionResult } from "../../engine/types";
import { unixMsToBusinessDate } from "../../lib/businessDates";

/**
 * Batch size for processing obligations per phase.
 * Limits how many obligations are transitioned per phase **per wave** to
 * avoid oversized single queries and to keep each transition batch bounded.
 *
 * When more than `BATCH_SIZE` rows exist in either phase, this action runs
 * additional **waves** in the same cron invocation until the backlog clears or
 * {@link MAX_WAVES_PER_CRON_RUN} is reached (then logs an alert; remainder
 * waits for the next day's cron).
 */
const BATCH_SIZE = 100;
/** Upper bound on waves per single `processObligationTransitions` run (100×500 = 50k per phase). */
const MAX_WAVES_PER_CRON_RUN = 500;
const JOB_NAME = "daily obligation transitions";
type CronActionCtx = Pick<
	GenericActionCtx<GenericDataModel>,
	"runMutation" | "runQuery"
>;
interface CronSource {
	actorType: "system";
	channel: "scheduler";
}

type ObligationTransitionEventType = "BECAME_DUE" | "GRACE_PERIOD_EXPIRED";

interface OverflowMetricsRecord {
	isSameBusinessDate: boolean;
	newlyDueOverflow: boolean;
	newlyDueOverflowStreak: number;
	pastGraceOverflow: boolean;
	pastGraceOverflowStreak: number;
}

interface ExistingOverflowMetrics {
	lastRunBusinessDate: string;
}

interface ProcessObligationTransitionsDeps {
	getBatchOverflowMetrics: (
		jobName: string
	) => Promise<ExistingOverflowMetrics | null>;
	getDuePastGrace: (asOf: number) => Promise<Array<{ _id: Id<"obligations"> }>>;
	getUpcomingDue: (asOf: number) => Promise<Array<{ _id: Id<"obligations"> }>>;
	logError: (...args: unknown[]) => void;
	logInfo: (message: string) => void;
	logWarn: (...args: unknown[]) => void;
	recordBatchOverflowMetrics: (args: {
		jobName: string;
		businessDate: string;
		batchSize: number;
		newlyDueCount: number;
		pastGraceCount: number;
	}) => Promise<OverflowMetricsRecord>;
	transitionObligation: (args: {
		entityId: Id<"obligations">;
		eventType: ObligationTransitionEventType;
		payload: Record<string, never>;
		source: CronSource;
	}) => Promise<TransitionResult>;
}

function createProcessObligationTransitionsDeps(
	ctx: CronActionCtx
): ProcessObligationTransitionsDeps {
	return {
		getBatchOverflowMetrics: (jobName) =>
			ctx.runQuery(
				internal.payments.obligations.monitoring.getBatchOverflowMetrics,
				{
					jobName,
				}
			),
		getDuePastGrace: (asOf) =>
			ctx.runQuery(internal.payments.obligations.queries.getDuePastGrace, {
				asOf,
			}),
		getUpcomingDue: (asOf) =>
			ctx.runQuery(internal.payments.obligations.queries.getUpcomingDue, {
				asOf,
			}),
		logError: (...args) => console.error(...args),
		logInfo: (message) => console.info(message),
		logWarn: (...args) => console.warn(...args),
		recordBatchOverflowMetrics: (args) =>
			ctx.runMutation(
				internal.payments.obligations.monitoring.recordBatchOverflowMetrics,
				args
			),
		transitionObligation: (args) =>
			ctx.runMutation(internal.engine.commands.transitionObligation, args),
	};
}

async function recordZeroOverflowMetricsForIdleBusinessDay(
	deps: Pick<
		ProcessObligationTransitionsDeps,
		"getBatchOverflowMetrics" | "recordBatchOverflowMetrics"
	>,
	businessDate: string
) {
	const existingMetrics = await deps.getBatchOverflowMetrics(JOB_NAME);
	if (existingMetrics?.lastRunBusinessDate === businessDate) {
		return;
	}

	await deps.recordBatchOverflowMetrics({
		jobName: JOB_NAME,
		businessDate,
		batchSize: BATCH_SIZE,
		newlyDueCount: 0,
		pastGraceCount: 0,
	});
}

async function processTransitionBatch(
	deps: Pick<
		ProcessObligationTransitionsDeps,
		"logError" | "logWarn" | "transitionObligation"
	>,
	obligations: Array<{ _id: Id<"obligations"> }>,
	eventType: ObligationTransitionEventType,
	source: CronSource
) {
	let successCount = 0;
	let rejectedCount = 0;

	for (const obligation of obligations) {
		try {
			const result = await deps.transitionObligation({
				entityId: obligation._id,
				eventType,
				payload: {},
				source,
			});
			if (result.success) {
				successCount++;
			} else {
				rejectedCount++;
				deps.logWarn(
					`[Obligation Cron] ${eventType} rejected for ${obligation._id}: ${result.reason ?? "unknown reason"}`
				);
			}
		} catch (error) {
			deps.logError(
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
	logWarn: (...args: unknown[]) => void;
}) {
	if (args.newlyDueOverflow) {
		args.logWarn(
			`[Obligation Cron] BECAME_DUE batch overflow on ${args.businessDate}: ${args.allNewlyDueCount} obligations exceeded BATCH_SIZE=${args.batchSize} (streak=${args.newlyDueOverflowStreak})`
		);
	}
	if (args.pastGraceOverflow) {
		args.logWarn(
			`[Obligation Cron] GRACE_PERIOD_EXPIRED batch overflow on ${args.businessDate}: ${args.allPastGraceCount} obligations exceeded BATCH_SIZE=${args.batchSize} (streak=${args.pastGraceOverflowStreak})`
		);
	}
}

function logOverflowAlerts(args: {
	businessDate: string;
	newlyDueOverflowStreak: number;
	pastGraceOverflowStreak: number;
	logError: (...args: unknown[]) => void;
}) {
	if (args.newlyDueOverflowStreak > 3) {
		args.logError(
			`[Obligation Cron] ALERT: BECAME_DUE overflow persisted for ${args.newlyDueOverflowStreak} consecutive UTC business days (job=${JOB_NAME}, businessDate=${args.businessDate})`
		);
	}
	if (args.pastGraceOverflowStreak > 3) {
		args.logError(
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
	waveIndex: number;
}) {
	const waveTag = args.waveIndex > 0 ? ` [wave=${args.waveIndex + 1}]` : "";
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
			? ` [BATCH_SIZE=${BATCH_SIZE} — additional waves run same cron when backlog exceeds batch]`
			: "") +
		` [businessDate=${args.businessDate}]${waveTag}`
	);
}

/**
 * Daily cron handler: transitions obligations through lifecycle stages.
 *
 * Phase 1: upcoming → due (BECAME_DUE) for obligations where dueDate <= now
 * Phase 2: due → overdue (GRACE_PERIOD_EXPIRED) for obligations where gracePeriodEnd <= now
 *
 * Repeats in **waves** (same action invocation) until both candidate lists are
 * drained or {@link MAX_WAVES_PER_CRON_RUN} is exceeded.
 *
 * Each transition fires independently through the GT engine. Failures are
 * logged but do not abort the batch. Note that the GT engine records a
 * rejected audit journal entry and returns `success: false` for events sent
 * to obligations in an incompatible state — these rejections are tracked
 * and logged separately from thrown errors.
 */
export async function processObligationTransitionsImpl(
	deps: ProcessObligationTransitionsDeps,
	options?: { now?: number }
) {
	const now = options?.now ?? Date.now();
	const businessDate = unixMsToBusinessDate(now);
	const source = {
		channel: "scheduler" as const,
		actorType: "system" as const,
	};

	let waveIndex = 0;
	let loggedFirstWaveOverflow = false;

	while (waveIndex < MAX_WAVES_PER_CRON_RUN) {
		const allNewlyDue = await deps.getUpcomingDue(now);
		const allPastGrace = await deps.getDuePastGrace(now);

		if (allNewlyDue.length === 0 && allPastGrace.length === 0) {
			if (waveIndex === 0) {
				await recordZeroOverflowMetricsForIdleBusinessDay(deps, businessDate);
			}
			break;
		}

		const newlyDue = allNewlyDue.slice(0, BATCH_SIZE);
		const {
			successCount: becameDueCount,
			rejectedCount: becameDueRejectedCount,
		} = await processTransitionBatch(deps, newlyDue, "BECAME_DUE", source);

		const pastGrace = allPastGrace.slice(0, BATCH_SIZE);
		const {
			successCount: gracePeriodExpiredCount,
			rejectedCount: gracePeriodExpiredRejectedCount,
		} = await processTransitionBatch(
			deps,
			pastGrace,
			"GRACE_PERIOD_EXPIRED",
			source
		);

		const overflowMetrics = await deps.recordBatchOverflowMetrics({
			jobName: JOB_NAME,
			businessDate,
			batchSize: BATCH_SIZE,
			newlyDueCount: allNewlyDue.length,
			pastGraceCount: allPastGrace.length,
		});

		if (
			!loggedFirstWaveOverflow &&
			(overflowMetrics.newlyDueOverflow || overflowMetrics.pastGraceOverflow)
		) {
			loggedFirstWaveOverflow = true;
			logOverflowWarnings({
				allNewlyDueCount: allNewlyDue.length,
				allPastGraceCount: allPastGrace.length,
				batchSize: BATCH_SIZE,
				businessDate,
				newlyDueOverflow: overflowMetrics.newlyDueOverflow,
				pastGraceOverflow: overflowMetrics.pastGraceOverflow,
				newlyDueOverflowStreak: overflowMetrics.newlyDueOverflowStreak,
				pastGraceOverflowStreak: overflowMetrics.pastGraceOverflowStreak,
				logWarn: deps.logWarn,
			});
		}

		if (waveIndex === 0 && !overflowMetrics.isSameBusinessDate) {
			logOverflowAlerts({
				businessDate,
				newlyDueOverflowStreak: overflowMetrics.newlyDueOverflowStreak,
				pastGraceOverflowStreak: overflowMetrics.pastGraceOverflowStreak,
				logError: deps.logError,
			});
		}

		deps.logInfo(
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
				waveIndex,
			})
		);

		const backlogExceedsBatch =
			allNewlyDue.length > BATCH_SIZE || allPastGrace.length > BATCH_SIZE;
		if (!backlogExceedsBatch) {
			break;
		}

		waveIndex += 1;
	}

	if (waveIndex >= MAX_WAVES_PER_CRON_RUN) {
		const remainingNewlyDue = await deps.getUpcomingDue(now);
		const remainingPastGrace = await deps.getDuePastGrace(now);
		if (remainingNewlyDue.length > 0 || remainingPastGrace.length > 0) {
			deps.logError(
				`[Obligation Cron] ALERT: wave cap reached (${MAX_WAVES_PER_CRON_RUN}) with remaining backlog — newlyDue=${remainingNewlyDue.length}, pastGrace=${remainingPastGrace.length}, businessDate=${businessDate}`
			);
		}
	}
}

export const processObligationTransitions = internalAction({
	handler: async (ctx) =>
		processObligationTransitionsImpl(
			createProcessObligationTransitionsDeps(ctx)
		),
});
