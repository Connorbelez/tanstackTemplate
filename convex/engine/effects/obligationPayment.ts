import { v } from "convex/values";
import { internalMutation } from "../../_generated/server";
import { effectPayloadValidator } from "../validators";

const obligationPaymentValidator = {
	...effectPayloadValidator,
	entityId: v.id("obligations"),
	entityType: v.literal("obligation"),
};

/**
 * Domain field patch: applies a payment amount to an obligation's amountSettled.
 * If the obligation has already transitioned to "settled", also stamps settledAt.
 *
 * This is NOT a state transition — it only patches numeric domain fields.
 */
export const applyPayment = internalMutation({
	args: obligationPaymentValidator,
	handler: async (ctx, args) => {
		const obligation = await ctx.db.get(args.entityId);
		if (!obligation) {
			throw new Error(`[applyPayment] Obligation not found: ${args.entityId}`);
		}

		const amount = args.payload?.amount;
		if (typeof amount !== "number" || !Number.isFinite(amount)) {
			throw new Error(
				`[applyPayment] Invalid payment amount for obligation=${args.entityId}: ${String(amount)}`
			);
		}

		const updatedAmountSettled = obligation.amountSettled + amount;

		const patch: { amountSettled: number; settledAt?: number } = {
			amountSettled: updatedAmountSettled,
		};

		// If the obligation has already been transitioned to "settled",
		// stamp the settledAt timestamp (domain field only).
		if (obligation.status === "settled") {
			patch.settledAt = Date.now();
		}

		await ctx.db.patch(args.entityId, patch);

		console.info(
			`[applyPayment] obligation=${args.entityId}: amountSettled ${obligation.amountSettled} -> ${updatedAmountSettled} (payment=${amount})`
		);
	},
});
