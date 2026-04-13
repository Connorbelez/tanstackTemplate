/**
 * Record CRUD tests — create, update, delete operations for the EAV CRM.
 *
 * Covers:
 * - createRecord: all 14 field types with correct value table routing
 * - createRecord: labelValue derivation from first text field by displayOrder
 * - createRecord: validation (required fields, type mismatches, unknown fields)
 * - createRecord: org scoping (different org cannot access records)
 * - updateRecord: field value replacement (old row deleted, new row inserted)
 * - updateRecord: labelValue update when first text field changes
 * - deleteRecord: soft-delete (isDeleted=true), exclusion from queryRecords
 */
import { ConvexError } from "convex/values";
import { beforeEach, describe, expect, it } from "vitest";
import {
	asAdmin,
	asDifferentOrg,
	CRM_ADMIN_IDENTITY,
	type CrmTestHarness,
	createCrmTestHarness,
	seedObjectWithFields,
	seedRecord,
} from "../../../src/test/convex/crm/helpers";
import { api, components, internal } from "../../_generated/api";

// ═══════════════════════════════════════════════════════════════════════
// createRecord
// ═══════════════════════════════════════════════════════════════════════

describe("Record CRUD", () => {
	let t: CrmTestHarness;

	beforeEach(() => {
		t = createCrmTestHarness();
	});

	describe("createRecord", () => {
		it("creates record with text field and routes to recordValuesText", async () => {
			const fixture = await seedObjectWithFields(t, {
				name: "text_obj",
				fields: [{ name: "title", fieldType: "text" }],
			});

			const recordId = await asAdmin(t).mutation(api.crm.records.createRecord, {
				objectDefId: fixture.objectDefId,
				values: { title: "Hello World" },
			});

			const textValues = await t.run(async (ctx) => {
				return ctx.db
					.query("recordValuesText")
					.withIndex("by_record", (q) => q.eq("recordId", recordId))
					.collect();
			});
			expect(textValues).toHaveLength(1);
			expect(textValues[0].value).toBe("Hello World");

			// Audit: verify crm.record.created event was logged
			const auditEntries = await t.query(
				components.auditLog.lib.queryByResource,
				{ resourceType: "records", resourceId: recordId }
			);
			const createEntry = auditEntries.find(
				(e: { action: string }) => e.action === "crm.record.created"
			);
			expect(createEntry).toBeDefined();
			expect(createEntry?.actorId).toBe(CRM_ADMIN_IDENTITY.subject);
		});

		it("creates record with number field and routes to recordValuesNumber", async () => {
			const fixture = await seedObjectWithFields(t, {
				name: "num_obj",
				fields: [{ name: "count", fieldType: "number" }],
			});

			const recordId = await asAdmin(t).mutation(api.crm.records.createRecord, {
				objectDefId: fixture.objectDefId,
				values: { count: 42 },
			});

			const numValues = await t.run(async (ctx) => {
				return ctx.db
					.query("recordValuesNumber")
					.withIndex("by_record", (q) => q.eq("recordId", recordId))
					.collect();
			});
			expect(numValues).toHaveLength(1);
			expect(numValues[0].value).toBe(42);
		});

		it("creates record with boolean field and routes to recordValuesBoolean", async () => {
			const fixture = await seedObjectWithFields(t, {
				name: "bool_obj",
				fields: [{ name: "active", fieldType: "boolean" }],
			});

			const recordId = await asAdmin(t).mutation(api.crm.records.createRecord, {
				objectDefId: fixture.objectDefId,
				values: { active: true },
			});

			const boolValues = await t.run(async (ctx) => {
				return ctx.db
					.query("recordValuesBoolean")
					.withIndex("by_record", (q) => q.eq("recordId", recordId))
					.collect();
			});
			expect(boolValues).toHaveLength(1);
			expect(boolValues[0].value).toBe(true);
		});

		it("creates record with date field and routes to recordValuesDate", async () => {
			const fixture = await seedObjectWithFields(t, {
				name: "date_obj",
				fields: [{ name: "dueDate", fieldType: "date" }],
			});

			const ts = Date.now();
			const recordId = await asAdmin(t).mutation(api.crm.records.createRecord, {
				objectDefId: fixture.objectDefId,
				values: { dueDate: ts },
			});

			const dateValues = await t.run(async (ctx) => {
				return ctx.db
					.query("recordValuesDate")
					.withIndex("by_record", (q) => q.eq("recordId", recordId))
					.collect();
			});
			expect(dateValues).toHaveLength(1);
			expect(dateValues[0].value).toBe(ts);
		});

		it("creates record with select field and routes to recordValuesSelect", async () => {
			const options = [
				{ value: "new", label: "New", color: "#3b82f6", order: 0 },
				{
					value: "contacted",
					label: "Contacted",
					color: "#eab308",
					order: 1,
				},
			];
			const fixture = await seedObjectWithFields(t, {
				name: "sel_obj",
				fields: [{ name: "status", fieldType: "select", options }],
			});

			const recordId = await asAdmin(t).mutation(api.crm.records.createRecord, {
				objectDefId: fixture.objectDefId,
				values: { status: "new" },
			});

			const selValues = await t.run(async (ctx) => {
				return ctx.db
					.query("recordValuesSelect")
					.withIndex("by_record", (q) => q.eq("recordId", recordId))
					.collect();
			});
			expect(selValues).toHaveLength(1);
			expect(selValues[0].value).toBe("new");
		});

		it("creates record with multi_select field and routes to recordValuesMultiSelect", async () => {
			const options = [
				{ value: "red", label: "Red", color: "#ef4444", order: 0 },
				{ value: "blue", label: "Blue", color: "#3b82f6", order: 1 },
				{ value: "green", label: "Green", color: "#22c55e", order: 2 },
			];
			const fixture = await seedObjectWithFields(t, {
				name: "msel_obj",
				fields: [{ name: "tags", fieldType: "multi_select", options }],
			});

			const recordId = await asAdmin(t).mutation(api.crm.records.createRecord, {
				objectDefId: fixture.objectDefId,
				values: { tags: ["red", "green"] },
			});

			const mselValues = await t.run(async (ctx) => {
				return ctx.db
					.query("recordValuesMultiSelect")
					.withIndex("by_record", (q) => q.eq("recordId", recordId))
					.collect();
			});
			expect(mselValues).toHaveLength(1);
			expect(mselValues[0].value).toEqual(["red", "green"]);
		});

		it("creates record with email field (validated)", async () => {
			const fixture = await seedObjectWithFields(t, {
				name: "email_obj",
				fields: [{ name: "email", fieldType: "email" }],
			});

			const recordId = await asAdmin(t).mutation(api.crm.records.createRecord, {
				objectDefId: fixture.objectDefId,
				values: { email: "test@example.com" },
			});

			const textValues = await t.run(async (ctx) => {
				return ctx.db
					.query("recordValuesText")
					.withIndex("by_record", (q) => q.eq("recordId", recordId))
					.collect();
			});
			expect(textValues).toHaveLength(1);
			expect(textValues[0].value).toBe("test@example.com");
		});

		it("creates record with phone field (validated)", async () => {
			const fixture = await seedObjectWithFields(t, {
				name: "phone_obj",
				fields: [{ name: "phone", fieldType: "phone" }],
			});

			const recordId = await asAdmin(t).mutation(api.crm.records.createRecord, {
				objectDefId: fixture.objectDefId,
				values: { phone: "+1-555-123-4567" },
			});

			const textValues = await t.run(async (ctx) => {
				return ctx.db
					.query("recordValuesText")
					.withIndex("by_record", (q) => q.eq("recordId", recordId))
					.collect();
			});
			expect(textValues).toHaveLength(1);
			expect(textValues[0].value).toBe("+1-555-123-4567");
		});

		it("creates record with url field (validated)", async () => {
			const fixture = await seedObjectWithFields(t, {
				name: "url_obj",
				fields: [{ name: "website", fieldType: "url" }],
			});

			const recordId = await asAdmin(t).mutation(api.crm.records.createRecord, {
				objectDefId: fixture.objectDefId,
				values: { website: "https://example.com" },
			});

			const textValues = await t.run(async (ctx) => {
				return ctx.db
					.query("recordValuesText")
					.withIndex("by_record", (q) => q.eq("recordId", recordId))
					.collect();
			});
			expect(textValues).toHaveLength(1);
			expect(textValues[0].value).toBe("https://example.com");
		});

		it("creates record with currency field", async () => {
			const fixture = await seedObjectWithFields(t, {
				name: "curr_obj",
				fields: [{ name: "amount", fieldType: "currency" }],
			});

			const recordId = await asAdmin(t).mutation(api.crm.records.createRecord, {
				objectDefId: fixture.objectDefId,
				values: { amount: 99.99 },
			});

			const numValues = await t.run(async (ctx) => {
				return ctx.db
					.query("recordValuesNumber")
					.withIndex("by_record", (q) => q.eq("recordId", recordId))
					.collect();
			});
			expect(numValues).toHaveLength(1);
			expect(numValues[0].value).toBe(99.99);
		});

		it("creates record with percentage field", async () => {
			const fixture = await seedObjectWithFields(t, {
				name: "pct_obj",
				fields: [{ name: "rate", fieldType: "percentage" }],
			});

			const recordId = await asAdmin(t).mutation(api.crm.records.createRecord, {
				objectDefId: fixture.objectDefId,
				values: { rate: 75.5 },
			});

			const numValues = await t.run(async (ctx) => {
				return ctx.db
					.query("recordValuesNumber")
					.withIndex("by_record", (q) => q.eq("recordId", recordId))
					.collect();
			});
			expect(numValues).toHaveLength(1);
			expect(numValues[0].value).toBe(75.5);
		});

		it("creates record with rich_text field", async () => {
			const fixture = await seedObjectWithFields(t, {
				name: "rt_obj",
				fields: [{ name: "body", fieldType: "rich_text" }],
			});

			const recordId = await asAdmin(t).mutation(api.crm.records.createRecord, {
				objectDefId: fixture.objectDefId,
				values: { body: "<p>Hello</p>" },
			});

			const rtValues = await t.run(async (ctx) => {
				return ctx.db
					.query("recordValuesRichText")
					.withIndex("by_record", (q) => q.eq("recordId", recordId))
					.collect();
			});
			expect(rtValues).toHaveLength(1);
			expect(rtValues[0].value).toBe("<p>Hello</p>");
		});

		it("creates record with user_ref field", async () => {
			const fixture = await seedObjectWithFields(t, {
				name: "uref_obj",
				fields: [{ name: "assignee", fieldType: "user_ref" }],
			});

			const recordId = await asAdmin(t).mutation(api.crm.records.createRecord, {
				objectDefId: fixture.objectDefId,
				values: { assignee: "user_01ABC" },
			});

			const urefValues = await t.run(async (ctx) => {
				return ctx.db
					.query("recordValuesUserRef")
					.withIndex("by_record", (q) => q.eq("recordId", recordId))
					.collect();
			});
			expect(urefValues).toHaveLength(1);
			expect(urefValues[0].value).toBe("user_01ABC");
		});

		it("creates record with datetime field", async () => {
			const fixture = await seedObjectWithFields(t, {
				name: "dt_obj",
				fields: [{ name: "scheduledAt", fieldType: "datetime" }],
			});

			const ts = Date.now();
			const recordId = await asAdmin(t).mutation(api.crm.records.createRecord, {
				objectDefId: fixture.objectDefId,
				values: { scheduledAt: ts },
			});

			const dateValues = await t.run(async (ctx) => {
				return ctx.db
					.query("recordValuesDate")
					.withIndex("by_record", (q) => q.eq("recordId", recordId))
					.collect();
			});
			expect(dateValues).toHaveLength(1);
			expect(dateValues[0].value).toBe(ts);
		});

		it("populates labelValue from first text field by displayOrder", async () => {
			// Create fields in order: number first, then text "name", then text "description"
			// The first text field by displayOrder should be "name" (index 1)
			const fixture = await seedObjectWithFields(t, {
				name: "label_obj",
				fields: [
					{ name: "priority", fieldType: "number" },
					{ name: "name", fieldType: "text" },
					{ name: "description", fieldType: "text" },
				],
			});

			const recordId = await asAdmin(t).mutation(api.crm.records.createRecord, {
				objectDefId: fixture.objectDefId,
				values: {
					priority: 1,
					name: "Primary Label",
					description: "Some description",
				},
			});

			const record = await t.run(async (ctx) => {
				return ctx.db.get(recordId);
			});
			expect(record).not.toBeNull();
			expect(record?.labelValue).toBe("Primary Label");
		});

		it("rejects missing required field with ConvexError", async () => {
			const fixture = await seedObjectWithFields(t, {
				name: "req_obj",
				fields: [
					{ name: "title", fieldType: "text", isRequired: true },
					{ name: "count", fieldType: "number" },
				],
			});

			await expect(
				asAdmin(t).mutation(api.crm.records.createRecord, {
					objectDefId: fixture.objectDefId,
					values: { count: 5 },
				})
			).rejects.toThrow(ConvexError);
		});

		it("rejects wrong type (string for number field) with ConvexError", async () => {
			const fixture = await seedObjectWithFields(t, {
				name: "type_obj",
				fields: [{ name: "amount", fieldType: "number" }],
			});

			await expect(
				asAdmin(t).mutation(api.crm.records.createRecord, {
					objectDefId: fixture.objectDefId,
					values: { amount: "not a number" },
				})
			).rejects.toThrow(ConvexError);
		});

		it("rejects unknown field name with ConvexError", async () => {
			const fixture = await seedObjectWithFields(t, {
				name: "unk_obj",
				fields: [{ name: "title", fieldType: "text" }],
			});

			await expect(
				asAdmin(t).mutation(api.crm.records.createRecord, {
					objectDefId: fixture.objectDefId,
					values: { title: "ok", nonexistent: "bad" },
				})
			).rejects.toThrow(ConvexError);
		});

		it("org-scoped: different org cannot query the created record", async () => {
			const fixture = await seedObjectWithFields(t, {
				name: "scope_obj",
				fields: [{ name: "title", fieldType: "text" }],
			});

			await asAdmin(t).mutation(api.crm.records.createRecord, {
				objectDefId: fixture.objectDefId,
				values: { title: "Secret" },
			});

			// Different org trying to query records for that objectDefId should fail
			await expect(
				asDifferentOrg(t).query(api.crm.recordQueries.queryRecords, {
					objectDefId: fixture.objectDefId,
					paginationOpts: { numItems: 25, cursor: null },
				})
			).rejects.toThrow(ConvexError);
		});
	});

	// ═══════════════════════════════════════════════════════════════════════
	// updateRecord
	// ═══════════════════════════════════════════════════════════════════════

	describe("updateRecord", () => {
		it("updates field value — old row deleted, new row inserted", async () => {
			const fixture = await seedObjectWithFields(t, {
				name: "upd_obj",
				fields: [
					{ name: "title", fieldType: "text" },
					{ name: "count", fieldType: "number" },
				],
			});

			const recordId = await seedRecord(t, fixture.objectDefId, {
				title: "Original",
				count: 10,
			});

			// Capture the original value row IDs
			const originalTextRows = await t.run(async (ctx) => {
				return ctx.db
					.query("recordValuesText")
					.withIndex("by_record", (q) => q.eq("recordId", recordId))
					.collect();
			});
			expect(originalTextRows).toHaveLength(1);
			const originalTextRowId = originalTextRows[0]._id;

			// Update
			await asAdmin(t).mutation(api.crm.records.updateRecord, {
				recordId,
				values: { title: "Updated" },
			});

			// Verify old row is gone and new row exists
			const newTextRows = await t.run(async (ctx) => {
				return ctx.db
					.query("recordValuesText")
					.withIndex("by_record", (q) => q.eq("recordId", recordId))
					.collect();
			});
			expect(newTextRows).toHaveLength(1);
			expect(newTextRows[0].value).toBe("Updated");
			expect(newTextRows[0]._id).not.toBe(originalTextRowId);

			// Verify the number field is unchanged
			const numRows = await t.run(async (ctx) => {
				return ctx.db
					.query("recordValuesNumber")
					.withIndex("by_record", (q) => q.eq("recordId", recordId))
					.collect();
			});
			expect(numRows).toHaveLength(1);
			expect(numRows[0].value).toBe(10);

			// Audit: verify crm.record.updated event was logged
			const auditEntries = await t.query(
				components.auditLog.lib.queryByResource,
				{ resourceType: "records", resourceId: recordId }
			);
			const updateEntry = auditEntries.find(
				(e: { action: string }) => e.action === "crm.record.updated"
			);
			expect(updateEntry).toBeDefined();
			expect(updateEntry?.actorId).toBe(CRM_ADMIN_IDENTITY.subject);
		});

		it("updates labelValue when first text field changes", async () => {
			const fixture = await seedObjectWithFields(t, {
				name: "lbl_upd_obj",
				fields: [
					{ name: "name", fieldType: "text" },
					{ name: "notes", fieldType: "text" },
				],
			});

			const recordId = await seedRecord(t, fixture.objectDefId, {
				name: "Original Name",
				notes: "Some notes",
			});

			// Verify initial labelValue
			const before = await t.run(async (ctx) => ctx.db.get(recordId));
			expect(before?.labelValue).toBe("Original Name");

			// Update the first text field
			await asAdmin(t).mutation(api.crm.records.updateRecord, {
				recordId,
				values: { name: "New Name" },
			});

			// Verify labelValue updated
			const after = await t.run(async (ctx) => ctx.db.get(recordId));
			expect(after?.labelValue).toBe("New Name");
		});
	});

	// ═══════════════════════════════════════════════════════════════════════
	// deleteRecord
	// ═══════════════════════════════════════════════════════════════════════

	describe("deleteRecord", () => {
		it("soft-deletes by setting isDeleted=true", async () => {
			const fixture = await seedObjectWithFields(t, {
				name: "del_obj",
				fields: [{ name: "title", fieldType: "text" }],
			});

			const recordId = await seedRecord(t, fixture.objectDefId, {
				title: "To Delete",
			});

			await asAdmin(t).mutation(api.crm.records.deleteRecord, {
				recordId,
			});

			// Record row still exists with isDeleted=true
			const record = await t.run(async (ctx) => ctx.db.get(recordId));
			expect(record).not.toBeNull();
			expect(record?.isDeleted).toBe(true);

			// Value rows are preserved (not physically deleted)
			const textValues = await t.run(async (ctx) => {
				return ctx.db
					.query("recordValuesText")
					.withIndex("by_record", (q) => q.eq("recordId", recordId))
					.collect();
			});
			expect(textValues).toHaveLength(1);
			expect(textValues[0].value).toBe("To Delete");

			// Audit: verify crm.record.deleted event was logged
			const auditEntries = await t.query(
				components.auditLog.lib.queryByResource,
				{ resourceType: "records", resourceId: recordId }
			);
			const deleteEntry = auditEntries.find(
				(e: { action: string }) => e.action === "crm.record.deleted"
			);
			expect(deleteEntry).toBeDefined();
			expect(deleteEntry?.actorId).toBe(CRM_ADMIN_IDENTITY.subject);
			expect(deleteEntry?.severity).toBe("warning");
		});

		it("deleted record not returned by queryRecords", async () => {
			const fixture = await seedObjectWithFields(t, {
				name: "del_q_obj",
				fields: [{ name: "title", fieldType: "text" }],
			});

			const recordId = await seedRecord(t, fixture.objectDefId, {
				title: "Visible",
			});

			// Verify it appears before deletion
			const beforeResult = await asAdmin(t).query(
				api.crm.recordQueries.queryRecords,
				{
					objectDefId: fixture.objectDefId,
					paginationOpts: { numItems: 25, cursor: null },
				}
			);
			expect(beforeResult.records).toHaveLength(1);

			// Delete
			await asAdmin(t).mutation(api.crm.records.deleteRecord, {
				recordId,
			});

			// Verify it no longer appears
			const afterResult = await asAdmin(t).query(
				api.crm.recordQueries.queryRecords,
				{
					objectDefId: fixture.objectDefId,
					paginationOpts: { numItems: 25, cursor: null },
				}
			);
			expect(afterResult.records).toHaveLength(0);
		});

		it("queryRecords respects logicalOperator OR filters", async () => {
			const fixture = await seedObjectWithFields(t, {
				name: "or_filter_obj",
				fields: [{ name: "title", fieldType: "text" }],
			});

			await seedRecord(t, fixture.objectDefId, {
				title: "Acme",
			});
			await seedRecord(t, fixture.objectDefId, {
				title: "Beta",
			});
			await seedRecord(t, fixture.objectDefId, {
				title: "Charlie",
			});

			const result = await asAdmin(t).query(
				api.crm.recordQueries.queryRecords,
				{
					objectDefId: fixture.objectDefId,
					filters: [
						{
							fieldDefId: fixture.fieldDefs.title,
							operator: "contains",
							value: "Acme",
						},
						{
							fieldDefId: fixture.fieldDefs.title,
							logicalOperator: "or",
							operator: "contains",
							value: "Beta",
						},
					],
					paginationOpts: { numItems: 25, cursor: null },
				}
			);

			expect(result.records).toHaveLength(2);
			expect(
				result.records.map((record) => record.fields.title).sort()
			).toEqual(["Acme", "Beta"]);
		});
	});
});

// ═══════════════════════════════════════════════════════════════════════
// getRecordReference
// ═══════════════════════════════════════════════════════════════════════

describe("getRecordReference", () => {
	let t: CrmTestHarness;

	beforeEach(() => {
		t = createCrmTestHarness();
	});

	it("returns EAV record with record kind and empty links", async () => {
		const fixture = await seedObjectWithFields(t, {
			name: "ref_test",
			fields: [{ name: "title", fieldType: "text" }],
		});

		const recordId = await seedRecord(t, fixture.objectDefId, {
			title: "Reference Test Record",
		});

		const result = await asAdmin(t).query(
			api.crm.recordQueries.getRecordReference,
			{
				objectDefId: fixture.objectDefId,
				recordId: recordId as string,
				recordKind: "record",
			}
		);

		expect(result.record._kind).toBe("record");
		expect(result.record.objectDefId).toBe(fixture.objectDefId);
		expect(result.record.fields.title).toBe("Reference Test Record");
		expect(result.links).toHaveProperty("inbound");
		expect(result.links).toHaveProperty("outbound");
	});

	it("returns native record with native kind", async () => {
		// Bootstrap system objects including borrower
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

		const borrowerId = await t.run(async (ctx) => {
			const userId = await ctx.db.insert("users", {
				authId: "crm-native-borrower",
				email: "crm-native-borrower@test.fairlend.ca",
				firstName: "CRM",
				lastName: "Borrower",
			});
			return ctx.db.insert("borrowers", {
				createdAt: Date.now(),
				orgId: CRM_ADMIN_IDENTITY.org_id,
				status: "active",
				userId,
			});
		});

		const result = await asAdmin(t).query(
			api.crm.recordQueries.getRecordReference,
			{
				objectDefId: borrowerObjDef._id,
				recordId: borrowerId as string,
				recordKind: "native",
			}
		);

		expect(result.record._kind).toBe("native");
		expect(result.record.objectDefId).toBe(borrowerObjDef._id);
		expect(result.links).toHaveProperty("inbound");
		expect(result.links).toHaveProperty("outbound");
	});

	it("throws for record in wrong org", async () => {
		const fixture = await seedObjectWithFields(t, {
			name: "org_record",
			fields: [{ name: "name", fieldType: "text" }],
		});

		const recordId = await seedRecord(t, fixture.objectDefId, {
			name: "Private Record",
		});

		await expect(
			asDifferentOrg(t).query(api.crm.recordQueries.getRecordReference, {
				objectDefId: fixture.objectDefId,
				recordId: recordId as string,
				recordKind: "record",
			})
		).rejects.toThrow();
	});

	it("throws ConvexError for unknown recordKind", async () => {
		const fixture = await seedObjectWithFields(t, {
			name: "kind_test",
			fields: [{ name: "x", fieldType: "text" }],
		});

		// @ts-expect-error — invalid recordKind for type testing
		await expect(
			asAdmin(t).query(api.crm.recordQueries.getRecordReference, {
				objectDefId: fixture.objectDefId,
				recordId: "any-id",
				recordKind: "unknown",
			})
		).rejects.toThrow();
	});
});

describe("getRecordDetailSurface", () => {
	let t: CrmTestHarness;

	beforeEach(() => {
		t = createCrmTestHarness();
	});

	it("returns normalized detail fields for CRM records", async () => {
		const fixture = await seedObjectWithFields(t, {
			name: "detail_surface",
			fields: [
				{ name: "title", fieldType: "text" },
				{
					name: "status",
					fieldType: "select",
					options: [
						{ color: "#2563eb", label: "New", order: 0, value: "new" },
						{ color: "#16a34a", label: "Active", order: 1, value: "active" },
					],
				},
			],
		});

		const recordId = await seedRecord(t, fixture.objectDefId, {
			title: "Detail Surface Record",
			status: "active",
		});

		const result = await asAdmin(t).query(
			api.crm.recordQueries.getRecordDetailSurface,
			{
				objectDefId: fixture.objectDefId,
				recordId: recordId as string,
				recordKind: "record",
			}
		);

		expect(result.objectDef._id).toBe(fixture.objectDefId);
		expect(result.adapterContract).toMatchObject({
			entityType: "detail_surface",
			variant: "fallback",
			detail: {
				mode: "generated",
				surfaceKey: "detail_surface",
			},
		});
		expect(result.fields.map((field) => field.name)).toEqual([
			"title",
			"status",
		]);
		expect(result.fields[1]).toMatchObject({
			editability: { mode: "editable" },
			label: "Status",
			name: "status",
			rendererHint: "select",
		});
		expect(result.record.fields).toMatchObject({
			status: "active",
			title: "Detail Surface Record",
		});
	});

	it("applies dedicated labels and computed values for native detail surfaces", async () => {
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

		const borrowerId = await t.run(async (ctx) => {
			const userId = await ctx.db.insert("users", {
				authId: "crm-native-borrower-detail",
				email: "crm-native-borrower-detail@test.fairlend.ca",
				firstName: "CRM",
				lastName: "Borrower Detail",
			});
			return ctx.db.insert("borrowers", {
				createdAt: Date.now(),
				idvStatus: "pending_review",
				orgId: CRM_ADMIN_IDENTITY.org_id,
				status: "active",
				userId,
			});
		});

		const result = await asAdmin(t).query(
			api.crm.recordQueries.getRecordDetailSurface,
			{
				objectDefId: borrowerObjDef._id,
				recordId: borrowerId as string,
				recordKind: "native",
			}
		);

		expect(result.adapterContract).toMatchObject({
			detailSurfaceKey: "borrowers",
			entityType: "borrowers",
			variant: "dedicated",
		});
		expect(
			result.fields.find((field) => field.name === "status")
		).toMatchObject({
			displayOrder: 0,
			label: "Borrower Status",
		});
		expect(
			result.fields.find((field) => field.name === "idvStatus")
		).toMatchObject({
			displayOrder: 1,
			label: "Identity Verification",
		});
		expect(
			result.fields.find((field) => field.name === "verificationSummary")
		).toMatchObject({
			fieldSource: "adapter_computed",
			label: "Verification Summary",
		});
		expect(result.record.fields.verificationSummary).toBe(
			"Active borrower • IDV pending review"
		);
	});
});
