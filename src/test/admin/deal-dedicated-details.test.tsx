/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useAction, useMutation, useQuery } from "convex/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Id } from "../../../convex/_generated/dataModel";
import type {
	NormalizedFieldDefinition,
	UnifiedRecord,
} from "../../../convex/crm/types";
import { DealsDedicatedDetails } from "#/components/admin/shell/dedicated-detail-panels";

vi.mock("convex/react", () => ({
	useAction: vi.fn(),
	useMutation: vi.fn(),
	useQuery: vi.fn(),
}));

vi.mock("#/hooks/use-can-do", () => ({
	useCanDo: vi.fn(() => true),
}));

vi.mock("sonner", () => ({
	toast: {
		error: vi.fn(),
		success: vi.fn(),
	},
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
			params?: Record<string, string>;
			to: string;
		}) => (
			<a
				className={props.className}
				href={props.to.replace(
					"$recordid",
					props.params?.recordid ?? "$recordid"
				)}
			>
				{props.children}
			</a>
		),
	};
});

function buildFieldDef(args: {
	displayOrder: number;
	label: string;
	name: string;
}): NormalizedFieldDefinition {
	return {
		aggregation: {
			enabled: false,
			reason: "Test fixture",
			supportedFunctions: [],
		},
		computed: undefined,
		defaultValue: undefined,
		description: undefined,
		displayOrder: args.displayOrder,
		editability: { mode: "editable" },
		fieldDefId: `field_${args.name}` as Id<"fieldDefs">,
		fieldSource: "persisted",
		fieldType: "text",
		isActive: true,
		isRequired: false,
		isUnique: false,
		isVisibleByDefault: true,
		label: args.label,
		layoutEligibility: {
			calendar: { enabled: false, reason: "Test fixture" },
			groupBy: { enabled: false, reason: "Test fixture" },
			kanban: { enabled: false, reason: "Test fixture" },
			table: { enabled: true },
		},
		name: args.name,
		nativeColumnPath: undefined,
		nativeReadOnly: false,
		normalizedFieldKind: "primitive",
		objectDefId: "object_deal" as Id<"objectDefs">,
		options: undefined,
		relation: undefined,
		rendererHint: "text",
	};
}

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe("deal dedicated details", () => {
	it("renders package state and allows retrying package generation", () => {
		const retryPackageGeneration = vi.fn().mockResolvedValue({
			dealId: "deal_1",
			packageId: "package_1",
			status: "ready",
		});
		vi.mocked(useQuery).mockReturnValue({
			documentInstances: [
				{
					class: "private_templated_non_signable",
					displayName: "Counsel memo",
					instanceId: "instance_1",
					kind: "generated",
					lastError: null,
					packageLabel: "Closing package",
					status: "available",
					url: "https://example.com/counsel-memo.pdf",
				},
				{
					class: "private_templated_signable",
					displayName: "Borrower signature packet",
					instanceId: "instance_2",
					kind: "generated",
					lastError: null,
					packageLabel: "Closing package",
					status: "signature_pending_recipient_resolution",
					url: null,
				},
			],
			documentPackage: {
				lastError: "Missing variables: listing_title",
				packageId: "package_1",
				readyAt: null,
				retryCount: 1,
				status: "partial_failure",
			},
			mortgage: { mortgageId: "mortgage_1" },
			parties: {
				lawyer: null,
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
				propertyId: "property_1",
				streetAddress: "123 King St W",
			},
			recentAuditEvents: [
				{
					eventId: "audit_1",
					eventType: "DEAL_LOCKED",
					newState: "lawyerOnboarding.pending",
					outcome: "success",
					previousState: "initiated",
					timestamp: Date.now(),
				},
			],
		});
		vi.mocked(useAction).mockReturnValue(retryPackageGeneration);
		vi.mocked(useMutation).mockReturnValue(vi.fn());

		const fields = [
			buildFieldDef({ displayOrder: 0, label: "Status", name: "status" }),
			buildFieldDef({
				displayOrder: 1,
				label: "Closing Date",
				name: "closingDate",
			}),
			buildFieldDef({
				displayOrder: 2,
				label: "Fractional Share",
				name: "fractionalShare",
			}),
			buildFieldDef({
				displayOrder: 3,
				label: "Locking Fee",
				name: "lockingFeeAmount",
			}),
		];
		const record = {
			_id: "deal_1",
			creationType: "real",
			fields: {
				closingDate: new Date("2026-05-15T12:00:00.000Z").toISOString(),
				fractionalShare: 2500,
				lockingFeeAmount: 7500,
				status: "initiated",
			},
			sourceId: null,
		} as unknown as UnifiedRecord;

		render(<DealsDedicatedDetails fields={fields} record={record} />);

		expect(screen.getByText("Deal Package")).toBeTruthy();
		expect(screen.getByText("Generated Read-only Documents")).toBeTruthy();
		expect(screen.getByText("Reserved Signable Documents")).toBeTruthy();
		expect(screen.getByText("Counsel memo")).toBeTruthy();
		expect(screen.getByText("Borrower signature packet")).toBeTruthy();
		expect(screen.getByText("Missing variables: listing_title")).toBeTruthy();
		expect(
			screen.getByRole("link", { name: "mortgage_1" }).getAttribute("href")
		).toBe("/admin/mortgages/mortgage_1");
		expect(
			screen.getByRole("link", { name: "123 King St W" }).getAttribute("href")
		).toBe("/admin/properties/property_1");

		fireEvent.click(
			screen.getByRole("button", { name: "Retry package generation" })
		);
		expect(retryPackageGeneration).toHaveBeenCalledWith({ dealId: "deal_1" });
	});
});
