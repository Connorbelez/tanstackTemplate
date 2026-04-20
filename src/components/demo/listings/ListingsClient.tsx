import { useMemo, useState } from "react";
import {
	DEFAULT_FILTERS,
	type FilterableItem,
	type FilterState,
	Horizontal,
	ListingGridShell,
	ListingMapPopup,
	MarketplaceFilterBar,
	type MobileListingSection,
	type MortgageType,
	type PropertyType,
} from "#/components/listings";
import { type DemoListing, demoListings } from "#/data/demo-listings-data";

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

function applyDemoFilters(
	items: readonly ListingItem[],
	filters: FilterState
): readonly ListingItem[] {
	return items.filter(
		// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Predicate has many independent guard clauses by design.
		(item) => {
			if (
				item.ltv !== undefined &&
				(item.ltv < filters.ltvRange[0] || item.ltv > filters.ltvRange[1])
			) {
				return false;
			}

			if (
				item.apr !== undefined &&
				(item.apr < filters.interestRateRange[0] ||
					item.apr > filters.interestRateRange[1])
			) {
				return false;
			}

			if (
				item.principal !== undefined &&
				(item.principal < filters.loanAmountRange[0] ||
					item.principal > filters.loanAmountRange[1])
			) {
				return false;
			}

			if (
				filters.mortgageTypes.length > 0 &&
				item.mortgageType &&
				!filters.mortgageTypes.includes(item.mortgageType as MortgageType)
			) {
				return false;
			}

			if (
				filters.propertyTypes.length > 0 &&
				item.propertyType &&
				!filters.propertyTypes.includes(item.propertyType as PropertyType)
			) {
				return false;
			}

			if (filters.searchQuery) {
				const query = filters.searchQuery.toLowerCase();
				const matchesTitle = item.title?.toLowerCase().includes(query);
				const matchesAddress = item.address?.toLowerCase().includes(query);
				if (!(matchesTitle || matchesAddress)) {
					return false;
				}
			}

			if (filters.maturityDate && item.maturityDate) {
				const filterDate = new Date(filters.maturityDate);
				const itemDate = new Date(item.maturityDate);
				if (itemDate > filterDate) {
					return false;
				}
			}

			return true;
		}
	);
}

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
	const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
	const listings: ListingItem[] = demoListings.map((listing) => ({
		...listing,
	}));
	const filteredListings = useMemo(
		() => applyDemoFilters(listings, filters),
		[listings, filters]
	);

	return (
		<ListingGridShell
			groupItemsForMobile={groupItemsForMobile}
			items={filteredListings}
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
			toolbar={
				<MarketplaceFilterBar
					filters={filters}
					items={listings}
					onFiltersChange={setFilters}
				/>
			}
		/>
	);
}
