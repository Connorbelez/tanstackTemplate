import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export type ListingInsert = Omit<Doc<"listings">, "_creationTime" | "_id">;

type DbCtx = Pick<MutationCtx, "db">;

/**
 * Enforces the 1:1 listing-to-mortgage contract for production listings.
 * Demo listings skip this check because they intentionally have no mortgage link.
 */
export async function assertUniqueMortgageListing(
	ctx: DbCtx,
	mortgageId: Id<"mortgages"> | undefined
): Promise<void> {
	if (!mortgageId) {
		return;
	}

	const existing = await ctx.db
		.query("listings")
		.withIndex("by_mortgage", (q) => q.eq("mortgageId", mortgageId))
		.unique();

	if (existing) {
		throw new ConvexError(
			`Listing already exists for mortgage ${String(mortgageId)}`
		);
	}
}

/**
 * Canonical insertion path for listing records so uniqueness checks live in
 * one place instead of being reimplemented across admin/demo/GT creation flows.
 */
export async function insertListing(
	ctx: MutationCtx,
	listing: ListingInsert
): Promise<Id<"listings">> {
	await assertUniqueMortgageListing(ctx, listing.mortgageId);
	return await ctx.db.insert("listings", listing);
}
