import { WorkflowManager } from "@convex-dev/workflow";
import { v } from "convex/values";
import { components, internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { internalMutation } from "../../_generated/server";
import { safeBigintToNumber } from "../../payments/cashLedger/accounts";
import {
	postOverpaymentToUnappliedCash,
	postPaymentReversalCascade,
} from "../../payments/cashLedger/integrations";
import { IDEMPOTENCY_KEY_PREFIX } from "../../payments/cashLedger/types";
import { executeTransition } from "../transition";
import type { CommandSource } from "../types";
import { effectPayloadValidator } from "../validators";

const workflow = new WorkflowManager(components.workflow);

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

async function scheduleCollectionFailedRuleEvaluation(
	ctx: MutationCtx,
	args: CollectionAttemptEffectArgs,
	attempt: {
		amount: number;
		method: string;
		planEntryId: Id<"collectionPlanEntries">;
		machineContext?: Record<string, unknown>;
	},
	planEntry: {
		obligationIds: Id<"obligations">[];
		workoutPlanId?: Id<"workoutPlans">;
	},
	effectLabel: string
) {
	const firstObligationId = planEntry.obligationIds[0];
	if (!firstObligationId) {
		throw new Error(
			`[${effectLabel}] Cannot schedule COLLECTION_FAILED rules evaluation without a linked obligation (attempt=${args.entityId})`
		);
	}

	const firstObligation = await ctx.db.get(firstObligationId);
	if (!firstObligation) {
		throw new Error(
			`[${effectLabel}] Linked obligation not found for attempt=${args.entityId}: ${firstObligationId}`
		);
	}

	await ctx.scheduler.runAfter(
		0,
		internal.payments.collectionPlan.engine.evaluateRules,
		{
			trigger: "event" as const,
			mortgageId: firstObligation.mortgageId,
			eventType: "COLLECTION_FAILED",
			eventPayload: {
				planEntryId: attempt.planEntryId,
				obligationIds: planEntry.obligationIds,
				amount: attempt.amount,
				method: attempt.method,
				workoutPlanId: planEntry.workoutPlanId,
				retryCount:
					typeof attempt.machineContext?.retryCount === "number"
						? attempt.machineContext.retryCount
						: 0,
			},
		}
	);

	console.info(
		`[${effectLabel}] Scheduled COLLECTION_FAILED rules evaluation for attempt=${args.entityId}`
	);
}

export async function runPaymentReversalCascadeForPlanEntry(
	ctx: MutationCtx,
	args: {
		attemptId?: Id<"collectionAttempts">;
		effectiveDate: string;
		planEntryId: Id<"collectionPlanEntries">;
		reason: string;
		source: CommandSource;
		transferRequestId?: Id<"transferRequests">;
	}
) {
	const planEntry = await ctx.db.get(args.planEntryId);
	if (!planEntry) {
		throw new Error(
			`[runPaymentReversalCascadeForPlanEntry] Plan entry not found: ${args.planEntryId}`
		);
	}

	for (const obligationId of planEntry.obligationIds) {
		const obligation = await ctx.db.get(obligationId);
		if (!obligation) {
			throw new Error(
				`[runPaymentReversalCascadeForPlanEntry] Obligation not found: ${obligationId}. ` +
					"Cannot complete reversal without a matching obligation record."
			);
		}

		const shouldCreateCorrective = obligation.status === "settled";

		const cascadeResult = await postPaymentReversalCascade(ctx, {
			attemptId: args.attemptId,
			transferRequestId: args.transferRequestId,
			obligationId,
			mortgageId: obligation.mortgageId,
			effectiveDate: args.effectiveDate,
			source: args.source,
			reason: args.reason,
		});

		if (shouldCreateCorrective && obligation.type !== "late_fee") {
			const cashReceivedReversalPrefix = `${IDEMPOTENCY_KEY_PREFIX}reversal:cash-received:`;
			const cashReceivedReversal = cascadeResult.reversalEntries.find((entry) =>
				entry.idempotencyKey.startsWith(cashReceivedReversalPrefix)
			);
			if (!cashReceivedReversal) {
				throw new Error(
					"[runPaymentReversalCascadeForPlanEntry] No CASH_RECEIVED reversal entry found in cascade result " +
						`for obligation=${obligationId}. Cannot determine reversedAmount for corrective obligation.`
				);
			}

			const reversedAmount = safeBigintToNumber(cashReceivedReversal.amount);

			await ctx.scheduler.runAfter(
				0,
				internal.payments.obligations.createCorrectiveObligation
					.createCorrectiveObligation,
				{
					originalObligationId: obligationId,
					reversedAmount,
					reason: args.reason,
					postingGroupId: cascadeResult.postingGroupId,
					source: args.source,
				}
			);
		}
	}
}

/**
 * Cross-entity effect: fires PAYMENT_APPLIED at each linked obligation.
 * Triggered when a collection attempt transitions to `confirmed` via FUNDS_SETTLED.
 *
 * Boundary note: collection attempts stay execution-only. This effect forwards
 * confirmed money to obligations, which then own mortgage lifecycle and cash
 * meaning. It must not mutate mortgage state directly.
 */
export const emitPaymentReceived = internalMutation({
	args: collectionAttemptEffectValidator,
	handler: async (ctx, args) => {
		const { attempt, planEntry } = await loadAttemptAndPlanEntry(
			ctx,
			args,
			"emitPaymentReceived"
		);
		const settledAt =
			typeof args.payload?.settledAt === "number"
				? args.payload.settledAt
				: Date.now();

		await ctx.db.patch(args.entityId, {
			confirmedAt: attempt.confirmedAt ?? settledAt,
			settledAt: attempt.settledAt ?? settledAt,
		});

		let remainingAmount = attempt.amount;
		const postingGroupId = `cash-receipt:${args.entityId}`;

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
					transferRequestId: attempt.transferRequestId,
					postingGroupId,
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

		// Route any remaining overpayment to UNAPPLIED_CASH
		if (remainingAmount > 0) {
			const firstObligation = await ctx.db.get(planEntry.obligationIds[0]);
			if (firstObligation) {
				await postOverpaymentToUnappliedCash(ctx, {
					attemptId: args.entityId,
					amount: remainingAmount,
					mortgageId: firstObligation.mortgageId,
					borrowerId: firstObligation.borrowerId,
					postingGroupId,
					source: args.source,
				});
			} else {
				console.warn(
					`[emitPaymentReceived] Overpayment of ${remainingAmount} cents but no obligation found for mortgageId resolution. attempt=${args.entityId}`
				);
			}
		}
	},
});

/**
 * No-op traceability effect for repeated settlement observations on already
 * confirmed attempts. The transfer owns the cash journal; this effect only
 * preserves an auditable same-state transition in the GT journal.
 */
export const recordSettlementObserved = internalMutation({
	args: collectionAttemptEffectValidator,
	handler: async () => {
		return;
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

		await scheduleCollectionFailedRuleEvaluation(
			ctx,
			args,
			attempt,
			planEntry,
			"emitCollectionFailed"
		);
	},
});

export const scheduleRetryEntry = internalMutation({
	args: collectionAttemptEffectValidator,
	handler: async (ctx, args) => {
		const { attempt, planEntry } = await loadAttemptAndPlanEntry(
			ctx,
			args,
			"scheduleRetryEntry"
		);

		await scheduleCollectionFailedRuleEvaluation(
			ctx,
			args,
			attempt,
			planEntry,
			"scheduleRetryEntry"
		);
	},
});

/**
 * Stub effect: notifies admin of permanent collection failure.
 * Phase 1 — log only; real notification in Phase 2+.
 */
export const notifyAdmin = internalMutation({
	args: collectionAttemptEffectValidator,
	handler: async (_ctx, args) => {
		console.info(`[notifyAdmin] permanent failure on attempt=${args.entityId}`);
	},
});

/**
 * Mutation step: executes the per-obligation reversal cascade within a
 * durable workflow. Each obligation's reversal is idempotent via
 * postingGroupId, so retries are safe.
 *
 * Called by `reversalCascadeWorkflow` — not directly by the scheduler.
 */
export const executeReversalCascadeStep = internalMutation({
	args: {
		entityId: v.id("collectionAttempts"),
		source: effectPayloadValidator.source,
		reason: v.string(),
		effectiveDate: v.string(),
	},
	handler: async (ctx, args) => {
		const attempt = await ctx.db.get(args.entityId);
		if (!attempt) {
			throw new Error(
				`[executeReversalCascadeStep] Collection attempt not found: ${args.entityId}`
			);
		}
		await runPaymentReversalCascadeForPlanEntry(ctx, {
			attemptId: args.entityId,
			effectiveDate: args.effectiveDate,
			planEntryId: attempt.planEntryId,
			reason: args.reason,
			source: args.source,
		});
	},
});

/**
 * Durable workflow for payment reversal cascade.
 *
 * Wraps executeReversalCascadeStep with automatic retries via the workflow
 * component. The cascade is idempotent via postingGroupId, so retries are
 * safe and will not create duplicate ledger entries.
 *
 * Follows the same pattern as hashChainJournalEntry in engine/hashChain.ts.
 */
export const reversalCascadeWorkflow = workflow.define({
	args: {
		entityId: v.id("collectionAttempts"),
		source: effectPayloadValidator.source,
		reason: v.string(),
		effectiveDate: v.string(),
	},
	handler: async (step, args) => {
		await step.runMutation(
			internal.engine.effects.collectionAttempt.executeReversalCascadeStep,
			{
				entityId: args.entityId,
				source: args.source,
				reason: args.reason,
				effectiveDate: args.effectiveDate,
			}
		);
	},
});

/**
 * Cross-entity effect: triggers cash ledger reversal cascade via durable workflow.
 * Triggered when a collection attempt transitions to `reversed` via PAYMENT_REVERSED.
 *
 * Starts a durable workflow (with automatic retries) that iterates all
 * obligationIds in the plan entry, delegating reversal of each obligation's
 * ledger entries to postPaymentReversalCascade(). Unlike emitPaymentReceived
 * (which tracks partial amounts and breaks early), the workflow unconditionally
 * reverses every obligation — partial reversal would leave the cash ledger
 * inconsistent.
 *
 * Each call is idempotent via posting-group deduplication in the cash ledger,
 * so workflow retries are safe and will not create duplicate entries.
 *
 * Return value (including clawbackRequired) is currently discarded —
 * payout clawback handling is deferred to ENG-175+.
 */
export const emitPaymentReversed = internalMutation({
	args: collectionAttemptEffectValidator,
	handler: async (ctx, args) => {
		const attempt = await ctx.db.get(args.entityId);
		if (!attempt) {
			throw new Error(
				`[emitPaymentReversed] Collection attempt not found: ${args.entityId}`
			);
		}

		let reason: string;
		if (typeof args.payload?.reason === "string") {
			reason = args.payload.reason;
		} else {
			reason = "payment_reversed";
			console.warn(
				`[emitPaymentReversed] No valid reason in payload for attempt=${args.entityId}. Defaulting to "${reason}".`
			);
		}

		// Prefer effectiveDate from event payload (set at event-receive time);
		// fall back to current date if not provided.
		const effectiveDate =
			typeof args.payload?.effectiveDate === "string"
				? args.payload.effectiveDate
				: new Date().toISOString().slice(0, 10);

		await ctx.db.patch(args.entityId, {
			reversedAt: attempt.reversedAt ?? Date.now(),
		});

		if (attempt.transferRequestId) {
			console.info(
				`[emitPaymentReversed] Attempt ${args.entityId} is linked to transfer ${attempt.transferRequestId}; transfer-owned reversal cascade already handled the ledger work.`
			);
			return;
		}

		// Start durable workflow — the workflow component handles retries
		// automatically if the reversal cascade step fails. The cascade is
		// idempotent via postingGroupId so retries are safe.
		await workflow.start(
			ctx,
			internal.engine.effects.collectionAttempt.reversalCascadeWorkflow,
			{
				entityId: args.entityId,
				source: args.source,
				reason,
				effectiveDate,
			},
			{
				startAsync: true,
			}
		);

		console.info(
			`[emitPaymentReversed] Started durable reversal cascade workflow for attempt=${args.entityId}`
		);
	},
});
