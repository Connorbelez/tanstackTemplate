import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

/**
 * Grants deal access to a user with a specific role.
 * Idempotent: if an active record already exists for (userId, dealId) with the
 * same role, returns it unchanged. If the role differs (e.g. guest_lawyer ->
 * platform_lawyer), the existing record is patched to the new role and returned.
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
		const existing = await ctx.db
			.query("dealAccess")
			.withIndex("by_user_and_deal", (q) =>
				q.eq("userId", args.userId).eq("dealId", args.dealId)
			)
			.filter((q) => q.eq(q.field("status"), "active"))
			.first();

		if (existing) {
			if (existing.role !== args.role) {
				await ctx.db.patch(existing._id, {
					role: args.role,
					grantedBy: args.grantedBy,
					grantedAt: Date.now(),
				});
			}
			return existing._id;
		}

		return await ctx.db.insert("dealAccess", {
			userId: args.userId,
			dealId: args.dealId,
			role: args.role,
			grantedAt: Date.now(),
			grantedBy: args.grantedBy,
			status: "active",
		});
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
