/**
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from "@testing-library/react";
import { useQuery } from "convex/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LenderListingDetailPage } from "#/components/lender/listings/LenderListingDetailPage";

vi.mock("convex/react", () => ({
	useQuery: vi.fn(),
}));

vi.mock("@tanstack/react-router", async () => {
	const actual = await vi.importActual<typeof import("@tanstack/react-router")>(
		"@tanstack/react-router"
	);

	return {
		...actual,
		Link: (props: {
			children: ReactNode;
			className?: string;
			to: string;
		}) => (
			<a className={props.className} href={props.to}>
				{props.children}
			</a>
		),
	};
});

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

interface QueryMock {
	mockReturnValueOnce(value: unknown): QueryMock;
}

describe("lender listing detail page", () => {
	it("renders the canonical listing snapshot and only public docs", () => {
		const useQueryMock = useQuery as unknown as QueryMock;
		useQueryMock
			.mockReturnValueOnce({
				availability: { availableFractions: 42 },
				listing: {
					city: "Toronto",
					description: "Projected lender-facing mortgage listing.",
					interestRate: 9.5,
					lienPosition: 1,
					listingId: "listing_1",
					loanType: "conventional",
					ltvRatio: 62,
					maturityDate: "2027-04-30",
					monthlyPayment: 2450,
					paymentFrequency: "monthly",
					principal: 250000,
					propertyType: "residential",
					province: "ON",
					status: "active",
					title: "King West bridge opportunity",
				},
			})
			.mockReturnValueOnce([
				{
					assetId: "asset_public_1",
					blueprintId: "blueprint_public_1",
					class: "public_static",
					description: "Visible to authenticated lenders.",
					displayName: "Investor Summary",
					url: "https://example.com/investor-summary.pdf",
				},
			]);

		render(<LenderListingDetailPage listingId="listing_1" />);

		expect(screen.getByText("King West bridge opportunity")).toBeTruthy();
		expect(screen.getByText("Public Documents")).toBeTruthy();
		expect(screen.getByText("Investor Summary")).toBeTruthy();
		expect(screen.getByText("Visible to authenticated lenders.")).toBeTruthy();
		expect(screen.queryByText("Private counsel memo")).toBeNull();
		expect(
			screen.getByRole("link", { name: "Open PDF" }).getAttribute("href")
		).toBe("https://example.com/investor-summary.pdf");
		expect(
			screen.getByRole("link", { name: "Back to lender workspace" }).getAttribute(
				"href"
			)
		).toBe("/lender");
	});
});
