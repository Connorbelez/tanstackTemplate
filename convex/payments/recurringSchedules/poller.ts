import { type FunctionReference, makeFunctionReference } from "convex/server";
import { ConvexError, v } from "convex/values";
import { convex } from "../../fluent";
import { getRecurringCollectionScheduleProvider } from "./providers/registry";

const listSchedulesEligibleForPollingRef = makeFunctionReference<
	"query",
	{ asOf: number; limit?: number },
	Promise<
		Array<{
			_id: string;
			endDate: number;
			externalScheduleRef?: string;
			lastSyncCursor?: string;
			lastSyncedAt?: number;
			nextPollAt?: number;
			providerCode: "pad_rotessa";
			startDate: number;
			status: string;
			syncLeaseExpiresAt?: number;
		}>
	>
>("payments/recurringSchedules/queries:listSchedulesEligibleForPolling");

const ingestExternalOccurrenceEventRef = makeFunctionReference<
	"mutation",
	{
		event: {
			amount?: number;
			externalOccurrenceOrdinal?: number;
			externalOccurrenceRef?: string;
			externalScheduleRef: string;
			mappedTransferEvent:
				| "PROCESSING_UPDATE"
				| "FUNDS_SETTLED"
				| "TRANSFER_FAILED"
				| "TRANSFER_REVERSED";
			occurredAt?: number;
			providerCode: "pad_rotessa";
			providerData?: Record<string, unknown>;
			providerRef?: string;
			rawProviderReason?: string;
			rawProviderStatus: string;
			receivedVia: "poller";
			scheduledDate?: string;
		};
	},
	Promise<
		| {
				outcome: "unresolved";
				reason: string;
		  }
		| {
				outcome: "materialized" | "already_applied" | "applied";
				matchedBy: string;
				collectionAttemptId: string;
				planEntryId: string;
				transferRequestId: string;
		  }
	>
>(
	"payments/recurringSchedules/occurrenceIngestion:ingestExternalOccurrenceEvent"
);

const POLL_INTERVAL_MS = 15 * 60 * 1000;
const POLL_LEASE_MS = 10 * 60 * 1000;
const LOOKAHEAD_DAYS = 14;
const LOOKBACK_DAYS = 35;

function toBusinessDate(timestamp: number) {
	return new Date(timestamp).toISOString().slice(0, 10);
}

export const claimExternalCollectionScheduleSync = convex
	.mutation()
	.input({
		asOf: v.number(),
		leaseOwner: v.string(),
		leaseTtlMs: v.optional(v.number()),
		scheduleId: v.id("externalCollectionSchedules"),
	})
	.handler(async (ctx, args) => {
		const schedule = await ctx.db.get(args.scheduleId);
		if (!schedule) {
			return { claimed: false as const, reason: "missing_schedule" as const };
		}
		if (!schedule.externalScheduleRef) {
			await ctx.db.patch(args.scheduleId, {
				status: "sync_error",
				lastSyncAttemptAt: args.asOf,
				lastSyncErrorAt: args.asOf,
				lastSyncErrorMessage:
					"External collection schedule is missing externalScheduleRef",
				nextPollAt: args.asOf + POLL_INTERVAL_MS,
				consecutiveSyncFailures: (schedule.consecutiveSyncFailures ?? 0) + 1,
				lastTransitionAt: args.asOf,
				syncLeaseOwner: undefined,
				syncLeaseExpiresAt: undefined,
			});
			return {
				claimed: false as const,
				reason: "missing_external_schedule_ref" as const,
			};
		}
		if (
			schedule.syncLeaseExpiresAt !== undefined &&
			schedule.syncLeaseExpiresAt > args.asOf
		) {
			return { claimed: false as const, reason: "lease_held" as const };
		}

		const leaseExpiresAt = args.asOf + (args.leaseTtlMs ?? POLL_LEASE_MS);
		await ctx.db.patch(args.scheduleId, {
			syncLeaseOwner: args.leaseOwner,
			syncLeaseExpiresAt: leaseExpiresAt,
			lastSyncAttemptAt: args.asOf,
		});

		return { claimed: true as const, leaseExpiresAt };
	})
	.internal();

export const recordExternalCollectionScheduleSyncSuccess = convex
	.mutation()
	.input({
		asOf: v.number(),
		lastProviderScheduleStatus: v.optional(v.string()),
		nextCursor: v.optional(v.string()),
		nextPollAt: v.number(),
		providerData: v.optional(v.record(v.string(), v.any())),
		scheduleStatus: v.union(v.literal("active"), v.literal("completed")),
		scheduleId: v.id("externalCollectionSchedules"),
		leaseOwner: v.string(),
	})
	.handler(async (ctx, args) => {
		const schedule = await ctx.db.get(args.scheduleId);
		if (!schedule || schedule.syncLeaseOwner !== args.leaseOwner) {
			return;
		}
		const nextScheduleStatus =
			args.scheduleStatus === "completed" ? "completed" : "active";

		await ctx.db.patch(args.scheduleId, {
			status: nextScheduleStatus,
			lastSyncedAt: args.asOf,
			lastSyncCursor: args.nextCursor,
			nextPollAt: args.nextPollAt,
			lastProviderScheduleStatus:
				args.lastProviderScheduleStatus ?? schedule.lastProviderScheduleStatus,
			providerData: {
				...(schedule.providerData ?? {}),
				...(args.providerData ?? {}),
			},
			consecutiveSyncFailures: 0,
			lastSyncErrorAt: undefined,
			lastSyncErrorMessage: undefined,
			lastTransitionAt:
				schedule.status === nextScheduleStatus
					? schedule.lastTransitionAt
					: args.asOf,
			syncLeaseOwner: undefined,
			syncLeaseExpiresAt: undefined,
		});
	})
	.internal();

export const recordExternalCollectionScheduleSyncFailure = convex
	.mutation()
	.input({
		asOf: v.number(),
		errorMessage: v.string(),
		nextPollAt: v.number(),
		scheduleId: v.id("externalCollectionSchedules"),
		leaseOwner: v.string(),
	})
	.handler(async (ctx, args) => {
		const schedule = await ctx.db.get(args.scheduleId);
		if (!schedule || schedule.syncLeaseOwner !== args.leaseOwner) {
			return;
		}

		const consecutiveSyncFailures = (schedule.consecutiveSyncFailures ?? 0) + 1;
		await ctx.db.patch(args.scheduleId, {
			status: "sync_error",
			lastSyncErrorAt: args.asOf,
			lastSyncErrorMessage: args.errorMessage,
			nextPollAt: args.nextPollAt,
			consecutiveSyncFailures,
			lastTransitionAt: args.asOf,
			syncLeaseOwner: undefined,
			syncLeaseExpiresAt: undefined,
		});
	})
	.internal();

export const pollProviderManagedSchedules = convex
	.action()
	.input({
		asOf: v.optional(v.number()),
		limit: v.optional(v.number()),
	})
	.handler(async (ctx, args) => {
		const asOf = args.asOf ?? Date.now();
		const candidates = await ctx.runQuery(listSchedulesEligibleForPollingRef, {
			asOf,
			limit: args.limit,
		});
		const leaseOwner = `provider-managed-poller:${crypto.randomUUID()}`;

		let claimedCount = 0;
		let syncedCount = 0;
		let ingestedEventCount = 0;
		let failedCount = 0;

		for (const candidate of candidates) {
			const claimed = (await ctx.runMutation(
				makeFunctionReference(
					"payments/recurringSchedules/poller:claimExternalCollectionScheduleSync"
				) as unknown as FunctionReference<"mutation">,
				{
					asOf,
					leaseOwner,
					leaseTtlMs: POLL_LEASE_MS,
					scheduleId: candidate._id,
				}
			)) as { claimed: boolean };

			if (!claimed.claimed) {
				continue;
			}
			claimedCount += 1;

			try {
				if (!candidate.externalScheduleRef) {
					throw new ConvexError(
						`External collection schedule ${candidate._id} is missing externalScheduleRef`
					);
				}

				const provider = getRecurringCollectionScheduleProvider(
					candidate.providerCode
				);
				const pollWindowStart = Math.max(
					candidate.startDate,
					(candidate.lastSyncedAt ?? asOf) - LOOKBACK_DAYS * 86_400_000
				);
				const pollWindowEnd = Math.min(
					candidate.endDate,
					asOf + LOOKAHEAD_DAYS * 86_400_000
				);

				const [scheduleStatus, occurrenceUpdates] = await Promise.all([
					provider.getScheduleStatus(candidate.externalScheduleRef),
					provider.pollOccurrenceUpdates({
						endDate: toBusinessDate(pollWindowEnd),
						externalScheduleRef: candidate.externalScheduleRef,
						sinceCursor: candidate.lastSyncCursor,
						startDate: toBusinessDate(pollWindowStart),
					}),
				]);
				const normalizedScheduleStatus =
					scheduleStatus.status === "completed" ? "completed" : "active";

				for (const event of occurrenceUpdates.events) {
					const ingestionResult = await ctx.runMutation(
						ingestExternalOccurrenceEventRef,
						{
							event: {
								...event,
								receivedVia: "poller",
							},
						}
					);
					if (ingestionResult.outcome === "unresolved") {
						throw new ConvexError(
							ingestionResult.reason ??
								`No local match found for provider occurrence on schedule ${candidate._id}.`
						);
					}
					ingestedEventCount += 1;
				}

				await ctx.runMutation(
					makeFunctionReference(
						"payments/recurringSchedules/poller:recordExternalCollectionScheduleSyncSuccess"
					) as unknown as FunctionReference<"mutation">,
					{
						asOf,
						lastProviderScheduleStatus: scheduleStatus.status,
						nextCursor: occurrenceUpdates.nextCursor,
						nextPollAt: asOf + POLL_INTERVAL_MS,
						providerData: {
							...(scheduleStatus.providerData ?? {}),
							...(occurrenceUpdates.providerData ?? {}),
						},
						scheduleStatus: normalizedScheduleStatus,
						scheduleId: candidate._id,
						leaseOwner,
					}
				);
				syncedCount += 1;
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : "Unknown polling error";
				await ctx.runMutation(
					makeFunctionReference(
						"payments/recurringSchedules/poller:recordExternalCollectionScheduleSyncFailure"
					) as unknown as FunctionReference<"mutation">,
					{
						asOf,
						errorMessage,
						nextPollAt: asOf + POLL_INTERVAL_MS,
						scheduleId: candidate._id,
						leaseOwner,
					}
				);
				failedCount += 1;
			}
		}

		return {
			candidateCount: candidates.length,
			claimedCount,
			failedCount,
			ingestedEventCount,
			syncedCount,
		};
	})
	.internal();
