/**
 * Transfer domain mutations — admin-gated seed operations for Phase 1.
 *
 * These mutations follow the Phase 1 "seed, don't build flows" pattern:
 * transfer requests are created and initiated via admin mutations/actions,
 * not user-facing workflows.
 *
 * `initiateTransfer` is an adminAction (not mutation) because future providers
 * will make external HTTP calls, which only actions can do in Convex.
 */

import { ConvexError, v } from "convex/values";
import { internal } from "../../_generated/api";
import { internalMutation } from "../../_generated/server";
import { buildSource } from "../../engine/commands";
import { executeTransition } from "../../engine/transition";
import { sourceValidator } from "../../engine/validators";
import { adminAction, adminMutation } from "../../fluent";
import type { TransferRequestInput } from "./interface";
import { getTransferProvider } from "./providers/registry";
import {
	counterpartyTypeValidator,
	directionValidator,
	providerCodeValidator,
	transferTypeValidator,
} from "./validators";

// ── createTransferRequest ──────────────────────────────────────────
/**
 * Creates a new transfer request record with status "initiated".
 * Idempotent: if a transfer with the same idempotencyKey exists, returns
 * the existing record's ID without creating a duplicate.
 */
export const createTransferRequest = adminMutation
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
		legNumber: v.optional(v.number()),
	})
	.handler(async (ctx, args) => {
		// 1. Validate amount is positive integer (safe-integer cents)
		if (!Number.isInteger(args.amount) || args.amount <= 0) {
			throw new ConvexError("Amount must be a positive integer (cents)");
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
			counterpartyId: args.counterpartyId,
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
 * This is an adminAction (not mutation) because future providers will make
 * external HTTP calls to VoPay/Rotessa/Plaid, which only actions can do.
 */
export const initiateTransfer = adminAction
	.input({
		transferId: v.id("transferRequests"),
	})
	.handler(async (ctx, args) => {
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

		const input: TransferRequestInput = {
			amount: transfer.amount,
			bankAccountRef: transfer.bankAccountRef,
			counterpartyId: transfer.counterpartyId,
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
