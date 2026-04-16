import { describe, expect, it } from "vitest";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import type { UserSavedViewDefinition } from "../../../convex/crm/types";
import {
	findDefaultUserSavedView,
	findSavedViewForSourceView,
	resolveAdminEntityViewContext,
	resolveAdminObjectDef,
} from "#/lib/admin-view-context";

function buildObjectDef(args: {
	name: string;
	nativeTable?: string;
	pluralLabel: string;
	singularLabel: string;
}): Doc<"objectDefs"> {
	return {
		_id: `object_${args.name}` as Id<"objectDefs">,
		_creationTime: 0,
		createdAt: 0,
		createdBy: "user_test",
		description: `${args.pluralLabel} object`,
		displayOrder: 0,
		icon: "box",
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

function buildViewDef(args: {
	id: string;
	isDefault?: boolean;
	name: string;
	objectDefId: Id<"objectDefs">;
	viewType: "calendar" | "kanban" | "table";
}): Doc<"viewDefs"> {
	return {
		_id: args.id as Id<"viewDefs">,
		_creationTime: 0,
		boundFieldId: undefined,
		createdAt: 0,
		createdBy: "user_test",
		isDefault: args.isDefault ?? false,
		name: args.name,
		needsRepair: false,
		objectDefId: args.objectDefId,
		orgId: "org_test",
		updatedAt: 0,
		viewType: args.viewType,
	};
}

function buildSavedView(args: {
	id: string;
	isDefault?: boolean;
	name: string;
	objectDefId: Id<"objectDefs">;
	sourceViewDefId: Id<"viewDefs">;
	viewType: "calendar" | "kanban" | "table";
}): UserSavedViewDefinition {
	return {
		aggregatePresets: [],
		fieldOrder: [],
		filters: [],
		groupByFieldId: undefined,
		isDefault: args.isDefault ?? false,
		name: args.name,
		objectDefId: args.objectDefId,
		ownerAuthId: "user_test",
		sourceViewDefId: args.sourceViewDefId,
		userSavedViewId: args.id as Id<"userSavedViews">,
		viewType: args.viewType,
		visibleFieldIds: [],
	};
}

describe("admin view context helpers", () => {
	it("resolves system objects by registered entity type", () => {
		const borrowers = buildObjectDef({
			name: "borrower",
			nativeTable: "borrowers",
			pluralLabel: "Borrowers",
			singularLabel: "Borrower",
		});

		expect(resolveAdminObjectDef("borrowers", [borrowers])).toEqual(borrowers);
	});

	it("resolves metadata-fallback objects by fallback entity type", () => {
		const leads = buildObjectDef({
			name: "lead",
			pluralLabel: "Leads",
			singularLabel: "Lead",
		});

		expect(resolveAdminObjectDef("lead", [leads])).toEqual(leads);
		expect(resolveAdminObjectDef("leads", [leads])).toEqual(leads);
	});

	it("prefers the default saved kanban view when one is active", () => {
		const borrowers = buildObjectDef({
			name: "borrower",
			nativeTable: "borrowers",
			pluralLabel: "Borrowers",
			singularLabel: "Borrower",
		});
		const tableView = buildViewDef({
			id: "view_borrowers_table",
			isDefault: true,
			name: "All Borrowers",
			objectDefId: borrowers._id,
			viewType: "table",
		});
		const kanbanView = buildViewDef({
			id: "view_borrowers_board",
			name: "Borrowers Board",
			objectDefId: borrowers._id,
			viewType: "kanban",
		});
		const savedKanbanView = buildSavedView({
			id: "saved_borrowers_board",
			isDefault: true,
			name: "My Borrower Board",
			objectDefId: borrowers._id,
			sourceViewDefId: kanbanView._id,
			viewType: "kanban",
		});

		const resolved = resolveAdminEntityViewContext({
			entityType: "borrowers",
			objectDefs: [borrowers],
			savedViews: [savedKanbanView],
			views: [tableView, kanbanView],
		});

		expect(resolved.objectDef?._id).toBe(borrowers._id);
		expect(resolved.activeSavedView?.userSavedViewId).toBe(
			savedKanbanView.userSavedViewId
		);
		expect(resolved.activeSourceView?._id).toBe(kanbanView._id);
		expect(resolved.viewMode).toBe("kanban");
	});

	it("falls back to table mode when the default saved kanban source view is unavailable", () => {
		const borrowers = buildObjectDef({
			name: "borrower",
			nativeTable: "borrowers",
			pluralLabel: "Borrowers",
			singularLabel: "Borrower",
		});
		const tableView = buildViewDef({
			id: "view_borrowers_table",
			isDefault: true,
			name: "All Borrowers",
			objectDefId: borrowers._id,
			viewType: "table",
		});
		const savedKanbanView = buildSavedView({
			id: "saved_borrowers_board",
			isDefault: true,
			name: "My Borrower Board",
			objectDefId: borrowers._id,
			sourceViewDefId: "view_missing_borrowers_board" as Id<"viewDefs">,
			viewType: "kanban",
		});

		const resolved = resolveAdminEntityViewContext({
			entityType: "borrowers",
			objectDefs: [borrowers],
			savedViews: [savedKanbanView],
			views: [tableView],
		});

		expect(resolved.activeSavedView?.userSavedViewId).toBe(
			savedKanbanView.userSavedViewId
		);
		expect(resolved.activeSourceView?._id).toBe(tableView._id);
		expect(resolved.viewMode).toBe("table");
	});

	it("falls back to the table system view when no saved view is active", () => {
		const lenders = buildObjectDef({
			name: "lender",
			nativeTable: "lenders",
			pluralLabel: "Lenders",
			singularLabel: "Lender",
		});
		const tableView = buildViewDef({
			id: "view_lenders_table",
			isDefault: true,
			name: "All Lenders",
			objectDefId: lenders._id,
			viewType: "table",
		});
		const kanbanView = buildViewDef({
			id: "view_lenders_board",
			name: "Lenders Board",
			objectDefId: lenders._id,
			viewType: "kanban",
		});

		const resolved = resolveAdminEntityViewContext({
			entityType: "lenders",
			objectDefs: [lenders],
			savedViews: [],
			views: [tableView, kanbanView],
		});

		expect(resolved.activeSavedView).toBeNull();
		expect(resolved.activeSourceView?._id).toBe(tableView._id);
		expect(resolved.viewMode).toBe("table");
	});

	it("finds existing saved views for a target source view", () => {
		const objectDefId = "object_brokers" as Id<"objectDefs">;
		const tableSavedView = buildSavedView({
			id: "saved_brokers_table",
			isDefault: true,
			name: "My Brokers Table",
			objectDefId,
			sourceViewDefId: "view_brokers_table" as Id<"viewDefs">,
			viewType: "table",
		});
		const kanbanSavedView = buildSavedView({
			id: "saved_brokers_board",
			name: "My Brokers Board",
			objectDefId,
			sourceViewDefId: "view_brokers_board" as Id<"viewDefs">,
			viewType: "kanban",
		});

		expect(findDefaultUserSavedView([tableSavedView, kanbanSavedView])).toEqual(
			tableSavedView
		);
		expect(
			findSavedViewForSourceView({
				savedViews: [tableSavedView, kanbanSavedView],
				viewDefId: "view_brokers_board" as Id<"viewDefs">,
				viewType: "kanban",
			})
		).toEqual(kanbanSavedView);
	});
});
