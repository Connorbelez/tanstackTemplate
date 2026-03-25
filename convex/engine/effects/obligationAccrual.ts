import { v } from "convex/values";
import { internalMutation } from "../../_generated/server";
import { postObligationAccrued } from "../../payments/cashLedger/integrations";
import { effectPayloadValidator } from "../validators";

const obligationEffectPayloadValidator = {
	...effectPayloadValidator,
	entityId: v.id("obligations"),
	entityType: v.literal("obligation"),
};

/**
 * GT Effect: Journal an OBLIGATION_ACCRUED entry when an obligation
 * transitions from upcoming → due via BECAME_DUE.
 *
 * Calls the existing postObligationAccrued() integration function
 * which is idempotent on `cash-ledger:obligation-accrued:{obligationId}`.
 */
export const accrueObligation = internalMutation({
	args: obligationEffectPayloadValidator,
	handler: async (ctx, args) => {
		await postObligationAccrued(ctx, {
			obligationId: args.entityId,
			source: args.source,
		});

		console.info(
			`[accrueObligation] Posted OBLIGATION_ACCRUED for obligation=${args.entityId}`
		);
	},
});
