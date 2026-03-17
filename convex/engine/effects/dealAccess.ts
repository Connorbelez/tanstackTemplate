import { v } from "convex/values";
import { internalMutation } from "../../_generated/server";
import { grantDealAccess } from "../../deals/mutations";
import { effectPayloadValidator } from "../validators";

const dealEffectPayloadValidator = {
	...effectPayloadValidator,
	entityId: v.id("deals"),
	entityType: v.literal("deal"),
};

/**
 * Effect: creates a dealAccess record for the assigned lawyer.
 * Fires on LAWYER_VERIFIED transition (lawyerOnboarding.pending → verified).
 * Delegates to the shared `grantDealAccess` helper for idempotent upsert logic.
 */
export const createDealAccess = internalMutation({
	args: dealEffectPayloadValidator,
	handler: async (ctx, args) => {
		const deal = await ctx.db.get(args.entityId);
		if (!deal) {
			console.error(`[createDealAccess] Deal not found: ${args.entityId}`);
			return;
		}

		const lawyerId = deal.lawyerId;
		if (!lawyerId) {
			return;
		}

		if (!deal.lawyerType) {
			console.warn(
				`[createDealAccess] Deal ${args.entityId} has lawyerId but no lawyerType — skipping access grant`
			);
			return;
		}

		const accessId = await grantDealAccess(ctx.db, {
			userId: lawyerId,
			dealId: args.entityId,
			role: deal.lawyerType,
			grantedBy: args.source.actorId ?? "system",
		});

		console.info(
			`[createDealAccess] Granted ${deal.lawyerType} access to deal=${args.entityId} for lawyer=${lawyerId} (accessId=${accessId})`
		);
	},
});

/**
 * Effect: revokes ALL active dealAccess records for a deal.
 * Fires on DEAL_CANCELLED transition.
 * Soft-delete: sets status to "revoked" with revokedAt timestamp.
 */
export const revokeAllDealAccess = internalMutation({
	args: dealEffectPayloadValidator,
	handler: async (ctx, args) => {
		const activeRecords = await ctx.db
			.query("dealAccess")
			.withIndex("by_deal", (q) => q.eq("dealId", args.entityId))
			.filter((q) => q.eq(q.field("status"), "active"))
			.collect();

		const now = Date.now();
		for (const record of activeRecords) {
			await ctx.db.patch(record._id, {
				status: "revoked" as const,
				revokedAt: now,
			});
		}

		if (activeRecords.length > 0) {
			console.info(
				`[revokeAllDealAccess] Revoked ${activeRecords.length} record(s) for deal=${args.entityId}`
			);
		}
	},
});

/**
 * Effect: revokes lawyer dealAccess records while retaining buyer/seller records.
 * Fires on deal confirmation (fundsTransfer.onDone).
 * Asymmetric revocation: lawyers lose access, parties retain it.
 */
export const revokeLawyerAccess = internalMutation({
	args: dealEffectPayloadValidator,
	handler: async (ctx, args) => {
		const activeRecords = await ctx.db
			.query("dealAccess")
			.withIndex("by_deal", (q) => q.eq("dealId", args.entityId))
			.filter((q) => q.eq(q.field("status"), "active"))
			.collect();

		const lawyerRecords = activeRecords.filter(
			(r) => r.role === "platform_lawyer" || r.role === "guest_lawyer"
		);

		const now = Date.now();
		for (const record of lawyerRecords) {
			await ctx.db.patch(record._id, {
				status: "revoked" as const,
				revokedAt: now,
			});
		}

		if (lawyerRecords.length > 0) {
			console.info(
				`[revokeLawyerAccess] Revoked ${lawyerRecords.length} lawyer record(s) for deal=${args.entityId}, retained ${activeRecords.length - lawyerRecords.length} party record(s)`
			);
		}
	},
});
