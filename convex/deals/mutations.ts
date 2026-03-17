import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { DatabaseWriter } from "../_generated/server";
import { internalMutation } from "../_generated/server";
import { buildSource, transitionCommandArgs } from "../engine/commands";
import { executeTransition } from "../engine/transition";
import type { CommandSource } from "../engine/types";
import { adminMutation } from "../fluent";

type DealAccessRole =
	| "platform_lawyer"
	| "guest_lawyer"
	| "lender"
	| "borrower";

/**
 * Shared idempotent grant logic for dealAccess records.
 * If an active record already exists for (userId, dealId) with the same role,
 * returns it unchanged. If the role differs (e.g. guest_lawyer ->
 * platform_lawyer), the existing record is patched to the new role and returned.
 */
export async function grantDealAccess(
	db: DatabaseWriter,
	args: {
		userId: string;
		dealId: Id<"deals">;
		role: DealAccessRole;
		grantedBy: string;
	}
): Promise<Id<"dealAccess">> {
	const existing = await db
		.query("dealAccess")
		.withIndex("by_user_and_deal", (q) =>
			q.eq("userId", args.userId).eq("dealId", args.dealId)
		)
		.filter((q) => q.eq(q.field("status"), "active"))
		.first();

	if (existing) {
		if (existing.role !== args.role) {
			await db.patch(existing._id, {
				role: args.role,
				grantedBy: args.grantedBy,
				grantedAt: Date.now(),
			});
		}
		return existing._id;
	}

	return await db.insert("dealAccess", {
		userId: args.userId,
		dealId: args.dealId,
		role: args.role,
		grantedAt: Date.now(),
		grantedBy: args.grantedBy,
		status: "active",
	});
}

/**
 * Grants deal access to a user with a specific role.
 * Delegates to the shared `grantDealAccess` helper for idempotent upsert logic.
 */
export const grantAccess = internalMutation({
	args: {
		userId: v.string(),
		dealId: v.id("deals"),
		role: v.union(
			v.literal("platform_lawyer"),
			v.literal("guest_lawyer"),
			v.literal("lender"),
			v.literal("borrower")
		),
		grantedBy: v.string(),
	},
	handler: async (ctx, args) => {
		return grantDealAccess(ctx.db, args);
	},
});

/**
 * Soft-revokes a single dealAccess record.
 * Idempotent: no-op if already revoked or not found.
 * Never hard-deletes — preserves grantedAt and revokedAt for audit.
 */
export const revokeAccess = internalMutation({
	args: {
		accessId: v.id("dealAccess"),
	},
	handler: async (ctx, args) => {
		const record = await ctx.db.get(args.accessId);
		if (!record || record.status === "revoked") {
			return;
		}

		await ctx.db.patch(args.accessId, {
			status: "revoked",
			revokedAt: Date.now(),
		});
	},
});

// ── Deal Transition Mutations ──────────────────────────────────────────

/**
 * Admin-gated transition for deals.
 * Requires FairLend admin role (enforced by adminMutation).
 *
 * Deal event types:
 * - DEAL_LOCKED: payload: { closingDate: number }
 * - LAWYER_VERIFIED: payload: { verificationId: string }
 * - REPRESENTATION_CONFIRMED: no payload
 * - LAWYER_APPROVED_DOCUMENTS: no payload
 * - ALL_PARTIES_SIGNED: no payload
 * - FUNDS_RECEIVED: payload: { method: "vopay" | "wire_receipt" | "manual" }
 * - DEAL_CANCELLED: payload: { reason: string }
 */
export const transitionDeal = adminMutation
	.input({ ...transitionCommandArgs, entityId: v.id("deals") })
	.handler(async (ctx, args) => {
		const source =
			(args.source as CommandSource | undefined) ??
			buildSource(ctx.viewer, "admin_dashboard");
		return executeTransition(ctx, {
			entityType: "deal",
			entityId: args.entityId,
			eventType: args.eventType,
			payload: args.payload as Record<string, unknown> | undefined,
			source,
		});
	})
	.public();
