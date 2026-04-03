import { makeFunctionReference } from "convex/server";
import { beforeEach, describe, expect, it } from "vitest";
import { api } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import type {
	RecordFilter,
	SavedViewFilterDefinition,
	UserSavedViewDefinition,
	ViewLayout,
} from "../types";
import {
	asAdmin,
	asUser,
	type CrmTestFixture,
	type CrmTestHarness,
	createCrmTestHarness,
	seedObjectWithFields,
	seedRecord,
} from "./helpers";

interface CreateUserSavedViewArgs {
	fieldOrder?: Id<"fieldDefs">[];
	filters?: SavedViewFilterDefinition[];
	groupByFieldId?: Id<"fieldDefs">;
	isDefault?: boolean;
	name: string;
	objectDefId: Id<"objectDefs">;
	sourceViewDefId?: Id<"viewDefs">;
	viewType: ViewLayout;
	visibleFieldIds?: Id<"fieldDefs">[];
}

interface TableQueryResult {
	columns: Array<{ displayOrder: number; isVisible: boolean; name: string }>;
	rows: Array<{ fields: Record<string, unknown> }>;
	totalCount: number;
}

interface KanbanQueryResult {
	groups: Array<{ count: number; label: string }>;
	totalCount: number;
}

interface CalendarQueryResult {
	events: Array<{ records: Array<{ fields: Record<string, unknown> }> }>;
}

interface ViewSchemaResult {
	columns: Array<{ displayOrder: number; isVisible: boolean; name: string }>;
	effectiveView: {
		activeSavedViewId?: Id<"userSavedViews">;
		filters: RecordFilter[];
		name: string;
	};
	savedView: UserSavedViewDefinition | null;
	systemView: { name: string };
	view: {
		name: string;
	};
}

const CREATE_USER_SAVED_VIEW = makeFunctionReference<
	"mutation",
	CreateUserSavedViewArgs,
	Id<"userSavedViews">
>("crm/userSavedViews:createUserSavedView");

const GET_DEFAULT_USER_SAVED_VIEW = makeFunctionReference<
	"query",
	{ objectDefId: Id<"objectDefs"> },
	UserSavedViewDefinition | null
>("crm/userSavedViews:getDefaultUserSavedView");

const LIST_USER_SAVED_VIEWS = makeFunctionReference<
	"query",
	{ objectDefId: Id<"objectDefs"> },
	UserSavedViewDefinition[]
>("crm/userSavedViews:listUserSavedViews");

const SET_DEFAULT_USER_SAVED_VIEW = makeFunctionReference<
	"mutation",
	{ userSavedViewId: Id<"userSavedViews"> },
	void
>("crm/userSavedViews:setDefaultUserSavedView");

async function seedLeadFixture(t: CrmTestHarness): Promise<CrmTestFixture> {
	return seedObjectWithFields(t, {
		name: "lead",
		fields: [
			{ name: "company_name", fieldType: "text", isRequired: true },
			{
				name: "status",
				fieldType: "select",
				options: [
					{ value: "new", label: "New", color: "#3b82f6", order: 0 },
					{
						value: "contacted",
						label: "Contacted",
						color: "#eab308",
						order: 1,
					},
					{
						value: "qualified",
						label: "Qualified",
						color: "#22c55e",
						order: 2,
					},
				],
			},
			{ name: "next_followup", fieldType: "date" },
			{ name: "deal_value", fieldType: "currency" },
			{ name: "is_active", fieldType: "boolean" },
		],
	});
}

describe("CRM user saved views", () => {
	let t: CrmTestHarness;

	beforeEach(() => {
		t = createCrmTestHarness();
	});

	it("enforces one default saved view per owner and scopes access per user", async () => {
		const fixture = await seedLeadFixture(t);

		const adminDefaultA = await asAdmin(t).mutation(CREATE_USER_SAVED_VIEW, {
			name: "Admin Compact",
			objectDefId: fixture.objectDefId,
			sourceViewDefId: fixture.defaultViewId,
			viewType: "table",
			isDefault: true,
		});
		const adminDefaultB = await asAdmin(t).mutation(CREATE_USER_SAVED_VIEW, {
			name: "Admin Pipeline",
			objectDefId: fixture.objectDefId,
			sourceViewDefId: fixture.defaultViewId,
			viewType: "table",
			isDefault: true,
		});
		const userDefault = await asUser(t).mutation(CREATE_USER_SAVED_VIEW, {
			name: "User Default",
			objectDefId: fixture.objectDefId,
			sourceViewDefId: fixture.defaultViewId,
			viewType: "table",
			isDefault: true,
		});

		const adminViews = await asAdmin(t).query(LIST_USER_SAVED_VIEWS, {
			objectDefId: fixture.objectDefId,
		});
		expect(adminViews).toHaveLength(2);
		expect(adminViews[0].userSavedViewId).toBe(adminDefaultB);
		expect(adminViews[0].isDefault).toBe(true);
		expect(
			adminViews.find((view) => view.userSavedViewId === adminDefaultA)
				?.isDefault
		).toBe(false);

		const adminDefault = await asAdmin(t).query(GET_DEFAULT_USER_SAVED_VIEW, {
			objectDefId: fixture.objectDefId,
		});
		expect(adminDefault?.userSavedViewId).toBe(adminDefaultB);

		const memberViews = await asUser(t).query(LIST_USER_SAVED_VIEWS, {
			objectDefId: fixture.objectDefId,
		});
		expect(memberViews).toHaveLength(1);
		expect(memberViews[0].userSavedViewId).toBe(userDefault);

		const memberDefault = await asUser(t).query(GET_DEFAULT_USER_SAVED_VIEW, {
			objectDefId: fixture.objectDefId,
		});
		expect(memberDefault?.userSavedViewId).toBe(userDefault);

		await expect(
			asUser(t).mutation(SET_DEFAULT_USER_SAVED_VIEW, {
				userSavedViewId: adminDefaultB,
			})
		).rejects.toThrow("Saved view not found or access denied");

		await expect(
			asUser(t).query(api.crm.viewQueries.queryViewRecords, {
				viewDefId: fixture.defaultViewId,
				userSavedViewId: adminDefaultB,
			})
		).rejects.toThrow("Saved view not found or access denied");
	});

	it("applies the default personal table view to records and schema", async () => {
		const fixture = await seedLeadFixture(t);

		await seedRecord(t, fixture.objectDefId, {
			company_name: "Acme",
			status: "new",
			deal_value: 100_000,
		});
		await seedRecord(t, fixture.objectDefId, {
			company_name: "Beta",
			status: "contacted",
			deal_value: 250_000,
		});
		await seedRecord(t, fixture.objectDefId, {
			company_name: "Gamma",
			status: "new",
			deal_value: 300_000,
		});

		const userSavedViewId = await asAdmin(t).mutation(CREATE_USER_SAVED_VIEW, {
			name: "My Active Leads",
			objectDefId: fixture.objectDefId,
			sourceViewDefId: fixture.defaultViewId,
			viewType: "table",
			isDefault: true,
			visibleFieldIds: [
				fixture.fieldDefs.status,
				fixture.fieldDefs.company_name,
			],
			fieldOrder: [fixture.fieldDefs.status, fixture.fieldDefs.company_name],
			filters: [
				{
					fieldDefId: fixture.fieldDefs.status,
					operator: "is",
					value: "new",
				},
			],
		});

		const result = (await asAdmin(t).query(
			api.crm.viewQueries.queryViewRecords,
			{
				viewDefId: fixture.defaultViewId,
				limit: 25,
			}
		)) as TableQueryResult;

		expect(result.totalCount).toBe(2);
		expect(
			result.columns
				.filter((column) => column.isVisible)
				.map((column) => column.name)
		).toEqual(["status", "company_name"]);
		for (const row of result.rows) {
			expect(Object.keys(row.fields).sort()).toEqual(
				["company_name", "status"].sort()
			);
			expect(row.fields.status).toBe("new");
		}

		const schema = (await asAdmin(t).query(api.crm.viewQueries.getViewSchema, {
			viewDefId: fixture.defaultViewId,
		})) as ViewSchemaResult;

		expect(schema.savedView?.userSavedViewId).toBe(userSavedViewId);
		expect(schema.systemView.name).not.toBe(schema.effectiveView.name);
		expect(schema.view.name).toBe(schema.systemView.name);
		expect(schema.effectiveView.name).toBe("My Active Leads");
		expect(schema.effectiveView.activeSavedViewId).toBe(userSavedViewId);
		expect(schema.effectiveView.filters[0]?.operator).toBe("is");
		expect(schema.effectiveView.filters[0]?.value).toBe("new");
	});

	it("does not apply a default saved view to a different requested system view", async () => {
		const fixture = await seedLeadFixture(t);

		await seedRecord(t, fixture.objectDefId, {
			company_name: "Acme",
			status: "new",
		});
		await seedRecord(t, fixture.objectDefId, {
			company_name: "Beta",
			status: "contacted",
		});

		await asAdmin(t).mutation(CREATE_USER_SAVED_VIEW, {
			name: "Default New Leads",
			objectDefId: fixture.objectDefId,
			sourceViewDefId: fixture.defaultViewId,
			viewType: "table",
			isDefault: true,
			filters: [
				{
					fieldDefId: fixture.fieldDefs.status,
					operator: "is",
					value: "new",
				},
			],
		});

		const alternateTableViewId = await asAdmin(t).mutation(
			api.crm.viewDefs.createView,
			{
				objectDefId: fixture.objectDefId,
				name: "All Leads Table",
				viewType: "table",
			}
		);

		const result = (await asAdmin(t).query(
			api.crm.viewQueries.queryViewRecords,
			{
				viewDefId: alternateTableViewId,
				limit: 25,
			}
		)) as TableQueryResult;

		expect(result.totalCount).toBe(2);

		const schema = (await asAdmin(t).query(api.crm.viewQueries.getViewSchema, {
			viewDefId: alternateTableViewId,
		})) as ViewSchemaResult;
		expect(schema.savedView).toBeNull();
		expect(schema.effectiveView.activeSavedViewId).toBeUndefined();
		expect(schema.view.name).toBe("All Leads Table");
	});

	it("rejects applying a saved view to a different requested system view", async () => {
		const fixture = await seedLeadFixture(t);

		const savedViewId = await asAdmin(t).mutation(CREATE_USER_SAVED_VIEW, {
			name: "Default New Leads",
			objectDefId: fixture.objectDefId,
			sourceViewDefId: fixture.defaultViewId,
			viewType: "table",
			filters: [
				{
					fieldDefId: fixture.fieldDefs.status,
					operator: "is",
					value: "new",
				},
			],
		});

		const alternateTableViewId = await asAdmin(t).mutation(
			api.crm.viewDefs.createView,
			{
				objectDefId: fixture.objectDefId,
				name: "All Leads Table",
				viewType: "table",
			}
		);

		await expect(
			asAdmin(t).query(api.crm.viewQueries.queryViewRecords, {
				viewDefId: alternateTableViewId,
				userSavedViewId: savedViewId,
			})
		).rejects.toThrow(
			"Saved view does not belong to the requested system view"
		);
	});

	it("applies personal kanban overlays when an explicit saved view is requested", async () => {
		const fixture = await seedLeadFixture(t);

		await seedRecord(t, fixture.objectDefId, {
			company_name: "Acme North",
			status: "new",
		});
		await seedRecord(t, fixture.objectDefId, {
			company_name: "Beta South",
			status: "contacted",
		});
		await seedRecord(t, fixture.objectDefId, {
			company_name: "Acme West",
			status: "new",
		});

		const kanbanViewId = await asAdmin(t).mutation(
			api.crm.viewDefs.createView,
			{
				objectDefId: fixture.objectDefId,
				name: "Pipeline",
				viewType: "kanban",
				boundFieldId: fixture.fieldDefs.status,
			}
		);

		const userSavedViewId = await asAdmin(t).mutation(CREATE_USER_SAVED_VIEW, {
			name: "New Leads Only",
			objectDefId: fixture.objectDefId,
			sourceViewDefId: kanbanViewId,
			viewType: "kanban",
			filters: [
				{
					fieldDefId: fixture.fieldDefs.status,
					operator: "is",
					value: "new",
				},
			],
		});

		const result = (await asAdmin(t).query(
			api.crm.viewQueries.queryViewRecords,
			{
				viewDefId: kanbanViewId,
				userSavedViewId,
			}
		)) as KanbanQueryResult;

		expect(result.totalCount).toBe(2);
		expect(result.groups.find((group) => group.label === "New")?.count).toBe(2);
		expect(
			result.groups.find((group) => group.label === "Contacted")?.count
		).toBe(0);
	});

	it("applies logical OR filters for personal kanban overlays", async () => {
		const fixture = await seedLeadFixture(t);

		await seedRecord(t, fixture.objectDefId, {
			company_name: "Acme North",
			status: "new",
		});
		await seedRecord(t, fixture.objectDefId, {
			company_name: "Beta South",
			status: "contacted",
		});
		await seedRecord(t, fixture.objectDefId, {
			company_name: "Gamma West",
			status: "qualified",
		});

		const kanbanViewId = await asAdmin(t).mutation(
			api.crm.viewDefs.createView,
			{
				objectDefId: fixture.objectDefId,
				name: "Pipeline",
				viewType: "kanban",
				boundFieldId: fixture.fieldDefs.status,
			}
		);

		const userSavedViewId = await asAdmin(t).mutation(CREATE_USER_SAVED_VIEW, {
			name: "New Or Qualified",
			objectDefId: fixture.objectDefId,
			sourceViewDefId: kanbanViewId,
			viewType: "kanban",
			filters: [
				{
					fieldDefId: fixture.fieldDefs.status,
					operator: "is",
					value: "new",
				},
				{
					fieldDefId: fixture.fieldDefs.status,
					logicalOperator: "or",
					operator: "is",
					value: "qualified",
				},
			],
		});

		const result = (await asAdmin(t).query(
			api.crm.viewQueries.queryViewRecords,
			{
				viewDefId: kanbanViewId,
				userSavedViewId,
			}
		)) as KanbanQueryResult;

		expect(result.totalCount).toBe(2);
		expect(result.groups.find((group) => group.label === "New")?.count).toBe(1);
		expect(
			result.groups.find((group) => group.label === "Qualified")?.count
		).toBe(1);
		expect(
			result.groups.find((group) => group.label === "Contacted")?.count
		).toBe(0);
	});

	it("applies personal calendar overlays when an explicit saved view is requested", async () => {
		const fixture = await seedLeadFixture(t);

		const jan15 = new Date("2026-01-15T00:00:00Z").getTime();
		const feb10 = new Date("2026-02-10T00:00:00Z").getTime();
		const mar20 = new Date("2026-03-20T00:00:00Z").getTime();
		const marchStart = new Date("2026-03-01T00:00:00Z").getTime();

		await seedRecord(t, fixture.objectDefId, {
			company_name: "Jan Corp",
			next_followup: jan15,
		});
		await seedRecord(t, fixture.objectDefId, {
			company_name: "Feb Corp",
			next_followup: feb10,
		});
		await seedRecord(t, fixture.objectDefId, {
			company_name: "Mar Corp",
			next_followup: mar20,
		});

		const calendarViewId = await asAdmin(t).mutation(
			api.crm.viewDefs.createView,
			{
				objectDefId: fixture.objectDefId,
				name: "Follow-up Calendar",
				viewType: "calendar",
				boundFieldId: fixture.fieldDefs.next_followup,
			}
		);

		const userSavedViewId = await asAdmin(t).mutation(CREATE_USER_SAVED_VIEW, {
			name: "Q1 Before March",
			objectDefId: fixture.objectDefId,
			sourceViewDefId: calendarViewId,
			viewType: "calendar",
			filters: [
				{
					fieldDefId: fixture.fieldDefs.next_followup,
					operator: "before",
					value: String(marchStart),
				},
			],
		});

		const result = (await asAdmin(t).query(
			api.crm.calendarQuery.queryCalendarRecords,
			{
				viewDefId: calendarViewId,
				userSavedViewId,
				rangeStart: new Date("2026-01-01T00:00:00Z").getTime(),
				rangeEnd: new Date("2026-12-31T23:59:59Z").getTime(),
			}
		)) as CalendarQueryResult;

		const companyNames = result.events.flatMap((event) =>
			event.records.map((record) => record.fields.company_name)
		);
		expect(companyNames).toContain("Jan Corp");
		expect(companyNames).toContain("Feb Corp");
		expect(companyNames).not.toContain("Mar Corp");
	});

	it("parses legacy raw string is_any_of filters for personal calendar overlays", async () => {
		const fixture = await seedLeadFixture(t);

		const jan15 = new Date("2026-01-15T00:00:00Z").getTime();
		const feb10 = new Date("2026-02-10T00:00:00Z").getTime();

		await seedRecord(t, fixture.objectDefId, {
			company_name: "Jan Corp",
			next_followup: jan15,
			status: "new",
		});
		await seedRecord(t, fixture.objectDefId, {
			company_name: "Feb Corp",
			next_followup: feb10,
			status: "contacted",
		});

		const calendarViewId = await asAdmin(t).mutation(
			api.crm.viewDefs.createView,
			{
				objectDefId: fixture.objectDefId,
				name: "Follow-up Calendar",
				viewType: "calendar",
				boundFieldId: fixture.fieldDefs.next_followup,
			}
		);

		const userSavedViewId = await asAdmin(t).mutation(CREATE_USER_SAVED_VIEW, {
			name: "New Only",
			objectDefId: fixture.objectDefId,
			sourceViewDefId: calendarViewId,
			viewType: "calendar",
			filters: [
				{
					fieldDefId: fixture.fieldDefs.status,
					operator: "is_any_of",
					value: "new",
				},
			],
		});

		const result = (await asAdmin(t).query(
			api.crm.calendarQuery.queryCalendarRecords,
			{
				viewDefId: calendarViewId,
				userSavedViewId,
				rangeStart: new Date("2026-01-01T00:00:00Z").getTime(),
				rangeEnd: new Date("2026-12-31T23:59:59Z").getTime(),
			}
		)) as CalendarQueryResult;

		const companyNames = result.events.flatMap((event) =>
			event.records.map((record) => record.fields.company_name)
		);
		expect(companyNames).toEqual(["Jan Corp"]);
	});

	it("reads legacy filtersJson saved views when resolving defaults", async () => {
		const fixture = await seedLeadFixture(t);

		await seedRecord(t, fixture.objectDefId, {
			company_name: "Acme",
			status: "new",
		});
		await seedRecord(t, fixture.objectDefId, {
			company_name: "Beta",
			status: "contacted",
		});

		await t.run(async (ctx) => {
			const legacySavedView = {
				orgId: "org_crm_test_001",
				objectDefId: fixture.objectDefId,
				ownerAuthId: "test-crm-admin",
				sourceViewDefId: fixture.defaultViewId,
				name: "Legacy New Leads",
				viewType: "table" as const,
				visibleFieldIds: [
					fixture.fieldDefs.company_name,
					fixture.fieldDefs.status,
				],
				fieldOrder: [fixture.fieldDefs.company_name, fixture.fieldDefs.status],
				filtersJson: JSON.stringify([
					{
						fieldDefId: fixture.fieldDefs.status,
						operator: "is",
						value: "new",
					},
				]),
				isDefault: true,
				createdAt: Date.now(),
				updatedAt: Date.now(),
			};

			await ctx.db.insert(
				"userSavedViews",
				legacySavedView as unknown as Parameters<typeof ctx.db.insert>[1]
			);
		});

		const defaultSavedView = await asAdmin(t).query(
			GET_DEFAULT_USER_SAVED_VIEW,
			{
				objectDefId: fixture.objectDefId,
			}
		);
		expect(defaultSavedView?.filters[0]?.operator).toBe("is");
		expect(defaultSavedView?.filters[0]?.value).toBe("new");

		const result = (await asAdmin(t).query(
			api.crm.viewQueries.queryViewRecords,
			{
				viewDefId: fixture.defaultViewId,
				limit: 25,
			}
		)) as TableQueryResult;

		expect(result.totalCount).toBe(1);
		expect(result.rows[0]?.fields.status).toBe("new");
	});
});
