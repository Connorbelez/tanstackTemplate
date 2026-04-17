import { ConvexError } from "convex/values";
import { adminMutation, requirePermission } from "../fluent";
import { listingCurationUpdateInputValidator } from "./validators";

function trimToUndefined(value: string | undefined) {
	if (typeof value !== "string") {
		return undefined;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

export const updateListingCuration = adminMutation
	.use(requirePermission("listing:manage"))
	.input(listingCurationUpdateInputValidator)
	.handler(async (ctx, args) => {
		const listing = await ctx.db.get(args.listingId);
		if (!listing) {
			throw new ConvexError("Listing not found");
		}

		await ctx.db.patch(args.listingId, {
			adminNotes: Object.hasOwn(args.patch, "adminNotes")
				? trimToUndefined(args.patch.adminNotes)
				: listing.adminNotes,
			description: Object.hasOwn(args.patch, "description")
				? trimToUndefined(args.patch.description)
				: listing.description,
			displayOrder: Object.hasOwn(args.patch, "displayOrder")
				? args.patch.displayOrder
				: listing.displayOrder,
			featured: Object.hasOwn(args.patch, "featured")
				? args.patch.featured
				: listing.featured,
			heroImages: Object.hasOwn(args.patch, "heroImages")
				? (args.patch.heroImages ?? [])
				: listing.heroImages,
			marketplaceCopy: Object.hasOwn(args.patch, "marketplaceCopy")
				? trimToUndefined(args.patch.marketplaceCopy)
				: listing.marketplaceCopy,
			seoSlug: Object.hasOwn(args.patch, "seoSlug")
				? trimToUndefined(args.patch.seoSlug)
				: listing.seoSlug,
			title: Object.hasOwn(args.patch, "title")
				? trimToUndefined(args.patch.title)
				: listing.title,
			updatedAt: Date.now(),
		});

		return ctx.db.get(args.listingId);
	})
	.public();
