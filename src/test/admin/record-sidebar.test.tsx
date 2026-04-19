/**
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from "@testing-library/react";
import { useQuery } from "convex/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import type {
	EntityViewAdapterContract,
	UnifiedRecord,
} from "../../../convex/crm/types";
import { AdminRecordDetailSurface } from "#/components/admin/shell/RecordSidebar";
import type { RecordSidebarEntityAdapter } from "#/components/admin/shell/entity-view-adapters";
import type { SidebarRecordRef } from "#/components/admin/shell/RecordSidebarProvider";

vi.mock("convex/react", () => ({
	useQuery: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
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
}));

vi.mock("#/hooks/useAdminRelationNavigation", () => ({
	useAdminRelationNavigation: vi.fn(() => vi.fn()),
}));

vi.mock("#/components/admin/shell/AdminPageMetadataContext", () => ({
	useAdminBreadcrumbLabel: vi.fn(),
}));

vi.mock("#/components/admin/shell/ActivityTimeline", () => ({
	ActivityTimeline: () => <div data-testid="activity-timeline" />,
}));

vi.mock("#/components/admin/shell/LinkedRecordsPanel", () => ({
	LinkedRecordsPanel: () => <div data-testid="linked-records-panel" />,
}));

interface QueryMock {
	mockImplementation(
		implementation: (query: unknown, args?: unknown) => unknown
	): QueryMock;
}

const REFERENCE: SidebarRecordRef = {
	entityType: "borrowers",
	objectDefId: "object_borrower",
	recordId: "borrower_1",
	recordKind: "native",
};

function buildBorrowerObjectDef(): Doc<"objectDefs"> {
	return {
		_id: "object_borrower" as Id<"objectDefs">,
		_creationTime: 0,
		createdAt: 0,
		createdBy: "user_test",
		description: "Test borrower object",
		icon: "user",
		isActive: true,
		isSystem: true,
		name: "borrower",
		nativeTable: "borrowers",
		orgId: "org_test",
		pluralLabel: "Borrowers",
		singularLabel: "Borrower",
		updatedAt: 0,
	};
}

function buildBorrowerRecord(): UnifiedRecord {
	return {
		_id: "borrower_1",
		_kind: "native",
		createdAt: 0,
		fields: {
			idvStatus: "verified",
			status: "active",
		},
		objectDefId: "object_borrower" as Id<"objectDefs">,
		updatedAt: 0,
	};
}

function buildAdapterContract(): EntityViewAdapterContract {
	return {
		computedFields: [],
		detail: {
			mode: "dedicated",
			surfaceKey: "borrowers",
		},
		entityType: "borrowers",
		fieldOverrides: [],
		layoutDefaults: {
			preferredVisibleFieldNames: [],
		},
		objectDefId: "object_borrower" as Id<"objectDefs">,
		supportedLayouts: ["table"],
		variant: "dedicated",
	};
}

function renderSurface(args: {
	adapter: RecordSidebarEntityAdapter;
	detailSurface:
		| {
				adapterContract?: EntityViewAdapterContract;
				fields?: readonly [];
				objectDef?: Doc<"objectDefs">;
				record?: UnifiedRecord;
		  }
		| undefined;
}) {
	const objectDef = buildBorrowerObjectDef();
	const useQueryMock = useQuery as unknown as QueryMock;

	useQueryMock.mockImplementation((_, queryArgs) =>
		queryArgs === undefined ? [objectDef] : args.detailSurface
	);

	return render(
		<AdminRecordDetailSurface
			adapters={{ borrowers: args.adapter }}
			reference={REFERENCE}
			variant="sheet"
		/>
	);
}

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe("AdminRecordDetailSurface", () => {
	it("skips adapter details while the live record surface is still loading", () => {
		const adapterSpy = vi.fn(() => <div>Adapter details ready</div>);

		const { container } = renderSurface({
			adapter: { renderDetailsTab: adapterSpy },
			detailSurface: undefined,
		});

		expect(adapterSpy).not.toHaveBeenCalled();
		expect(screen.queryByText("Adapter details ready")).toBeNull();
		expect(container.querySelectorAll(".animate-pulse")).toHaveLength(4);
	});

	it("skips adapter details when the record payload is unavailable", () => {
		const adapterSpy = vi.fn(() => <div>Adapter details ready</div>);

		renderSurface({
			adapter: { renderDetailsTab: adapterSpy },
			detailSurface: {
				adapterContract: buildAdapterContract(),
				fields: [],
				objectDef: buildBorrowerObjectDef(),
			},
		});

		expect(adapterSpy).not.toHaveBeenCalled();
		expect(screen.getByText("Live record data unavailable")).toBeTruthy();
	});

	it("renders adapter details once a real record is available", () => {
		const record = buildBorrowerRecord();
		const adapterSpy = vi.fn(() => <div>Adapter details ready</div>);

		renderSurface({
			adapter: { renderDetailsTab: adapterSpy },
			detailSurface: {
				adapterContract: buildAdapterContract(),
				fields: [],
				objectDef: buildBorrowerObjectDef(),
				record,
			},
		});

		expect(screen.getByText("Adapter details ready")).toBeTruthy();
		expect(adapterSpy).toHaveBeenCalledTimes(1);
		expect(adapterSpy.mock.calls[0]?.[0]?.record).toBe(record);
	});
});
