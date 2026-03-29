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
import {
	obligationTypeToTransferType,
	PROVIDER_CODES,
} from "../../payments/transfers/types";
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

		// ─── Phase M2a: Create parallel transfer record for audit trail ───
		// Decision D4: Bridged transfers skip cash posting in publishTransferConfirmed
		// because the collection attempt path already posted via postCashReceiptForObligation().
		//
		// The bridge creates the transfer at "initiated" then immediately fires
		// FUNDS_SETTLED via executeTransition, maintaining GT compliance:
		// audit journal, hash chain, and effect scheduling all go through the engine.
		const bridgeIdempotencyKey = `transfer:bridge:${args.entityId}`;
		const existingBridge = await ctx.db
			.query("transferRequests")
			.withIndex("by_idempotency", (q) =>
				q.eq("idempotencyKey", bridgeIdempotencyKey)
			)
			.first();

		if (!existingBridge) {
			const firstOblForBridge = await ctx.db.get(planEntry.obligationIds[0]);
			if (firstOblForBridge?.borrowerId) {
				const now = Date.now();
				const bridgeTransferId = await ctx.db.insert("transferRequests", {
					orgId: firstOblForBridge.orgId,
					status: "initiated",
					direction: "inbound",
					transferType: obligationTypeToTransferType(firstOblForBridge.type),
					amount: attempt.amount,
					currency: "CAD",
					counterpartyType: "borrower",
					counterpartyId: String(firstOblForBridge.borrowerId),
					mortgageId: firstOblForBridge.mortgageId,
					obligationId: planEntry.obligationIds[0],
					planEntryId: planEntry._id,
					collectionAttemptId: args.entityId,
					providerCode: (PROVIDER_CODES as readonly string[]).includes(
						planEntry.method ?? ""
					)
						? (planEntry.method as (typeof PROVIDER_CODES)[number])
						: "manual",
					providerRef: attempt.providerRef ?? `bridge_${args.entityId}`,
					idempotencyKey: bridgeIdempotencyKey,
					source: args.source,
					createdAt: now,
					lastTransitionAt: now,
				});

				// Fire GT transition to reach confirmed state — creates audit journal
				// + hash chain entry. publishTransferConfirmed will see collectionAttemptId
				// and skip cash posting (D4 conditional).
				await executeTransition(ctx, {
					entityType: "transfer",
					entityId: bridgeTransferId,
					eventType: "FUNDS_SETTLED",
					payload: { settledAt: now, providerData: { bridged: true } },
					source: args.source,
				});
			} else {
				console.warn(
					`[emitPaymentReceived] Cannot create bridge transfer for attempt=${args.entityId}: no borrowerId on obligation ${planEntry.obligationIds[0]}`
				);
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
		const planEntry = await ctx.db.get(attempt.planEntryId);
		if (!planEntry) {
			throw new Error(
				`[executeReversalCascadeStep] Plan entry not found: ${attempt.planEntryId} (attempt=${args.entityId})`
			);
		}

		for (const obligationId of planEntry.obligationIds) {
			const obligation = await ctx.db.get(obligationId);
			if (!obligation) {
				throw new Error(
					`[executeReversalCascadeStep] Obligation not found: ${obligationId} ` +
						`(attempt=${args.entityId}). Cannot complete reversal — ` +
						"the cash ledger would be left in an inconsistent state."
				);
			}

			// Capture status BEFORE cascade — postPaymentReversalCascade does not
			// modify obligation status today, but capturing early prevents a latent
			// bug if the cascade is ever extended to update status.
			const shouldCreateCorrective = obligation.status === "settled";

			console.info(
				`[executeReversalCascadeStep] Starting reversal cascade for attempt=${args.entityId}, obligation=${obligationId}`
			);

			const cascadeResult = await postPaymentReversalCascade(ctx, {
				attemptId: args.entityId,
				obligationId,
				mortgageId: obligation.mortgageId,
				effectiveDate: args.effectiveDate,
				source: args.source,
				reason: args.reason,
			});

			console.info(
				`[executeReversalCascadeStep] Reversal cascade complete for attempt=${args.entityId}, obligation=${obligationId}`
			);

			// Schedule corrective obligation creation (ENG-180)
			// Only for settled obligations — non-settled obligations were never fully
			// paid and don't need a corrective receivable.
			// Skip late_fee obligations — corrective creation is not supported for
			// late fees (they require feeCode/mortgageFeeId and are filtered from
			// corrective queries).
			if (shouldCreateCorrective && obligation.type !== "late_fee") {
				// Derive reversedAmount from the cascade's REVERSAL of CASH_RECEIVED
				// rather than obligation.amount — partial payments mean the attempt
				// may have settled less than the full obligation amount.
				const cashReceivedReversalPrefix = `${IDEMPOTENCY_KEY_PREFIX}reversal:cash-received:`;
				const cashReceivedReversal = cascadeResult.reversalEntries.find((e) =>
					e.idempotencyKey.startsWith(cashReceivedReversalPrefix)
				);
				if (!cashReceivedReversal) {
					throw new Error(
						"[executeReversalCascadeStep] No CASH_RECEIVED reversal entry found in cascade result " +
							`for attempt=${args.entityId}, obligation=${obligationId}. ` +
							"Cannot determine reversedAmount for corrective obligation."
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

				console.info(
					`[executeReversalCascadeStep] Scheduled corrective obligation for attempt=${args.entityId}, obligation=${obligationId}`
				);
			}
		}
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
