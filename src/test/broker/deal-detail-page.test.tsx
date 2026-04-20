/**
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from "@testing-library/react";
import { useQuery } from "convex/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BrokerDealDetailPage } from "#/components/broker/deals/BrokerDealDetailPage";

vi.mock("convex/react", () => ({
	useAction: vi.fn(() => vi.fn()),
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
	vi.restoreAllMocks();
});

interface QueryMock {
	mockReturnValue(value: unknown): QueryMock;
}

describe("broker deal detail page", () => {
	it("renders the broker-facing deal package and archive actions", () => {
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
					archivedAt: new Date("2026-05-16T16:30:00.000Z").getTime(),
					archivedSigning: {
						completionCertificateUrl:
							"https://example.com/broker-borrower-certificate.pdf",
						finalPdfUrl: "https://example.com/broker-borrower-final.pdf",
						signingCompletedAt: new Date(
							"2026-05-16T15:45:00.000Z"
						).getTime(),
					},
					class: "private_templated_signable",
					displayName: "Archived borrower packet",
					instanceId: "instance_3",
					kind: "generated",
					packageLabel: "Closing package",
					signing: {
						canLaunchEmbeddedSigning: false,
						envelopeId: "envelope_2",
						generatedDocumentSigningStatus: "completed",
						lastError: null,
						lastProviderSyncAt: new Date("2026-05-16T15:46:00.000Z").getTime(),
						providerCode: "documenso",
						providerEnvelopeId: "doc_env_2",
						recipients: [],
						status: "completed",
					},
					status: "archived",
					url: "https://example.com/broker-borrower-final.pdf",
				},
			],
			documentPackage: {
				archivedAt: new Date("2026-05-16T16:30:00.000Z").getTime(),
				lastError: null,
				packageId: "package_1",
				readyAt: new Date("2026-05-15T13:00:00.000Z").getTime(),
				retryCount: 0,
				status: "archived",
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

		render(<BrokerDealDetailPage dealId="deal_1" />);

		expect(screen.getByText("Deal Package")).toBeTruthy();
		expect(screen.getByText("Archived Signed Artifacts")).toBeTruthy();
		expect(screen.getByText("Signed archive ready")).toBeTruthy();
		expect(screen.getByText("Archived borrower packet")).toBeTruthy();
		expect(
			screen.getByRole("link", { name: "Open final PDF" }).getAttribute("href")
		).toBe("https://example.com/broker-borrower-final.pdf");
		expect(
			screen
				.getByRole("link", { name: "Open completion certificate" })
				.getAttribute("href")
		).toBe("https://example.com/broker-borrower-certificate.pdf");
		expect(
			screen.getByRole("link", { name: "Back to broker workspace" }).getAttribute(
				"href"
			)
		).toBe("/broker");
	});
});
