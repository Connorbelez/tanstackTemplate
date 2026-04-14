/**
 * EAV-CRM Walk-Through — end-to-end integration test covering the full pipeline:
 * create object -> add fields -> create views -> create records ->
 * query table view -> query kanban view -> update record -> search -> perf check.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
	asAdmin,
	type CrmTestHarness,
	createCrmTestHarness,
} from "../../../src/test/convex/crm/helpers";
import { api } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";

const SEARCH_UNSUPPORTED_RE =
	/search (index|indexes|indices).*(not supported|unsupported)/i;

describe("EAV-CRM Walk-Through", () => {
	let t: CrmTestHarness;

	beforeEach(() => {
		t = createCrmTestHarness();
	});

	it("full pipeline: create object -> add fields -> create views -> create records -> query -> search", async () => {
		// 1. Create object ("Lead")
		const objectDefId = await asAdmin(t).mutation(
			api.crm.objectDefs.createObject,
			{
				name: "lead",
				singularLabel: "Lead",
				pluralLabel: "Leads",
				icon: "user-plus",
			}
		);

		// Verify default table view auto-created
		const views = await asAdmin(t).query(api.crm.viewDefs.listViews, {
			objectDefId,
		});
		expect(views).toHaveLength(1);
		expect(views[0].viewType).toBe("table");
		expect(views[0].isDefault).toBe(true);
		const tableViewId = views[0]._id;

		// 2. Add fields
		await asAdmin(t).mutation(api.crm.fieldDefs.createField, {
			objectDefId,
			name: "company_name",
			label: "Company Name",
			fieldType: "text",
			isRequired: true,
		});
		const statusId = await asAdmin(t).mutation(api.crm.fieldDefs.createField, {
			objectDefId,
			name: "status",
			label: "Status",
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
				{ value: "lost", label: "Lost", color: "#ef4444", order: 3 },
			],
		});
		const followupId = await asAdmin(t).mutation(
			api.crm.fieldDefs.createField,
			{
				objectDefId,
				name: "next_followup",
				label: "Next Follow-up",
				fieldType: "date",
			}
		);
		await asAdmin(t).mutation(api.crm.fieldDefs.createField, {
			objectDefId,
			name: "deal_value",
			label: "Deal Value",
			fieldType: "currency",
		});

		// 3. Verify capabilities
		await t.run(async (ctx) => {
			// status should have kanban + group_by + table
			const statusCaps = await ctx.db
				.query("fieldCapabilities")
				.withIndex("by_field", (q) => q.eq("fieldDefId", statusId))
				.collect();
			const statusCapNames = statusCaps.map((c) => c.capability).sort();
			expect(statusCapNames).toEqual(["group_by", "kanban", "table"]);

			// next_followup should have calendar + sort + table
			const dateCaps = await ctx.db
				.query("fieldCapabilities")
				.withIndex("by_field", (q) => q.eq("fieldDefId", followupId))
				.collect();
			const dateCapNames = dateCaps.map((c) => c.capability).sort();
			expect(dateCapNames).toEqual(["calendar", "sort", "table"]);
		});

		// 4. Create kanban view bound to status field
		const kanbanViewId = await asAdmin(t).mutation(
			api.crm.viewDefs.createView,
			{
				objectDefId,
				name: "Pipeline Board",
				viewType: "kanban",
				boundFieldId: statusId,
			}
		);

		// 5. Create 3 records
		await asAdmin(t).mutation(api.crm.records.createRecord, {
			objectDefId,
			values: { company_name: "Acme Corp", status: "new", deal_value: 250_000 },
		});
		await asAdmin(t).mutation(api.crm.records.createRecord, {
			objectDefId,
			values: {
				company_name: "Beta Inc",
				status: "contacted",
				deal_value: 150_000,
			},
		});
		await asAdmin(t).mutation(api.crm.records.createRecord, {
			objectDefId,
			values: {
				company_name: "Charlie Co",
				status: "qualified",
				deal_value: 500_000,
			},
		});

		// 6. Query table view -> verify 3 records
		const tableResult = await asAdmin(t).query(
			api.crm.viewQueries.queryViewRecords,
			{
				viewDefId: tableViewId,
				limit: 25,
			}
		);
		expect(tableResult.rows).toHaveLength(3);
		expect(tableResult.columns.length).toBeGreaterThanOrEqual(4);

		// 7. Query kanban view -> verify grouped by status
		const kanbanResult = await asAdmin(t).query(
			api.crm.viewQueries.queryViewRecords,
			{
				viewDefId: kanbanViewId,
			}
		);
		expect(kanbanResult.totalCount).toBe(3);
		const newGroup = kanbanResult.groups.find(
			(g: { label: string }) => g.label === "New"
		);
		const contactedGroup = kanbanResult.groups.find(
			(g: { label: string }) => g.label === "Contacted"
		);
		const qualifiedGroup = kanbanResult.groups.find(
			(g: { label: string }) => g.label === "Qualified"
		);
		expect(newGroup?.count).toBe(1);
		expect(contactedGroup?.count).toBe(1);
		expect(qualifiedGroup?.count).toBe(1);

		// 8. Update record status
		const acmeRecord = tableResult.rows.find(
			(r: { fields: Record<string, unknown> }) =>
				r.fields.company_name === "Acme Corp"
		);
		expect(acmeRecord).toBeDefined();
		await asAdmin(t).mutation(api.crm.records.updateRecord, {
			recordId: acmeRecord?._id as Id<"records">,
			values: { status: "contacted" },
		});

		// Verify updated value
		const updatedTable = await asAdmin(t).query(
			api.crm.viewQueries.queryViewRecords,
			{
				viewDefId: tableViewId,
				limit: 25,
			}
		);
		const updatedAcme = updatedTable.rows.find(
			(r: { fields: Record<string, unknown> }) =>
				r.fields.company_name === "Acme Corp"
		);
		expect(updatedAcme?.fields.status).toBe("contacted");

		// 9. Search records by labelValue
		// Note: Convex search indexes in convex-test may not fully support
		// search. If this assertion fails, the test can be skipped.
		try {
			const searchResults = await asAdmin(t).query(
				api.crm.recordQueries.searchRecords,
				{
					objectDefId,
					query: "Acme",
				}
			);
			expect(searchResults.length).toBeGreaterThanOrEqual(1);
			expect(searchResults[0].fields.company_name).toBe("Acme Corp");
		} catch (error) {
			// Only treat explicit "search not supported" errors as a reason to skip.
			if (error instanceof Error && SEARCH_UNSUPPORTED_RE.test(error.message)) {
				// convex-test may not support search indexes — warn and continue
				console.warn(
					"Search index not supported in convex-test — skipping search assertion"
				);
			} else {
				// Unexpected error — surface it instead of silently skipping.
				throw error;
			}
		}

		// 10. Performance check (generous margins for convex-test in-process)
		const enablePerfCheck = process.env.CRM_WALKTHROUGH_PERF_CHECK === "1";
		const start = performance.now();
		await asAdmin(t).query(api.crm.recordQueries.queryRecords, {
			objectDefId,
			paginationOpts: { numItems: 25, cursor: null },
		});
		const elapsed = performance.now() - start;
		if (enablePerfCheck) {
			// convex-test in-process — 2000ms is very generous
			expect(elapsed).toBeLessThan(2000);
		} else {
			console.info(
				`EAV-CRM Walk-Through perf: queryRecords completed in ${elapsed.toFixed(
					1
				)}ms (perf check disabled; set CRM_WALKTHROUGH_PERF_CHECK=1 to enable assertion)`
			);
		}
	});
});
