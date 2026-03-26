import { v } from "convex/values";
import { internal } from "../../_generated/api";
import { type ActionCtx, internalQuery } from "../../_generated/server";
import type { ReversalResult, ReversalWebhookPayload } from "./types";

// ── Internal Queries ─────────────────────────────────────────────────

/** Look up a collection attempt by its provider reference. */
export const getAttemptByProviderRef = internalQuery({
	args: { providerRef: v.string() },
	handler: async (ctx, args) => {
		return ctx.db
			.query("collectionAttempts")
			.withIndex("by_provider_ref", (q) =>
				q.eq("providerRef", args.providerRef)
			)
			.first();
	},
});

// ── Main Handler ─────────────────────────────────────────────────────

/**
 * Shared reversal handler used by both Rotessa and Stripe httpAction handlers.
 *
 * Orchestrates:
 * 1. Looks up the collection attempt by providerRef
 * 2. Validates attempt state (must be `confirmed`)
 * 3. Fires the GT transition once via `processReversalCascade`
 *
 * The GT transition's `emitPaymentReversed` effect handles the per-obligation
 * cash ledger reversal cascade automatically. This handler fires the transition
 * exactly once — never per-obligation.
 *
 * This is a plain async function (NOT a Convex registered function) that
 * receives an ActionCtx from the calling httpAction.
 */
export async function handlePaymentReversal(
	ctx: ActionCtx,
	payload: ReversalWebhookPayload
): Promise<ReversalResult> {
	// 1. Look up collection attempt by providerRef
	const attempt = await ctx.runQuery(
		internal.payments.webhooks.handleReversal.getAttemptByProviderRef,
		{ providerRef: payload.providerRef }
	);

	if (!attempt) {
		return { success: false, reason: "attempt_not_found" };
	}

	// 2. Validate attempt state
	if (attempt.status === "reversed") {
		return {
			success: true,
			reason: "already_reversed",
			attemptId: attempt._id,
		};
	}

	if (attempt.status !== "confirmed") {
		return {
			success: false,
			reason: "invalid_state",
			attemptId: attempt._id,
		};
	}

	// 3. Fire the GT transition once — the emitPaymentReversed effect
	//    handles per-obligation cash ledger reversal cascade automatically.
	const result = await ctx.runMutation(
		internal.payments.webhooks.processReversal.processReversalCascade,
		{
			attemptId: attempt._id,
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
			attemptId: attempt._id,
		};
	}

	return {
		success: true,
		attemptId: attempt._id,
	};
}
