import { v } from "convex/values";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { internalMutation } from "../../_generated/server";
import { safeBigintToNumber } from "../../payments/cashLedger/accounts";
import {
	postCashReceiptForTransfer,
	postLenderPayoutForTransfer,
	postTransferReversal,
} from "../../payments/cashLedger/integrations";
import {
	reconcileAttemptLinkedInboundCancellation,
	reconcileAttemptLinkedInboundFailure,
	reconcileAttemptLinkedInboundReversal,
	reconcileAttemptLinkedInboundSettlement,
} from "../../payments/transfers/collectionAttemptReconciliation";
import { extractLeg1Metadata } from "../../payments/transfers/pipeline.types";
import type { ProviderCode } from "../../payments/transfers/types";
import { PROVIDER_CODES } from "../../payments/transfers/types";
import { appendAuditJournalEntry } from "../auditJournal";
import type { CommandSource } from "../types";
import { effectPayloadValidator } from "../validators";

function assertProviderCode(value: string): ProviderCode {
	if ((PROVIDER_CODES as readonly string[]).includes(value)) {
		return value as ProviderCode;
	}
	throw new Error(
		`[transfer-effects] Unknown provider code: "${value}". ` +
			`Expected one of: ${PROVIDER_CODES.join(", ")}`
	);
}

const transferEffectValidator = {
	...effectPayloadValidator,
	entityId: v.id("transferRequests"),
	entityType: v.literal("transfer"),
};

interface TransferEffectArgs {
	effectName: string;
	entityId: Id<"transferRequests">;
	entityType: "transfer";
	eventType: string;
	journalEntryId: string;
	payload?: Record<string, unknown>;
	source: CommandSource;
}

async function loadTransfer(
	ctx: MutationCtx,
	args: TransferEffectArgs,
	effectLabel: string
) {
	const transfer = await ctx.db.get(args.entityId);
	if (!transfer) {
		throw new Error(
			`[${effectLabel}] Transfer request not found: ${args.entityId}`
		);
	}
	return transfer;
}

/**
 * Domain field patch: writes providerRef onto the transfer entity.
 */
export const recordTransferProviderRef = internalMutation({
	args: transferEffectValidator,
	handler: async (ctx, args) => {
		const transfer = await loadTransfer(ctx, args, "recordTransferProviderRef");

		const providerRef = args.payload?.providerRef;
		if (typeof providerRef === "string") {
			await ctx.db.patch(transfer._id, { providerRef });
		} else {
			console.warn(
				`[recordTransferProviderRef] providerRef missing or non-string in payload for transfer ${args.entityId}. ` +
					`Got: ${typeof providerRef === "undefined" ? "undefined" : JSON.stringify(providerRef)}`
			);
		}
	},
});

/**
 * Settles a transfer and posts cash ledger entries (unless bridged via collection attempt).
 *
 * Decision D4 conditional: When collectionAttemptId is set, cash was already
 * posted via the collection attempt path. Only settledAt is patched.
 *
 * Always patches settledAt on the transfer record. Cash ledger posting only
 * occurs for non-bridged transfers with a known direction.
 *
 * Boundary note: this effect does not inspect collection-plan strategy state.
 * It only uses explicit transfer linkage (collectionAttemptId) at the
 * reconciliation seam; money meaning stays transfer- or obligation-driven.
 */
export const publishTransferConfirmed = internalMutation({
	args: transferEffectValidator,
	handler: async (ctx, args) => {
		const transfer = await loadTransfer(ctx, args, "publishTransferConfirmed");

		// Preserve the provider's settlement timestamp when available (e.g. webhook/reconciliation replays).
		// Falls back to current time for real-time confirmations.
		const settledAt =
			typeof args.payload?.settledAt === "number"
				? args.payload.settledAt
				: Date.now();

		// Persist settledAt BEFORE posting cash so posting helpers see the authoritative timestamp.
		await ctx.db.patch(args.entityId, { settledAt });

		const reconciledAttempt = await reconcileAttemptLinkedInboundSettlement(
			ctx,
			{
				transfer,
				settledAt,
				source: args.source,
			}
		);

		// Attempt-linked inbound transfers keep business settlement and cash posting
		// on the Collection Attempt path. Outbound and non-attempt-linked transfers
		// still post directly from the transfer effect.
		if (reconciledAttempt) {
			console.info(
				`[publishTransferConfirmed] Attempt-linked inbound transfer ${args.entityId} reconciled through collection attempt settlement. Skipping transfer-owned cash posting.`
			);
		} else if (transfer.direction === "inbound") {
			await postCashReceiptForTransfer(ctx, {
				transferRequestId: args.entityId,
				source: args.source,
			});
		} else if (transfer.direction === "outbound") {
			await postLenderPayoutForTransfer(ctx, {
				transferRequestId: args.entityId,
				source: args.source,
			});
		} else {
			// Missing direction on a non-bridged confirmed transfer is a data integrity violation.
			// Schema requires direction, so this should never happen — but if it does, fail loudly.
			throw new Error(
				`[publishTransferConfirmed] Transfer ${args.entityId} has no direction set. ` +
					"Cannot post cash entry — this is a data integrity violation."
			);
		}

		// ── Dispersal entry lifecycle (disbursement confirmation) ────────
		// Read before patching — if the entry was deleted, log an error but
		// do NOT throw. The transfer settlement and cash posting must not be
		// rolled back because of a missing dispersal entry reference.
		if (
			transfer.transferType === "lender_dispersal_payout" &&
			transfer.dispersalEntryId
		) {
			const dispersalEntry = await ctx.db.get(transfer.dispersalEntryId);
			if (dispersalEntry) {
				const settledDate = new Date(settledAt).toISOString().slice(0, 10);
				const previousStatus = dispersalEntry.status;

				await ctx.db.patch(transfer.dispersalEntryId, {
					status: "disbursed" as const,
					payoutDate: settledDate,
				});

				await appendAuditJournalEntry(ctx, {
					entityType: "dispersalEntry",
					entityId: `${transfer.dispersalEntryId}`,
					eventType: "DISBURSEMENT_CONFIRMED",
					organizationId: dispersalEntry.orgId,
					previousState: previousStatus,
					newState: "disbursed",
					outcome: "transitioned",
					actorId: args.source.actorId ?? "system",
					actorType: args.source.actorType,
					channel: args.source.channel,
					payload: {
						transferRequestId: `${args.entityId}`,
						payoutDate: settledDate,
						amount: transfer.amount,
						lenderId: transfer.lenderId ? `${transfer.lenderId}` : undefined,
					},
					timestamp: Date.now(),
				});

				console.info(
					`[publishTransferConfirmed] Dispersal entry ${transfer.dispersalEntryId} → disbursed (payoutDate: ${settledDate})`
				);
			} else {
				console.error(
					`[publishTransferConfirmed] Dispersal entry ${transfer.dispersalEntryId} not found — ` +
						`transfer ${args.entityId} settled but entry status not updated. ` +
						"Data integrity violation: investigate manually."
				);
			}
		}

		// ── Pipeline orchestration (post-cash, async-scheduled) ───────
		// Cash posting is committed above. Pipeline follow-ups are scheduled
		// asynchronously so failures don't roll back cash ledger entries.
		try {
			await handlePipelineLegConfirmed(ctx, transfer);
		} catch (error) {
			// Intentionally do not rethrow: pipeline failures must not roll back
			// settledAt or cash-ledger postings already performed above.
			console.error(
				"[publishTransferConfirmed] Pipeline orchestration failed after cash posting",
				{
					transferId: args.entityId,
					error,
				}
			);
		}
	},
});

/**
 * Maps a transfer provider code to the deal machine's FUNDS_RECEIVED method union.
 * The deal machine only accepts "vopay" | "wire_receipt" | "manual".
 */
function mapProviderToFundsMethod(
	providerCode: string
): "vopay" | "wire_receipt" | "manual" {
	switch (providerCode) {
		case "pad_vopay":
		case "eft_vopay":
			return "vopay";
		case "wire":
			return "wire_receipt";
		case "manual":
			return "manual";
		default:
			// Mock providers and future providers default to "manual".
			// Warn so new providers don't silently get the wrong method type.
			console.warn(
				`[mapProviderToFundsMethod] Unknown provider code "${providerCode}" — ` +
					`defaulting to "manual". If this is a new provider, add an explicit mapping.`
			);
			return "manual";
	}
}

/**
 * Handles pipeline-aware follow-up after a transfer leg is confirmed.
 *
 * - Leg 1 confirmed → schedule Leg 2 creation + initiation (idempotent check first)
 * - Leg 2 confirmed → schedule FUNDS_RECEIVED on the deal machine
 *
 * Uses ctx.scheduler to decouple pipeline orchestration from cash posting.
 */
async function handlePipelineLegConfirmed(
	ctx: MutationCtx,
	transfer: {
		_id: Id<"transferRequests">;
		pipelineId?: string;
		legNumber?: number;
		transferType: string;
		dealId?: Id<"deals">;
		mortgageId?: Id<"mortgages">;
		providerCode: string;
		metadata?: Record<string, unknown>;
	}
) {
	// Not a pipeline transfer — nothing to do
	if (!transfer.pipelineId || transfer.legNumber == null) {
		return;
	}

	if (
		transfer.legNumber === 1 &&
		transfer.transferType === "deal_principal_transfer"
	) {
		// Leg 1 confirmed → create and initiate Leg 2
		// Fail closed: missing dealId/mortgageId on a pipeline leg is a data integrity
		// violation that would leave buyer funds stuck in trust with no Leg 2.
		if (!(transfer.dealId && transfer.mortgageId)) {
			throw new Error(
				`[handlePipelineLegConfirmed] Leg 1 transfer ${transfer._id} missing dealId or mortgageId — ` +
					`cannot create Leg 2. Pipeline ${transfer.pipelineId} is now stuck. ` +
					"This is a data integrity violation."
			);
		}

		// Idempotency guard: check if Leg 2 already exists (protects against
		// reconciliation healing re-triggering pipeline orchestration).
		const existingLeg2 = await ctx.db
			.query("transferRequests")
			.withIndex("by_pipeline", (q) =>
				q.eq("pipelineId", transfer.pipelineId).eq("legNumber", 2)
			)
			.first();

		if (existingLeg2) {
			console.info(
				`[handlePipelineLegConfirmed] Leg 2 already exists (${existingLeg2._id}) for pipeline ${transfer.pipelineId} — skipping`
			);
			return;
		}

		// Extract Leg 2 config from Leg 1 metadata (typed via DealClosingLeg1Metadata)
		const leg1Meta = extractLeg1Metadata(
			transfer.metadata as Record<string, unknown> | undefined
		);

		// Fail closed: missing metadata on a confirmed Leg 1 means the pipeline
		// creator didn't set sellerId/leg2Amount — funds would be stuck in trust.
		if (!leg1Meta) {
			throw new Error(
				`[handlePipelineLegConfirmed] Leg 1 transfer ${transfer._id} has invalid or missing pipeline metadata. ` +
					"Expected DealClosingLeg1Metadata shape. " +
					`Pipeline ${transfer.pipelineId} cannot create Leg 2.`
			);
		}

		console.info(
			`[handlePipelineLegConfirmed] Leg 1 confirmed for pipeline ${transfer.pipelineId} — scheduling Leg 2`
		);

		await ctx.scheduler.runAfter(
			0,
			internal.payments.transfers.pipeline.createAndInitiateLeg2,
			{
				pipelineId: transfer.pipelineId,
				dealId: transfer.dealId,
				sellerId: leg1Meta.sellerId,
				lenderId: leg1Meta.lenderId as Id<"lenders"> | undefined,
				mortgageId: transfer.mortgageId,
				leg2Amount: leg1Meta.leg2Amount,
				providerCode: assertProviderCode(transfer.providerCode),
			}
		);
	} else if (
		transfer.legNumber === 2 &&
		transfer.transferType === "deal_seller_payout"
	) {
		// Leg 2 confirmed → fire FUNDS_RECEIVED on the deal machine
		// Fail closed: missing dealId means deal will never transition to confirmed
		// despite both legs completing — a contradictory state.
		if (!transfer.dealId) {
			throw new Error(
				`[handlePipelineLegConfirmed] Leg 2 transfer ${transfer._id} has no dealId — ` +
					`cannot fire FUNDS_RECEIVED. Pipeline ${transfer.pipelineId} completed but deal is stuck. ` +
					"This is a data integrity violation."
			);
		}

		console.info(
			`[handlePipelineLegConfirmed] Leg 2 confirmed for pipeline ${transfer.pipelineId} — firing FUNDS_RECEIVED on deal ${transfer.dealId}`
		);

		await ctx.scheduler.runAfter(
			0,
			internal.payments.transfers.mutations.fireDealTransitionInternal,
			{
				dealId: transfer.dealId,
				eventType: "FUNDS_RECEIVED",
				payload: { method: mapProviderToFundsMethod(transfer.providerCode) },
			}
		);
	}
}

/**
 * Records transfer failure metadata on the transfer entity.
 */
export const publishTransferFailed = internalMutation({
	args: transferEffectValidator,
	handler: async (ctx, args) => {
		const transfer = await loadTransfer(ctx, args, "publishTransferFailed");

		const rawErrorCode = args.payload?.errorCode;
		const rawReason = args.payload?.reason;
		const errorCode =
			typeof rawErrorCode === "string" ? rawErrorCode : "UNKNOWN";
		const reason =
			typeof rawReason === "string" ? rawReason : "unknown_failure";

		if (typeof rawErrorCode !== "string" || typeof rawReason !== "string") {
			console.warn(
				`[publishTransferFailed] Missing or non-string error metadata for transfer ${args.entityId}. ` +
					`errorCode: ${JSON.stringify(rawErrorCode)}, reason: ${JSON.stringify(rawReason)}. ` +
					`Defaulting to errorCode="${errorCode}", reason="${reason}".`
			);
		}

		await ctx.db.patch(args.entityId, {
			failedAt: Date.now(),
			failureReason: reason,
			failureCode: errorCode,
		});

		await reconcileAttemptLinkedInboundFailure(ctx, {
			transfer,
			failureCode: errorCode,
			failureReason: reason,
			source: args.source,
		});

		console.warn(
			`[publishTransferFailed] Transfer ${args.entityId} failed: ${reason} (${errorCode})`
		);

		// ── Dispersal entry failure ─────────────────────────────────────
		// Read before patching — same defensive pattern as publishTransferConfirmed.
		if (
			transfer.transferType === "lender_dispersal_payout" &&
			transfer.dispersalEntryId
		) {
			const dispersalEntry = await ctx.db.get(transfer.dispersalEntryId);
			if (dispersalEntry) {
				const previousStatus = dispersalEntry.status;

				await ctx.db.patch(transfer.dispersalEntryId, {
					status: "failed" as const,
				});

				await appendAuditJournalEntry(ctx, {
					entityType: "dispersalEntry",
					entityId: `${transfer.dispersalEntryId}`,
					eventType: "DISBURSEMENT_FAILED",
					organizationId: dispersalEntry.orgId,
					previousState: previousStatus,
					newState: "failed",
					outcome: "transitioned",
					actorId: args.source.actorId ?? "system",
					actorType: args.source.actorType,
					channel: args.source.channel,
					payload: {
						transferRequestId: `${args.entityId}`,
						failureCode: errorCode,
						failureReason: reason,
					},
					timestamp: Date.now(),
				});

				console.warn(
					`[publishTransferFailed] Dispersal entry ${transfer.dispersalEntryId} → failed (transfer: ${args.entityId}, reason: ${reason})`
				);
			} else {
				console.error(
					`[publishTransferFailed] Dispersal entry ${transfer.dispersalEntryId} not found — ` +
						`transfer ${args.entityId} failure recorded but entry status not updated. ` +
						"Investigate manually."
				);
			}
		}

		// ── Pipeline failure handling ─────────────────────────────────
		await handlePipelineLegFailed(
			ctx,
			{
				_id: transfer._id,
				pipelineId: transfer.pipelineId,
				legNumber: transfer.legNumber,
				dealId: transfer.dealId,
				metadata: transfer.metadata as Record<string, unknown> | undefined,
			},
			reason,
			errorCode
		);
	},
});

/**
 * Mirrors transfer cancellation back onto the linked Collection Attempt for
 * canonical inbound collection executions.
 */
export const publishTransferCancelled = internalMutation({
	args: transferEffectValidator,
	handler: async (ctx, args) => {
		const transfer = await loadTransfer(ctx, args, "publishTransferCancelled");
		const reason =
			typeof args.payload?.reason === "string"
				? args.payload.reason
				: "transfer_cancelled";

		const reconciledAttempt = await reconcileAttemptLinkedInboundCancellation(
			ctx,
			{
				transfer,
				reason,
				source: args.source,
			}
		);

		if (reconciledAttempt) {
			console.info(
				`[publishTransferCancelled] Attempt-linked inbound transfer ${args.entityId} cancelled its linked collection attempt.`
			);
		}
	},
});

/**
 * Handles pipeline-aware follow-up after a transfer leg fails.
 *
 * - Leg 1 fails: deal stays in fundsTransfer.pending. No Leg 2 created.
 * - Leg 2 fails after Leg 1 confirmed: partial failure — buyer funds held in trust.
 *   Manual resolution by an admin is required; failure details are logged.
 *
 * Does NOT auto-cancel Leg 1 if Leg 2 fails — funds already received.
 */
async function handlePipelineLegFailed(
	ctx: MutationCtx,
	transfer: {
		_id: Id<"transferRequests">;
		pipelineId?: string;
		legNumber?: number;
		dealId?: Id<"deals">;
		metadata?: Record<string, unknown>;
	},
	reason: string,
	errorCode: string
) {
	if (!transfer.pipelineId || transfer.legNumber == null) {
		return;
	}

	const failureType =
		transfer.legNumber === 2 ? "partial_failure" : "leg1_failure";

	// Durable record: patch pipeline failure context onto the transfer metadata.
	// This ensures the failure is queryable via getPipelineStatus and admin dashboards
	// even if ephemeral logs are lost.
	const existingMetadata = (transfer.metadata ?? {}) as Record<string, unknown>;
	await ctx.db.patch(transfer._id, {
		metadata: {
			...existingMetadata,
			pipelineFailure: {
				type: failureType,
				pipelineId: transfer.pipelineId,
				legNumber: transfer.legNumber,
				reason,
				errorCode,
				failedAt: Date.now(),
				requiresAdminResolution: transfer.legNumber === 2,
			},
		},
	});

	if (transfer.legNumber === 1) {
		console.error(
			`[handlePipelineLegFailed] Pipeline ${transfer.pipelineId} FAILED at Leg 1. ` +
				`Deal ${transfer.dealId ?? "unknown"} stays in fundsTransfer.pending. ` +
				`No Leg 2 will be created. Reason: ${reason} (${errorCode}). ` +
				"Admin intervention required."
		);
	} else if (transfer.legNumber === 2) {
		console.error(
			`[handlePipelineLegFailed] Pipeline ${transfer.pipelineId} PARTIAL FAILURE at Leg 2. ` +
				"Leg 1 was confirmed — buyer funds are held in TRUST_CASH. " +
				`Deal ${transfer.dealId ?? "unknown"} will NOT transition to confirmed. ` +
				`Reason: ${reason} (${errorCode}). ` +
				"Manual resolution required — admin must retry Leg 2 or resolve manually."
		);
	}

	// TODO: Replace console.error with structured admin alert system (e.g. Resend email,
	// adminAlerts table) when notification infrastructure is available. Pipeline failures
	// represent stranded funds and require prompt human intervention.
}

/**
 * Records transfer reversal metadata and posts a cash ledger reversal if
 * a matching journal entry exists.
 *
 * Always patches reversedAt and reversalRef on the transfer entity.
 * Cash ledger reversal only occurs if a journal entry exists.
 * Bridged transfers (collectionAttemptId set) are expected to lack journal
 * entries — their cash was reversed via the collection attempt path.
 */
export const publishTransferReversed = internalMutation({
	args: transferEffectValidator,
	handler: async (ctx, args) => {
		const transfer = await loadTransfer(ctx, args, "publishTransferReversed");

		const reversalRef =
			typeof args.payload?.reversalRef === "string"
				? args.payload.reversalRef
				: undefined;
		const reason =
			typeof args.payload?.reason === "string"
				? args.payload.reason
				: "transfer_reversed";
		const effectiveDate =
			typeof args.payload?.effectiveDate === "string"
				? args.payload.effectiveDate
				: new Date().toISOString().slice(0, 10);

		await ctx.db.patch(args.entityId, {
			reversedAt: Date.now(),
			reversalRef,
		});

		await reconcileAttemptLinkedInboundReversal(ctx, {
			transfer,
			reason,
			effectiveDate,
			source: args.source,
		});

		// Look up original journal entry for cash reversal
		const originalEntry = await ctx.db
			.query("cash_ledger_journal_entries")
			.withIndex("by_transfer_request", (q) =>
				q.eq("transferRequestId", args.entityId)
			)
			.first();

		if (originalEntry) {
			const journalAmount = safeBigintToNumber(originalEntry.amount);
			const amount = transfer.amount ?? journalAmount;

			if (transfer.amount != null && transfer.amount !== journalAmount) {
				console.warn(
					`[publishTransferReversed] Amount mismatch for transfer ${args.entityId}: ` +
						`transfer.amount=${transfer.amount}, journal.amount=${journalAmount}. ` +
						"Using transfer.amount for reversal."
				);
			}

			await postTransferReversal(ctx, {
				transferRequestId: args.entityId,
				originalEntryId: originalEntry._id,
				amount,
				effectiveDate,
				source: args.source,
				reason,
			});

			console.info(
				`[publishTransferReversed] Posted cash reversal for transfer ${args.entityId}`
			);
		} else if (transfer.collectionAttemptId) {
			console.info(
				`[publishTransferReversed] No journal entry for bridged transfer ${args.entityId}. Cash reversal skipped (handled by collection attempt path).`
			);
		} else {
			// Fail closed: a non-bridged transfer MUST have a journal entry for reversal.
			// Returning silently would leave permanent ledger drift with no retry/healing signal.
			throw new Error(
				`[publishTransferReversed] No journal entry found for NON-bridged transfer ${args.entityId}. ` +
					"Cash reversal cannot be posted — failing closed to prevent ledger drift. " +
					"Investigate and reconcile manually or enqueue a healing action."
			);
		}

		// ── Dispersal entry reversal ──────────────────────────────────────
		// A reversed disbursement means the lender's payout was clawed back.
		// Reset the entry to "failed" so it can be retried or investigated.
		if (
			transfer.transferType === "lender_dispersal_payout" &&
			transfer.dispersalEntryId
		) {
			const dispersalEntry = await ctx.db.get(transfer.dispersalEntryId);
			if (dispersalEntry) {
				const previousStatus = dispersalEntry.status;

				await ctx.db.patch(transfer.dispersalEntryId, {
					status: "failed" as const,
					payoutDate: undefined,
				});

				await appendAuditJournalEntry(ctx, {
					entityType: "dispersalEntry",
					entityId: `${transfer.dispersalEntryId}`,
					eventType: "DISBURSEMENT_REVERSED",
					organizationId: dispersalEntry.orgId,
					previousState: previousStatus,
					newState: "failed",
					outcome: "transitioned",
					actorId: args.source.actorId ?? "system",
					actorType: args.source.actorType,
					channel: args.source.channel,
					payload: {
						transferRequestId: `${args.entityId}`,
						reversalReason: reason,
					},
					timestamp: Date.now(),
				});

				console.warn(
					`[publishTransferReversed] Dispersal entry ${transfer.dispersalEntryId} → failed ` +
						`(transfer ${args.entityId} reversed, reason: ${reason})`
				);
			} else {
				console.error(
					`[publishTransferReversed] Dispersal entry ${transfer.dispersalEntryId} not found — ` +
						`cannot revert status after transfer ${args.entityId} reversal. ` +
						"Investigate manually."
				);
			}
		}
	},
});
