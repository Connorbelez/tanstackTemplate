/**
 * System Adapter tests — resolveColumnPath (pure), queryNativeTable, and
 * the UnifiedRecord contract between EAV and native records.
 *
 * Covers:
 * - resolveColumnPath: simple field mapping, nested paths, date coercion, missing paths
 * - queryNativeTable: org-scoped queries via bootstrap + native seeding
 * - UnifiedRecord contract: EAV and native records share identical top-level keys
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
	asAdmin,
	CRM_ADMIN_IDENTITY,
	type CrmTestHarness,
	createCrmTestHarness,
	seedObjectWithFields,
	seedRecord,
} from "../../../src/test/convex/crm/helpers";
import { api, internal } from "../../_generated/api";
import type { Doc } from "../../_generated/dataModel";
import { resolveColumnPath } from "../systemAdapters/columnResolver";

// ── Helper: build a minimal fieldDef-like object for resolveColumnPath ──

const makeFieldDef = (nativeColumnPath: string, fieldType: string) =>
	({
		nativeColumnPath,
		fieldType,
	}) as Doc<"fieldDefs">;

// ═══════════════════════════════════════════════════════════════════════
// resolveColumnPath (pure function — no convex-test needed)
// ═══════════════════════════════════════════════════════════════════════

describe("resolveColumnPath", () => {
	it("maps simple field name to document property", () => {
		const doc = { principal: 500_000, status: "active" };
		const result = resolveColumnPath(
			doc,
			makeFieldDef("principal", "currency")
		);
		expect(result).toBe(500_000);
	});

	it("handles nested paths (dot notation)", () => {
		const doc = { terms: { interestRate: 5.25 } };
		const result = resolveColumnPath(
			doc,
			makeFieldDef("terms.interestRate", "percentage")
		);
		expect(result).toBe(5.25);
	});

	it("coerces string date to unix ms for date fields", () => {
		const doc = { maturityDate: "2031-03-01" };
		const result = resolveColumnPath(doc, makeFieldDef("maturityDate", "date"));
		expect(result).toBe(Date.parse("2031-03-01"));
	});

	it("coerces string date to unix ms for datetime fields", () => {
		const doc = { createdAt: "2025-06-15T10:30:00Z" };
		const result = resolveColumnPath(
			doc,
			makeFieldDef("createdAt", "datetime")
		);
		expect(result).toBe(Date.parse("2025-06-15T10:30:00Z"));
	});

	it("returns undefined for invalid date string", () => {
		const doc = { maturityDate: "not-a-date" };
		const result = resolveColumnPath(doc, makeFieldDef("maturityDate", "date"));
		expect(result).toBeUndefined();
	});

	it("returns undefined for missing path", () => {
		const doc = { foo: "bar" };
		expect(
			resolveColumnPath(doc, makeFieldDef("missing", "text"))
		).toBeUndefined();
	});

	it("returns undefined when nativeColumnPath is empty", () => {
		const doc = { principal: 500_000 };
		expect(
			resolveColumnPath(doc, makeFieldDef("", "currency"))
		).toBeUndefined();
	});

	it("returns undefined for deeply nested missing path", () => {
		const doc = { level1: { level2: "found" } };
		expect(
			resolveColumnPath(doc, makeFieldDef("level1.level2.level3", "text"))
		).toBeUndefined();
	});

	it("passes through non-date string values as-is", () => {
		const doc = { status: "active" };
		const result = resolveColumnPath(doc, makeFieldDef("status", "text"));
		expect(result).toBe("active");
	});

	it("passes through numeric values for non-date fields", () => {
		const doc = { maturityDate: 1_893_456_000_000 };
		const result = resolveColumnPath(doc, makeFieldDef("maturityDate", "date"));
		// numeric date values are passed through (coercion only applies to strings)
		expect(result).toBe(1_893_456_000_000);
	});
});

// ═══════════════════════════════════════════════════════════════════════
// queryNativeTable — requires convex-test with seeded native rows
// ═══════════════════════════════════════════════════════════════════════

describe("queryNativeTable", () => {
	let t: CrmTestHarness;
	const ORG_ID = CRM_ADMIN_IDENTITY.org_id;

	beforeEach(() => {
		t = createCrmTestHarness();
	});

	it("returns documents from mortgages table via queryRecords", async () => {
		// Seed prerequisite rows: user, broker, property
		const { propertyId, brokerId } = await t.run(async (ctx) => {
			const userId = await ctx.db.insert("users", {
				authId: "test-user-for-broker",
				email: "broker@test.ca",
				firstName: "Test",
				lastName: "Broker",
			});
			const brokerId = await ctx.db.insert("brokers", {
				status: "active",
				userId,
				orgId: ORG_ID,
				createdAt: Date.now(),
			});
			const propertyId = await ctx.db.insert("properties", {
				streetAddress: "123 Main St",
				city: "Toronto",
				province: "ON",
				postalCode: "M5V1A1",
				propertyType: "residential",
				createdAt: Date.now(),
			});
			return { propertyId, brokerId };
		});

		// Seed a mortgage row
		await t.run(async (ctx) => {
			await ctx.db.insert("mortgages", {
				orgId: ORG_ID,
				status: "active",
				propertyId,
				principal: 500_000,
				interestRate: 5.25,
				rateType: "fixed",
				termMonths: 60,
				amortizationMonths: 300,
				paymentAmount: 2800,
				paymentFrequency: "monthly",
				loanType: "conventional",
				lienPosition: 1,
				interestAdjustmentDate: "2026-04-01",
				termStartDate: "2026-04-01",
				maturityDate: "2031-03-01",
				firstPaymentDate: "2026-05-01",
				brokerOfRecordId: brokerId,
				createdAt: Date.now(),
			});
		});

		// Bootstrap system objects so objectDefs/fieldDefs exist
		await t.mutation(
			internal.crm.systemAdapters.bootstrap.bootstrapSystemObjects,
			{ orgId: ORG_ID }
		);

		// Find the mortgage objectDef
		const mortgageObjDef = await t.run(async (ctx) => {
			return ctx.db
				.query("objectDefs")
				.withIndex("by_org_name", (q) =>
					q.eq("orgId", ORG_ID).eq("name", "mortgage")
				)
				.first();
		});
		expect(mortgageObjDef).not.toBeNull();
		if (!mortgageObjDef) {
			throw new Error("unreachable");
		}

		// Query via the public API
		const result = await asAdmin(t).query(api.crm.recordQueries.queryRecords, {
			objectDefId: mortgageObjDef._id,
			paginationOpts: { numItems: 25, cursor: null },
		});

		expect(result.records).toHaveLength(1);
		expect(result.records[0]._kind).toBe("native");
		expect(result.records[0].fields.principal).toBe(500_000);
		expect(result.records[0].fields.interestRate).toBe(5.25);
		expect(result.records[0].fields.status).toBe("active");
		expect(result.records[0].fields.maturityDate).toBe(
			Date.parse("2031-03-01")
		);
	});

	it("org-scoped: only returns docs from caller's org", async () => {
		const OTHER_ORG = "org_other_test_002";

		// Seed prerequisite rows
		const { propertyId, brokerId, otherBrokerId } = await t.run(async (ctx) => {
			const userId = await ctx.db.insert("users", {
				authId: "test-user-for-broker-2",
				email: "broker2@test.ca",
				firstName: "Test",
				lastName: "Broker2",
			});
			const brokerId = await ctx.db.insert("brokers", {
				status: "active",
				userId,
				orgId: ORG_ID,
				createdAt: Date.now(),
			});
			const otherUserId = await ctx.db.insert("users", {
				authId: "test-user-other-broker",
				email: "other-broker@test.ca",
				firstName: "Other",
				lastName: "Broker",
			});
			const otherBrokerId = await ctx.db.insert("brokers", {
				status: "active",
				userId: otherUserId,
				orgId: OTHER_ORG,
				createdAt: Date.now(),
			});
			const propertyId = await ctx.db.insert("properties", {
				streetAddress: "456 Oak Ave",
				city: "Vancouver",
				province: "BC",
				postalCode: "V6B2N2",
				propertyType: "residential",
				createdAt: Date.now(),
			});
			return { propertyId, brokerId, otherBrokerId };
		});

		// Seed mortgages for both orgs
		await t.run(async (ctx) => {
			await ctx.db.insert("mortgages", {
				orgId: ORG_ID,
				status: "active",
				propertyId,
				principal: 300_000,
				interestRate: 4.5,
				rateType: "fixed",
				termMonths: 36,
				amortizationMonths: 300,
				paymentAmount: 1800,
				paymentFrequency: "monthly",
				loanType: "conventional",
				lienPosition: 1,
				interestAdjustmentDate: "2026-04-01",
				termStartDate: "2026-04-01",
				maturityDate: "2029-03-01",
				firstPaymentDate: "2026-05-01",
				brokerOfRecordId: brokerId,
				createdAt: Date.now(),
			});
			await ctx.db.insert("mortgages", {
				orgId: OTHER_ORG,
				status: "active",
				propertyId,
				principal: 700_000,
				interestRate: 6.0,
				rateType: "variable",
				termMonths: 60,
				amortizationMonths: 300,
				paymentAmount: 4000,
				paymentFrequency: "bi_weekly",
				loanType: "insured",
				lienPosition: 1,
				interestAdjustmentDate: "2026-01-01",
				termStartDate: "2026-01-01",
				maturityDate: "2031-01-01",
				firstPaymentDate: "2026-02-01",
				brokerOfRecordId: otherBrokerId,
				createdAt: Date.now(),
			});
		});

		// Bootstrap for the admin's org only
		await t.mutation(
			internal.crm.systemAdapters.bootstrap.bootstrapSystemObjects,
			{ orgId: ORG_ID }
		);

		const mortgageObjDef = await t.run(async (ctx) => {
			return ctx.db
				.query("objectDefs")
				.withIndex("by_org_name", (q) =>
					q.eq("orgId", ORG_ID).eq("name", "mortgage")
				)
				.first();
		});

		if (!mortgageObjDef) {
			throw new Error("unreachable");
		}

		const result = await asAdmin(t).query(api.crm.recordQueries.queryRecords, {
			objectDefId: mortgageObjDef._id,
			paginationOpts: { numItems: 25, cursor: null },
		});

		// Should only see the mortgage for ORG_ID
		expect(result.records).toHaveLength(1);
		expect(result.records[0].fields.principal).toBe(300_000);
	});

	it("returns documents from borrowers table via queryRecords", async () => {
		// Seed a user + borrower for the default org
		await t.run(async (ctx) => {
			const userId = await ctx.db.insert("users", {
				authId: "test-user-borrower",
				email: "borrower@test.ca",
				firstName: "Alice",
				lastName: "Borrower",
			});
			await ctx.db.insert("borrowers", {
				status: "active",
				userId,
				orgId: ORG_ID,
				createdAt: Date.now(),
			});
		});

		// Bootstrap system objects (creates objectDefs for all native tables)
		await t.mutation(
			internal.crm.systemAdapters.bootstrap.bootstrapSystemObjects,
			{ orgId: ORG_ID }
		);

		const borrowerObjDef = await t.run(async (ctx) => {
			return ctx.db
				.query("objectDefs")
				.withIndex("by_org_name", (q) =>
					q.eq("orgId", ORG_ID).eq("name", "borrower")
				)
				.first();
		});
		expect(borrowerObjDef).not.toBeNull();
		if (!borrowerObjDef) {
			throw new Error("unreachable");
		}

		const result = await asAdmin(t).query(api.crm.recordQueries.queryRecords, {
			objectDefId: borrowerObjDef._id,
			paginationOpts: { numItems: 10, cursor: null },
		});

		expect(result.records).toHaveLength(1);
		expect(result.records[0]._kind).toBe("native");
	});

	it("returns documents from listings table via queryRecords", async () => {
		const { mortgageId, propertyId } = await t.run(async (ctx) => {
			const userId = await ctx.db.insert("users", {
				authId: "test-user-listing",
				email: "listing-broker@test.ca",
				firstName: "Lena",
				lastName: "Listing",
			});
			const brokerId = await ctx.db.insert("brokers", {
				status: "active",
				userId,
				orgId: ORG_ID,
				createdAt: Date.now(),
			});
			const propertyId = await ctx.db.insert("properties", {
				streetAddress: "789 King St W",
				city: "Toronto",
				province: "ON",
				postalCode: "M5V1M5",
				propertyType: "condo",
				createdAt: Date.now(),
			});
			const mortgageId = await ctx.db.insert("mortgages", {
				orgId: ORG_ID,
				status: "active",
				propertyId,
				principal: 425_000,
				interestRate: 5.1,
				rateType: "fixed",
				termMonths: 48,
				amortizationMonths: 300,
				paymentAmount: 2460,
				paymentFrequency: "monthly",
				loanType: "conventional",
				lienPosition: 1,
				interestAdjustmentDate: "2026-06-01",
				termStartDate: "2026-06-01",
				maturityDate: "2030-05-31",
				firstPaymentDate: "2026-07-01",
				brokerOfRecordId: brokerId,
				createdAt: Date.now(),
			});

			return { mortgageId, propertyId };
		});

		await t.run(async (ctx) => {
			await ctx.db.insert("listings", {
				mortgageId,
				propertyId,
				dataSource: "mortgage_pipeline",
				status: "draft",
				principal: 425_000,
				interestRate: 5.1,
				ltvRatio: 67.5,
				termMonths: 48,
				maturityDate: "2030-05-31",
				monthlyPayment: 2460,
				rateType: "fixed",
				paymentFrequency: "monthly",
				loanType: "conventional",
				lienPosition: 1,
				propertyType: "condo",
				city: "Toronto",
				province: "ON",
				latestAppraisalValueAsIs: 630_000,
				latestAppraisalDate: "2026-05-15",
				title: "Downtown First Mortgage",
				heroImages: [],
				featured: true,
				publicDocumentIds: [],
				viewCount: 12,
				createdAt: Date.now(),
				updatedAt: Date.now(),
			});
		});

		await t.mutation(
			internal.crm.systemAdapters.bootstrap.bootstrapSystemObjects,
			{ orgId: ORG_ID }
		);

		const listingObjDef = await t.run(async (ctx) => {
			return ctx.db
				.query("objectDefs")
				.withIndex("by_org_name", (q) =>
					q.eq("orgId", ORG_ID).eq("name", "listing")
				)
				.first();
		});
		expect(listingObjDef).not.toBeNull();
		if (!listingObjDef) {
			throw new Error("unreachable");
		}

		const result = await asAdmin(t).query(api.crm.recordQueries.queryRecords, {
			objectDefId: listingObjDef._id,
			paginationOpts: { numItems: 10, cursor: null },
		});

		expect(result.records).toHaveLength(1);
		expect(result.records[0]).toMatchObject({
			_kind: "native",
			nativeTable: "listings",
			fields: {
				city: "Toronto",
				interestRate: 5.1,
				principal: 425_000,
				status: "draft",
				title: "Downtown First Mortgage",
			},
		});
	});

	it("throws for unknown native table names", async () => {
		// Insert a fake objectDef with an unknown nativeTable value
		const fakeObjectDefId = await t.run(async (ctx) => {
			const now = Date.now();
			return ctx.db.insert("objectDefs", {
				orgId: ORG_ID,
				name: "fake_entity",
				singularLabel: "Fake",
				pluralLabel: "Fakes",
				icon: "x",
				isSystem: true,
				nativeTable: "nonexistent_native_table",
				isActive: true,
				displayOrder: 999,
				createdAt: now,
				updatedAt: now,
				createdBy: CRM_ADMIN_IDENTITY.subject,
			});
		});

		await expect(
			asAdmin(t).query(api.crm.recordQueries.queryRecords, {
				objectDefId: fakeObjectDefId,
				paginationOpts: { numItems: 5, cursor: null },
			})
		).rejects.toThrow();
	});
});

// ═══════════════════════════════════════════════════════════════════════
// UnifiedRecord contract — EAV vs native shape parity
// ═══════════════════════════════════════════════════════════════════════

describe("UnifiedRecord contract", () => {
	let t: CrmTestHarness;
	const ORG_ID = CRM_ADMIN_IDENTITY.org_id;

	beforeEach(() => {
		t = createCrmTestHarness();
	});

	it("EAV and native records have identical UnifiedRecord keys", async () => {
		// ── Create an EAV record ──
		const eavFixture = await seedObjectWithFields(t, {
			name: "contact",
			fields: [
				{ name: "full_name", fieldType: "text", isRequired: true },
				{ name: "email", fieldType: "email" },
			],
		});
		await seedRecord(t, eavFixture.objectDefId, {
			full_name: "Alice Doe",
			email: "alice@example.com",
		});

		const eavResult = await asAdmin(t).query(
			api.crm.recordQueries.queryRecords,
			{
				objectDefId: eavFixture.objectDefId,
				paginationOpts: { numItems: 25, cursor: null },
			}
		);
		expect(eavResult.records).toHaveLength(1);

		// ── Create a native record (mortgage) ──
		const { propertyId, brokerId } = await t.run(async (ctx) => {
			const userId = await ctx.db.insert("users", {
				authId: "test-user-unified",
				email: "unified@test.ca",
				firstName: "Unified",
				lastName: "Test",
			});
			const brokerId = await ctx.db.insert("brokers", {
				status: "active",
				userId,
				orgId: ORG_ID,
				createdAt: Date.now(),
			});
			const propertyId = await ctx.db.insert("properties", {
				streetAddress: "789 Elm St",
				city: "Calgary",
				province: "AB",
				postalCode: "T2P1J9",
				propertyType: "condo",
				createdAt: Date.now(),
			});
			return { propertyId, brokerId };
		});

		await t.run(async (ctx) => {
			await ctx.db.insert("mortgages", {
				orgId: ORG_ID,
				status: "active",
				propertyId,
				principal: 400_000,
				interestRate: 4.0,
				rateType: "fixed",
				termMonths: 48,
				amortizationMonths: 240,
				paymentAmount: 2200,
				paymentFrequency: "monthly",
				loanType: "conventional",
				lienPosition: 1,
				interestAdjustmentDate: "2026-05-01",
				termStartDate: "2026-05-01",
				maturityDate: "2030-05-01",
				firstPaymentDate: "2026-06-01",
				brokerOfRecordId: brokerId,
				createdAt: Date.now(),
			});
		});

		await t.mutation(
			internal.crm.systemAdapters.bootstrap.bootstrapSystemObjects,
			{ orgId: ORG_ID }
		);

		const mortgageObjDef = await t.run(async (ctx) => {
			return ctx.db
				.query("objectDefs")
				.withIndex("by_org_name", (q) =>
					q.eq("orgId", ORG_ID).eq("name", "mortgage")
				)
				.first();
		});

		if (!mortgageObjDef) {
			throw new Error("unreachable");
		}

		const nativeResult = await asAdmin(t).query(
			api.crm.recordQueries.queryRecords,
			{
				objectDefId: mortgageObjDef._id,
				paginationOpts: { numItems: 25, cursor: null },
			}
		);
		expect(nativeResult.records).toHaveLength(1);

		// ── Compare keys ──
		const eavRecord = eavResult.records[0];
		const nativeRecord = nativeResult.records[0];

		const eavKeys = Object.keys(eavRecord).sort();
		const nativeKeys = Object.keys(nativeRecord).sort();
		expect(eavKeys).toEqual(nativeKeys);
		expect(eavKeys).toEqual([
			"_id",
			"_kind",
			"createdAt",
			"fields",
			"nativeTable",
			"objectDefId",
			"updatedAt",
		]);
	});
});
