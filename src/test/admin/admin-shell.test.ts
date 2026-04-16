import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import type {
	NormalizedFieldDefinition,
	UnifiedRecord,
} from "../../../../convex/crm/types";
import { isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { FAIRLEND_STAFF_ORG_ID } from "../../../convex/constants";
import {
	buildAdminPreviewRecords,
	getAdminPreviewRecord,
} from "#/components/admin/shell/admin-preview-records";
import {
	getAdminRecordSupportingText,
	getAdminRecordTitle,
} from "#/components/admin/shell/admin-view-rendering";
import { resolveRecordSidebarEntityAdapter } from "#/components/admin/shell/entity-view-adapters";
import {
	getAdminNavigationSections,
	isAdminRouteActive,
} from "#/components/admin/shell/entity-registry";
import {
	navigateToAdminRelation,
	resolveAdminRecordRouteTarget,
	resolveAdminRelationReference,
} from "#/lib/admin-relation-navigation";
import { EMPTY_ADMIN_DETAIL_SEARCH } from "#/lib/admin-detail-search";
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
	return buildSystemObjectDef({
		name: "borrower",
		nativeTable: "borrowers",
		pluralLabel: "Borrowers",
		singularLabel: "Borrower",
	});
}

function buildSystemObjectDef(args: {
	name: string;
	nativeTable: Doc<"objectDefs">["nativeTable"];
	pluralLabel: string;
	singularLabel: string;
}): Doc<"objectDefs"> {
	return {
		_id: `object_${args.name}` as Id<"objectDefs">,
		_creationTime: 0,
		createdAt: 0,
		createdBy: "user_test",
		description: `Test ${args.singularLabel.toLowerCase()} object`,
		icon: "user",
		isActive: true,
		isSystem: true,
		name: args.name,
		nativeTable: args.nativeTable,
		orgId: "org_test",
		pluralLabel: args.pluralLabel,
		singularLabel: args.singularLabel,
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

function buildLeadObjectDef(): Doc<"objectDefs"> {
	return {
		_id: "object_lead" as Id<"objectDefs">,
		_creationTime: 0,
		createdAt: 0,
		createdBy: "user_test",
		description: "Test lead object",
		icon: "briefcase",
		isActive: true,
		isSystem: false,
		name: "lead",
		nativeTable: undefined,
		orgId: "org_test",
		pluralLabel: "Leads",
		singularLabel: "Lead",
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

	it("uses listing-specific title and supporting text semantics", () => {
		const fields = [
			buildFieldDef({ displayOrder: 0, label: "Title", name: "title" }),
			buildFieldDef({
				displayOrder: 1,
				label: "Property Summary",
				name: "propertySummary",
			}),
		];
		const record: UnifiedRecord = {
			_id: "listing_1",
			_kind: "native",
			createdAt: 0,
			fields: {
				interestRate: 5.1,
				ltvRatio: 67.5,
				propertySummary: "789 King St W, Toronto, ON",
				propertyType: "condo",
				title: "Downtown First Mortgage",
			},
			objectDefId: "object_listing" as Id<"objectDefs">,
			updatedAt: 0,
		};
		const objectDef = buildSystemObjectDef({
			name: "listing",
			nativeTable: "listings",
			pluralLabel: "Listings",
			singularLabel: "Listing",
		});

		expect(
			getAdminRecordTitle({
				adapterContract: { entityType: "listings", titleFieldName: "title" },
				fields,
				record,
			})
		).toBe("Downtown First Mortgage");
		expect(
			getAdminRecordSupportingText({
				adapterContract: { entityType: "listings" },
				objectDef,
				record,
			})
		).toBe("789 King St W, Toronto, ON • Condo • 5.1% • LTV 67.5%");
	});

	it("uses mortgage summary fields for card copy when a dedicated adapter is active", () => {
		const fields = [
			buildFieldDef({
				displayOrder: 0,
				fieldType: "text",
				label: "Property Summary",
				name: "propertySummary",
			}),
			buildFieldDef({
				displayOrder: 1,
				fieldType: "text",
				label: "Borrower Summary",
				name: "borrowerSummary",
			}),
		];
		const record: UnifiedRecord = {
			_id: "mortgage_1",
			_kind: "native",
			createdAt: 0,
			fields: {
				borrowerSummary: "Alice Borrower + 1 more",
				paymentSummary: "Monthly • $2,460",
				principal: 425_000,
				propertySummary: "789 King St W, Toronto, ON",
			},
			objectDefId: "object_mortgage" as Id<"objectDefs">,
			updatedAt: 0,
		};
		const objectDef = buildSystemObjectDef({
			name: "mortgage",
			nativeTable: "mortgages",
			pluralLabel: "Mortgages",
			singularLabel: "Mortgage",
		});

		expect(
			getAdminRecordTitle({
				adapterContract: {
					entityType: "mortgages",
					titleFieldName: "propertySummary",
				},
				fields,
				record,
			})
		).toBe("789 King St W, Toronto, ON");
		expect(
			getAdminRecordSupportingText({
				adapterContract: { entityType: "mortgages" },
				objectDef,
				record,
			})
		).toBe("Alice Borrower + 1 more • Monthly • $2,460 • $425,000");
	});

	it("resolves relation references from object metadata", () => {
		const objectDef = buildBorrowerObjectDef();

		expect(
			resolveAdminRelationReference({
				objectDefs: [objectDef],
				target: {
					objectDefId: String(objectDef._id),
					recordId: "borrower_1",
					recordKind: "native",
				},
			})
		).toEqual({
			entityType: "borrowers",
			objectDefId: String(objectDef._id),
			recordId: "borrower_1",
			recordKind: "native",
		});
	});

	it("resolves fallback relation references from object metadata", () => {
		const objectDef = buildLeadObjectDef();

		expect(
			resolveAdminRelationReference({
				objectDefs: [objectDef],
				target: {
					objectDefId: String(objectDef._id),
					recordId: "lead_1",
					recordKind: "record",
				},
			})
		).toEqual({
			entityType: "lead",
			objectDefId: String(objectDef._id),
			recordId: "lead_1",
			recordKind: "record",
		});
	});

	it("builds dedicated admin detail routes for related records", () => {
		expect(
			resolveAdminRecordRouteTarget({
				entityType: "borrowers",
				recordId: "borrower_1",
			})
		).toEqual({
			params: {
				recordid: "borrower_1",
			},
			search: EMPTY_ADMIN_DETAIL_SEARCH,
			to: "/admin/borrowers/$recordid",
		});
	});

	it("builds generic admin detail routes for metadata-fallback related records", () => {
		expect(
			resolveAdminRecordRouteTarget({
				entityType: "lead",
				recordId: "lead_1",
			})
		).toEqual({
			params: {
				entitytype: "lead",
				recordid: "lead_1",
			},
			search: EMPTY_ADMIN_DETAIL_SEARCH,
			to: "/admin/$entitytype/$recordid",
		});
	});

	it("returns null when the related record id is blank", () => {
		expect(
			resolveAdminRecordRouteTarget({
				entityType: "borrowers",
				recordId: "   ",
			})
		).toBeNull();
	});

	it("prefers sidebar navigation for sheet-presented relation clicks", () => {
		const navigate = vi.fn();
		const pushToSidebar = vi.fn();
		const objectDef = buildBorrowerObjectDef();

		navigateToAdminRelation({
			navigate,
			objectDefs: [objectDef],
			presentation: "sheet",
			pushToSidebar,
			target: {
				objectDefId: String(objectDef._id),
				recordId: "borrower_1",
				recordKind: "native",
			},
		});

		expect(pushToSidebar).toHaveBeenCalledWith({
			entityType: "borrowers",
			objectDefId: String(objectDef._id),
			recordId: "borrower_1",
			recordKind: "native",
		});
		expect(navigate).not.toHaveBeenCalled();
	});

	it("falls back to full-page navigation when sidebar state is unavailable", () => {
		const navigate = vi.fn();
		const objectDef = buildBorrowerObjectDef();

		navigateToAdminRelation({
			navigate,
			objectDefs: [objectDef],
			presentation: "sheet",
			target: {
				objectDefId: String(objectDef._id),
				recordId: "borrower_1",
				recordKind: "native",
			},
		});

		expect(navigate).toHaveBeenCalledWith({
			params: {
				recordid: "borrower_1",
			},
			search: EMPTY_ADMIN_DETAIL_SEARCH,
			to: "/admin/borrowers/$recordid",
		});
	});

	it("falls back to generic full-page navigation for metadata-fallback relations", () => {
		const navigate = vi.fn();
		const objectDef = buildLeadObjectDef();

		navigateToAdminRelation({
			navigate,
			objectDefs: [objectDef],
			presentation: "sheet",
			target: {
				objectDefId: String(objectDef._id),
				recordId: "lead_1",
				recordKind: "record",
			},
		});

		expect(navigate).toHaveBeenCalledWith({
			params: {
				entitytype: "lead",
				recordid: "lead_1",
			},
			search: EMPTY_ADMIN_DETAIL_SEARCH,
			to: "/admin/$entitytype/$recordid",
		});
	});
});
