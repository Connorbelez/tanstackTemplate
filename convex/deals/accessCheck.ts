import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import type { Viewer } from "../fluent";

/**
 * Two-layer deal authorization check.
 *
 * Layer 1: Admin bypass — `viewer.isFairLendAdmin` (no DB lookup).
 * Layer 2: dealAccess table — active record required for (userId, dealId).
 *
 * Throws ConvexError if the viewer has no access. Revoked records
 * are treated as no access (only `status === "active"` counts).
 */
export async function assertDealAccess(
	ctx: Pick<QueryCtx, "db">,
	viewer: Viewer,
	dealId: Id<"deals">
): Promise<void> {
	// Layer 1: admin bypass
	if (viewer.isFairLendAdmin) {
		return;
	}

	// Layer 2: dealAccess table check
	const access = await ctx.db
		.query("dealAccess")
		.withIndex("by_user_and_deal", (q) =>
			q.eq("userId", viewer.authId).eq("dealId", dealId)
		)
		.filter((q) => q.eq(q.field("status"), "active"))
		.first();

	if (!access) {
		throw new ConvexError("No access to this deal");
	}
}
