import { ConvexError, v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { listActivePublicStaticBlueprintAssets } from "../documents/mortgageBlueprints";
import { listingQuery } from "../fluent";

export async function readListingPublicDocuments(
	ctx: Pick<QueryCtx, "db" | "storage">,
	listingId: Id<"listings">
) {
	const listing = await ctx.db.get(listingId);
	if (!listing?.mortgageId) {
		return [];
	}

	const assets = await listActivePublicStaticBlueprintAssets(
		ctx,
		listing.mortgageId
	);
	return Promise.all(
		assets.map(async ({ asset, blueprint }) => ({
			assetId: asset._id,
			blueprintId: blueprint._id,
			class: blueprint.class,
			description: blueprint.description ?? null,
			displayName: blueprint.displayName,
			url: await ctx.storage.getUrl(asset.fileRef),
		}))
	);
}

export const listForListing = listingQuery
	.input({
		listingId: v.id("listings"),
	})
	.handler(async (ctx, args) => {
		const listing = await ctx.db.get(args.listingId);
		if (!listing) {
			throw new ConvexError("Listing not found");
		}
		if (listing.status !== "published") {
			throw new ConvexError("Listing not found");
		}

		return readListingPublicDocuments(ctx, args.listingId);
	})
	.public();
