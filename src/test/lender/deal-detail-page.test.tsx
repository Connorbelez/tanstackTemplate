/**
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from "@testing-library/react";
import { useQuery } from "convex/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LenderDealDetailPage } from "#/components/lender/deals/LenderDealDetailPage";

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
	mockReturnValue(value: unknown): QueryMock;
}

describe("lender deal detail page", () => {
	it("renders the immutable deal package and only available private docs", () => {
		const useQueryMock = useQuery as unknown as QueryMock;
		useQueryMock.mockReturnValue({
			deal: {
				closingDate: new Date("2026-05-15T12:00:00.000Z").getTime(),
				dealId: "deal_1",
				fractionalShare: 2500,
				lockingFeeAmount: 7500,
				status: "initiated",
			},
			documentInstances: [
				{
					class: "private_templated_non_signable",
					displayName: "Counsel memo",
					instanceId: "instance_1",
					kind: "generated",
					packageLabel: "Closing package",
					status: "available",
					url: "https://example.com/counsel-memo.pdf",
				},
				{
					class: "private_templated_signable",
					displayName: "Borrower signature packet",
					instanceId: "instance_2",
					kind: "generated",
					packageLabel: "Closing package",
					status: "signature_pending_recipient_resolution",
					url: null,
				},
			],
			documentPackage: {
				lastError: null,
				packageId: "package_1",
				readyAt: new Date("2026-05-15T13:00:00.000Z").getTime(),
				retryCount: 0,
				status: "ready",
			},
			mortgage: {
				interestRate: 9.5,
				maturityDate: "2027-04-30",
				mortgageId: "mortgage_1",
				paymentAmount: 2450,
				paymentFrequency: "monthly",
				principal: 250000,
				status: "active",
			},
			parties: {
				lender: {
					email: "lender@test.fairlend.ca",
					name: "Lena Lender",
				},
				seller: {
					email: "seller@test.fairlend.ca",
					name: "Sam Seller",
				},
			},
			property: {
				city: "Toronto",
				propertyType: "residential",
				province: "ON",
				streetAddress: "123 King St W",
				unit: null,
			},
		});

		render(<LenderDealDetailPage dealId="deal_1" />);

		expect(screen.getByText("Deal Package")).toBeTruthy();
		expect(screen.getByText("Closing Snapshot")).toBeTruthy();
		expect(screen.getAllByText("Package Status").length).toBeGreaterThan(0);
		expect(screen.getByText("Generated Read-only Documents")).toBeTruthy();
		expect(screen.getByText("Private Static Documents")).toBeTruthy();
		expect(screen.getByText("Reserved Signable Documents")).toBeTruthy();
		expect(screen.getByText("Counsel memo")).toBeTruthy();
		expect(screen.queryByText("Borrower signature packet")).toBeNull();
		expect(
			screen.getByRole("link", { name: "Open PDF" }).getAttribute("href")
		).toBe("https://example.com/counsel-memo.pdf");
		expect(
			screen.getByRole("link", { name: "Back to lender workspace" }).getAttribute(
				"href"
			)
		).toBe("/lender");
	});
});
