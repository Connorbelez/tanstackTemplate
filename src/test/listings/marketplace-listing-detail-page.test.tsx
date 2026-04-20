/**
 * @vitest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MarketplaceListingDetailPage } from "#/components/listings/MarketplaceListingDetailPage";
import { buildMarketplaceListingDetailModel } from "#/components/listings/marketplace-detail-adapter";
import type { MarketplaceListingDetailSnapshot } from "#/components/listings/marketplace-types";

vi.mock("#/components/listings/ListingDetailPage", () => ({
	ListingDetailPage: ({
		backHref,
		buildSimilarListingHref,
		listing,
		mode,
	}: {
		backHref?: string;
		buildSimilarListingHref: (listingId: string) => string;
		listing: { checkout?: unknown; title: string };
		mode?: string;
	}) => (
		<div
			data-back-href={backHref}
			data-has-checkout={String(listing.checkout !== undefined)}
			data-mode={mode}
			data-similar-href={buildSimilarListingHref("listing_similar_1")}
			data-testid="listing-detail-props"
			data-title={listing.title}
		/>
	),
}));

function createDetailSnapshot(): NonNullable<MarketplaceListingDetailSnapshot> {
	return {
		appraisals: [
			{
				comparables: [
					{
						address: "12 Mercer Street",
						adjustedValue: 655000,
						id: "comp-1",
						propertyType: "Condo",
						saleDate: "2026-02-14",
						salePrice: 648000,
						squareFootage: 812,
					},
				],
				effectiveDate: "2026-02-20",
				id: "appraisal-1",
				reportDate: "2026-02-22",
				type: "desktop",
				valueAsIfComplete: 705000,
				valueAsIs: 675000,
			},
		],
		documents: [
			{
				assetId: "asset-1",
				blueprintId: "blueprint-1",
				class: "appraisal_report",
				description: "Certified third-party appraisal package.",
				displayName: "Appraisal Report",
				url: "https://example.com/appraisal-report.pdf",
			},
		],
		encumbrances: [
			{
				balanceAsOfDate: "2026-01-05",
				holder: "Senior Charge Holder",
				id: "enc-1",
				outstandingBalance: 125000,
				priority: 1,
				type: "mortgage",
			},
		],
		investment: {
			availableFractions: 420,
			investorCount: 3,
			lockedPercent: 12,
			soldPercent: 28,
			totalFractions: 1000,
		},
		listing: {
			approximateLatitude: 43.645,
			approximateLongitude: -79.395,
			borrowerSignal: {
				borrowerCount: 2,
				hasGuarantor: true,
				participants: [
					{ idvStatus: "verified", name: "Alex Investor", role: "primary" },
					{ idvStatus: "verified", name: "Jordan Support", role: "guarantor" },
				],
				primaryBorrowerName: "Alex Investor",
			},
			heroImages: [
				{
					caption: "Front elevation",
					id: "hero-1",
					url: "https://example.com/hero-1.jpg",
				},
			],
			id: "listing_123456",
			interestRate: 8.5,
			lienPosition: 1,
			locationLabel: "Toronto, ON",
			ltvRatio: 64,
			marketplaceCopy:
				"Strong first-position opportunity with disciplined underwriting.",
			maturityDate: "2028-03-15",
			mortgageTypeLabel: "First",
			monthlyPayment: 3187,
			paymentFrequency: "monthly",
			paymentHistory: {
				byStatus: { overdue: 1, settled: 11 },
				totalObligations: 12,
			},
			principal: 450000,
			propertyTypeLabel: "Detached Home",
			rateType: "fixed",
			readOnly: true,
			summary:
				"Strong first-position opportunity with disciplined underwriting.",
			termMonths: 24,
			title: "King West Bridge Opportunity",
		},
		similarListings: [
			{
				heroImageUrl: "https://example.com/similar-1.jpg",
				id: "listing_similar_1",
				interestRate: 9.1,
				locationLabel: "Etobicoke, ON",
				ltvRatio: 66,
				mortgageTypeLabel: "First",
				principal: 320000,
				propertyTypeLabel: "Condo",
				title: "Lakeshore Condo Bridge",
			},
		],
	};
}

describe("marketplace listing detail adapter", () => {
	it("builds a read-only listing detail model from the marketplace snapshot", () => {
		const detail = createDetailSnapshot();
		const model = buildMarketplaceListingDetailModel(detail);

		expect(model.investment.availableFractions).toBe(420);
		expect(model.investment.perFractionAmount).toBe(450);
		expect(model.documents[0]?.url).toBe(
			"https://example.com/appraisal-report.pdf"
		);
		expect(model.badges[0]?.label).toBe("1ST MORTGAGE");
	});
});

describe("marketplace listing detail page", () => {
	it("passes the shared detail page a read-only listing model", () => {
		render(<MarketplaceListingDetailPage snapshot={createDetailSnapshot()} />);

		const rendered = screen.getByTestId("listing-detail-props");

		expect(rendered.getAttribute("data-mode")).toBe("readOnly");
		expect(rendered.getAttribute("data-back-href")).toBe("/listings");
		expect(rendered.getAttribute("data-title")).toBe(
			"King West Bridge Opportunity"
		);
		expect(rendered.getAttribute("data-has-checkout")).toBe("false");
		expect(rendered.getAttribute("data-similar-href")).toBe(
			"/listings/listing_similar_1"
		);
	});
});
