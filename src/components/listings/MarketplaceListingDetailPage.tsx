import { useMemo } from "react";
import { ListingDetailPage } from "./ListingDetailPage";
import { buildMarketplaceListingDetailModel } from "./marketplace-detail-adapter";
import type { MarketplaceListingDetailSnapshot } from "./marketplace-types";

interface MarketplaceListingDetailPageProps {
	snapshot: NonNullable<MarketplaceListingDetailSnapshot>;
}

export function MarketplaceListingDetailPage({
	snapshot,
}: MarketplaceListingDetailPageProps) {
	const listing = useMemo(
		() => buildMarketplaceListingDetailModel(snapshot),
		[snapshot]
	);

	return (
		<ListingDetailPage
			backHref="/listings"
			buildSimilarListingHref={(listingId) => `/listings/${listingId}`}
			listing={listing}
			mode="readOnly"
		/>
	);
}
