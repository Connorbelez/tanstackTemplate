import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { MarketplaceFilterBar } from "./filter-bar";
import { ListingGridShell } from "./ListingGridShell";
import { Horizontal } from "./listing-card-horizontal";
import { ListingMapPopup } from "./listing-map-popup";
import {
	buildFilterMetricItems,
	buildMarketplaceListingCardItems,
	filterStateToSearchState,
	searchStateToFilterState,
} from "./marketplace-adapters";
import type {
	MarketplaceListingCardItem,
	MarketplaceListingsSearchState,
	MarketplaceListingsSnapshot,
} from "./marketplace-types";
import type { MobileListingSection } from "./mobile-listing-scroller";

function groupItemsForMobile(items: readonly MarketplaceListingCardItem[]) {
	const firstMortgages = items.filter((item) => item.mortgageType === "First");
	const secondMortgages = items.filter(
		(item) => item.mortgageType === "Second"
	);
	const otherMortgages = items.filter(
		(item) => item.mortgageType !== "First" && item.mortgageType !== "Second"
	);

	const sections: MobileListingSection<MarketplaceListingCardItem>[] = [];

	if (firstMortgages.length > 0) {
		sections.push({ items: firstMortgages, title: "1st Mortgages" });
	}
	if (secondMortgages.length > 0) {
		sections.push({ items: secondMortgages, title: "2nd Mortgages" });
	}
	if (otherMortgages.length > 0) {
		sections.push({ items: otherMortgages, title: "Other Opportunities" });
	}

	return sections;
}

interface MarketplaceListingsPageProps {
	search: MarketplaceListingsSearchState;
	setSearch: (
		updater: (
			current: MarketplaceListingsSearchState
		) => MarketplaceListingsSearchState
	) => void;
	snapshot: MarketplaceListingsSnapshot;
}

export function MarketplaceListingsPage({
	snapshot,
	search,
	setSearch,
}: MarketplaceListingsPageProps) {
	const filterState = useMemo(() => searchStateToFilterState(search), [search]);
	const filterMetrics = useMemo(
		() => buildFilterMetricItems(snapshot.page),
		[snapshot.page]
	);
	const items = useMemo(
		() => buildMarketplaceListingCardItems(snapshot.page),
		[snapshot.page]
	);

	const toolbar = (
		<div className="space-y-3">
			<div className="flex flex-wrap items-center gap-2">
				<Badge className="rounded-full px-3 py-1" variant="secondary">
					{snapshot.page.length} opportunities
				</Badge>
				<Badge className="rounded-full px-3 py-1" variant="outline">
					Read-only marketplace
				</Badge>
			</div>
			<MarketplaceFilterBar
				filters={filterState}
				items={filterMetrics}
				onFiltersChange={(nextFilters) =>
					setSearch(() => filterStateToSearchState(nextFilters, search.sort))
				}
			/>
		</div>
	);

	if (snapshot.page.length === 0) {
		return (
			<section className="mx-auto flex min-h-[50vh] max-w-4xl flex-col items-center justify-center gap-6 px-6 py-16">
				<div className="w-full">{toolbar}</div>
				<div className="space-y-3 text-center">
					<p className="font-medium text-[11px] text-muted-foreground uppercase tracking-[0.24em]">
						Marketplace
					</p>
					<h1 className="font-semibold text-3xl tracking-tight">
						No listings match these filters
					</h1>
					<p className="max-w-xl text-center text-muted-foreground text-sm leading-6">
						Clear the current filters or widen the search ranges to reveal more
						published mortgage opportunities.
					</p>
				</div>
				<Button
					className="rounded-full"
					onClick={() =>
						setSearch((current) => ({ sort: current.sort ?? "featured" }))
					}
					type="button"
					variant="outline"
				>
					Clear filters
				</Button>
			</section>
		);
	}

	return (
		<div className="space-y-4 px-4 py-6 sm:px-6 lg:px-8">
			<div className="space-y-3 px-4 sm:px-8">
				<p className="font-medium text-[11px] text-muted-foreground uppercase tracking-[0.24em]">
					Lender Marketplace
				</p>
				<div className="flex flex-col gap-2 xl:flex-row xl:items-end xl:justify-between">
					<div className="space-y-2">
						<h1 className="font-semibold text-3xl tracking-tight sm:text-4xl">
							Browse fractional mortgage opportunities
						</h1>
						<p className="max-w-3xl text-muted-foreground text-sm leading-6 sm:text-base">
							Published listings are read-only in this release. Review pricing,
							collateral quality, fractions available, and the supporting map
							context before opening the full listing detail.
						</p>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<Badge className="rounded-full px-3 py-1" variant="secondary">
							{snapshot.page.length} live listings
						</Badge>
						{snapshot.isDone ? null : (
							<Badge className="rounded-full px-3 py-1" variant="outline">
								More results available
							</Badge>
						)}
					</div>
				</div>
			</div>

			<ListingGridShell
				groupItemsForMobile={groupItemsForMobile}
				items={items}
				mapProps={{
					initialCenter: { lat: 43.6532, lng: -79.3832 },
					initialZoom: 10,
				}}
				renderCard={(listing) => (
					<Link
						className="block"
						params={{ listingId: listing.id }}
						to="/listings/$listingId"
					>
						<Horizontal
							address={listing.address}
							apr={listing.apr}
							availablePercent={listing.availablePercent}
							id={listing.id}
							imageSrc={listing.imageSrc}
							lockedPercent={listing.lockedPercent}
							ltv={listing.ltv}
							maturityDate={listing.maturityDate.toLocaleDateString("en-CA")}
							principal={listing.principal}
							propertyType={listing.propertyType}
							soldPercent={listing.soldPercent}
							title={listing.title}
						/>
					</Link>
				)}
				renderMapPopup={(listing) => (
					<ListingMapPopup
						address={listing.address}
						apr={listing.apr}
						imageSrc={listing.imageSrc}
						principal={listing.principal}
						title={listing.title}
					/>
				)}
				toolbar={toolbar}
			/>
		</div>
	);
}
