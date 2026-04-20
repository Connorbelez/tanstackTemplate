import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

export type MostRecentPaymentStatus =
	| "settled"
	| "processing"
	| "failed"
	| "reversed"
	| "cancelled"
	| "none";

export type NextUpcomingPaymentStatus =
	| "planned"
	| "provider_scheduled"
	| "executing"
	| "due"
	| "overdue"
	| "none";

export interface MortgagePaymentSnapshot {
	mostRecentPaymentAmount: number | null;
	mostRecentPaymentDate: number | null;
	mostRecentPaymentStatus: MostRecentPaymentStatus;
	nextUpcomingPaymentAmount: number | null;
	nextUpcomingPaymentDate: number | null;
	nextUpcomingPaymentStatus: NextUpcomingPaymentStatus;
}

type AttemptSource = Pick<
	Doc<"collectionAttempts">,
	| "_id"
	| "amount"
	| "cancelledAt"
	| "confirmedAt"
	| "failedAt"
	| "initiatedAt"
	| "reversedAt"
	| "settledAt"
	| "status"
	| "transferRequestId"
>;

type ObligationSource = Pick<
	Doc<"obligations">,
	"amount" | "dueDate" | "status"
>;

type PlanEntrySource = Pick<
	Doc<"collectionPlanEntries">,
	"amount" | "scheduledDate" | "status"
>;

type ExternalScheduleCandidate = Pick<
	Doc<"externalCollectionSchedules">,
	"_id" | "createdAt" | "nextPollAt" | "status"
>;
type ExternalScheduleSource = ExternalScheduleCandidate | null;
type MortgageSource = Pick<
	Doc<"mortgages">,
	"_id" | "activeExternalCollectionScheduleId"
>;

type TransferSource = Pick<
	Doc<"transferRequests">,
	"confirmedAt" | "failedAt" | "reversedAt" | "status"
>;
type ObligationRowSource = ObligationSource &
	Pick<Doc<"obligations">, "mortgageId">;
type PlanEntryRowSource = PlanEntrySource &
	Pick<Doc<"collectionPlanEntries">, "mortgageId">;
type AttemptRowSource = AttemptSource &
	Pick<Doc<"collectionAttempts">, "mortgageId">;
type ExternalScheduleRowSource = ExternalScheduleCandidate &
	Pick<Doc<"externalCollectionSchedules">, "mortgageId">;

// Larger table views were fanning out into one set of payment index scans per
// mortgage. Until a persisted snapshot read model lands, switch to a shared
// table scan once the batch is large enough that per-mortgage fanout is worse.
const BULK_SNAPSHOT_SCAN_THRESHOLD = 8;

const EMPTY_SNAPSHOT: MortgagePaymentSnapshot = {
	mostRecentPaymentAmount: null,
	mostRecentPaymentDate: null,
	mostRecentPaymentStatus: "none",
	nextUpcomingPaymentAmount: null,
	nextUpcomingPaymentDate: null,
	nextUpcomingPaymentStatus: "none",
};

function isTerminalExternalCollectionScheduleStatus(
	status: ExternalScheduleCandidate["status"]
) {
	return (
		status === "cancelled" ||
		status === "completed" ||
		status === "activation_failed"
	);
}

function isSettledLikeObligationStatus(status: ObligationSource["status"]) {
	return (
		status === "settled" ||
		status === "waived" ||
		status === "partially_settled"
	);
}

function toMostRecentStatusFromAttempt(args: {
	attempt: AttemptSource;
	transfer?: TransferSource | null;
}): MostRecentPaymentStatus {
	const { attempt, transfer } = args;

	if (transfer?.status === "reversed" || attempt.reversedAt !== undefined) {
		return "reversed";
	}

	if (transfer?.status === "failed" || attempt.failedAt !== undefined) {
		return "failed";
	}

	if (transfer?.status === "cancelled" || attempt.cancelledAt !== undefined) {
		return "cancelled";
	}

	if (
		transfer?.status === "confirmed" ||
		attempt.settledAt !== undefined ||
		attempt.confirmedAt !== undefined ||
		attempt.status === "confirmed"
	) {
		return "settled";
	}

	if (
		transfer?.status === "initiated" ||
		transfer?.status === "pending" ||
		transfer?.status === "processing" ||
		attempt.status === "initiated" ||
		attempt.status === "pending" ||
		attempt.status === "executing" ||
		attempt.status === "processing"
	) {
		return "processing";
	}

	if (attempt.status === "permanent_fail" || attempt.status === "failed") {
		return "failed";
	}

	if (attempt.status === "cancelled") {
		return "cancelled";
	}

	return "processing";
}

function toMostRecentStatusFromObligation(
	obligation: ObligationSource
): MostRecentPaymentStatus {
	switch (obligation.status) {
		case "settled":
		case "waived":
			return "settled";
		case "upcoming":
		case "due":
		case "overdue":
		case "partially_settled":
			return "processing";
		default:
			return "none";
	}
}

function getAttemptEffectiveTimestamp(args: {
	attempt: AttemptSource;
	transfer?: TransferSource | null;
}) {
	return (
		args.transfer?.reversedAt ??
		args.attempt.reversedAt ??
		args.transfer?.failedAt ??
		args.attempt.cancelledAt ??
		args.attempt.failedAt ??
		args.transfer?.confirmedAt ??
		args.attempt.settledAt ??
		args.attempt.confirmedAt ??
		args.attempt.initiatedAt
	);
}

function toNextUpcomingStatusFromPlanEntry(args: {
	asOf: number;
	entry: PlanEntrySource;
}): NextUpcomingPaymentStatus {
	if (args.entry.status === "executing") {
		return "executing";
	}

	if (args.entry.scheduledDate <= args.asOf) {
		return "due";
	}

	if (args.entry.status === "provider_scheduled") {
		return "provider_scheduled";
	}

	return "planned";
}

function toNextUpcomingStatusFromObligation(args: {
	asOf: number;
	obligation: ObligationSource;
}): NextUpcomingPaymentStatus {
	switch (args.obligation.status) {
		case "overdue":
			return "overdue";
		case "due":
			return "due";
		case "partially_settled":
			return "executing";
		case "upcoming":
			return args.obligation.dueDate <= args.asOf ? "due" : "planned";
		default:
			return args.obligation.dueDate <= args.asOf ? "due" : "planned";
	}
}

function sortDescendingByDate<T extends { date: number }>(left: T, right: T) {
	return right.date - left.date;
}

function sortAscendingByDate<T extends { date: number }>(left: T, right: T) {
	return left.date - right.date;
}

export function pickPreferredExternalCollectionSchedule<
	TSchedule extends ExternalScheduleCandidate,
>(args: {
	mortgage: MortgageSource | null;
	schedules: readonly TSchedule[];
}): TSchedule | null;
export function pickPreferredExternalCollectionSchedule<
	TSchedule extends ExternalScheduleCandidate,
>(args: {
	mortgage: MortgageSource | null;
	schedules: readonly TSchedule[];
}): TSchedule | null {
	if (!args.mortgage) {
		return null;
	}

	if (args.mortgage.activeExternalCollectionScheduleId) {
		const activeSchedule = args.schedules.find(
			(schedule) =>
				schedule._id === args.mortgage?.activeExternalCollectionScheduleId
		);
		if (
			activeSchedule &&
			!isTerminalExternalCollectionScheduleStatus(activeSchedule.status)
		) {
			return activeSchedule;
		}
	}

	return (
		[...args.schedules]
			.filter(
				(schedule) =>
					!isTerminalExternalCollectionScheduleStatus(schedule.status)
			)
			.sort((left, right) => right.createdAt - left.createdAt)[0] ?? null
	);
}

function buildTransfersByAttemptId(args: {
	attempts: readonly AttemptSource[];
	transfersById: ReadonlyMap<string, TransferSource | null | undefined>;
}) {
	return new Map(
		args.attempts.map((attempt) => [
			String(attempt._id),
			attempt.transferRequestId
				? (args.transfersById.get(String(attempt.transferRequestId)) ?? null)
				: null,
		])
	);
}

export function deriveMostRecentPaymentSnapshot(args: {
	attempts: readonly AttemptSource[];
	obligations: readonly ObligationSource[];
	transfersByAttemptId: ReadonlyMap<string, TransferSource | null | undefined>;
}): {
	amount: number | null;
	date: number | null;
	status: MostRecentPaymentStatus;
} {
	const latestAttempt = [...args.attempts]
		.map((attempt) => ({
			attempt,
			date: getAttemptEffectiveTimestamp({
				attempt,
				transfer: args.transfersByAttemptId.get(String(attempt._id)),
			}),
		}))
		.sort(sortDescendingByDate)[0];

	if (latestAttempt) {
		const transfer = args.transfersByAttemptId.get(
			String(latestAttempt.attempt._id)
		);
		return {
			amount: latestAttempt.attempt.amount,
			date: latestAttempt.date,
			status: toMostRecentStatusFromAttempt({
				attempt: latestAttempt.attempt,
				transfer,
			}),
		};
	}

	const latestSettledLikeObligation = args.obligations
		.filter((obligation) => isSettledLikeObligationStatus(obligation.status))
		.map((obligation) => ({ obligation, date: obligation.dueDate }))
		.sort(sortDescendingByDate)[0];
	const latestObligation =
		latestSettledLikeObligation ??
		[...args.obligations]
			.map((obligation) => ({ obligation, date: obligation.dueDate }))
			.sort(sortDescendingByDate)[0];

	if (latestObligation) {
		return {
			amount: latestObligation.obligation.amount,
			date: latestObligation.obligation.dueDate,
			status: toMostRecentStatusFromObligation(latestObligation.obligation),
		};
	}

	return {
		amount: null,
		date: null,
		status: "none",
	};
}

export function deriveNextUpcomingPaymentSnapshot(args: {
	asOf: number;
	externalSchedule: ExternalScheduleSource;
	obligations: readonly ObligationSource[];
	planEntries: readonly PlanEntrySource[];
}): {
	amount: number | null;
	date: number | null;
	status: NextUpcomingPaymentStatus;
} {
	const nextPlanEntry = [...args.planEntries]
		.filter(
			(entry) =>
				entry.status !== "completed" &&
				entry.status !== "cancelled" &&
				entry.status !== "rescheduled"
		)
		.map((entry) => ({ entry, date: entry.scheduledDate }))
		.sort(sortAscendingByDate)[0];

	if (nextPlanEntry) {
		return {
			amount: nextPlanEntry.entry.amount,
			date: nextPlanEntry.entry.scheduledDate,
			status: toNextUpcomingStatusFromPlanEntry({
				asOf: args.asOf,
				entry: nextPlanEntry.entry,
			}),
		};
	}

	if (args.externalSchedule?.nextPollAt !== undefined) {
		return {
			amount: null,
			date: args.externalSchedule.nextPollAt,
			status: "provider_scheduled",
		};
	}

	const nextObligation = [...args.obligations]
		.filter(
			(obligation) =>
				obligation.status !== "settled" && obligation.status !== "waived"
		)
		.map((obligation) => ({ obligation, date: obligation.dueDate }))
		.sort(sortAscendingByDate)[0];

	if (nextObligation) {
		return {
			amount: nextObligation.obligation.amount,
			date: nextObligation.obligation.dueDate,
			status: toNextUpcomingStatusFromObligation({
				asOf: args.asOf,
				obligation: nextObligation.obligation,
			}),
		};
	}

	return {
		amount: null,
		date: null,
		status: "none",
	};
}

export function buildMortgagePaymentSnapshot(args: {
	asOf: number;
	attempts: readonly AttemptSource[];
	mortgage: MortgageSource | null;
	obligations: readonly ObligationSource[];
	planEntries: readonly PlanEntrySource[];
	schedules: readonly ExternalScheduleCandidate[];
	transfersById: ReadonlyMap<string, TransferSource | null | undefined>;
}): MortgagePaymentSnapshot {
	const transfersByAttemptId = buildTransfersByAttemptId({
		attempts: args.attempts,
		transfersById: args.transfersById,
	});
	const mostRecent = deriveMostRecentPaymentSnapshot({
		attempts: args.attempts,
		obligations: args.obligations,
		transfersByAttemptId,
	});
	const nextUpcoming = deriveNextUpcomingPaymentSnapshot({
		asOf: args.asOf,
		externalSchedule: pickPreferredExternalCollectionSchedule({
			mortgage: args.mortgage,
			schedules: args.schedules,
		}),
		obligations: args.obligations,
		planEntries: args.planEntries,
	});

	return {
		mostRecentPaymentAmount: mostRecent.amount,
		mostRecentPaymentDate: mostRecent.date,
		mostRecentPaymentStatus: mostRecent.status,
		nextUpcomingPaymentAmount: nextUpcoming.amount,
		nextUpcomingPaymentDate: nextUpcoming.date,
		nextUpcomingPaymentStatus: nextUpcoming.status,
	};
}

function groupRowsByMortgageId<T extends { mortgageId: Id<"mortgages"> }>(
	rows: readonly T[]
) {
	const rowsByMortgageId = new Map<string, T[]>();

	for (const row of rows) {
		const mortgageId = String(row.mortgageId);
		const existingRows = rowsByMortgageId.get(mortgageId);
		if (existingRows) {
			existingRows.push(row);
			continue;
		}

		rowsByMortgageId.set(mortgageId, [row]);
	}

	return rowsByMortgageId;
}

function buildMortgagePaymentSnapshotsFromRows(args: {
	asOf: number;
	attempts: readonly AttemptRowSource[];
	mortgages: readonly MortgageSource[];
	obligations: readonly ObligationRowSource[];
	planEntries: readonly PlanEntryRowSource[];
	schedules: readonly ExternalScheduleRowSource[];
	transfersById: ReadonlyMap<string, TransferSource | null | undefined>;
}) {
	const obligationsByMortgageId = groupRowsByMortgageId(args.obligations);
	const planEntriesByMortgageId = groupRowsByMortgageId(args.planEntries);
	const attemptsByMortgageId = groupRowsByMortgageId(args.attempts);
	const schedulesByMortgageId = groupRowsByMortgageId(args.schedules);

	return new Map(
		args.mortgages.map((mortgage) => [
			String(mortgage._id),
			buildMortgagePaymentSnapshot({
				asOf: args.asOf,
				attempts: attemptsByMortgageId.get(String(mortgage._id)) ?? [],
				mortgage,
				obligations: obligationsByMortgageId.get(String(mortgage._id)) ?? [],
				planEntries: planEntriesByMortgageId.get(String(mortgage._id)) ?? [],
				schedules: schedulesByMortgageId.get(String(mortgage._id)) ?? [],
				transfersById: args.transfersById,
			}),
		])
	);
}

async function loadMortgagePaymentSnapshotsPerMortgage(args: {
	asOf: number;
	ctx: Pick<QueryCtx, "db">;
	mortgages: readonly MortgageSource[];
}) {
	const mortgageData = await Promise.all(
		args.mortgages.map(async (mortgage) => {
			const [obligations, planEntries, attempts, schedules] = await Promise.all(
				[
					args.ctx.db
						.query("obligations")
						.withIndex("by_mortgage_and_date", (query) =>
							query.eq("mortgageId", mortgage._id)
						)
						.collect(),
					args.ctx.db
						.query("collectionPlanEntries")
						.withIndex("by_mortgage_status_scheduled", (query) =>
							query.eq("mortgageId", mortgage._id)
						)
						.collect(),
					args.ctx.db
						.query("collectionAttempts")
						.withIndex("by_mortgage_status", (query) =>
							query.eq("mortgageId", mortgage._id)
						)
						.collect(),
					args.ctx.db
						.query("externalCollectionSchedules")
						.withIndex("by_mortgage", (query) =>
							query.eq("mortgageId", mortgage._id)
						)
						.collect(),
				]
			);

			return {
				attempts,
				mortgage,
				obligations,
				planEntries,
				schedules,
			};
		})
	);

	const transferIds = [
		...new Set(
			mortgageData
				.flatMap((entry) => entry.attempts)
				.map((attempt) => attempt.transferRequestId)
				.filter(
					(transferId): transferId is Id<"transferRequests"> =>
						transferId !== undefined
				)
		),
	];
	const transfers = await Promise.all(
		transferIds.map((transferId) => args.ctx.db.get(transferId))
	);
	const transfersById = new Map(
		transfers
			.filter(
				(transfer): transfer is Doc<"transferRequests"> => transfer !== null
			)
			.map((transfer) => [String(transfer._id), transfer] as const)
	);

	return new Map(
		mortgageData.map((entry) => [
			String(entry.mortgage._id),
			buildMortgagePaymentSnapshot({
				asOf: args.asOf,
				attempts: entry.attempts,
				mortgage: entry.mortgage,
				obligations: entry.obligations,
				planEntries: entry.planEntries,
				schedules: entry.schedules,
				transfersById,
			}),
		])
	);
}

async function loadMortgagePaymentSnapshotsBulk(args: {
	asOf: number;
	ctx: Pick<QueryCtx, "db">;
	mortgages: readonly MortgageSource[];
}) {
	const mortgageIdSet = new Set(
		args.mortgages.map((mortgage) => String(mortgage._id))
	);
	const [obligations, planEntries, attempts, schedules] = await Promise.all([
		args.ctx.db
			.query("obligations")
			.collect()
			.then((rows) =>
				rows.filter((row) => mortgageIdSet.has(String(row.mortgageId)))
			),
		args.ctx.db
			.query("collectionPlanEntries")
			.collect()
			.then((rows) =>
				rows.filter((row) => mortgageIdSet.has(String(row.mortgageId)))
			),
		args.ctx.db
			.query("collectionAttempts")
			.collect()
			.then((rows) =>
				rows.filter((row) => mortgageIdSet.has(String(row.mortgageId)))
			),
		args.ctx.db
			.query("externalCollectionSchedules")
			.collect()
			.then((rows) =>
				rows.filter((row) => mortgageIdSet.has(String(row.mortgageId)))
			),
	]);
	const transferIdSet = new Set(
		attempts.flatMap((attempt) =>
			attempt.transferRequestId ? [String(attempt.transferRequestId)] : []
		)
	);
	const transfersById =
		transferIdSet.size === 0
			? new Map<string, TransferSource>()
			: new Map(
					(await args.ctx.db.query("transferRequests").collect())
						.filter((transfer) => transferIdSet.has(String(transfer._id)))
						.map((transfer) => [String(transfer._id), transfer] as const)
				);

	return buildMortgagePaymentSnapshotsFromRows({
		asOf: args.asOf,
		attempts,
		mortgages: args.mortgages,
		obligations,
		planEntries,
		schedules,
		transfersById,
	});
}

export async function loadMortgagePaymentSnapshots(
	ctx: Pick<QueryCtx, "db">,
	mortgageIds: readonly Id<"mortgages">[],
	asOf = Date.now()
): Promise<Map<string, MortgagePaymentSnapshot>> {
	const uniqueMortgageIds = [...new Set(mortgageIds.map(String))]
		.map((mortgageId) => ctx.db.normalizeId("mortgages", mortgageId))
		.filter((mortgageId): mortgageId is Id<"mortgages"> => mortgageId !== null);

	if (uniqueMortgageIds.length === 0) {
		return new Map();
	}

	const mortgages = (
		await Promise.all(
			uniqueMortgageIds.map((mortgageId) => ctx.db.get(mortgageId))
		)
	).filter((mortgage): mortgage is Doc<"mortgages"> => mortgage !== null);
	if (mortgages.length === 0) {
		return new Map();
	}

	if (mortgages.length > BULK_SNAPSHOT_SCAN_THRESHOLD) {
		return loadMortgagePaymentSnapshotsBulk({
			asOf,
			ctx,
			mortgages,
		});
	}

	return loadMortgagePaymentSnapshotsPerMortgage({
		asOf,
		ctx,
		mortgages,
	});
}

export const EMPTY_MORTGAGE_PAYMENT_SNAPSHOT = EMPTY_SNAPSHOT;
