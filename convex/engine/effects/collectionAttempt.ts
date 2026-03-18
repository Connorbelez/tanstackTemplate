import { v } from "convex/values";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { internalMutation } from "../../_generated/server";
import { executeTransition } from "../transition";
import type { CommandSource } from "../types";
import { effectPayloadValidator } from "../validators";

const collectionAttemptEffectValidator = {
	...effectPayloadValidator,
	entityId: v.id("collectionAttempts"),
	entityType: v.literal("collectionAttempt"),
};

interface CollectionAttemptEffectArgs {
	effectName: string;
	entityId: Id<"collectionAttempts">;
	entityType: "collectionAttempt";
	eventType: string;
	journalEntryId: string;
	payload?: Record<string, unknown>;
	source: CommandSource;
}

async function loadAttemptAndPlanEntry(
	ctx: MutationCtx,
	args: CollectionAttemptEffectArgs,
	effectLabel: string
) {
	const attempt = await ctx.db.get(args.entityId);
	if (!attempt) {
		throw new Error(
			`[${effectLabel}] Collection attempt not found: ${args.entityId}`
		);
	}

	const planEntry = await ctx.db.get(attempt.planEntryId);
	if (!planEntry) {
		throw new Error(
			`[${effectLabel}] Plan entry not found: ${attempt.planEntryId} (attempt=${args.entityId})`
		);
	}

	return { attempt, planEntry };
}

/**
 * Cross-entity effect: fires PAYMENT_APPLIED at each linked obligation.
 * Triggered when a collection attempt transitions to `confirmed` via FUNDS_SETTLED.
 */
export const emitPaymentReceived = internalMutation({
	args: collectionAttemptEffectValidator,
	handler: async (ctx, args) => {
		const { attempt, planEntry } = await loadAttemptAndPlanEntry(
			ctx,
			args,
			"emitPaymentReceived"
		);

		let remainingAmount = attempt.amount;

		for (const obligationId of planEntry.obligationIds) {
			const obligation = await ctx.db.get(obligationId);
			if (!obligation) {
				console.warn(
					`[emitPaymentReceived] Obligation not found: ${obligationId} (attempt=${args.entityId}). Skipping.`
				);
				continue;
			}

			const outstandingAmount = Math.max(
				0,
				obligation.amount - (obligation.amountSettled ?? 0)
			);
			const appliedAmount = Math.min(remainingAmount, outstandingAmount);
			if (appliedAmount <= 0) {
				continue;
			}

			const result = await executeTransition(ctx, {
				entityType: "obligation",
				entityId: obligationId,
				eventType: "PAYMENT_APPLIED",
				payload: {
					amount: appliedAmount,
					attemptId: args.entityId,
					currentAmountSettled: obligation.amountSettled,
					totalAmount: obligation.amount,
				},
				source: args.source,
			});

			if (!result.success) {
				console.warn(
					`[emitPaymentReceived] PAYMENT_APPLIED skipped for obligation=${obligationId}: ${result.reason ?? "unknown reason"} (state=${result.previousState})`
				);
				continue;
			}

			console.info(
				`[emitPaymentReceived] attempt=${args.entityId} -> obligation=${obligationId}: ${result.previousState} -> ${result.newState}`
			);

			remainingAmount -= appliedAmount;
			if (remainingAmount <= 0) {
				break;
			}
		}
	},
});

/**
 * Cross-entity effect: triggers rules engine evaluation with COLLECTION_FAILED.
 * Triggered when a collection attempt transitions to `permanent_fail` via MAX_RETRIES_EXCEEDED.
 */
export const emitCollectionFailed = internalMutation({
	args: collectionAttemptEffectValidator,
	handler: async (ctx, args) => {
		const { attempt, planEntry } = await loadAttemptAndPlanEntry(
			ctx,
			args,
			"emitCollectionFailed"
		);

		await ctx.scheduler.runAfter(
			0,
			internal.payments.collectionPlan.engine.evaluateRules,
			{
				trigger: "event" as const,
				eventType: "COLLECTION_FAILED",
				eventPayload: {
					planEntryId: attempt.planEntryId,
					obligationIds: planEntry.obligationIds,
					amount: attempt.amount,
					method: attempt.method,
					retryCount:
						typeof attempt.machineContext?.retryCount === "number"
							? attempt.machineContext.retryCount
							: 0,
				},
			}
		);

		console.info(
			`[emitCollectionFailed] Scheduled COLLECTION_FAILED rules evaluation for attempt=${args.entityId}`
		);
	},
});

/**
 * Domain field patch: writes providerRef onto the attempt entity.
 */
export const recordProviderRef = internalMutation({
	args: collectionAttemptEffectValidator,
	handler: async (ctx, args) => {
		const providerRef = args.payload?.providerRef;
		if (typeof providerRef === "string") {
			await ctx.db.patch(args.entityId, { providerRef });
		}
	},
});

/**
 * Stub effect: notifies admin of permanent collection failure.
 * Phase 1 — log only; real notification in Phase 2+.
 */
export const notifyAdmin = internalMutation({
	args: collectionAttemptEffectValidator,
	handler: async (_ctx, args) => {
		console.info(
			`[notifyAdmin] stub — permanent failure on attempt=${args.entityId}`
		);
	},
});
