import { v } from "convex/values";
import type { Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { internalMutation } from "../../_generated/server";
import { safeBigintToNumber } from "../../payments/cashLedger/accounts";
import {
	postCashReceiptForTransfer,
	postLenderPayoutForTransfer,
	postTransferReversal,
} from "../../payments/cashLedger/integrations";
import type { CommandSource } from "../types";
import { effectPayloadValidator } from "../validators";

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
 * Always patches settledAt on the transfer record. Cash ledger reversal only
 * occurs for non-bridged transfers with a known direction.
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

		// D4: bridged transfer — cash posted via collection attempt path
		if (transfer.collectionAttemptId) {
			console.info(
				`[publishTransferConfirmed] Bridged transfer ${args.entityId} — cash posted via collection attempt path. Skipping.`
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
	},
});

/**
 * Records transfer failure metadata on the transfer entity.
 */
export const publishTransferFailed = internalMutation({
	args: transferEffectValidator,
	handler: async (ctx, args) => {
		await loadTransfer(ctx, args, "publishTransferFailed");

		const errorCode =
			typeof args.payload?.errorCode === "string"
				? args.payload.errorCode
				: "UNKNOWN";
		const reason =
			typeof args.payload?.reason === "string"
				? args.payload.reason
				: "unknown_failure";

		await ctx.db.patch(args.entityId, {
			failedAt: Date.now(),
			failureReason: reason,
			failureCode: errorCode,
		});

		console.warn(
			`[publishTransferFailed] Transfer ${args.entityId} failed: ${reason} (${errorCode})`
		);
	},
});

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

		await ctx.db.patch(args.entityId, {
			reversedAt: Date.now(),
			reversalRef,
		});

		// Look up original journal entry for cash reversal
		const originalEntry = await ctx.db
			.query("cash_ledger_journal_entries")
			.withIndex("by_transfer_request", (q) =>
				q.eq("transferRequestId", args.entityId)
			)
			.first();

		if (originalEntry) {
			const effectiveDate = new Date().toISOString().slice(0, 10);
			const amount =
				transfer.amount ?? safeBigintToNumber(originalEntry.amount);

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
	},
});
