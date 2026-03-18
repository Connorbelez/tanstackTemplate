import { v } from "convex/values";
import { internalMutation } from "../../_generated/server";
import { auditLog } from "../../auditLog";
import { effectPayloadValidator } from "../validators";

const obligationWaiverValidator = {
	...effectPayloadValidator,
	entityId: v.id("obligations"),
	entityType: v.literal("obligation"),
};

/**
 * Audit-only effect: records that an obligation was waived.
 * Does NOT modify any domain fields — the state transition itself
 * handles the status change. This effect exists purely for the
 * compliance audit trail.
 */
export const recordWaiver = internalMutation({
	args: obligationWaiverValidator,
	handler: async (ctx, args) => {
		const obligation = await ctx.db.get(args.entityId);
		if (!obligation) {
			throw new Error(`[recordWaiver] Obligation not found: ${args.entityId}`);
		}

		const reason =
			(args.payload?.reason as string | undefined) ?? "no reason provided";
		const approvedBy =
			(args.payload?.approvedBy as string | undefined) ??
			args.source.actorId ??
			"system";

		await auditLog.log(ctx, {
			action: "obligation.waived",
			actorId: args.source.actorId ?? "system",
			resourceType: "obligations",
			resourceId: args.entityId,
			severity: "warning",
			metadata: {
				reason,
				approvedBy,
				obligationId: args.entityId,
				mortgageId: obligation.mortgageId,
				amount: obligation.amount,
				amountSettled: obligation.amountSettled,
			},
		});

		console.info(
			`[recordWaiver] Waiver recorded for obligation=${args.entityId}, mortgage=${obligation.mortgageId}`
		);
	},
});
