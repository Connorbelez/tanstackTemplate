import { v } from "convex/values";
import { internalQuery } from "../_generated/server";
import { authedQuery } from "../fluent";
import { assertDealAccess } from "./accessCheck";

// ── Internal: used by effects ──────────────────────────────────────

export const getActiveDealAccess = internalQuery({
	args: { dealId: v.id("deals") },
	handler: async (ctx, { dealId }) => {
		return await ctx.db
			.query("dealAccess")
			.withIndex("by_deal", (q) => q.eq("dealId", dealId))
			.filter((q) => q.eq(q.field("status"), "active"))
			.collect();
	},
});

export const getActiveLawyerAccess = internalQuery({
	args: { dealId: v.id("deals") },
	handler: async (ctx, { dealId }) => {
		const allActive = await ctx.db
			.query("dealAccess")
			.withIndex("by_deal", (q) => q.eq("dealId", dealId))
			.filter((q) => q.eq(q.field("status"), "active"))
			.collect();
		return allActive.filter(
			(r) => r.role === "platform_lawyer" || r.role === "guest_lawyer"
		);
	},
});

// ── Public: closingTeamAssignments ─────────────────────────────────

/**
 * Returns all active dealAccess records for a deal.
 * Enforces two-layer authorization: admin bypass → dealAccess check.
 */
export const closingTeamAssignments = authedQuery
	.input({ dealId: v.id("deals") })
	.handler(async (ctx, { dealId }) => {
		await assertDealAccess(ctx, ctx.viewer, dealId);

		return await ctx.db
			.query("dealAccess")
			.withIndex("by_deal", (q) => q.eq("dealId", dealId))
			.filter((q) => q.eq(q.field("status"), "active"))
			.collect();
	})
	.public();
