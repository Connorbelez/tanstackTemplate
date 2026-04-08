import { internal } from "../../_generated/api";
import type { ActionCtx } from "../../_generated/server";
import type { ProviderCode } from "../transfers/types";
import type { ReversalResult, ReversalWebhookPayload } from "./types";

const REVERSAL_PROVIDER_CODE_MAP: Record<
	ReversalWebhookPayload["provider"],
	ProviderCode[]
> = {
	rotessa: ["pad_rotessa"],
	pad_vopay: ["pad_vopay"],
	stripe: [],
};

async function getTransferByProviderRef(
	ctx: ActionCtx,
	payload: ReversalWebhookPayload
) {
	for (const providerCode of REVERSAL_PROVIDER_CODE_MAP[payload.provider]) {
		const transfer = await ctx.runQuery(
			internal.payments.webhooks.transferCore.getTransferRequestByProviderRef,
			{
				providerCode,
				providerRef: payload.providerRef,
			}
		);
		if (transfer) {
			return transfer;
		}
	}

	return null;
}

// ── Main Handler ─────────────────────────────────────────────────────

/**
 * Shared reversal handler used by legacy reversal webhook endpoints.
 *
 * Orchestrates:
 * 1. Looks up the transfer by canonical providerCode + providerRef
 * 2. Validates transfer state (must be `confirmed`)
 * 3. Fires the transfer GT transition once via `processReversalCascade`
 *
 * Transfer effects then reconcile any linked collection attempt and the
 * per-obligation cash-ledger reversal cascade automatically.
 *
 * This is a plain async function (NOT a Convex registered function) that
 * receives an ActionCtx from the calling httpAction.
 */
export async function handlePaymentReversal(
	ctx: ActionCtx,
	payload: ReversalWebhookPayload
): Promise<ReversalResult> {
	// 1. Look up transfer by canonical provider boundary
	const transfer = await getTransferByProviderRef(ctx, payload);

	if (!transfer) {
		if (REVERSAL_PROVIDER_CODE_MAP[payload.provider].length === 0) {
			return { success: false, reason: "unsupported_provider" };
		}
		return { success: false, reason: "transfer_not_found" };
	}

	// 2. Validate transfer state
	if (transfer.status === "reversed") {
		return {
			success: true,
			reason: "already_reversed",
			attemptId: transfer.collectionAttemptId,
			transferId: transfer._id,
		};
	}

	if (transfer.status !== "confirmed") {
		return {
			success: false,
			reason: "invalid_state",
			attemptId: transfer.collectionAttemptId,
			transferId: transfer._id,
		};
	}

	// 3. Fire the transfer transition once — transfer effects reconcile the
	//    linked collection attempt and the per-obligation cash reversal cascade.
	const result = await ctx.runMutation(
		internal.payments.webhooks.processReversal.processReversalCascade,
		{
			transferId: transfer._id,
			effectiveDate: payload.reversalDate,
			reason: payload.reversalReason,
			provider: payload.provider,
			providerEventId: payload.providerEventId,
		}
	);

	if (!result.success) {
		return {
			success: false,
			reason: "transition_failed",
			attemptId: transfer.collectionAttemptId,
			transferId: transfer._id,
		};
	}

	return {
		success: true,
		attemptId: transfer.collectionAttemptId,
		transferId: transfer._id,
	};
}
