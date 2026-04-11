import { ConvexError, v } from "convex/values";
import type { Doc } from "../../_generated/dataModel";
import { convex } from "../../fluent";

function toActivationEligibilityError(args: {
	mortgageId: string;
	planEntryId: string;
}) {
	return new ConvexError(
		`Requested collection plan entry ${args.planEntryId} is not eligible for provider-managed activation on mortgage ${args.mortgageId}. Expected a future planned app-owned entry.`
	);
}

function findDuplicatePlanEntryIds(planEntryIds: readonly string[]) {
	const seen = new Set<string>();
	const duplicates = new Set<string>();

	for (const planEntryId of planEntryIds) {
		if (seen.has(planEntryId)) {
			duplicates.add(planEntryId);
			continue;
		}
		seen.add(planEntryId);
	}

	return [...duplicates];
}

/**
 * Builds the activation snapshot for provider-managed recurring schedules.
 *
 * `asOf` is optional and defaults to the invocation time when omitted, so the
 * selected planned entries are time-dependent unless the caller pins a value.
 */
export const loadActivationSnapshot = convex
	.query()
	.input({
		/** Defaults to `Date.now()` when omitted. */
		asOf: v.optional(v.number()),
		bankAccountId: v.id("bankAccounts"),
		mortgageId: v.id("mortgages"),
		planEntryIds: v.optional(v.array(v.id("collectionPlanEntries"))),
		providerCode: v.literal("pad_rotessa"),
	})
	.handler(async (ctx, args) => {
		const mortgage = await ctx.db.get(args.mortgageId);
		if (!mortgage) {
			throw new ConvexError(`Mortgage not found: ${args.mortgageId}`);
		}

		const bankAccount = await ctx.db.get(args.bankAccountId);
		if (!bankAccount) {
			throw new ConvexError(`Bank account not found: ${args.bankAccountId}`);
		}

		const borrowerLink = await ctx.db
			.query("mortgageBorrowers")
			.withIndex("by_mortgage", (q) => q.eq("mortgageId", args.mortgageId))
			.collect();
		const primaryBorrowerLinks = borrowerLink.filter(
			(link) => link.role === "primary"
		);
		if (primaryBorrowerLinks.length !== 1) {
			throw new ConvexError(
				`Mortgage ${args.mortgageId} must have exactly one explicit primary borrower for schedule activation. primaryBorrowerCount=${primaryBorrowerLinks.length} borrowerLinkCount=${borrowerLink.length}`
			);
		}

		const asOf = args.asOf ?? Date.now();
		if (args.planEntryIds !== undefined && args.planEntryIds.length === 0) {
			throw new ConvexError(
				"At least one collection plan entry is required for schedule activation."
			);
		}
		const eligibleFuturePlanEntries = (
			await ctx.db
				.query("collectionPlanEntries")
				.withIndex("by_mortgage_status_scheduled", (q) =>
					q
						.eq("mortgageId", args.mortgageId)
						.eq("status", "planned")
						.gte("scheduledDate", asOf)
				)
				.collect()
		)
			.filter(
				(entry) =>
					entry.executionMode === undefined ||
					entry.executionMode === "app_owned"
			)
			.sort((left, right) => left.scheduledDate - right.scheduledDate);

		const requestedPlanEntryIds = args.planEntryIds;
		const filteredPlanEntries =
			requestedPlanEntryIds === undefined
				? eligibleFuturePlanEntries
				: await (async () => {
						const duplicatePlanEntryIds = findDuplicatePlanEntryIds(
							requestedPlanEntryIds.map((planEntryId) => `${planEntryId}`)
						);
						if (duplicatePlanEntryIds.length > 0) {
							throw new ConvexError(
								`Provider-managed activation does not accept duplicate collection plan entry ids: ${duplicatePlanEntryIds.join(", ")}.`
							);
						}

						const requestedPlanEntries = await Promise.all(
							requestedPlanEntryIds.map(async (planEntryId) => {
								const entry = await ctx.db.get(planEntryId);
								if (!entry) {
									throw new ConvexError(
										`Collection plan entry not found: ${planEntryId}`
									);
								}
								return entry;
							})
						);
						for (const entry of requestedPlanEntries) {
							if (
								entry.mortgageId !== args.mortgageId ||
								entry.status !== "planned" ||
								(entry.executionMode !== undefined &&
									entry.executionMode !== "app_owned") ||
								entry.scheduledDate < asOf
							) {
								throw toActivationEligibilityError({
									mortgageId: `${args.mortgageId}`,
									planEntryId: `${entry._id}`,
								});
							}
						}

						const requestedPlanEntryIdSet = new Set(
							requestedPlanEntries.map((entry) => `${entry._id}`)
						);
						const orderedRequestedPlanEntries =
							eligibleFuturePlanEntries.filter((entry) =>
								requestedPlanEntryIdSet.has(`${entry._id}`)
							);
						const requestedPlanEntryIdStrings = orderedRequestedPlanEntries.map(
							(entry) => `${entry._id}`
						);
						const eligibleFuturePlanEntryIds = eligibleFuturePlanEntries.map(
							(entry) => `${entry._id}`
						);
						const firstRequestedIndex = eligibleFuturePlanEntryIds.indexOf(
							requestedPlanEntryIdStrings[0] ?? ""
						);
						const expectedWindow = eligibleFuturePlanEntryIds.slice(
							firstRequestedIndex,
							firstRequestedIndex + requestedPlanEntryIdStrings.length
						);
						const isContiguousWindow =
							firstRequestedIndex >= 0 &&
							expectedWindow.length === requestedPlanEntryIdStrings.length &&
							expectedWindow.every(
								(planEntryId, index) =>
									planEntryId === requestedPlanEntryIdStrings[index]
							);
						if (!isContiguousWindow) {
							throw new ConvexError(
								"Requested collection plan entries must form a contiguous future installment window for provider-managed activation."
							);
						}

						return orderedRequestedPlanEntries;
					})();

		return {
			bankAccount,
			borrowerId: primaryBorrowerLinks[0].borrowerId,
			mortgage,
			planEntries: filteredPlanEntries,
			providerCode: args.providerCode,
		};
	})
	.internal();

export const getExternalCollectionScheduleByProviderRef = convex
	.query()
	.input({
		externalScheduleRef: v.string(),
		providerCode: v.literal("pad_rotessa"),
	})
	.handler(async (ctx, args) => {
		return ctx.db
			.query("externalCollectionSchedules")
			.withIndex("by_provider_ref", (q) =>
				q
					.eq("providerCode", args.providerCode)
					.eq("externalScheduleRef", args.externalScheduleRef)
			)
			.first();
	})
	.internal();

export const listSchedulesEligibleForPolling = convex
	.query()
	.input({
		asOf: v.number(),
		limit: v.optional(v.number()),
	})
	.handler(async (ctx, args) => {
		const limit = Math.max(1, Math.min(args.limit ?? 25, 100));
		const syncErrorBudget = Math.max(1, Math.ceil(limit / 4));

		const collectEligibleSchedules = async (
			status: "active" | "sync_error",
			targetCount: number
		) => {
			const eligible: Doc<"externalCollectionSchedules">[] = [];
			let cursor: string | null = null;
			const pageSize = Math.max(25, Math.min(targetCount * 3, 100));

			while (eligible.length < targetCount) {
				const { continueCursor, isDone, page } = await ctx.db
					.query("externalCollectionSchedules")
					.withIndex("by_status_and_next_poll", (q) =>
						q.eq("status", status).lte("nextPollAt", args.asOf)
					)
					.paginate({ cursor, numItems: pageSize });

				for (const schedule of page) {
					if (
						schedule.syncLeaseExpiresAt !== undefined &&
						schedule.syncLeaseExpiresAt > args.asOf
					) {
						continue;
					}
					eligible.push(schedule);
					if (eligible.length === targetCount) {
						return eligible;
					}
				}

				if (isDone) {
					return eligible;
				}
				cursor = continueCursor;
			}

			return eligible;
		};

		// Reserve some polling capacity for retrying sync_error schedules so they
		// continue to make forward progress under sustained active backlog.
		const reservedSyncError = await collectEligibleSchedules(
			"sync_error",
			Math.min(limit, syncErrorBudget)
		);
		const active = await collectEligibleSchedules(
			"active",
			Math.max(0, limit - reservedSyncError.length)
		);
		const extraSyncError =
			active.length + reservedSyncError.length < limit
				? (
						await collectEligibleSchedules("sync_error", limit - active.length)
					).slice(reservedSyncError.length)
				: [];

		return [...reservedSyncError, ...active, ...extraSyncError]
			.sort((left, right) => (left.nextPollAt ?? 0) - (right.nextPollAt ?? 0))
			.slice(0, limit);
	})
	.internal();

export const getExternalCollectionScheduleDetail = convex
	.query()
	.input({
		scheduleId: v.id("externalCollectionSchedules"),
	})
	.handler(async (ctx, args) => {
		const schedule = await ctx.db.get(args.scheduleId);
		if (!schedule) {
			return null;
		}

		const planEntries = await ctx.db
			.query("collectionPlanEntries")
			.withIndex("by_external_schedule_ordinal", (q) =>
				q.eq("externalCollectionScheduleId", args.scheduleId)
			)
			.collect();

		return {
			schedule,
			planEntries: planEntries.sort(
				(left, right) =>
					(left.externalOccurrenceOrdinal ?? Number.MAX_SAFE_INTEGER) -
					(right.externalOccurrenceOrdinal ?? Number.MAX_SAFE_INTEGER)
			),
		};
	})
	.internal();

export const listExternalCollectionScheduleSyncIssues = convex
	.query()
	.input({
		limit: v.optional(v.number()),
	})
	.handler(async (ctx, args) => {
		return ctx.db
			.query("externalCollectionSchedules")
			.withIndex("by_status", (q) => q.eq("status", "sync_error"))
			.take(Math.max(1, Math.min(args.limit ?? 25, 100)));
	})
	.internal();
