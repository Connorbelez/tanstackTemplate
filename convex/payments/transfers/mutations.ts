/**
 * Transfer domain mutations — payment permission-gated operations.
 *
 * `initiateTransfer` remains an action (not mutation) because provider-backed
 * implementations perform external HTTP calls, which only actions can do.
 */

import { ConvexError, v } from "convex/values";
import { internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import { internalAction, internalMutation } from "../../_generated/server";
import { buildSource } from "../../engine/commands";
import { executeTransition } from "../../engine/transition";
import type { CommandSource, TransitionResult } from "../../engine/types";
import { sourceValidator } from "../../engine/validators";
import {
	paymentAction,
	paymentCancelMutation,
	paymentMutation,
	paymentRetryMutation,
} from "../../fluent";
import type { BankAccountValidationResult } from "../bankAccounts/types";
import {
	buildCommitmentDepositIdempotencyKey,
	getCommitmentDepositValidationError,
} from "./depositCollection.logic";
import type { TransferRequestInput } from "./interface";
import { areMockTransferProvidersEnabled } from "./mockProviders";
import { buildPipelineIdempotencyKey } from "./pipeline";
import { validatePipelineFields } from "./pipeline.types";
import { buildPrincipalReturnIdempotencyKey } from "./principalReturn.logic";
import { getTransferProvider } from "./providers/registry";
import {
	InvalidDomainEntityIdError,
	type TransferDirection,
	toDomainEntityId,
} from "./types";
import {
	counterpartyTypeValidator,
	directionValidator,
	legNumberValidator,
	providerCodeValidator,
	transferTypeValidator,
} from "./validators";

export function buildRetryIdempotencyKey(transferId: string) {
	return `retry:${transferId}`;
}

// ── Shared validation for transfer creation ────────────────────────
/**
 * Validates common transfer input fields shared by both public and internal
 * creation paths. Throws ConvexError on validation failure.
 */
function validateTransferCreationInput(args: {
	amount: number;
	pipelineId?: string;
	legNumber?: number;
	providerCode: string;
	counterpartyId: string;
}): string {
	if (!Number.isInteger(args.amount) || args.amount <= 0) {
		throw new ConvexError("Amount must be a positive integer (cents)");
	}

	const pipelineError = validatePipelineFields(args.pipelineId, args.legNumber);
	if (pipelineError) {
		throw new ConvexError(pipelineError);
	}

	if (
		(args.providerCode === "mock_pad" || args.providerCode === "mock_eft") &&
		!areMockTransferProvidersEnabled()
	) {
		throw new ConvexError(
			`Transfer provider "${args.providerCode}" is disabled by default. Set ENABLE_MOCK_PROVIDERS="true" to opt in.`
		);
	}

	try {
		return toDomainEntityId(args.counterpartyId, "counterpartyId");
	} catch (error) {
		if (error instanceof InvalidDomainEntityIdError) {
			throw new ConvexError(error.message);
		}
		throw error;
	}
}

/** Throws a structured ConvexError if the bank-account validation result is invalid. */
function assertBankValidation(
	result: BankAccountValidationResult
): asserts result is { valid: true } {
	if (!result.valid) {
		throw new ConvexError({
			code: result.errorCode,
			message: result.errorMessage,
		});
	}
}

export function canCancelTransferStatus(status: string) {
	return status === "initiated";
}

export function canRetryTransferStatus(status: string) {
	return status === "failed";
}

export function canManuallyConfirmTransferStatus(
	status: string,
	direction?: TransferDirection
) {
	if (direction === "outbound") {
		return status === "pending" || status === "processing";
	}

	return (
		status === "initiated" || status === "pending" || status === "processing"
	);
}

// ── createTransferRequest ──────────────────────────────────────────
/**
 * Creates a new transfer request record with status "initiated".
 * Idempotent: if a transfer with the same idempotencyKey exists, returns
 * the existing record's ID without creating a duplicate.
 */
export const createTransferRequest = paymentMutation
	.input({
		direction: directionValidator,
		transferType: transferTypeValidator,
		amount: v.number(),
		currency: v.optional(v.literal("CAD")),
		counterpartyType: counterpartyTypeValidator,
		counterpartyId: v.string(),
		bankAccountRef: v.optional(v.string()),
		// References
		mortgageId: v.optional(v.id("mortgages")),
		obligationId: v.optional(v.id("obligations")),
		dealId: v.optional(v.id("deals")),
		dispersalEntryId: v.optional(v.id("dispersalEntries")),
		planEntryId: v.optional(v.id("collectionPlanEntries")),
		collectionAttemptId: v.optional(v.id("collectionAttempts")),
		// Participant references (required for ledger scoping)
		lenderId: v.optional(v.id("lenders")),
		borrowerId: v.optional(v.id("borrowers")),
		// Provider & idempotency
		providerCode: providerCodeValidator,
		idempotencyKey: v.string(),
		// Optional metadata
		metadata: v.optional(v.record(v.string(), v.any())),
		pipelineId: v.optional(v.string()),
		legNumber: v.optional(legNumberValidator),
	})
	.handler(async (ctx, args) => {
		// 1. Validate amount is positive integer (safe-integer cents)
		if (!Number.isInteger(args.amount) || args.amount <= 0) {
			throw new ConvexError("Amount must be a positive integer (cents)");
		}

		// 1a. Pipeline fields must be co-required: both present or both absent
		const pipelineError = validatePipelineFields(
			args.pipelineId,
			args.legNumber
		);
		if (pipelineError) {
			throw new ConvexError(pipelineError);
		}

		// 1b. Guard against auth-ID / entity-ID confusion (ENG-218).
		// counterpartyId must stay in domain entity ID space.
		let counterpartyId: TransferRequestInput["counterpartyId"];
		try {
			counterpartyId = toDomainEntityId(args.counterpartyId, "counterpartyId");
		} catch (error) {
			if (error instanceof InvalidDomainEntityIdError) {
				throw new ConvexError(error.message);
			}
			throw error;
		}

		if (
			(args.providerCode === "mock_pad" || args.providerCode === "mock_eft") &&
			!areMockTransferProvidersEnabled()
		) {
			throw new ConvexError(
				`Transfer provider "${args.providerCode}" is disabled by default. Set ENABLE_MOCK_PROVIDERS="true" to opt in.`
			);
		}

		// 2. Idempotency check
		const existing = await ctx.db
			.query("transferRequests")
			.withIndex("by_idempotency", (q) =>
				q.eq("idempotencyKey", args.idempotencyKey)
			)
			.first();

		if (existing) {
			return existing._id;
		}

		// 3. Build source from authenticated viewer
		const source = buildSource(ctx.viewer, "admin_dashboard");

		// 4. Insert transfer record
		const now = Date.now();
		const transferId = await ctx.db.insert("transferRequests", {
			status: "initiated",
			direction: args.direction,
			transferType: args.transferType,
			amount: args.amount,
			currency: args.currency ?? "CAD",
			counterpartyType: args.counterpartyType,
			counterpartyId,
			bankAccountRef: args.bankAccountRef,
			// References
			mortgageId: args.mortgageId,
			obligationId: args.obligationId,
			dealId: args.dealId,
			dispersalEntryId: args.dispersalEntryId,
			planEntryId: args.planEntryId,
			collectionAttemptId: args.collectionAttemptId,
			// Participant references
			lenderId: args.lenderId,
			borrowerId: args.borrowerId,
			// Provider & idempotency
			providerCode: args.providerCode,
			idempotencyKey: args.idempotencyKey,
			source,
			// Pipeline
			pipelineId: args.pipelineId,
			legNumber: args.legNumber,
			// Metadata
			metadata: args.metadata,
			// Timestamps
			createdAt: now,
			lastTransitionAt: now,
		});

		// 5. Return the new transfer ID
		return transferId;
	})
	.public();

// ── fireInitiateTransition (internal) ─────────────────────────────
/** Fires a GT transition on a transfer. Called by the initiateTransfer action. */
export const fireInitiateTransition = internalMutation({
	args: {
		transferId: v.id("transferRequests"),
		eventType: v.union(
			v.literal("FUNDS_SETTLED"),
			v.literal("PROVIDER_INITIATED")
		),
		payload: v.optional(v.record(v.string(), v.any())),
		source: sourceValidator,
	},
	handler: async (ctx, args) => {
		return executeTransition(ctx, {
			entityType: "transfer",
			entityId: args.transferId,
			eventType: args.eventType,
			payload: args.payload as Record<string, unknown> | undefined,
			source: args.source,
		});
	},
});

// ── persistProviderRef (internal) ──────────────────────────────────
/**
 * Patches providerRef onto a transfer record. Used by the immediate-confirm
 * path in initiateTransfer where the state machine transition (FUNDS_SETTLED)
 * does not fire the recordTransferProviderRef effect.
 */
export const persistProviderRef = internalMutation({
	args: {
		transferId: v.id("transferRequests"),
		providerRef: v.string(),
	},
	handler: async (ctx, args) => {
		await ctx.db.patch(args.transferId, { providerRef: args.providerRef });
	},
});

// ── initiateTransfer ───────────────────────────────────────────────
/**
 * Initiates an existing transfer request via the resolved provider.
 * Depending on the provider result, fires either FUNDS_SETTLED (confirmed)
 * or PROVIDER_INITIATED (pending) through the transition engine.
 *
 * This is an action (not mutation) because future providers will make
 * external HTTP calls to VoPay/Rotessa/Plaid, which only actions can do.
 */
export const initiateTransfer = paymentAction
	.input({
		transferId: v.id("transferRequests"),
	})
	.handler(async (ctx, args): Promise<TransitionResult> => {
		const transfer = await ctx.runQuery(
			internal.payments.transfers.queries.getTransferInternal,
			{ transferId: args.transferId }
		);
		if (!transfer) {
			throw new ConvexError("Transfer request not found");
		}

		if (transfer.status !== "initiated") {
			throw new ConvexError(
				`Transfer must be in "initiated" status to initiate, currently: "${transfer.status}"`
			);
		}

		// Schema guarantees these are typed — no unsafe casts needed
		const provider = getTransferProvider(transfer.providerCode);

		let counterpartyId: TransferRequestInput["counterpartyId"];
		try {
			counterpartyId = toDomainEntityId(
				transfer.counterpartyId,
				"counterpartyId"
			);
		} catch (error) {
			if (error instanceof InvalidDomainEntityIdError) {
				throw new ConvexError(error.message);
			}
			throw error;
		}

		// ── Bank account validation gate (ENG-205) ────────────────────
		assertBankValidation(
			await ctx.runQuery(
				internal.payments.bankAccounts.validation
					.validateBankAccountForTransfer,
				{
					counterpartyType: transfer.counterpartyType,
					counterpartyId,
					providerCode: transfer.providerCode,
				}
			)
		);

		const input: TransferRequestInput = {
			amount: transfer.amount,
			bankAccountRef: transfer.bankAccountRef,
			counterpartyId,
			counterpartyType: transfer.counterpartyType,
			currency: transfer.currency,
			direction: transfer.direction,
			idempotencyKey: transfer.idempotencyKey,
			legNumber: transfer.legNumber,
			metadata: transfer.metadata as Record<string, unknown> | undefined,
			pipelineId: transfer.pipelineId,
			providerCode: transfer.providerCode,
			references: {
				mortgageId: transfer.mortgageId,
				obligationId: transfer.obligationId,
				dealId: transfer.dealId,
				dispersalEntryId: transfer.dispersalEntryId,
				planEntryId: transfer.planEntryId,
				collectionAttemptId: transfer.collectionAttemptId,
			},
			source: buildSource(ctx.viewer, "admin_dashboard"),
			transferType: transfer.transferType,
		};

		const result = await provider.initiate(input);
		const source = buildSource(ctx.viewer, "admin_dashboard");

		if (result.status === "confirmed") {
			// Persist providerRef before transitioning — the FUNDS_SETTLED path
			// in the state machine does not fire recordTransferProviderRef, so
			// without this the provider reference would be lost.
			await ctx.runMutation(
				internal.payments.transfers.mutations.persistProviderRef,
				{
					transferId: args.transferId,
					providerRef: result.providerRef,
				}
			);
			return ctx.runMutation(
				internal.payments.transfers.mutations.fireInitiateTransition,
				{
					transferId: args.transferId,
					eventType: "FUNDS_SETTLED",
					payload: {
						settledAt: Date.now(),
						providerData: {},
						providerRef: result.providerRef,
					},
					source,
				}
			);
		}

		return ctx.runMutation(
			internal.payments.transfers.mutations.fireInitiateTransition,
			{
				transferId: args.transferId,
				eventType: "PROVIDER_INITIATED",
				payload: { providerRef: result.providerRef },
				source,
			}
		);
	})
	.public();

// ═══════════════════════════════════════════════════════════════════════
// Internal (system-initiated) mutations for pipeline orchestration
// ═══════════════════════════════════════════════════════════════════════

const PIPELINE_SOURCE: CommandSource = {
	channel: "scheduler",
	actorType: "system",
};

// ── createTransferRequestInternal ──────────────────────────────────
/**
 * Creates a transfer request without RBAC checks.
 * Used by the deal closing pipeline to create system-initiated transfers.
 */
export const createTransferRequestInternal = internalMutation({
	args: {
		direction: directionValidator,
		transferType: transferTypeValidator,
		amount: v.number(),
		currency: v.optional(v.literal("CAD")),
		counterpartyType: counterpartyTypeValidator,
		counterpartyId: v.string(),
		bankAccountRef: v.optional(v.string()),
		// References
		mortgageId: v.optional(v.id("mortgages")),
		obligationId: v.optional(v.id("obligations")),
		dealId: v.optional(v.id("deals")),
		dispersalEntryId: v.optional(v.id("dispersalEntries")),
		planEntryId: v.optional(v.id("collectionPlanEntries")),
		collectionAttemptId: v.optional(v.id("collectionAttempts")),
		// Participant references
		lenderId: v.optional(v.id("lenders")),
		borrowerId: v.optional(v.id("borrowers")),
		// Provider & idempotency
		providerCode: providerCodeValidator,
		idempotencyKey: v.string(),
		// Pipeline
		pipelineId: v.optional(v.string()),
		legNumber: v.optional(legNumberValidator),
		// Metadata
		metadata: v.optional(v.record(v.string(), v.any())),
	},
	handler: async (ctx, args) => {
		// Validate inputs (amount, pipeline co-requirement, mock provider guard, counterparty ID)
		const counterpartyId = validateTransferCreationInput(args);

		// Idempotency check
		const existing = await ctx.db
			.query("transferRequests")
			.withIndex("by_idempotency", (q) =>
				q.eq("idempotencyKey", args.idempotencyKey)
			)
			.first();

		if (existing) {
			return existing._id;
		}

		const now = Date.now();
		return ctx.db.insert("transferRequests", {
			status: "initiated",
			direction: args.direction,
			transferType: args.transferType,
			amount: args.amount,
			currency: args.currency ?? "CAD",
			counterpartyType: args.counterpartyType,
			counterpartyId,
			bankAccountRef: args.bankAccountRef,
			mortgageId: args.mortgageId,
			obligationId: args.obligationId,
			dealId: args.dealId,
			dispersalEntryId: args.dispersalEntryId,
			planEntryId: args.planEntryId,
			collectionAttemptId: args.collectionAttemptId,
			lenderId: args.lenderId,
			borrowerId: args.borrowerId,
			providerCode: args.providerCode,
			idempotencyKey: args.idempotencyKey,
			source: PIPELINE_SOURCE,
			pipelineId: args.pipelineId,
			legNumber: args.legNumber,
			metadata: args.metadata,
			createdAt: now,
			lastTransitionAt: now,
		});
	},
});

// ── initiateTransferInternal ──────────────────────────────────────
/**
 * Initiates a transfer without RBAC checks. Used by pipeline orchestration.
 * Same logic as initiateTransfer but with system source.
 */
export const initiateTransferInternal = internalAction({
	args: {
		transferId: v.id("transferRequests"),
	},
	handler: async (ctx, args): Promise<TransitionResult> => {
		const transfer = await ctx.runQuery(
			internal.payments.transfers.queries.getTransferInternal,
			{ transferId: args.transferId }
		);
		if (!transfer) {
			throw new ConvexError("Transfer request not found");
		}

		// Retry-safe: if the transfer is already beyond "initiated" (e.g., "pending"
		// or "confirmed" from a prior run), return early instead of throwing.
		// This makes pipeline retry/idempotency safe — createDealClosingPipeline and
		// createAndInitiateLeg2 may be re-scheduled by Convex's retry mechanism.
		if (transfer.status !== "initiated") {
			console.info(
				`[initiateTransferInternal] Transfer ${args.transferId} already in "${transfer.status}" — skipping initiation (retry-safe).`
			);
			return {
				entityId: args.transferId,
				status: transfer.status,
			} as TransitionResult;
		}

		const provider = getTransferProvider(transfer.providerCode);

		let counterpartyId: TransferRequestInput["counterpartyId"];
		try {
			counterpartyId = toDomainEntityId(
				transfer.counterpartyId,
				"counterpartyId"
			);
		} catch (error) {
			if (error instanceof InvalidDomainEntityIdError) {
				throw new ConvexError(error.message);
			}
			throw error;
		}

		// ── Bank account validation gate (ENG-205) ────────────────────
		assertBankValidation(
			await ctx.runQuery(
				internal.payments.bankAccounts.validation
					.validateBankAccountForTransfer,
				{
					counterpartyType: transfer.counterpartyType,
					counterpartyId,
					providerCode: transfer.providerCode,
				}
			)
		);

		const input: TransferRequestInput = {
			amount: transfer.amount,
			bankAccountRef: transfer.bankAccountRef,
			counterpartyId,
			counterpartyType: transfer.counterpartyType,
			currency: transfer.currency,
			direction: transfer.direction,
			idempotencyKey: transfer.idempotencyKey,
			legNumber: transfer.legNumber,
			metadata: transfer.metadata as Record<string, unknown> | undefined,
			pipelineId: transfer.pipelineId,
			providerCode: transfer.providerCode,
			references: {
				mortgageId: transfer.mortgageId,
				obligationId: transfer.obligationId,
				dealId: transfer.dealId,
				dispersalEntryId: transfer.dispersalEntryId,
				planEntryId: transfer.planEntryId,
				collectionAttemptId: transfer.collectionAttemptId,
			},
			source: PIPELINE_SOURCE,
			transferType: transfer.transferType,
		};

		const result = await provider.initiate(input);

		if (result.status === "confirmed") {
			await ctx.runMutation(
				internal.payments.transfers.mutations.persistProviderRef,
				{
					transferId: args.transferId,
					providerRef: result.providerRef,
				}
			);
			return ctx.runMutation(
				internal.payments.transfers.mutations.fireInitiateTransition,
				{
					transferId: args.transferId,
					eventType: "FUNDS_SETTLED",
					payload: {
						settledAt: Date.now(),
						providerData: {},
						providerRef: result.providerRef,
					},
					source: PIPELINE_SOURCE,
				}
			);
		}

		return ctx.runMutation(
			internal.payments.transfers.mutations.fireInitiateTransition,
			{
				transferId: args.transferId,
				eventType: "PROVIDER_INITIATED",
				payload: { providerRef: result.providerRef },
				source: PIPELINE_SOURCE,
			}
		);
	},
});

// ── fireDealTransitionInternal ──────────────────────────────────────
/**
 * Fires a transition on a deal entity from system context.
 * Used by the pipeline to fire FUNDS_RECEIVED when Leg 2 completes.
 */
export const fireDealTransitionInternal = internalMutation({
	args: {
		dealId: v.id("deals"),
		eventType: v.literal("FUNDS_RECEIVED"),
		payload: v.optional(
			v.object({
				method: v.union(
					v.literal("vopay"),
					v.literal("wire_receipt"),
					v.literal("manual")
				),
			})
		),
	},
	handler: async (ctx, args) => {
		return executeTransition(ctx, {
			entityType: "deal",
			entityId: args.dealId,
			eventType: args.eventType,
			payload: args.payload as Record<string, unknown> | undefined,
			source: PIPELINE_SOURCE,
		});
	},
});

// ── startDealClosingPipeline ────────────────────────────────────────
/**
 * Admin-facing action to start a deal closing pipeline.
 *
 * Validates the deal is in fundsTransfer.pending, checks idempotency
 * (no existing pipeline for this deal), and kicks off Leg 1.
 *
 * Supported provider codes: "manual" (default), "mock_pad", "mock_eft".
 * Other codes (pad_vopay, eft_vopay, etc.) require the corresponding
 * provider implementation — currently Phase 2+.
 */
export const startDealClosingPipeline = paymentAction
	.input({
		dealId: v.id("deals"),
		leg1Amount: v.number(),
		leg2Amount: v.optional(v.number()),
		providerCode: v.optional(providerCodeValidator),
	})
	.handler(
		async (
			ctx,
			args
		): Promise<{
			pipelineId: string;
			leg1TransferId: Id<"transferRequests"> | undefined;
			alreadyExists: boolean;
		}> => {
			const deal: Doc<"deals"> = await ctx.runQuery(
				internal.deals.queries.getInternalDeal,
				{
					dealId: args.dealId,
				}
			);

			// Validate deal is in fundsTransfer.pending
			if (deal.status !== "fundsTransfer.pending") {
				throw new ConvexError(
					`Deal must be in "fundsTransfer.pending" to start pipeline, currently: "${deal.status}"`
				);
			}

			// Idempotency: check if pipeline already exists for this deal
			const existingTransfers: Doc<"transferRequests">[] = await ctx.runQuery(
				internal.payments.transfers.queries.getPipelineLegsInternal,
				// Query by deterministic pipelineId derived from dealId before creating the pipeline
				{ pipelineId: `deal-closing:${args.dealId}` }
			);

			if (existingTransfers.length > 0) {
				const expectedPipelineId = `deal-closing:${args.dealId}`;
				const pipelineId =
					existingTransfers[0].pipelineId ?? expectedPipelineId;
				console.info(
					`[startDealClosingPipeline] Pipeline already exists for deal ${args.dealId}: ${pipelineId}`
				);
				return {
					pipelineId,
					leg1TransferId: existingTransfers.find(
						(t: Doc<"transferRequests">) => t.legNumber === 1
					)?._id,
					alreadyExists: true,
				};
			}

			// Generate deterministic pipeline ID from dealId
			const pipelineId = `deal-closing:${args.dealId}`;
			const leg2Amount = args.leg2Amount ?? args.leg1Amount;
			const providerCode = args.providerCode ?? "manual";

			const result: {
				pipelineId: string;
				leg1TransferId: Id<"transferRequests">;
			} = await ctx.runAction(
				internal.payments.transfers.pipeline.createDealClosingPipeline,
				{
					dealId: args.dealId,
					pipelineId,
					buyerId: deal.buyerId,
					sellerId: deal.sellerId,
					lenderId: deal.lenderId,
					mortgageId: deal.mortgageId,
					leg1Amount: args.leg1Amount,
					leg2Amount,
					providerCode,
				}
			);

			console.info(
				`[startDealClosingPipeline] Started pipeline for deal ${args.dealId}: ${pipelineId}`
			);

			return { ...result, alreadyExists: false };
		}
	)
	.public();

// ── cancelTransfer ──────────────────────────────────────────────────
/**
 * Cancels a transfer that has not been initiated with a provider yet.
 * Current transfer machine semantics only allow cancellation from `initiated`.
 */
export const cancelTransfer = paymentCancelMutation
	.input({
		transferId: v.id("transferRequests"),
		reason: v.optional(v.string()),
	})
	.handler(async (ctx, args) => {
		const transfer = await ctx.db.get(args.transferId);
		if (!transfer) {
			throw new ConvexError("Transfer request not found");
		}

		if (!canCancelTransferStatus(transfer.status)) {
			throw new ConvexError(
				`Transfer must be in "initiated" status to cancel, currently: "${transfer.status}"`
			);
		}

		const source = buildSource(ctx.viewer, "admin_dashboard");
		return executeTransition(ctx, {
			entityType: "transfer",
			entityId: args.transferId,
			eventType: "TRANSFER_CANCELLED",
			payload: { reason: args.reason ?? "Cancelled by admin" },
			source,
		});
	})
	.public();

// ── retryTransfer ───────────────────────────────────────────────────
/**
 * Creates a fresh transfer request from a failed transfer so the operation
 * can be retried. The retry idempotency key is deterministic per failed
 * transfer record so repeated invocations for the same failed transfer are
 * request-idempotent, while retries of later failed retry records still
 * produce distinct keys.
 */
export const retryTransfer = paymentRetryMutation
	.input({
		transferId: v.id("transferRequests"),
	})
	.handler(async (ctx, args) => {
		const transfer = await ctx.db.get(args.transferId);
		if (!transfer) {
			throw new ConvexError("Transfer request not found");
		}

		if (!canRetryTransferStatus(transfer.status)) {
			throw new ConvexError(
				`Transfer must be in "failed" status to retry, currently: "${transfer.status}"`
			);
		}

		const now = Date.now();

		// Pipeline transfers use a deterministic pipeline-scoped retry key so
		// computePipelineStatus can identify the retry as the active leg.
		// Non-pipeline transfers keep the original per-transfer retry key.
		const retryIdempotencyKey =
			transfer.pipelineId && transfer.legNumber != null
				? `${buildPipelineIdempotencyKey(transfer.pipelineId, transfer.legNumber)}:retry:${args.transferId}`
				: buildRetryIdempotencyKey(`${args.transferId}`);

		const existing = await ctx.db
			.query("transferRequests")
			.withIndex("by_idempotency", (q) =>
				q.eq("idempotencyKey", retryIdempotencyKey)
			)
			.first();
		if (existing) {
			return existing._id;
		}

		const source = buildSource(ctx.viewer, "admin_dashboard");
		const originalMetadata = transfer.metadata as
			| Record<string, unknown>
			| undefined;
		const metadata: Record<string, unknown> = {
			...(originalMetadata ?? {}),
			retryOfTransferId: `${args.transferId}`,
			retriedAt: now,
		};

		return ctx.db.insert("transferRequests", {
			status: "initiated",
			direction: transfer.direction,
			transferType: transfer.transferType,
			amount: transfer.amount,
			currency: transfer.currency,
			counterpartyType: transfer.counterpartyType,
			counterpartyId: transfer.counterpartyId,
			bankAccountRef: transfer.bankAccountRef,
			mortgageId: transfer.mortgageId,
			obligationId: transfer.obligationId,
			dealId: transfer.dealId,
			dispersalEntryId: transfer.dispersalEntryId,
			planEntryId: transfer.planEntryId,
			collectionAttemptId: transfer.collectionAttemptId,
			lenderId: transfer.lenderId,
			borrowerId: transfer.borrowerId,
			providerCode: transfer.providerCode,
			idempotencyKey: retryIdempotencyKey,
			source,
			pipelineId: transfer.pipelineId,
			legNumber: transfer.legNumber,
			metadata,
			createdAt: now,
			lastTransitionAt: now,
		});
	})
	.public();

// ── confirmManualTransfer ───────────────────────────────────────────
/**
 * Confirms settlement for manual transfers without calling a provider API.
 * This supports permission-gated manual cash/cheque/wire flows.
 */
export const confirmManualTransfer = paymentMutation
	.input({
		transferId: v.id("transferRequests"),
		providerRef: v.optional(v.string()),
	})
	.handler(async (ctx, args) => {
		const transfer = await ctx.db.get(args.transferId);
		if (!transfer) {
			throw new ConvexError("Transfer request not found");
		}

		if (transfer.providerCode !== "manual") {
			throw new ConvexError(
				`Only manual transfers can be confirmed manually, got "${transfer.providerCode}"`
			);
		}

		if (
			!canManuallyConfirmTransferStatus(transfer.status, transfer.direction)
		) {
			const allowedStates =
				transfer.direction === "outbound"
					? `"pending" or "processing"`
					: `"initiated", "pending", or "processing"`;
			throw new ConvexError(
				`Transfer must be in ${allowedStates} status to confirm manually, currently: "${transfer.status}"`
			);
		}

		const now = Date.now();
		const providerRef =
			args.providerRef ?? transfer.providerRef ?? `manual_${now}`;
		if (transfer.providerRef !== providerRef) {
			await ctx.db.patch(args.transferId, { providerRef });
		}

		const source = buildSource(ctx.viewer, "admin_dashboard");
		return executeTransition(ctx, {
			entityType: "transfer",
			entityId: args.transferId,
			eventType: "FUNDS_SETTLED",
			payload: {
				settledAt: now,
				providerData: {
					providerRef,
					method: "manual",
				},
			},
			source,
		});
	})
	.public();

// ── collectCommitmentDepositAdmin ───────────────────────────────────
/**
 * Admin-facing action to trigger commitment deposit collection.
 * Validates deal consistency when `dealId` is set, and returns early with
 * `alreadyExists` when a non-initiated commitment deposit transfer already
 * exists for the idempotency key.
 */
export const collectCommitmentDepositAdmin = paymentAction
	.input({
		dealId: v.optional(v.id("deals")),
		applicationId: v.optional(v.string()),
		borrowerId: v.id("borrowers"),
		mortgageId: v.id("mortgages"),
		amount: v.number(),
		providerCode: v.optional(providerCodeValidator),
	})
	.handler(async (ctx, args) => {
		const validationError = getCommitmentDepositValidationError({
			dealId: args.dealId,
			applicationId: args.applicationId,
			amount: args.amount,
		});
		if (validationError) {
			throw new ConvexError(validationError);
		}

		if (args.dealId) {
			const deal = await ctx.runQuery(internal.deals.queries.getInternalDeal, {
				dealId: args.dealId,
			});

			if (deal.status === "confirmed" || deal.status === "failed") {
				throw new ConvexError(
					`Cannot collect commitment deposit: deal is in terminal state "${deal.status}"`
				);
			}

			if (deal.mortgageId !== args.mortgageId) {
				throw new ConvexError("mortgageId does not match the deal's mortgage");
			}

			// TODO(ENG-xxx): deal.buyerId is a WorkOS authId (v.string()), but
			// args.borrowerId is v.id("borrowers"). A proper ownership check needs
			// to resolve borrower → user → authId before comparing to deal.buyerId.
			// Skipping this check until the schema is unified. See PR #300 review.
		}

		const idempotencyKey = buildCommitmentDepositIdempotencyKey(
			args.dealId,
			args.applicationId
		);

		const existing = await ctx.runQuery(
			internal.payments.transfers.queries.getTransferByIdempotencyKeyInternal,
			{ idempotencyKey }
		);

		if (existing && existing.transferType === "commitment_deposit_collection") {
			if (
				existing.status === "confirmed" ||
				existing.status === "pending" ||
				existing.status === "processing"
			) {
				console.info(
					`[collectCommitmentDepositAdmin] Commitment deposit transfer already exists (${existing._id}, status=${existing.status}) for idempotency key ${idempotencyKey}`
				);
				return {
					transferId: existing._id,
					alreadyExists: true,
				};
			}

			if (existing.status === "failed") {
				throw new ConvexError(
					`A commitment deposit transfer exists but failed (${existing._id}). Use the transfer retry flow or cancel before collecting again.`
				);
			}

			if (existing.status !== "initiated") {
				throw new ConvexError(
					`A commitment deposit transfer exists in terminal status "${existing.status}" (${existing._id}). This transfer cannot be retried — resolve at the deal level or create a new deposit collection.`
				);
			}
		}

		const result = await ctx.runAction(
			internal.payments.transfers.depositCollection.collectCommitmentDeposit,
			{
				dealId: args.dealId,
				applicationId: args.applicationId,
				borrowerId: args.borrowerId,
				mortgageId: args.mortgageId,
				amount: args.amount,
				providerCode: args.providerCode,
			}
		);

		return { ...result, alreadyExists: false };
	})
	.public();

// ── returnInvestorPrincipal ─────────────────────────────────────────
/**
 * Admin-facing action to trigger investor principal return.
 * Validates the deal is in a post-close state, checks idempotency,
 * and delegates to the principalReturn orchestrator.
 */
export const returnInvestorPrincipal = paymentAction
	.input({
		dealId: v.id("deals"),
		sellerId: v.string(),
		lenderId: v.id("lenders"),
		mortgageId: v.id("mortgages"),
		principalAmount: v.number(),
		prorationAdjustment: v.optional(v.number()),
		providerCode: v.optional(providerCodeValidator),
		bankAccountRef: v.optional(v.string()),
	})
	.handler(async (ctx, args) => {
		// Validate deal exists and is in a post-close state
		const deal = await ctx.runQuery(internal.deals.queries.getInternalDeal, {
			dealId: args.dealId,
		});
		if (deal.status !== "confirmed") {
			throw new ConvexError(
				`Deal must be in "confirmed" status for principal return, currently: "${deal.status}"`
			);
		}

		// Check idempotency
		const idempotencyKey = buildPrincipalReturnIdempotencyKey(
			args.dealId,
			args.sellerId
		);
		const existing = await ctx.runQuery(
			internal.payments.transfers.queries.getTransferByIdempotencyKeyInternal,
			{ idempotencyKey }
		);
		if (existing && existing.transferType === "lender_principal_return") {
			if (
				existing.status === "confirmed" ||
				existing.status === "pending" ||
				existing.status === "processing"
			) {
				return { transferId: existing._id, alreadyExists: true };
			}
			if (existing.status === "failed") {
				throw new ConvexError(
					`A principal return transfer exists but failed (${existing._id}). Use the retry flow or cancel before trying again.`
				);
			}
			if (existing.status !== "initiated") {
				throw new ConvexError(
					`A principal return transfer exists in terminal status "${existing.status}" (${existing._id}). This transfer cannot be retried — resolve at the deal level or create a new principal return.`
				);
			}
		}

		const result = await ctx.runAction(
			internal.payments.transfers.principalReturn.createPrincipalReturn,
			{
				dealId: args.dealId,
				sellerId: args.sellerId,
				lenderId: args.lenderId,
				mortgageId: args.mortgageId,
				principalAmount: args.principalAmount,
				prorationAdjustment: args.prorationAdjustment ?? 0,
				providerCode: args.providerCode ?? "manual",
				bankAccountRef: args.bankAccountRef,
			}
		);

		return { ...result, alreadyExists: false };
	})
	.public();
