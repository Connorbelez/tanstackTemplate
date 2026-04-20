/**
 * @vitest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MarketplaceListingsPage } from "#/components/listings/MarketplaceListingsPage";
import { parseMarketplaceListingsSearch } from "#/components/listings/search";

vi.mock("#/components/listings/filter-modal", () => ({
	default: () => <div data-testid="filter-modal" />,
}));

describe("marketplace listings search", () => {
	it("normalizes search params into route state", () => {
		expect(
			parseMarketplaceListingsSearch({
				mortgageTypes: "First,Second",
				propertyTypes: "Detached Home,Condo",
				q: "toronto",
				sort: "featured",
			})
		).toMatchObject({
			mortgageTypes: ["First", "Second"],
			propertyTypes: ["Detached Home", "Condo"],
			q: "toronto",
			sort: "featured",
		});
	});
});

describe("marketplace listings page", () => {
	it("renders the empty state when no listings match", () => {
		render(
			<MarketplaceListingsPage
				search={{}}
				setSearch={() => undefined}
				snapshot={{ continueCursor: null, isDone: true, page: [] }}
			/>
		);

		expect(screen.getByText("No listings match these filters")).toBeTruthy();
	});
});
