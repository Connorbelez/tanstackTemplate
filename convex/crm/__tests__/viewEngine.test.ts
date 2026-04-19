import { beforeEach, describe, expect, it } from "vitest";
import {
	asAdmin,
	CRM_ADMIN_IDENTITY,
	type CrmTestFixture,
	type CrmTestHarness,
	createCrmTestHarness,
	seedObjectWithFields,
	seedRecord,
} from "../../../src/test/convex/crm/helpers";
import { api, components, internal } from "../../_generated/api";
import { KANBAN_NO_VALUE_SENTINEL } from "../viewDefs";

// ── Shared fixture builder ───────────────────────────────────────────

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

async function seedRelationFixture(t: CrmTestHarness) {
	const sourceFixture = await seedObjectWithFields(t, {
		name: "deal_relation",
		fields: [{ name: "name", fieldType: "text", isRequired: true }],
	});
	const targetFixture = await seedObjectWithFields(t, {
		name: "property_relation",
		fields: [{ name: "address", fieldType: "text", isRequired: true }],
	});
	const relationFieldId = await asAdmin(t).mutation(
		api.crm.fieldDefs.createField,
		{
			fieldType: "text",
			label: "Property",
			name: "property",
			objectDefId: sourceFixture.objectDefId,
			relation: {
				cardinality: "many_to_many",
				relationName: "Property",
				targetObjectDefId: targetFixture.objectDefId,
			},
		}
	);
	const linkTypeDefId = await asAdmin(t).mutation(
		api.crm.linkTypes.createLinkType,
		{
			cardinality: "many_to_many",
			name: "Property",
			sourceObjectDefId: sourceFixture.objectDefId,
			targetObjectDefId: targetFixture.objectDefId,
		}
	);
	const dealRecordId = await seedRecord(t, sourceFixture.objectDefId, {
		name: "Loan Alpha",
	});
	const propertyRecordId = await seedRecord(t, targetFixture.objectDefId, {
		address: "12 Oak Street",
	});

	await asAdmin(t).mutation(api.crm.recordLinks.createLink, {
		linkTypeDefId,
		sourceId: dealRecordId as string,
		sourceKind: "record",
		targetId: propertyRecordId as string,
		targetKind: "record",
	});

	return {
		dealRecordId,
		propertyRecordId,
		relationFieldId,
		sourceFixture,
		targetFixture,
	};
}

// ═══════════════════════════════════════════════════════════════════════
// View Engine
// ═══════════════════════════════════════════════════════════════════════

describe("View Engine", () => {
	let t: CrmTestHarness;

	beforeEach(() => {
		t = createCrmTestHarness();
	});

	// ── Table view ──────────────────────────────────────────────────

	describe("Table view", () => {
		it("returns columns matching viewFields config in displayOrder", async () => {
			const fixture = await seedLeadFixture(t);

			await seedRecord(t, fixture.objectDefId, {
				company_name: "Acme",
				status: "new",
			});

			const result = await asAdmin(t).query(
				api.crm.viewQueries.queryViewRecords,
				{
					viewDefId: fixture.defaultViewId,
					limit: 25,
				}
			);

			// Table view returns columns
			expect(result).toHaveProperty("columns");
			const { columns } = result as {
				columns: Array<{
					displayOrder: number;
					fieldType: string;
					label: string;
					name: string;
				}>;
			};

			// Columns should be ordered by displayOrder
			for (let i = 1; i < columns.length; i++) {
				expect(columns[i].displayOrder).toBeGreaterThanOrEqual(
					columns[i - 1].displayOrder
				);
			}

			// All seeded fields should appear
			const colNames = columns.map((c) => c.name);
			expect(colNames).toContain("company_name");
			expect(colNames).toContain("status");
			expect(colNames).toContain("next_followup");
			expect(colNames).toContain("deal_value");
			expect(colNames).toContain("is_active");
		});

		it("only includes visible fields in row data", async () => {
			const fixture = await seedLeadFixture(t);

			await seedRecord(t, fixture.objectDefId, {
				company_name: "Acme",
				status: "new",
				deal_value: 100_000,
			});

			const result = await asAdmin(t).query(
				api.crm.viewQueries.queryViewRecords,
				{
					viewDefId: fixture.defaultViewId,
					limit: 25,
				}
			);

			const { rows, columns } = result as {
				columns: Array<{ isVisible: boolean; name: string }>;
				rows: Array<{ fields: Record<string, unknown> }>;
			};

			// By default all fields are visible. The row fields should only
			// contain keys matching visible columns.
			const visibleNames = new Set(
				columns.filter((c) => c.isVisible).map((c) => c.name)
			);

			expect(rows.length).toBeGreaterThan(0);
			for (const row of rows) {
				for (const key of Object.keys(row.fields)) {
					expect(visibleNames.has(key)).toBe(true);
				}
			}
		});

		it("pagination with cursor returns next page", async () => {
			const fixture = await seedLeadFixture(t);

			// Seed 5 records
			for (let i = 0; i < 5; i++) {
				await seedRecord(t, fixture.objectDefId, {
					company_name: `Company_${String(i)}`,
					status: "new",
				});
			}

			// Request page of 2
			const page1 = await asAdmin(t).query(
				api.crm.viewQueries.queryViewRecords,
				{
					viewDefId: fixture.defaultViewId,
					limit: 2,
				}
			);

			const p1 = page1 as {
				cursor: string | null;
				rows: unknown[];
				totalCount: number;
			};
			expect(p1.rows).toHaveLength(2);
			expect(p1.totalCount).toBe(5);
			expect(p1.cursor).not.toBeNull();
			expect(p1.cursor?.startsWith("native:")).toBe(false);

			// Request second page
			const page2 = await asAdmin(t).query(
				api.crm.viewQueries.queryViewRecords,
				{
					viewDefId: fixture.defaultViewId,
					limit: 2,
					cursor: p1.cursor,
				}
			);

			const p2 = page2 as {
				cursor: string | null;
				rows: unknown[];
				totalCount: number;
			};
			expect(p2.rows).toHaveLength(2);
			expect(p2.totalCount).toBe(5);
		});

		it("returns normalized page rows and filtered aggregates alongside compatibility rows", async () => {
			const fixture = await seedLeadFixture(t);

			await seedRecord(t, fixture.objectDefId, {
				company_name: "Alpha",
				status: "new",
				deal_value: 100_000,
			});
			await seedRecord(t, fixture.objectDefId, {
				company_name: "Beta",
				status: "new",
				deal_value: 300_000,
			});
			await seedRecord(t, fixture.objectDefId, {
				company_name: "Gamma",
				status: "contacted",
				deal_value: 900_000,
			});

			await t.run(async (ctx) => {
				const viewDef = await ctx.db.get(fixture.defaultViewId);
				if (!viewDef) {
					throw new Error("Expected default view");
				}

				await ctx.db.patch(fixture.defaultViewId, {
					aggregatePresets: [
						{
							fieldDefId: fixture.fieldDefs.deal_value,
							fn: "sum",
							label: "Pipeline total",
						},
					],
				});
				await ctx.db.insert("viewFilters", {
					viewDefId: fixture.defaultViewId,
					fieldDefId: fixture.fieldDefs.status,
					operator: "eq",
					value: "new",
				});
			});

			const result = await asAdmin(t).query(
				api.crm.viewQueries.queryViewRecords,
				{
					viewDefId: fixture.defaultViewId,
					limit: 10,
				}
			);

			expect(result.totalCount).toBe(2);
			expect(result.page.rows).toHaveLength(2);
			expect(result.page.rows[0].record._id).toBe(result.rows[0]._id);
			expect(result.page.rows[0].cells.length).toBeGreaterThan(0);
			expect(result.page.rows[0].cells[0]).toHaveProperty("fieldName");
			expect(result.aggregates).toContainEqual(
				expect.objectContaining({
					fieldDefId: fixture.fieldDefs.deal_value,
					fn: "sum",
					label: "Pipeline total",
					value: 400_000,
				})
			);
		});

		it("applies a default saved-view overlay for ordering, visibility, filters, and aggregates", async () => {
			const fixture = await seedLeadFixture(t);

			await seedRecord(t, fixture.objectDefId, {
				company_name: "Qualified Deal",
				status: "qualified",
				deal_value: 500_000,
			});
			await seedRecord(t, fixture.objectDefId, {
				company_name: "New Deal",
				status: "new",
				deal_value: 100_000,
			});

			await t.run(async (ctx) => {
				await ctx.db.insert("userSavedViews", {
					orgId: CRM_ADMIN_IDENTITY.org_id,
					objectDefId: fixture.objectDefId,
					ownerAuthId: CRM_ADMIN_IDENTITY.subject,
					sourceViewDefId: fixture.defaultViewId,
					name: "Saved Pipeline",
					viewType: "table",
					visibleFieldIds: [
						fixture.fieldDefs.deal_value,
						fixture.fieldDefs.company_name,
					],
					fieldOrder: [
						fixture.fieldDefs.deal_value,
						fixture.fieldDefs.company_name,
					],
					filters: [
						{
							fieldDefId: fixture.fieldDefs.status,
							operator: "eq",
							value: "qualified",
						},
					],
					groupByFieldId: undefined,
					aggregatePresets: [
						{
							fieldDefId: fixture.fieldDefs.deal_value,
							fn: "sum",
							label: "Saved total",
						},
					],
					isDefault: true,
					createdAt: Date.now(),
					updatedAt: Date.now(),
				});
			});

			const result = await asAdmin(t).query(
				api.crm.viewQueries.queryViewRecords,
				{
					viewDefId: fixture.defaultViewId,
					limit: 10,
				}
			);

			expect(result.view.name).toBe("Saved Pipeline");
			expect(result.columns.slice(0, 2).map((column) => column.name)).toEqual([
				"deal_value",
				"company_name",
			]);
			expect(result.totalCount).toBe(1);
			expect(result.rows[0].fields.company_name).toBe("Qualified Deal");
			expect(result.aggregates).toContainEqual(
				expect.objectContaining({
					label: "Saved total",
					value: 500_000,
				})
			);
		});

		it("hydrates relation cell payloads for normalized table rows and record detail surfaces", async () => {
			const fixture = await seedRelationFixture(t);
			const unlinkedDealRecordId = await seedRecord(
				t,
				fixture.sourceFixture.objectDefId,
				{
					name: "Loan Beta",
				}
			);

			const result = await asAdmin(t).query(
				api.crm.viewQueries.queryViewRecords,
				{
					viewDefId: fixture.sourceFixture.defaultViewId,
					limit: 25,
				}
			);

			const relationRow = result.page.rows.find(
				(row) => row.record._id === (fixture.dealRecordId as string)
			);
			expect(relationRow).toBeDefined();
			const scalarCell = relationRow?.cells.find(
				(cell) => cell.fieldName === "name"
			);
			expect(scalarCell?.displayValue).toBeUndefined();
			expect(scalarCell?.value).toBe("Loan Alpha");

			const relationCell = relationRow?.cells.find(
				(cell) => cell.fieldName === "property"
			);
			expect(relationCell?.fieldDefId).toBe(fixture.relationFieldId);
			expect(relationCell?.displayValue).toEqual({
				cardinality: "many_to_many",
				items: [
					{
						label: "12 Oak Street",
						objectDefId: fixture.targetFixture.objectDefId,
						recordId: fixture.propertyRecordId as string,
						recordKind: "record",
					},
				],
				kind: "relation",
			});
			expect(relationCell?.value).toBeUndefined();

			const detailSurface = await asAdmin(t).query(
				api.crm.recordQueries.getRecordDetailSurface,
				{
					objectDefId: fixture.sourceFixture.objectDefId,
					recordId: fixture.dealRecordId as string,
					recordKind: "record",
				}
			);

			expect(detailSurface.record.fields.property).toEqual({
				cardinality: "many_to_many",
				items: [
					{
						label: "12 Oak Street",
						objectDefId: fixture.targetFixture.objectDefId,
						recordId: fixture.propertyRecordId as string,
						recordKind: "record",
					},
				],
				kind: "relation",
			});

			const unlinkedRelationRow = result.page.rows.find(
				(row) => row.record._id === (unlinkedDealRecordId as string)
			);
			expect(unlinkedRelationRow).toBeDefined();

			const emptyRelationCell = unlinkedRelationRow?.cells.find(
				(cell) => cell.fieldName === "property"
			);
			expect(emptyRelationCell?.displayValue).toEqual({
				cardinality: "many_to_many",
				items: [],
				kind: "relation",
			});
			expect(emptyRelationCell?.value).toBeUndefined();

			const emptyDetailSurface = await asAdmin(t).query(
				api.crm.recordQueries.getRecordDetailSurface,
				{
					objectDefId: fixture.sourceFixture.objectDefId,
					recordId: unlinkedDealRecordId as string,
					recordKind: "record",
				}
			);
			expect(emptyDetailSurface.record.fields.property).toEqual({
				cardinality: "many_to_many",
				items: [],
				kind: "relation",
			});
		});
	});

	// ── Kanban view ─────────────────────────────────────────────────

	describe("Kanban view", () => {
		it("groups records by select field value", async () => {
			const fixture = await seedLeadFixture(t);

			await seedRecord(t, fixture.objectDefId, {
				company_name: "Acme",
				status: "new",
			});
			await seedRecord(t, fixture.objectDefId, {
				company_name: "Beta",
				status: "contacted",
			});
			await seedRecord(t, fixture.objectDefId, {
				company_name: "Charlie",
				status: "new",
			});

			const kanbanViewId = await asAdmin(t).mutation(
				api.crm.viewDefs.createView,
				{
					objectDefId: fixture.objectDefId,
					name: "Pipeline Board",
					viewType: "kanban",
					boundFieldId: fixture.fieldDefs.status,
				}
			);

			const result = await asAdmin(t).query(
				api.crm.viewQueries.queryViewRecords,
				{
					viewDefId: kanbanViewId,
				}
			);

			const { groups, totalCount } = result as {
				groups: Array<{
					count: number;
					label: string;
					records: unknown[];
				}>;
				totalCount: number;
			};

			expect(totalCount).toBe(3);

			const newGroup = groups.find((g) => g.label === "New");
			const contactedGroup = groups.find((g) => g.label === "Contacted");
			expect(newGroup?.count).toBe(2);
			expect(contactedGroup?.count).toBe(1);
		});

		it("each group has correct count and records", async () => {
			const fixture = await seedLeadFixture(t);

			await seedRecord(t, fixture.objectDefId, {
				company_name: "Acme",
				status: "qualified",
			});

			const kanbanViewId = await asAdmin(t).mutation(
				api.crm.viewDefs.createView,
				{
					objectDefId: fixture.objectDefId,
					name: "Board",
					viewType: "kanban",
					boundFieldId: fixture.fieldDefs.status,
				}
			);

			const result = await asAdmin(t).query(
				api.crm.viewQueries.queryViewRecords,
				{ viewDefId: kanbanViewId }
			);

			const { groups } = result as {
				groups: Array<{
					count: number;
					records: Array<{ fields: Record<string, unknown> }>;
				}>;
			};

			for (const group of groups) {
				expect(group.count).toBe(group.records.length);
			}
		});

		it("records without grouping field value go to 'No Value' group", async () => {
			const fixture = await seedLeadFixture(t);

			// Seed record without status
			await seedRecord(t, fixture.objectDefId, {
				company_name: "NoStatus Corp",
			});

			const kanbanViewId = await asAdmin(t).mutation(
				api.crm.viewDefs.createView,
				{
					objectDefId: fixture.objectDefId,
					name: "Board",
					viewType: "kanban",
					boundFieldId: fixture.fieldDefs.status,
				}
			);

			const result = await asAdmin(t).query(
				api.crm.viewQueries.queryViewRecords,
				{ viewDefId: kanbanViewId }
			);

			const { groups } = result as {
				groups: Array<{
					count: number;
					label: string;
					records: unknown[];
				}>;
			};

			const noValueGroup = groups.find((g) => g.label === "No Value");
			expect(noValueGroup).toBeDefined();
			expect(noValueGroup?.count).toBe(1);
		});
	});

	// ── Calendar view ───────────────────────────────────────────────

	describe("Calendar view", () => {
		it("returns records within date range", async () => {
			const fixture = await seedLeadFixture(t);

			// Seed records with different dates
			const jan15 = new Date("2026-01-15T00:00:00Z").getTime();
			const feb10 = new Date("2026-02-10T00:00:00Z").getTime();
			const mar20 = new Date("2026-03-20T00:00:00Z").getTime();

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

			// Query Jan 1 to Feb 28
			const rangeStart = new Date("2026-01-01T00:00:00Z").getTime();
			const rangeEnd = new Date("2026-02-28T23:59:59Z").getTime();

			const calResult = await asAdmin(t).query(
				api.crm.calendarQuery.queryCalendarRecords,
				{
					viewDefId: calendarViewId,
					rangeStart,
					rangeEnd,
				}
			);

			// Should include Jan and Feb records
			const allRecords = calResult.events.flatMap(
				(e: { records: Array<{ fields: Record<string, unknown> }> }) =>
					e.records
			);
			const companyNames = allRecords.map(
				(r: { fields: Record<string, unknown> }) => r.fields.company_name
			);
			expect(companyNames).toContain("Jan Corp");
			expect(companyNames).toContain("Feb Corp");
			expect(companyNames).not.toContain("Mar Corp");
		});

		it("records outside range are excluded", async () => {
			const fixture = await seedLeadFixture(t);

			const dec1 = new Date("2025-12-01T00:00:00Z").getTime();
			await seedRecord(t, fixture.objectDefId, {
				company_name: "Old Corp",
				next_followup: dec1,
			});

			const calendarViewId = await asAdmin(t).mutation(
				api.crm.viewDefs.createView,
				{
					objectDefId: fixture.objectDefId,
					name: "Calendar",
					viewType: "calendar",
					boundFieldId: fixture.fieldDefs.next_followup,
				}
			);

			// Query range entirely in 2026
			const rangeStart = new Date("2026-01-01T00:00:00Z").getTime();
			const rangeEnd = new Date("2026-12-31T23:59:59Z").getTime();

			const calResult = await asAdmin(t).query(
				api.crm.calendarQuery.queryCalendarRecords,
				{
					viewDefId: calendarViewId,
					rangeStart,
					rangeEnd,
				}
			);

			const allRecords = calResult.events.flatMap(
				(e: { records: Array<{ fields: Record<string, unknown> }> }) =>
					e.records
			);
			const companyNames = allRecords.map(
				(r: { fields: Record<string, unknown> }) => r.fields.company_name
			);
			expect(companyNames).not.toContain("Old Corp");
		});

		it("queryViewRecords returns calendar payload when a range is provided", async () => {
			const fixture = await seedLeadFixture(t);
			const jan15 = new Date("2026-01-15T00:00:00Z").getTime();
			const feb10 = new Date("2026-02-10T00:00:00Z").getTime();

			await seedRecord(t, fixture.objectDefId, {
				company_name: "Jan Corp",
				next_followup: jan15,
			});
			await seedRecord(t, fixture.objectDefId, {
				company_name: "Feb Corp",
				next_followup: feb10,
			});

			const calendarViewId = await asAdmin(t).mutation(
				api.crm.viewDefs.createView,
				{
					objectDefId: fixture.objectDefId,
					name: "Calendar",
					viewType: "calendar",
					boundFieldId: fixture.fieldDefs.next_followup,
				}
			);

			const result = await asAdmin(t).query(
				api.crm.viewQueries.queryViewRecords,
				{
					viewDefId: calendarViewId,
					rangeStart: new Date("2026-01-01T00:00:00Z").getTime(),
					rangeEnd: new Date("2026-02-28T23:59:59Z").getTime(),
				}
			);

			expect(result.viewType).toBe("calendar");
			expect(result.events.length).toBe(2);
			expect(result.events[0].rows[0].record.fields.company_name).toBeDefined();
		});

		it("parses legacy comma-delimited between filters for calendar views", async () => {
			const fixture = await seedLeadFixture(t);

			const jan15 = new Date("2026-01-15T00:00:00Z").getTime();
			const feb10 = new Date("2026-02-10T00:00:00Z").getTime();
			const mar20 = new Date("2026-03-20T00:00:00Z").getTime();
			const rangeStart = new Date("2026-01-01T00:00:00Z").getTime();
			const febEnd = new Date("2026-02-28T23:59:59Z").getTime();
			const rangeEnd = new Date("2026-12-31T23:59:59Z").getTime();

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

			await t.run(async (ctx) => {
				await ctx.db.insert("viewFilters", {
					viewDefId: calendarViewId,
					fieldDefId: fixture.fieldDefs.next_followup,
					operator: "between",
					value: `${String(rangeStart)},${String(febEnd)}`,
				});
			});

			const result = await asAdmin(t).query(
				api.crm.calendarQuery.queryCalendarRecords,
				{
					viewDefId: calendarViewId,
					rangeStart,
					rangeEnd,
				}
			);

			const companyNames = result.events.flatMap(
				(event: { records: Array<{ fields: Record<string, unknown> }> }) =>
					event.records.map((record) => record.fields.company_name)
			);
			expect(companyNames).toContain("Jan Corp");
			expect(companyNames).toContain("Feb Corp");
			expect(companyNames).not.toContain("Mar Corp");
		});
	});

	// ── View filters ────────────────────────────────────────────────

	describe("View filters", () => {
		it("eq filter: exact match on select field", async () => {
			const fixture = await seedLeadFixture(t);

			await seedRecord(t, fixture.objectDefId, {
				company_name: "Acme",
				status: "new",
			});
			await seedRecord(t, fixture.objectDefId, {
				company_name: "Beta",
				status: "contacted",
			});
			await seedRecord(t, fixture.objectDefId, {
				company_name: "Charlie",
				status: "new",
			});

			// Insert a viewFilter directly
			await t.run(async (ctx) => {
				await ctx.db.insert("viewFilters", {
					viewDefId: fixture.defaultViewId,
					fieldDefId: fixture.fieldDefs.status,
					operator: "eq",
					value: "new",
				});
			});

			const result = await asAdmin(t).query(
				api.crm.viewQueries.queryViewRecords,
				{
					viewDefId: fixture.defaultViewId,
					limit: 25,
				}
			);

			const { rows, totalCount } = result as {
				rows: Array<{ fields: Record<string, unknown> }>;
				totalCount: number;
			};

			expect(totalCount).toBe(2);
			for (const row of rows) {
				expect(row.fields.status).toBe("new");
			}
		});

		it("contains filter: substring match on text field", async () => {
			const fixture = await seedLeadFixture(t);

			await seedRecord(t, fixture.objectDefId, {
				company_name: "Acme Industries",
				status: "new",
			});
			await seedRecord(t, fixture.objectDefId, {
				company_name: "Beta Corp",
				status: "new",
			});
			await seedRecord(t, fixture.objectDefId, {
				company_name: "Acme Solutions",
				status: "contacted",
			});

			await t.run(async (ctx) => {
				await ctx.db.insert("viewFilters", {
					viewDefId: fixture.defaultViewId,
					fieldDefId: fixture.fieldDefs.company_name,
					operator: "contains",
					value: "Acme",
				});
			});

			const result = await asAdmin(t).query(
				api.crm.viewQueries.queryViewRecords,
				{
					viewDefId: fixture.defaultViewId,
					limit: 25,
				}
			);

			const { rows, totalCount } = result as {
				rows: Array<{ fields: Record<string, unknown> }>;
				totalCount: number;
			};

			expect(totalCount).toBe(2);
			for (const row of rows) {
				expect(String(row.fields.company_name).toLowerCase()).toContain("acme");
			}
		});

		it("equals filter aliases to exact match on text field", async () => {
			const fixture = await seedLeadFixture(t);

			await seedRecord(t, fixture.objectDefId, {
				company_name: "Acme",
				status: "new",
			});
			await seedRecord(t, fixture.objectDefId, {
				company_name: "Acme Holdings",
				status: "new",
			});

			await t.run(async (ctx) => {
				await ctx.db.insert("viewFilters", {
					viewDefId: fixture.defaultViewId,
					fieldDefId: fixture.fieldDefs.company_name,
					operator: "equals",
					value: "Acme",
				});
			});

			const result = await asAdmin(t).query(
				api.crm.viewQueries.queryViewRecords,
				{
					viewDefId: fixture.defaultViewId,
					limit: 25,
				}
			);

			const { rows, totalCount } = result as {
				rows: Array<{ fields: Record<string, unknown> }>;
				totalCount: number;
			};

			expect(totalCount).toBe(1);
			expect(rows[0]?.fields.company_name).toBe("Acme");
		});

		it("is_true filter: boolean field", async () => {
			const fixture = await seedLeadFixture(t);

			await seedRecord(t, fixture.objectDefId, {
				company_name: "Active Corp",
				is_active: true,
			});
			await seedRecord(t, fixture.objectDefId, {
				company_name: "Inactive Corp",
				is_active: false,
			});

			await t.run(async (ctx) => {
				await ctx.db.insert("viewFilters", {
					viewDefId: fixture.defaultViewId,
					fieldDefId: fixture.fieldDefs.is_active,
					operator: "is_true",
				});
			});

			const result = await asAdmin(t).query(
				api.crm.viewQueries.queryViewRecords,
				{
					viewDefId: fixture.defaultViewId,
					limit: 25,
				}
			);

			const { rows, totalCount } = result as {
				rows: Array<{ fields: Record<string, unknown> }>;
				totalCount: number;
			};

			expect(totalCount).toBe(1);
			expect(rows[0].fields.is_active).toBe(true);
		});

		it("is_false filter: boolean field", async () => {
			const fixture = await seedLeadFixture(t);

			await seedRecord(t, fixture.objectDefId, {
				company_name: "Active Corp",
				is_active: true,
			});
			await seedRecord(t, fixture.objectDefId, {
				company_name: "Inactive Corp",
				is_active: false,
			});

			await t.run(async (ctx) => {
				await ctx.db.insert("viewFilters", {
					viewDefId: fixture.defaultViewId,
					fieldDefId: fixture.fieldDefs.is_active,
					operator: "is_false",
				});
			});

			const result = await asAdmin(t).query(
				api.crm.viewQueries.queryViewRecords,
				{ viewDefId: fixture.defaultViewId, limit: 25 }
			);
			const { rows, totalCount } = result as {
				rows: Array<{ fields: Record<string, unknown> }>;
				totalCount: number;
			};
			expect(totalCount).toBe(1);
			expect(rows[0].fields.is_active).toBe(false);
		});

		it("gt filter: numeric range on currency field", async () => {
			const fixture = await seedLeadFixture(t);

			await seedRecord(t, fixture.objectDefId, {
				company_name: "Small Deal",
				deal_value: 100_000,
			});
			await seedRecord(t, fixture.objectDefId, {
				company_name: "Big Deal",
				deal_value: 500_000,
			});

			await t.run(async (ctx) => {
				await ctx.db.insert("viewFilters", {
					viewDefId: fixture.defaultViewId,
					fieldDefId: fixture.fieldDefs.deal_value,
					operator: "gt",
					value: JSON.stringify(200_000),
				});
			});

			const result = await asAdmin(t).query(
				api.crm.viewQueries.queryViewRecords,
				{ viewDefId: fixture.defaultViewId, limit: 25 }
			);
			const { rows, totalCount } = result as {
				rows: Array<{ fields: Record<string, unknown> }>;
				totalCount: number;
			};
			expect(totalCount).toBe(1);
			expect(rows[0].fields.company_name).toBe("Big Deal");
		});

		it("lt filter: numeric range on currency field", async () => {
			const fixture = await seedLeadFixture(t);

			await seedRecord(t, fixture.objectDefId, {
				company_name: "Small Deal",
				deal_value: 100_000,
			});
			await seedRecord(t, fixture.objectDefId, {
				company_name: "Big Deal",
				deal_value: 500_000,
			});

			await t.run(async (ctx) => {
				await ctx.db.insert("viewFilters", {
					viewDefId: fixture.defaultViewId,
					fieldDefId: fixture.fieldDefs.deal_value,
					operator: "lt",
					value: JSON.stringify(200_000),
				});
			});

			const result = await asAdmin(t).query(
				api.crm.viewQueries.queryViewRecords,
				{ viewDefId: fixture.defaultViewId, limit: 25 }
			);
			const { rows, totalCount } = result as {
				rows: Array<{ fields: Record<string, unknown> }>;
				totalCount: number;
			};
			expect(totalCount).toBe(1);
			expect(rows[0].fields.company_name).toBe("Small Deal");
		});

		it("gte filter: inclusive numeric range", async () => {
			const fixture = await seedLeadFixture(t);

			await seedRecord(t, fixture.objectDefId, {
				company_name: "Exact",
				deal_value: 200_000,
			});
			await seedRecord(t, fixture.objectDefId, {
				company_name: "Below",
				deal_value: 100_000,
			});
			await seedRecord(t, fixture.objectDefId, {
				company_name: "Above",
				deal_value: 300_000,
			});

			await t.run(async (ctx) => {
				await ctx.db.insert("viewFilters", {
					viewDefId: fixture.defaultViewId,
					fieldDefId: fixture.fieldDefs.deal_value,
					operator: "gte",
					value: JSON.stringify(200_000),
				});
			});

			const result = await asAdmin(t).query(
				api.crm.viewQueries.queryViewRecords,
				{ viewDefId: fixture.defaultViewId, limit: 25 }
			);
			const { totalCount } = result as { totalCount: number };
			expect(totalCount).toBe(2); // Exact + Above
		});

		it("starts_with filter: text prefix match", async () => {
			const fixture = await seedLeadFixture(t);

			await seedRecord(t, fixture.objectDefId, {
				company_name: "Acme Corp",
				status: "new",
			});
			await seedRecord(t, fixture.objectDefId, {
				company_name: "Beta Inc",
				status: "new",
			});
			await seedRecord(t, fixture.objectDefId, {
				company_name: "Acme Solutions",
				status: "new",
			});

			await t.run(async (ctx) => {
				await ctx.db.insert("viewFilters", {
					viewDefId: fixture.defaultViewId,
					fieldDefId: fixture.fieldDefs.company_name,
					operator: "starts_with",
					value: "Acme",
				});
			});

			const result = await asAdmin(t).query(
				api.crm.viewQueries.queryViewRecords,
				{ viewDefId: fixture.defaultViewId, limit: 25 }
			);
			const { rows, totalCount } = result as {
				rows: Array<{ fields: Record<string, unknown> }>;
				totalCount: number;
			};
			expect(totalCount).toBe(2);
			for (const row of rows) {
				expect(String(row.fields.company_name).startsWith("Acme")).toBe(true);
			}
		});

		it("is_any_of filter: array membership on select field", async () => {
			const fixture = await seedLeadFixture(t);

			await seedRecord(t, fixture.objectDefId, {
				company_name: "A",
				status: "new",
			});
			await seedRecord(t, fixture.objectDefId, {
				company_name: "B",
				status: "contacted",
			});
			await seedRecord(t, fixture.objectDefId, {
				company_name: "C",
				status: "qualified",
			});

			await t.run(async (ctx) => {
				await ctx.db.insert("viewFilters", {
					viewDefId: fixture.defaultViewId,
					fieldDefId: fixture.fieldDefs.status,
					operator: "is_any_of",
					value: JSON.stringify(["new", "qualified"]),
				});
			});

			const result = await asAdmin(t).query(
				api.crm.viewQueries.queryViewRecords,
				{ viewDefId: fixture.defaultViewId, limit: 25 }
			);
			const { rows, totalCount } = result as {
				rows: Array<{ fields: Record<string, unknown> }>;
				totalCount: number;
			};
			expect(totalCount).toBe(2);
			for (const row of rows) {
				expect(["new", "qualified"]).toContain(row.fields.status);
			}
		});

		it("is filter aliases to exact match on select field", async () => {
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
				await ctx.db.insert("viewFilters", {
					viewDefId: fixture.defaultViewId,
					fieldDefId: fixture.fieldDefs.status,
					operator: "is",
					value: "new",
				});
			});

			const result = await asAdmin(t).query(
				api.crm.viewQueries.queryViewRecords,
				{
					viewDefId: fixture.defaultViewId,
					limit: 25,
				}
			);
			const { rows, totalCount } = result as {
				rows: Array<{ fields: Record<string, unknown> }>;
				totalCount: number;
			};

			expect(totalCount).toBe(1);
			expect(rows[0]?.fields.status).toBe("new");
		});

		it("logicalOperator OR combines view filters left-to-right", async () => {
			const fixture = await seedLeadFixture(t);

			await seedRecord(t, fixture.objectDefId, {
				company_name: "A",
				status: "new",
			});
			await seedRecord(t, fixture.objectDefId, {
				company_name: "B",
				status: "contacted",
			});
			await seedRecord(t, fixture.objectDefId, {
				company_name: "C",
				status: "qualified",
			});

			await t.run(async (ctx) => {
				await ctx.db.insert("viewFilters", {
					viewDefId: fixture.defaultViewId,
					fieldDefId: fixture.fieldDefs.status,
					operator: "is",
					value: "new",
				});
				await ctx.db.insert("viewFilters", {
					viewDefId: fixture.defaultViewId,
					fieldDefId: fixture.fieldDefs.status,
					logicalOperator: "or",
					operator: "is",
					value: "qualified",
				});
			});

			const result = await asAdmin(t).query(
				api.crm.viewQueries.queryViewRecords,
				{ viewDefId: fixture.defaultViewId, limit: 25 }
			);
			const { rows, totalCount } = result as {
				rows: Array<{ fields: Record<string, unknown> }>;
				totalCount: number;
			};
			expect(totalCount).toBe(2);
			for (const row of rows) {
				expect(["new", "qualified"]).toContain(row.fields.status);
			}
		});

		it("between filter throws a clear error for table views", async () => {
			const fixture = await seedLeadFixture(t);

			await t.run(async (ctx) => {
				await ctx.db.insert("viewFilters", {
					viewDefId: fixture.defaultViewId,
					fieldDefId: fixture.fieldDefs.deal_value,
					operator: "between",
					value: JSON.stringify([10_000, 50_000]),
				});
			});

			await expect(
				asAdmin(t).query(api.crm.viewQueries.queryViewRecords, {
					viewDefId: fixture.defaultViewId,
					limit: 25,
				})
			).rejects.toThrow(
				'Operator "between" is not supported by table or kanban view filtering yet'
			);
		});
	});

	// ── View schema ─────────────────────────────────────────────────

	describe("View schema", () => {
		it("getViewSchema returns normalized field and view contracts", async () => {
			const fixture = await seedLeadFixture(t);

			await t.run(async (ctx) => {
				await ctx.db.insert("viewFilters", {
					viewDefId: fixture.defaultViewId,
					fieldDefId: fixture.fieldDefs.company_name,
					operator: "equals",
					value: "Acme",
				});
			});

			const schema = await asAdmin(t).query(api.crm.viewQueries.getViewSchema, {
				viewDefId: fixture.defaultViewId,
			});

			expect(schema.viewType).toBe("table");
			expect(schema.needsRepair).toBe(false);
			expect(schema.columns.length).toBeGreaterThan(0);

			// Each column should have a hasSortCapability boolean
			for (const col of schema.columns) {
				expect(typeof col.hasSortCapability).toBe("boolean");
			}

			// Currency fields should have sort capability (number/currency/percentage/date)
			const currencyCol = schema.columns.find(
				(c: { name: string }) => c.name === "deal_value"
			);
			expect(currencyCol?.hasSortCapability).toBe(true);

			// Text fields should NOT have sort capability
			const textCol = schema.columns.find(
				(c: { name: string }) => c.name === "company_name"
			);
			expect(textCol?.hasSortCapability).toBe(false);

			const statusCol = schema.columns.find(
				(c: { name: string }) => c.name === "status"
			);
			expect(statusCol).toMatchObject({
				normalizedFieldKind: "single_select",
				rendererHint: "select",
				layoutEligibility: {
					kanban: { enabled: true },
					groupBy: { enabled: true },
				},
				editability: {
					mode: "editable",
				},
				isVisibleByDefault: true,
			});

			const followupField = schema.fields.find(
				(field: { name: string }) => field.name === "next_followup"
			);
			expect(followupField).toMatchObject({
				rendererHint: "date",
				layoutEligibility: {
					calendar: { enabled: true },
				},
			});

			expect(schema.view).toMatchObject({
				viewDefId: fixture.defaultViewId,
				layout: "table",
				isDefault: true,
				filters: [
					expect.objectContaining({
						fieldDefId: fixture.fieldDefs.company_name,
						operator: "equals",
						value: "Acme",
					}),
				],
				visibleFieldIds: schema.columns
					.filter((column: { isVisible: boolean }) => column.isVisible)
					.map((column: { fieldDefId: string }) => column.fieldDefId),
			});
			expect(schema.adapterContract).toMatchObject({
				entityType: "lead",
				objectDefId: fixture.objectDefId,
				variant: "fallback",
				detail: {
					mode: "generated",
					surfaceKey: "lead",
				},
			});
			expect(schema.adapterContract.supportedLayouts).toEqual(
				expect.arrayContaining(["table", "kanban", "calendar"])
			);
			expect(schema.adapterContract.layoutDefaults).toMatchObject({
				kanbanFieldName: "status",
				calendarDateFieldName: "next_followup",
				preferredVisibleFieldNames: expect.arrayContaining([
					"company_name",
					"status",
					"next_followup",
				]),
			});
			expect(schema.adapterContract.fieldOverrides).toEqual([]);
			expect(schema.adapterContract.computedFields).toEqual([]);
			expect(schema.view.disabledLayoutMessages).toBeUndefined();
		});

		it("derives disabled layout messages when no persisted messages exist", async () => {
			const fixture = await seedObjectWithFields(t, {
				name: "notes_only",
				fields: [{ name: "title", fieldType: "text" }],
			});

			const schema = await asAdmin(t).query(api.crm.viewQueries.getViewSchema, {
				viewDefId: fixture.defaultViewId,
			});

			expect(schema.systemView.disabledLayoutMessages).toMatchObject({
				calendar: "Add a date or datetime field to unlock calendar layouts.",
				kanban: "Add a single-select field to unlock kanban layouts.",
			});
			expect(schema.view.disabledLayoutMessages).toMatchObject({
				calendar: "Add a date or datetime field to unlock calendar layouts.",
				kanban: "Add a single-select field to unlock kanban layouts.",
			});
		});
	});

	// ── View integrity ──────────────────────────────────────────────

	describe("View integrity", () => {
		it("deactivating bound field sets view.needsRepair = true", async () => {
			const fixture = await seedLeadFixture(t);

			const kanbanViewId = await asAdmin(t).mutation(
				api.crm.viewDefs.createView,
				{
					objectDefId: fixture.objectDefId,
					name: "Pipeline",
					viewType: "kanban",
					boundFieldId: fixture.fieldDefs.status,
				}
			);

			// Deactivate the bound field
			await asAdmin(t).mutation(api.crm.fieldDefs.deactivateField, {
				fieldDefId: fixture.fieldDefs.status,
			});

			// Verify needsRepair
			await t.run(async (ctx) => {
				const view = await ctx.db.get(kanbanViewId);
				expect(view?.needsRepair).toBe(true);
			});
		});

		it("querying a needsRepair view throws ConvexError", async () => {
			const fixture = await seedLeadFixture(t);

			const kanbanViewId = await asAdmin(t).mutation(
				api.crm.viewDefs.createView,
				{
					objectDefId: fixture.objectDefId,
					name: "Pipeline",
					viewType: "kanban",
					boundFieldId: fixture.fieldDefs.status,
				}
			);

			// Deactivate the bound field to trigger needsRepair
			await asAdmin(t).mutation(api.crm.fieldDefs.deactivateField, {
				fieldDefId: fixture.fieldDefs.status,
			});

			// Query should throw
			await expect(
				asAdmin(t).query(api.crm.viewQueries.queryViewRecords, {
					viewDefId: kanbanViewId,
				})
			).rejects.toThrow();
		});
	});

	// ── moveKanbanRecord ────────────────────────────────────────────

	describe("moveKanbanRecord", () => {
		it("updates field value when dragging to new group", async () => {
			const fixture = await seedLeadFixture(t);

			const recordId = await seedRecord(t, fixture.objectDefId, {
				company_name: "Movable",
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

			await asAdmin(t).mutation(api.crm.viewQueries.moveKanbanRecord, {
				recordId,
				viewDefId: kanbanViewId,
				targetGroupValue: "contacted",
			});

			// Verify via querying records
			const queryResult = await asAdmin(t).query(
				api.crm.recordQueries.queryRecords,
				{
					objectDefId: fixture.objectDefId,
					paginationOpts: { numItems: 25, cursor: null },
				}
			);

			const movedRecord = queryResult.records.find(
				(r: { _id: string }) => r._id === (recordId as string)
			);
			expect(movedRecord?.fields.status).toBe("contacted");

			// Audit: verify crm.record.updated event was emitted
			const auditEntries = await t.query(
				components.auditLog.lib.queryByResource,
				{ resourceType: "records", resourceId: recordId }
			);
			const updateEntry = auditEntries.find(
				(e: { action: string }) => e.action === "crm.record.updated"
			);
			expect(updateEntry).toBeDefined();
		});

		it("moving to No Value group clears the field value", async () => {
			const fixture = await seedLeadFixture(t);

			const recordId = await seedRecord(t, fixture.objectDefId, {
				company_name: "ClearMe",
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

			await asAdmin(t).mutation(api.crm.viewQueries.moveKanbanRecord, {
				recordId,
				viewDefId: kanbanViewId,
				targetGroupValue: KANBAN_NO_VALUE_SENTINEL,
			});

			// Verify field value was cleared
			const queryResult = await asAdmin(t).query(
				api.crm.recordQueries.queryRecords,
				{
					objectDefId: fixture.objectDefId,
					paginationOpts: { numItems: 25, cursor: null },
				}
			);

			const clearedRecord = queryResult.records.find(
				(r: { _id: string }) => r._id === (recordId as string)
			);
			// After moving to No Value, the status field should be undefined (cleared)
			expect(clearedRecord?.fields.status).toBeUndefined();
		});
	});
});

// ═══════════════════════════════════════════════════════════════════════
// System object view queries
// ═══════════════════════════════════════════════════════════════════════

describe("System object view queries", () => {
	let t: CrmTestHarness;

	beforeEach(() => {
		t = createCrmTestHarness();
	});

	it("queryViewRecords with system object returns UnifiedRecord with _kind=native", async () => {
		await t.run(async (ctx) => {
			const userId = await ctx.db.insert("users", {
				authId: "test-view-engine-borrower",
				email: "borrower+view-engine@test.ca",
				firstName: "Taylor",
				lastName: "Borrower",
			});
			await ctx.db.insert("borrowers", {
				status: "active",
				idvStatus: "verified",
				userId,
				orgId: CRM_ADMIN_IDENTITY.org_id,
				createdAt: Date.now(),
			});
		});

		// Bootstrap system objects (creates objectDefs for all native tables including borrower)
		await t.mutation(
			internal.crm.systemAdapters.bootstrap.bootstrapSystemObjects,
			{ orgId: CRM_ADMIN_IDENTITY.org_id }
		);

		const borrowerObjDef = await t.run(async (ctx) => {
			return ctx.db
				.query("objectDefs")
				.withIndex("by_org_name", (q) =>
					q.eq("orgId", CRM_ADMIN_IDENTITY.org_id).eq("name", "borrower")
				)
				.first();
		});
		expect(borrowerObjDef).not.toBeNull();
		if (!borrowerObjDef) {
			throw new Error("Borrower system object not found");
		}
		expect(borrowerObjDef.isSystem).toBe(true);
		expect(borrowerObjDef.nativeTable).toBeTruthy();

		await t.run(async (ctx) => {
			const userId = await ctx.db.insert("users", {
				authId: "borrower-auth-1",
				email: "borrower@test.fairlend.ca",
				firstName: "Native",
				lastName: "Borrower",
			});

			await ctx.db.insert("borrowers", {
				status: "active",
				orgId: CRM_ADMIN_IDENTITY.org_id,
				userId,
				createdAt: Date.now(),
			});
		});

		// Create a default view for the borrower object
		const viewDefId = await asAdmin(t).mutation(api.crm.viewDefs.createView, {
			objectDefId: borrowerObjDef._id,
			name: "All Borrowers",
			viewType: "table",
		});

		const result = await asAdmin(t).query(
			api.crm.viewQueries.queryViewRecords,
			{
				viewDefId,
				cursor: null,
				limit: 25,
			}
		);

		// Should return UnifiedRecords with _kind=native for system objects
		expect(result.rows).toBeDefined();
		expect(result.rows.length).toBeGreaterThan(0);
		expect(result.rows[0]._kind).toBe("native");
		// UnifiedRecord contract: all expected top-level keys present
		expect(result.rows[0]).toHaveProperty("_id");
		expect(result.rows[0]).toHaveProperty("objectDefId");
		expect(result.rows[0]).toHaveProperty("fields");
		expect(result.rows[0]).toHaveProperty("createdAt");
		expect(result.rows[0]).toHaveProperty("updatedAt");
		expect(result.rows[0].fields).toMatchObject({
			idvStatus: "verified",
			status: "active",
		});
	});

	it("queryViewRecords with non-system object returns _kind=record", async () => {
		const fixture = await seedLeadFixture(t);
		await seedRecord(t, fixture.objectDefId, {
			company_name: "Acme",
			status: "new",
		});

		const result = await asAdmin(t).query(
			api.crm.viewQueries.queryViewRecords,
			{
				viewDefId: fixture.defaultViewId,
				cursor: null,
				limit: 25,
			}
		);

		expect(result.rows).toBeDefined();
		expect(result.rows.length).toBeGreaterThan(0);
		expect(result.rows[0]._kind).toBe("record");
	});

	it("getViewSchema returns dedicated adapter metadata for system objects", async () => {
		await t.mutation(
			internal.crm.systemAdapters.bootstrap.bootstrapSystemObjects,
			{
				orgId: CRM_ADMIN_IDENTITY.org_id,
			}
		);

		const mortgageObjDef = await t.run(async (ctx) => {
			return ctx.db
				.query("objectDefs")
				.withIndex("by_org_name", (q) =>
					q.eq("orgId", CRM_ADMIN_IDENTITY.org_id).eq("name", "mortgage")
				)
				.first();
		});
		expect(mortgageObjDef).not.toBeNull();
		if (!mortgageObjDef) {
			throw new Error("Mortgage system object not found");
		}

		const viewDefId = await asAdmin(t).mutation(api.crm.viewDefs.createView, {
			objectDefId: mortgageObjDef._id,
			name: "All Mortgages",
			viewType: "table",
		});

		const schema = await asAdmin(t).query(api.crm.viewQueries.getViewSchema, {
			viewDefId,
		});

		expect(schema.adapterContract).toMatchObject({
			entityType: "mortgages",
			objectDefId: mortgageObjDef._id,
			variant: "dedicated",
			detail: {
				mode: "dedicated",
				surfaceKey: "mortgages",
			},
			statusFieldName: "status",
			layoutDefaults: {
				kanbanFieldName: "status",
				calendarDateFieldName: "maturityDate",
			},
		});
		expect(schema.adapterContract.supportedLayouts).toEqual(
			expect.arrayContaining(["table", "kanban", "calendar"])
		);
		expect(
			schema.adapterContract.layoutDefaults.preferredVisibleFieldNames
		).toEqual(
			expect.arrayContaining([
				"principal",
				"paymentAmount",
				"interestRate",
				"maturityDate",
				"status",
			])
		);
	});

	it("getViewSchema applies dedicated field overrides and computed fields", async () => {
		await t.mutation(
			internal.crm.systemAdapters.bootstrap.bootstrapSystemObjects,
			{
				orgId: CRM_ADMIN_IDENTITY.org_id,
			}
		);

		const borrowerObjDef = await t.run(async (ctx) => {
			return ctx.db
				.query("objectDefs")
				.withIndex("by_org_name", (q) =>
					q.eq("orgId", CRM_ADMIN_IDENTITY.org_id).eq("name", "borrower")
				)
				.first();
		});
		expect(borrowerObjDef).not.toBeNull();
		if (!borrowerObjDef) {
			throw new Error("Borrower system object not found");
		}

		const viewDefId = await asAdmin(t).mutation(api.crm.viewDefs.createView, {
			objectDefId: borrowerObjDef._id,
			name: "All Borrowers",
			viewType: "table",
		});

		const schema = await asAdmin(t).query(api.crm.viewQueries.getViewSchema, {
			viewDefId,
		});

		const statusColumn = schema.columns.find(
			(column: { name: string }) => column.name === "status"
		);
		expect(statusColumn).toMatchObject({
			displayOrder: 0,
			label: "Borrower Status",
		});

		const idvField = schema.fields.find(
			(field: { name: string }) => field.name === "idvStatus"
		);
		expect(idvField).toMatchObject({
			displayOrder: 1,
			fieldSource: "persisted",
			label: "Identity Verification",
		});

		const computedField = schema.fields.find(
			(field: { name: string }) => field.name === "verificationSummary"
		);
		expect(computedField).toMatchObject({
			computed: {
				expressionKey: "borrowerVerificationSummary",
				sourceFieldNames: ["status", "idvStatus"],
			},
			fieldSource: "adapter_computed",
			fieldType: "text",
			isVisibleByDefault: false,
			label: "Verification Summary",
			normalizedFieldKind: "computed",
			rendererHint: "computed",
		});
		expect(computedField?.fieldDefId).toBe("computed:verificationSummary");
	});
});
