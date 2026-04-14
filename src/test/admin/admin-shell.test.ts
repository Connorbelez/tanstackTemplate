import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import type {
	NormalizedFieldDefinition,
	UnifiedRecord,
} from "../../../../convex/crm/types";
import { isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FAIRLEND_STAFF_ORG_ID } from "../../../convex/constants";
import {
	buildAdminPreviewRecords,
	getAdminPreviewRecord,
} from "#/components/admin/shell/admin-preview-records";
import { resolveRecordSidebarEntityAdapter } from "#/components/admin/shell/entity-view-adapters";
import {
	getAdminNavigationSections,
	isAdminRouteActive,
} from "#/components/admin/shell/entity-registry";
import { canAccessAdminPath } from "#/lib/auth";
import { isAdminPathname } from "#/lib/admin-routes";

function buildFieldDef(args: {
	displayOrder: number;
	fieldType?: NormalizedFieldDefinition["fieldType"];
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
		fieldType: args.fieldType ?? "text",
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
		objectDefId: "object_borrower" as Id<"objectDefs">,
		options: undefined,
		relation: undefined,
		rendererHint: "text",
	};
}

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
			notes: "Follow up tomorrow",
			status: "active",
		},
		objectDefId: "object_borrower" as Id<"objectDefs">,
		updatedAt: 0,
	};
}

const FAIRLEND_ADMIN_CONTEXT = {
	orgId: FAIRLEND_STAFF_ORG_ID,
	permissions: ["admin:access"],
	role: "admin",
	roles: ["admin"],
	token: null,
	userId: "user_fairlend_admin",
};

const UNDERWRITER_CONTEXT = {
	orgId: null,
	permissions: ["underwriter:access"],
	role: "underwriter",
	roles: ["underwriter"],
	token: null,
	userId: "user_underwriter",
};

const EXTERNAL_ADMIN_CONTEXT = {
	orgId: "org_external_test",
	permissions: ["admin:access"],
	role: "admin",
	roles: ["admin"],
	token: null,
	userId: "user_external_admin",
};

const ROLE_ONLY_ADMIN_CONTEXT = {
	orgId: FAIRLEND_STAFF_ORG_ID,
	permissions: ["admin:access"],
	role: "admin",
	roles: [],
	token: null,
	userId: "user_fairlend_admin_role_only",
};

describe("admin shell helpers", () => {
	it("matches dashboard routes exactly instead of every admin page", () => {
		expect(isAdminRouteActive("/admin", "/admin")).toBe(true);
		expect(isAdminRouteActive("/admin/mortgages", "/admin")).toBe(false);
	});

	it("matches entity routes for nested detail pages", () => {
		expect(isAdminRouteActive("/admin/mortgages", "/admin/mortgages")).toBe(true);
		expect(
			isAdminRouteActive("/admin/mortgages/123", "/admin/mortgages")
		).toBe(true);
		expect(isAdminRouteActive("/admin/listings", "/admin/mortgages")).toBe(
			false
		);
	});

	it("builds ordered admin navigation sections and excludes hidden entities", () => {
		const sections = getAdminNavigationSections(
			[
				{
					domain: "system",
					entityType: "zebra",
					iconName: "shield",
					isHiddenFromNavigation: true,
					pluralLabel: "Zebras",
					route: "/admin/zebras",
					singularLabel: "Zebra",
					supportsDetailPage: true,
					supportsTableView: true,
				},
				{
					domain: "system",
					entityType: "borrowers",
					iconName: "user",
					pluralLabel: "Borrowers",
					route: "/admin/borrowers",
					singularLabel: "Borrower",
					supportsDetailPage: true,
					supportsTableView: true,
				},
				{
					domain: "marketplace",
					entityType: "listings",
					iconName: "box",
					pluralLabel: "Listings",
					route: "/admin/listings",
					singularLabel: "Listing",
					supportsDetailPage: true,
					supportsTableView: true,
				},
			],
			[
				{
					domain: "system",
					iconName: "shield",
					kind: "route",
					label: "Dashboard",
					route: "/admin",
				},
			]
		);

		expect(sections.map((section) => section.domain)).toEqual([
			"marketplace",
			"system",
		]);
		expect(sections[1]?.items.map((item) => item.label)).toEqual([
			"Dashboard",
			"Borrowers",
		]);
	});

	it("allows underwriters only on the underwriting admin subtree", () => {
		expect(canAccessAdminPath("/admin/underwriting", UNDERWRITER_CONTEXT)).toBe(
			true
		);
		expect(
			canAccessAdminPath("/admin/underwriting/queue", UNDERWRITER_CONTEXT)
		).toBe(true);
		expect(canAccessAdminPath("/admin/mortgages", UNDERWRITER_CONTEXT)).toBe(
			false
		);
		expect(canAccessAdminPath("/admin/mortgages", FAIRLEND_ADMIN_CONTEXT)).toBe(
			true
		);
		expect(canAccessAdminPath("/admin/mortgages", ROLE_ONLY_ADMIN_CONTEXT)).toBe(
			true
		);
		expect(canAccessAdminPath("/admin/mortgages", EXTERNAL_ADMIN_CONTEXT)).toBe(
			false
		);
	});

	it("identifies admin pathnames for root header suppression", () => {
		expect(isAdminPathname("/admin")).toBe(true);
		expect(isAdminPathname("/admin/listings")).toBe(true);
		expect(isAdminPathname("/administrator")).toBe(false);
		expect(isAdminPathname("/about")).toBe(false);
	});

	it("builds deterministic preview records only for registered entities", () => {
		expect(buildAdminPreviewRecords("listings")).toHaveLength(10);
		expect(buildAdminPreviewRecords("ghost")).toEqual([]);
		expect(buildAdminPreviewRecords("listings")[0]).toMatchObject({
			id: 0,
			name: "Listing 1",
		});
	});

	it("finds preview records by string route id and returns undefined when absent", () => {
		expect(getAdminPreviewRecord("mortgages", "4")).toMatchObject({
			id: 4,
			name: "Mortgage 5",
		});
		expect(getAdminPreviewRecord("mortgages", "99")).toBeUndefined();
		expect(getAdminPreviewRecord("ghost", "1")).toBeUndefined();
	});

	it("resolves dedicated adapters from object definitions and preserves overrides", () => {
		const adapter = resolveRecordSidebarEntityAdapter({
			detailSurfaceKey: "borrowers",
			objectDef: buildBorrowerObjectDef(),
			overrides: {
				borrowers: {
					getRecordTitle: () => "Overridden Borrower",
				},
			},
			entityType: undefined,
		});

		expect(adapter).toBeDefined();
		expect(adapter?.renderDetailsTab).toBeTypeOf("function");
		expect(
			adapter?.getRecordTitle?.({
				adapterContract: undefined,
				entity: undefined,
				objectDef: buildBorrowerObjectDef(),
				record: buildBorrowerRecord(),
				recordId: "borrower_1",
			})
		).toBe("Overridden Borrower");
	});

	it("renders dedicated detail fields in the configured priority order", () => {
		const adapter = resolveRecordSidebarEntityAdapter({
			entityType: "borrowers",
			objectDef: undefined,
		});
		expect(adapter?.renderDetailsTab).toBeTypeOf("function");
		if (!adapter?.renderDetailsTab) {
			throw new Error("Borrower adapter not found");
		}

		const fields = [
			buildFieldDef({ displayOrder: 2, label: "Notes", name: "notes" }),
			buildFieldDef({ displayOrder: 1, label: "IDV Status", name: "idvStatus" }),
			buildFieldDef({ displayOrder: 0, label: "Status", name: "status" }),
		];
		const record = buildBorrowerRecord();

		const content = adapter.renderDetailsTab({
			adapterContract: undefined,
			entity: undefined,
			fields,
			objectDef: buildBorrowerObjectDef(),
			record,
			recordId: record._id,
		});
		expect(isValidElement(content)).toBe(true);
		if (!isValidElement(content)) {
			throw new Error("Expected dedicated details renderer to return an element");
		}

		const markup = renderToStaticMarkup(content);
		expect(markup).toContain("Status");
		expect(markup).toContain("IDV Status");
		expect(markup).toContain("Notes");
		expect(markup.indexOf("Status")).toBeLessThan(markup.indexOf("IDV Status"));
		expect(markup.indexOf("IDV Status")).toBeLessThan(markup.indexOf("Notes"));
	});
});
