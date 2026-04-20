import { v } from "convex/values";
import type { Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { internalMutation } from "../../_generated/server";
import { type DealAccessRole, grantDealAccess } from "../../deals/mutations";
import { effectPayloadValidator } from "../validators";

const dealEffectPayloadValidator = {
	...effectPayloadValidator,
	entityId: v.id("deals"),
	entityType: v.literal("deal"),
};

interface PendingDealAccessGrant {
	role: DealAccessRole;
	userId: string;
}

async function resolveBrokerDealAccessGrants(
	ctx: Pick<MutationCtx, "db">,
	args: {
		dealId: Id<"deals">;
		mortgageId: Id<"mortgages">;
	}
): Promise<PendingDealAccessGrant[]> {
	const mortgage = await ctx.db.get(args.mortgageId);
	if (!mortgage) {
		console.warn(
			`[createDealAccess] Mortgage ${args.mortgageId} not found for deal=${args.dealId}; skipping broker access grants`
		);
		return [];
	}

	const brokerTargets: Array<{
		brokerId: Id<"brokers">;
		role: Extract<DealAccessRole, "assigned_broker" | "broker_of_record">;
	}> = [
		{
			brokerId: mortgage.brokerOfRecordId,
			role: "broker_of_record",
		},
	];

	if (mortgage.assignedBrokerId) {
		brokerTargets.push({
			brokerId: mortgage.assignedBrokerId,
			role: "assigned_broker",
		});
	}

	const grants: PendingDealAccessGrant[] = [];
	const grantedUserIds = new Set<string>();

	for (const target of brokerTargets) {
		const broker = await ctx.db.get(target.brokerId);
		if (!broker) {
			console.warn(
				`[createDealAccess] Broker ${target.brokerId} not found for deal=${args.dealId}; skipping ${target.role}`
			);
			continue;
		}

		const user = await ctx.db.get(broker.userId);
		if (!user) {
			console.warn(
				`[createDealAccess] Broker user ${broker.userId} not found for deal=${args.dealId}; skipping ${target.role}`
			);
			continue;
		}

		if (grantedUserIds.has(user.authId)) {
			continue;
		}

		grantedUserIds.add(user.authId);
		grants.push({
			role: target.role,
			userId: user.authId,
		});
	}

	return grants;
}

/**
 * Effect: creates dealAccess records for the structural deal participants that
 * need private-deal visibility.
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

		const grantsByUserId = new Map<string, DealAccessRole>([
			[lawyerId, deal.lawyerType],
		]);
		const brokerGrants = await resolveBrokerDealAccessGrants(ctx, {
			dealId: args.entityId,
			mortgageId: deal.mortgageId,
		});
		for (const grant of brokerGrants) {
			if (!grantsByUserId.has(grant.userId)) {
				grantsByUserId.set(grant.userId, grant.role);
			}
		}

		const grantedRecords: string[] = [];
		for (const [userId, role] of grantsByUserId.entries()) {
			const accessId = await grantDealAccess(ctx.db, {
				userId,
				dealId: args.entityId,
				role,
				grantedBy: args.source.actorId ?? "system",
			});
			grantedRecords.push(`${role}:${userId}:${accessId}`);
		}

		console.info(
			`[createDealAccess] Granted ${grantedRecords.join(", ")} for deal=${args.entityId}`
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
 * Effect: revokes lawyer dealAccess records while retaining non-lawyer records.
 * Fires on deal confirmation (fundsTransfer.onDone).
 * Asymmetric revocation: lawyers lose access, brokers and deal parties retain it.
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
