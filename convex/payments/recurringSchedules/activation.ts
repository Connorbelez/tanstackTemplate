import { type FunctionReference, makeFunctionReference } from "convex/server";
import { ConvexError, v } from "convex/values";
import type { Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { convex } from "../../fluent";
import { validateBankAccountRecord } from "../bankAccounts/validation";
import {
	getRecurringCollectionScheduleProvider,
	type SupportedRecurringCollectionScheduleProvider,
} from "./providers/registry";
import { resolveRotessaCustomerReference } from "./rotessaCustomerReference";

const loadActivationSnapshotRef = makeFunctionReference<
	"query",
	{
		asOf?: number;
		bankAccountId: string;
		mortgageId: string;
		planEntryIds?: string[];
		providerCode: "pad_rotessa";
	},
	Promise<{
		bankAccount: {
			_id: string;
			metadata?: Record<string, unknown>;
			ownerId: string;
			ownerType: string;
			status: string;
			mandateStatus: string;
			institutionNumber?: string;
			transitNumber?: string;
		};
		borrowerId: string;
		mortgage: {
			_id: string;
			activeExternalCollectionScheduleId?: string;
			firstPaymentDate: string;
			maturityDate: string;
			paymentFrequency: string;
			status: string;
		};
		planEntries: Array<{
			_id: string;
			amount: number;
			method: string;
			scheduledDate: number;
			status: string;
		}>;
		providerCode: "pad_rotessa";
	}>
>("payments/recurringSchedules/queries:loadActivationSnapshot");

function toIsoBusinessDate(timestamp: number) {
	return new Date(timestamp).toISOString().slice(0, 10);
}

function mapMortgageFrequencyToRotessaFrequency(paymentFrequency: string) {
	switch (paymentFrequency) {
		case "monthly":
			return "Monthly" as const;
		case "bi_weekly":
		case "accelerated_bi_weekly":
			return "Every Other Week" as const;
		case "weekly":
			return "Weekly" as const;
		default:
			throw new ConvexError(
				`Mortgage payment frequency "${paymentFrequency}" is not supported by the Rotessa recurring schedule adapter.`
			);
	}
}

function buildActivationIdempotencyKey(args: {
	planEntryIds: string[];
	primaryBankAccountId: string;
	providerCode: SupportedRecurringCollectionScheduleProvider;
}) {
	const normalizedPlanEntryIds = [...args.planEntryIds].sort();
	if (normalizedPlanEntryIds.length === 0) {
		throw new ConvexError(
			"At least one collection plan entry is required to build the activation idempotency key."
		);
	}

	return [
		"provider-managed-schedule",
		args.providerCode,
		args.primaryBankAccountId,
		...normalizedPlanEntryIds,
	].join(":");
}

function validateUniformInstallments(
	planEntries: Array<{ _id: string; amount: number }>
) {
	const firstAmount = planEntries[0]?.amount;
	if (firstAmount === undefined) {
		throw new ConvexError(
			"At least one plan entry is required for activation."
		);
	}

	for (const entry of planEntries.slice(1)) {
		if (entry.amount !== firstAmount) {
			throw new ConvexError(
				"Rotessa recurring schedule activation currently requires a fixed installment amount across the selected plan entries."
			);
		}
	}

	return firstAmount;
}

function isTerminalExternalCollectionScheduleStatus(status: string) {
	return (
		status === "cancelled" ||
		status === "completed" ||
		status === "activation_failed"
	);
}

async function resolveLiveScheduleConflict(args: {
	activationIdempotencyKey: string;
	ctx: MutationCtx;
	mortgageId: Id<"mortgages">;
}) {
	const mortgage = await args.ctx.db.get(args.mortgageId);
	if (!mortgage) {
		throw new ConvexError(`Mortgage not found: ${args.mortgageId}`);
	}
	if (mortgage.activeExternalCollectionScheduleId) {
		const activeSchedule = await args.ctx.db.get(
			mortgage.activeExternalCollectionScheduleId
		);
		if (!activeSchedule) {
			throw new ConvexError(
				`Mortgage ${args.mortgageId} references missing external collection schedule ${mortgage.activeExternalCollectionScheduleId}.`
			);
		}
		if (
			activeSchedule.activationIdempotencyKey === args.activationIdempotencyKey
		) {
			return activeSchedule;
		}
		if (!isTerminalExternalCollectionScheduleStatus(activeSchedule.status)) {
			throw new ConvexError(
				`Mortgage ${args.mortgageId} already has live external collection schedule ${activeSchedule._id} in status ${activeSchedule.status}. Cancel or complete it before activating another provider-managed schedule.`
			);
		}
	}

	const mortgageSchedules = await args.ctx.db
		.query("externalCollectionSchedules")
		.withIndex("by_mortgage", (q) => q.eq("mortgageId", args.mortgageId))
		.collect();
	const concurrentLiveSchedule = mortgageSchedules.find(
		(schedule) => !isTerminalExternalCollectionScheduleStatus(schedule.status)
	);
	if (!concurrentLiveSchedule) {
		return null;
	}
	if (
		concurrentLiveSchedule.activationIdempotencyKey ===
		args.activationIdempotencyKey
	) {
		return concurrentLiveSchedule;
	}
	throw new ConvexError(
		`Mortgage ${args.mortgageId} already has live external collection schedule ${concurrentLiveSchedule._id} in status ${concurrentLiveSchedule.status}. Cancel or complete it before activating another provider-managed schedule.`
	);
}

export const beginRecurringScheduleActivation = convex
	.mutation()
	.input({
		activationIdempotencyKey: v.string(),
		bankAccountId: v.id("bankAccounts"),
		borrowerId: v.id("borrowers"),
		cadence: v.string(),
		coveredFromPlanEntryId: v.id("collectionPlanEntries"),
		coveredToPlanEntryId: v.id("collectionPlanEntries"),
		endDate: v.number(),
		mortgageId: v.id("mortgages"),
		providerCode: v.literal("pad_rotessa"),
		source: v.string(),
		startDate: v.number(),
	})
	.handler(async (ctx, args) => {
		const existing = await ctx.db
			.query("externalCollectionSchedules")
			.withIndex("by_activation_key", (q) =>
				q.eq("activationIdempotencyKey", args.activationIdempotencyKey)
			)
			.first();

		if (existing) {
			if (existing.status === "activation_failed") {
				const liveSchedule = await resolveLiveScheduleConflict({
					activationIdempotencyKey: args.activationIdempotencyKey,
					ctx,
					mortgageId: args.mortgageId,
				});
				if (liveSchedule) {
					return {
						needsProviderCreate: liveSchedule.externalScheduleRef === undefined,
						scheduleId: liveSchedule._id,
					};
				}
				const retriedAt = Date.now();
				await ctx.db.patch(existing._id, {
					status: "activating",
					lastSyncErrorAt: undefined,
					lastSyncErrorMessage: undefined,
					lastTransitionAt: retriedAt,
				});
				return {
					needsProviderCreate: existing.externalScheduleRef === undefined,
					scheduleId: existing._id,
				};
			}
			if (existing.externalScheduleRef) {
				return {
					needsProviderCreate: false as const,
					scheduleId: existing._id,
				};
			}
			throw new ConvexError(
				`External collection schedule activation is already in progress for ${args.activationIdempotencyKey}.`
			);
		}

		const liveSchedule = await resolveLiveScheduleConflict({
			activationIdempotencyKey: args.activationIdempotencyKey,
			ctx,
			mortgageId: args.mortgageId,
		});
		if (liveSchedule) {
			return { created: false as const, scheduleId: liveSchedule._id };
		}

		const scheduleId = await ctx.db.insert("externalCollectionSchedules", {
			status: "activating",
			mortgageId: args.mortgageId,
			borrowerId: args.borrowerId,
			providerCode: args.providerCode,
			bankAccountId: args.bankAccountId,
			activationIdempotencyKey: args.activationIdempotencyKey,
			startDate: args.startDate,
			endDate: args.endDate,
			cadence: args.cadence,
			coveredFromPlanEntryId: args.coveredFromPlanEntryId,
			coveredToPlanEntryId: args.coveredToPlanEntryId,
			consecutiveSyncFailures: 0,
			source: args.source,
			createdAt: Date.now(),
			lastTransitionAt: Date.now(),
		});

		return { needsProviderCreate: true as const, scheduleId };
	})
	.internal();

export const recordRecurringScheduleProviderActivation = convex
	.mutation()
	.input({
		activatedAt: v.number(),
		externalScheduleRef: v.string(),
		nextPollAt: v.number(),
		providerData: v.optional(v.record(v.string(), v.any())),
		providerStatus: v.union(v.literal("pending"), v.literal("active")),
		scheduleId: v.id("externalCollectionSchedules"),
	})
	.handler(async (ctx, args) => {
		const schedule = await ctx.db.get(args.scheduleId);
		if (!schedule) {
			throw new ConvexError(
				`External collection schedule not found: ${args.scheduleId}`
			);
		}

		await ctx.db.patch(args.scheduleId, {
			externalScheduleRef: args.externalScheduleRef,
			activatedAt: args.activatedAt,
			nextPollAt: args.nextPollAt,
			lastProviderScheduleStatus: args.providerStatus,
			providerData: args.providerData,
		});

		return { scheduleId: args.scheduleId };
	})
	.internal();

async function loadValidatedPlanEntriesForCommit(args: {
	ctx: MutationCtx;
	planEntryIds: Id<"collectionPlanEntries">[];
	scheduleId: Id<"externalCollectionSchedules">;
	scheduleMortgageId: Id<"mortgages">;
}) {
	const planEntries = await Promise.all(
		args.planEntryIds.map(async (planEntryId) => {
			const planEntry = await args.ctx.db.get(planEntryId);
			if (!planEntry) {
				throw new ConvexError(
					`Collection plan entry not found during schedule commit: ${planEntryId}`
				);
			}
			if (planEntry.mortgageId !== args.scheduleMortgageId) {
				throw new ConvexError(
					`Collection plan entry ${planEntryId} does not belong to mortgage ${args.scheduleMortgageId}.`
				);
			}

			const alreadyBoundToSchedule =
				planEntry.status === "provider_scheduled" &&
				planEntry.externalCollectionScheduleId === args.scheduleId;
			if (alreadyBoundToSchedule) {
				return planEntry;
			}

			if (
				planEntry.status !== "planned" ||
				(planEntry.executionMode !== undefined &&
					planEntry.executionMode !== "app_owned") ||
				planEntry.externalCollectionScheduleId !== undefined
			) {
				throw new ConvexError(
					`Collection plan entry ${planEntryId} is no longer eligible for provider-managed activation.`
				);
			}

			return planEntry;
		})
	);

	return planEntries;
}

export const commitRecurringScheduleActivation = convex
	.mutation()
	.input({
		planEntryIds: v.array(v.id("collectionPlanEntries")),
		scheduleId: v.id("externalCollectionSchedules"),
	})
	.handler(async (ctx, args) => {
		const schedule = await ctx.db.get(args.scheduleId);
		if (!schedule) {
			throw new ConvexError(
				`External collection schedule not found: ${args.scheduleId}`
			);
		}
		if (!schedule.externalScheduleRef) {
			throw new ConvexError(
				`External collection schedule ${args.scheduleId} is missing externalScheduleRef and cannot be committed.`
			);
		}
		const localScheduleStatus =
			schedule.lastProviderScheduleStatus === "active"
				? "active"
				: "activating";
		const committedAt = Date.now();
		await loadValidatedPlanEntriesForCommit({
			ctx,
			planEntryIds: args.planEntryIds,
			scheduleId: args.scheduleId,
			scheduleMortgageId: schedule.mortgageId,
		});

		await ctx.db.patch(args.scheduleId, {
			status: localScheduleStatus,
			lastTransitionAt:
				schedule.status === localScheduleStatus
					? schedule.lastTransitionAt
					: committedAt,
		});

		for (const [index, planEntryId] of args.planEntryIds.entries()) {
			await ctx.db.patch(planEntryId, {
				status: "provider_scheduled",
				executionMode: "provider_managed",
				method: "pad_rotessa",
				externalCollectionScheduleId: args.scheduleId,
				externalOccurrenceOrdinal: index + 1,
				externallyManagedAt: schedule.activatedAt ?? committedAt,
			});
		}

		await ctx.db.patch(schedule.mortgageId, {
			collectionExecutionMode: "provider_managed",
			collectionExecutionProviderCode: "pad_rotessa",
			activeExternalCollectionScheduleId: args.scheduleId,
			collectionExecutionUpdatedAt: schedule.activatedAt ?? committedAt,
		});

		return { scheduleId: args.scheduleId };
	})
	.internal();

export const failRecurringScheduleActivation = convex
	.mutation()
	.input({
		clearProviderActivation: v.optional(v.boolean()),
		errorMessage: v.string(),
		scheduleId: v.id("externalCollectionSchedules"),
	})
	.handler(async (ctx, args) => {
		await ctx.db.patch(args.scheduleId, {
			status: "activation_failed",
			lastSyncErrorAt: Date.now(),
			lastSyncErrorMessage: args.errorMessage,
			lastTransitionAt: Date.now(),
			...(args.clearProviderActivation
				? {
						externalScheduleRef: undefined,
						activatedAt: undefined,
						nextPollAt: undefined,
						lastProviderScheduleStatus: undefined,
						providerData: undefined,
					}
				: {}),
		});
	})
	.internal();

/**
 * Activates one provider-managed recurring collection schedule for a mortgage.
 *
 * When `asOf` is omitted, snapshot selection is evaluated at invocation time.
 */
export const activateRecurringSchedule = convex
	.action()
	.input({
		/** Defaults to `Date.now()` inside `loadActivationSnapshot` when omitted. */
		asOf: v.optional(v.number()),
		bankAccountId: v.id("bankAccounts"),
		planEntryIds: v.optional(v.array(v.id("collectionPlanEntries"))),
		mortgageId: v.id("mortgages"),
		providerCode: v.literal("pad_rotessa"),
	})
	.handler(async (ctx, args) => {
		const snapshot = await ctx.runQuery(loadActivationSnapshotRef, args);
		if (snapshot.planEntries.length === 0) {
			throw new ConvexError(
				"No eligible future app-owned collection plan entries were found for provider-managed activation."
			);
		}

		if (
			snapshot.bankAccount.ownerType !== "borrower" ||
			snapshot.bankAccount.ownerId !== `${snapshot.borrowerId}`
		) {
			throw new ConvexError(
				"Provider-managed recurring schedule activation requires a borrower-owned inbound bank account."
			);
		}

		const bankValidation = validateBankAccountRecord(
			snapshot.bankAccount,
			args.providerCode
		);
		if (!bankValidation.valid) {
			throw new ConvexError(bankValidation.errorMessage);
		}

		const uniformAmount = validateUniformInstallments(snapshot.planEntries);
		const customerReference = resolveRotessaCustomerReference(
			snapshot.bankAccount.metadata
		);
		const cadence = mapMortgageFrequencyToRotessaFrequency(
			snapshot.mortgage.paymentFrequency
		);
		const activationIdempotencyKey = buildActivationIdempotencyKey({
			planEntryIds: snapshot.planEntries.map((entry) => `${entry._id}`),
			primaryBankAccountId: `${snapshot.bankAccount._id}`,
			providerCode: args.providerCode,
		});
		const lastPlanEntry = snapshot.planEntries.at(-1);
		if (!lastPlanEntry) {
			throw new ConvexError(
				"Rotessa recurring schedule activation requires at least one future collection plan entry."
			);
		}

		const beginResult = (await ctx.runMutation(
			makeFunctionReference(
				"payments/recurringSchedules/activation:beginRecurringScheduleActivation"
			) as unknown as FunctionReference<"mutation">,
			{
				activationIdempotencyKey,
				bankAccountId: args.bankAccountId,
				borrowerId: snapshot.borrowerId,
				cadence,
				coveredFromPlanEntryId: snapshot.planEntries[0]._id,
				coveredToPlanEntryId: lastPlanEntry._id,
				endDate: lastPlanEntry.scheduledDate,
				mortgageId: args.mortgageId,
				providerCode: args.providerCode,
				source: "activation_action",
				startDate: snapshot.planEntries[0].scheduledDate,
			}
		)) as { needsProviderCreate: boolean; scheduleId: string };

		const provider = getRecurringCollectionScheduleProvider(args.providerCode);
		let providerScheduleCreatedThisRun = false;
		let providerExternalScheduleRef: string | undefined;

		try {
			if (beginResult.needsProviderCreate) {
				const providerSchedule = await provider.createSchedule({
					...customerReference,
					amount: uniformAmount,
					bankAccountId: args.bankAccountId,
					comment: `mortgage:${args.mortgageId};schedule:${beginResult.scheduleId}`,
					frequency: cadence,
					installments: snapshot.planEntries.length,
					processDate: toIsoBusinessDate(snapshot.planEntries[0].scheduledDate),
					providerCode: args.providerCode,
				});
				providerScheduleCreatedThisRun = true;
				providerExternalScheduleRef = providerSchedule.externalScheduleRef;

				const activatedAt = Date.now();
				await ctx.runMutation(
					makeFunctionReference(
						"payments/recurringSchedules/activation:recordRecurringScheduleProviderActivation"
					) as unknown as FunctionReference<"mutation">,
					{
						activatedAt,
						externalScheduleRef: providerSchedule.externalScheduleRef,
						nextPollAt: activatedAt,
						providerData: providerSchedule.providerData,
						providerStatus: providerSchedule.status,
						scheduleId: beginResult.scheduleId,
					}
				);
			}

			await ctx.runMutation(
				makeFunctionReference(
					"payments/recurringSchedules/activation:commitRecurringScheduleActivation"
				) as unknown as FunctionReference<"mutation">,
				{
					planEntryIds: snapshot.planEntries.map((entry) => entry._id),
					scheduleId: beginResult.scheduleId,
				}
			);

			return { scheduleId: beginResult.scheduleId };
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Unknown activation error";
			let clearProviderActivation = false;
			let cancellationFailureMessage: string | undefined;

			if (providerScheduleCreatedThisRun && providerExternalScheduleRef) {
				try {
					await provider.cancelSchedule(providerExternalScheduleRef);
					clearProviderActivation = true;
				} catch (cancelError) {
					cancellationFailureMessage =
						cancelError instanceof Error
							? cancelError.message
							: "Unknown schedule cancellation error";
				}
			}

			await ctx.runMutation(
				makeFunctionReference(
					"payments/recurringSchedules/activation:failRecurringScheduleActivation"
				) as unknown as FunctionReference<"mutation">,
				{
					clearProviderActivation,
					errorMessage:
						cancellationFailureMessage === undefined
							? errorMessage
							: `${errorMessage} (Compensation cancel failed: ${cancellationFailureMessage})`,
					scheduleId: beginResult.scheduleId,
				}
			);
			throw error;
		}
	})
	.internal();
