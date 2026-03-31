/**
 * Metadata Compiler tests — pure function + integration via convex-test.
 *
 * Covers:
 * - deriveCapabilities for all 14 field types
 * - createField inserts correct capabilities
 * - updateField with type change re-derives capabilities
 * - deactivateField removes all capabilities
 * - Capabilities queryable via fieldCapabilities.by_object_capability index
 */
import { beforeEach, describe, expect, it } from "vitest";
import { api } from "../../_generated/api";
import { deriveCapabilities } from "../metadataCompiler";
import {
	asAdmin,
	type CrmTestFixture,
	type CrmTestHarness,
	createCrmTestHarness,
	seedObjectWithFields,
} from "./helpers";

// ═══════════════════════════════════════════════════════════════════════
// PURE FUNCTION TESTS
// ═══════════════════════════════════════════════════════════════════════

describe("deriveCapabilities (pure)", () => {
	it('text → ["table"]', () => {
		expect(deriveCapabilities("text")).toEqual(["table"]);
	});

	it('email → ["table"]', () => {
		expect(deriveCapabilities("email")).toEqual(["table"]);
	});

	it('phone → ["table"]', () => {
		expect(deriveCapabilities("phone")).toEqual(["table"]);
	});

	it('url → ["table"]', () => {
		expect(deriveCapabilities("url")).toEqual(["table"]);
	});

	it('rich_text → ["table"]', () => {
		expect(deriveCapabilities("rich_text")).toEqual(["table"]);
	});

	it('user_ref → ["table"]', () => {
		expect(deriveCapabilities("user_ref")).toEqual(["table"]);
	});

	it('boolean → ["table"]', () => {
		expect(deriveCapabilities("boolean")).toEqual(["table"]);
	});

	it('number → ["table", "aggregate", "sort"]', () => {
		expect(deriveCapabilities("number")).toEqual([
			"table",
			"aggregate",
			"sort",
		]);
	});

	it('currency → ["table", "aggregate", "sort"]', () => {
		expect(deriveCapabilities("currency")).toEqual([
			"table",
			"aggregate",
			"sort",
		]);
	});

	it('percentage → ["table", "aggregate", "sort"]', () => {
		expect(deriveCapabilities("percentage")).toEqual([
			"table",
			"aggregate",
			"sort",
		]);
	});

	it('date → ["table", "calendar", "sort"]', () => {
		expect(deriveCapabilities("date")).toEqual(["table", "calendar", "sort"]);
	});

	it('datetime → ["table", "calendar", "sort"]', () => {
		expect(deriveCapabilities("datetime")).toEqual([
			"table",
			"calendar",
			"sort",
		]);
	});

	it('select → ["table", "kanban", "group_by"]', () => {
		expect(deriveCapabilities("select")).toEqual([
			"table",
			"kanban",
			"group_by",
		]);
	});

	it('multi_select → ["table", "kanban"]', () => {
		expect(deriveCapabilities("multi_select")).toEqual(["table", "kanban"]);
	});
});

// ═══════════════════════════════════════════════════════════════════════
// INTEGRATION TESTS
// ═══════════════════════════════════════════════════════════════════════

describe("metadataCompiler integration", () => {
	let t: CrmTestHarness;
	let fixture: CrmTestFixture;

	const SELECT_OPTIONS = [
		{ value: "open", label: "Open", color: "#22c55e", order: 0 },
		{ value: "closed", label: "Closed", color: "#ef4444", order: 1 },
	];

	beforeEach(async () => {
		t = createCrmTestHarness();
		fixture = await seedObjectWithFields(t, {
			name: "TestObj",
			fields: [
				{ name: "title", fieldType: "text" },
				{ name: "amount", fieldType: "number" },
				{
					name: "status",
					fieldType: "select",
					options: SELECT_OPTIONS,
				},
			],
		});
	});

	describe("createField inserts correct capabilities", () => {
		it("text field gets only table capability", async () => {
			const caps = await t.run(async (ctx) => {
				return ctx.db
					.query("fieldCapabilities")
					.withIndex("by_field", (q) =>
						q.eq("fieldDefId", fixture.fieldDefs.title)
					)
					.collect();
			});
			expect(caps.map((c) => c.capability)).toEqual(["table"]);
		});

		it("number field gets table + aggregate + sort capabilities", async () => {
			const caps = await t.run(async (ctx) => {
				return ctx.db
					.query("fieldCapabilities")
					.withIndex("by_field", (q) =>
						q.eq("fieldDefId", fixture.fieldDefs.amount)
					)
					.collect();
			});
			expect(caps.map((c) => c.capability).sort()).toEqual(
				["aggregate", "sort", "table"].sort()
			);
		});

		it("select field gets table + kanban + group_by capabilities", async () => {
			const caps = await t.run(async (ctx) => {
				return ctx.db
					.query("fieldCapabilities")
					.withIndex("by_field", (q) =>
						q.eq("fieldDefId", fixture.fieldDefs.status)
					)
					.collect();
			});
			expect(caps.map((c) => c.capability).sort()).toEqual(
				["group_by", "kanban", "table"].sort()
			);
		});
	});

	describe("updateField with type change re-derives capabilities", () => {
		it("changing text → number replaces capabilities", async () => {
			// Pre-check: title has only table
			const capsBefore = await t.run(async (ctx) => {
				return ctx.db
					.query("fieldCapabilities")
					.withIndex("by_field", (q) =>
						q.eq("fieldDefId", fixture.fieldDefs.title)
					)
					.collect();
			});
			expect(capsBefore).toHaveLength(1);
			expect(capsBefore[0].capability).toBe("table");

			// Update field type from text → number
			const admin = asAdmin(t);
			await admin.mutation(api.crm.fieldDefs.updateField, {
				fieldDefId: fixture.fieldDefs.title,
				fieldType: "number",
			});

			// Post-check: should have table + aggregate + sort
			const capsAfter = await t.run(async (ctx) => {
				return ctx.db
					.query("fieldCapabilities")
					.withIndex("by_field", (q) =>
						q.eq("fieldDefId", fixture.fieldDefs.title)
					)
					.collect();
			});
			expect(capsAfter.map((c) => c.capability).sort()).toEqual(
				["aggregate", "sort", "table"].sort()
			);
		});

		it("changing number → date replaces capabilities", async () => {
			const admin = asAdmin(t);
			await admin.mutation(api.crm.fieldDefs.updateField, {
				fieldDefId: fixture.fieldDefs.amount,
				fieldType: "date",
			});

			const capsAfter = await t.run(async (ctx) => {
				return ctx.db
					.query("fieldCapabilities")
					.withIndex("by_field", (q) =>
						q.eq("fieldDefId", fixture.fieldDefs.amount)
					)
					.collect();
			});
			expect(capsAfter.map((c) => c.capability).sort()).toEqual(
				["calendar", "sort", "table"].sort()
			);
		});
	});

	describe("deactivateField removes all capabilities", () => {
		it("deactivating a field deletes its capabilities", async () => {
			// Pre-check: status field has capabilities
			const capsBefore = await t.run(async (ctx) => {
				return ctx.db
					.query("fieldCapabilities")
					.withIndex("by_field", (q) =>
						q.eq("fieldDefId", fixture.fieldDefs.status)
					)
					.collect();
			});
			expect(capsBefore.length).toBeGreaterThan(0);

			// Deactivate
			const admin = asAdmin(t);
			await admin.mutation(api.crm.fieldDefs.deactivateField, {
				fieldDefId: fixture.fieldDefs.status,
			});

			// Post-check: no capabilities remain
			const capsAfter = await t.run(async (ctx) => {
				return ctx.db
					.query("fieldCapabilities")
					.withIndex("by_field", (q) =>
						q.eq("fieldDefId", fixture.fieldDefs.status)
					)
					.collect();
			});
			expect(capsAfter).toHaveLength(0);
		});
	});

	describe("capabilities queryable via by_object_capability index", () => {
		it("can query all kanban-capable fields for an object", async () => {
			const kanbanCaps = await t.run(async (ctx) => {
				return ctx.db
					.query("fieldCapabilities")
					.withIndex("by_object_capability", (q) =>
						q.eq("objectDefId", fixture.objectDefId).eq("capability", "kanban")
					)
					.collect();
			});
			// Only the select field should have kanban capability
			expect(kanbanCaps).toHaveLength(1);
			expect(kanbanCaps[0].fieldDefId).toBe(fixture.fieldDefs.status);
		});

		it("can query all sortable fields for an object", async () => {
			const sortCaps = await t.run(async (ctx) => {
				return ctx.db
					.query("fieldCapabilities")
					.withIndex("by_object_capability", (q) =>
						q.eq("objectDefId", fixture.objectDefId).eq("capability", "sort")
					)
					.collect();
			});
			// Only the number field should have sort capability
			expect(sortCaps).toHaveLength(1);
			expect(sortCaps[0].fieldDefId).toBe(fixture.fieldDefs.amount);
		});

		it("all three fields have table capability", async () => {
			const tableCaps = await t.run(async (ctx) => {
				return ctx.db
					.query("fieldCapabilities")
					.withIndex("by_object_capability", (q) =>
						q.eq("objectDefId", fixture.objectDefId).eq("capability", "table")
					)
					.collect();
			});
			expect(tableCaps).toHaveLength(3);
		});
	});
});
