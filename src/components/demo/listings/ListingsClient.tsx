import { type DemoListing, demoListings } from "#/data/demo-listings-data";
import { type FilterableItem, ListingGridShell } from "./ListingGridShell";
import { Horizontal } from "./listing-card-horizontal";
import { ListingMapPopup } from "./listing-map-popup";
import type { MobileListingSection } from "./mobile-listing-scroller";

type ListingItem = FilterableItem &
	Pick<
		DemoListing,
		| "id"
		| "imageSrc"
		| "locked"
		| "availablePercent"
		| "lockedPercent"
		| "soldPercent"
	>;

function groupItemsForMobile(items: readonly ListingItem[]) {
	const firstMortgages = items.filter((item) => item.mortgageType === "First");
	const secondMortgages = items.filter(
		(item) => item.mortgageType === "Second"
	);
	const otherMortgages = items.filter(
		(item) => item.mortgageType !== "First" && item.mortgageType !== "Second"
	);

	const sections: MobileListingSection<ListingItem>[] = [];

	if (firstMortgages.length > 0) {
		sections.push({
			title: "1st Mortgages",
			items: firstMortgages,
		});
	}

	if (secondMortgages.length > 0) {
		sections.push({
			title: "2nd Mortgages",
			items: secondMortgages,
		});
	}

	if (otherMortgages.length > 0) {
		sections.push({
			title: "Other Opportunities",
			items: otherMortgages,
		});
	}

	return sections;
}

export function ListingsClient() {
	const listings: ListingItem[] = demoListings.map((listing) => ({
		...listing,
	}));

	return (
		<ListingGridShell
			groupItemsForMobile={groupItemsForMobile}
			items={listings}
			mapProps={{
				initialCenter: { lat: 43.6532, lng: -79.3832 },
				initialZoom: 11,
			}}
			renderCard={(listing) => (
				<Horizontal
					address={listing.address}
					apr={listing.apr}
					availablePercent={listing.availablePercent}
					id={listing.id}
					imageSrc={listing.imageSrc}
					locked={listing.locked}
					lockedPercent={listing.lockedPercent}
					ltv={listing.ltv}
					marketValue={listing.marketValue}
					maturityDate={listing.maturityDate?.toLocaleDateString("en-US", {
						day: "2-digit",
						month: "2-digit",
						year: "numeric",
					})}
					principal={listing.principal}
					propertyType={listing.propertyType}
					soldPercent={listing.soldPercent}
					title={listing.title}
				/>
			)}
			renderMapPopup={(listing) => (
				<ListingMapPopup
					address={listing.address ?? ""}
					apr={listing.apr ?? 0}
					imageSrc={listing.imageSrc}
					principal={listing.principal ?? 0}
					title={listing.title ?? ""}
				/>
			)}
			showFilters
		/>
	);
}
