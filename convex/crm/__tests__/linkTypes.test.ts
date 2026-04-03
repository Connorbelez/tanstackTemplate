/**
 * LinkType CRUD tests.
 *
 * Covers: creation, deactivation, listing, org isolation,
 * and active-link blocking on deactivation.
 */

import { ConvexError } from "convex/values";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { registerAuditLogComponent } from "../../../src/test/convex/registerAuditLogComponent";
import { api } from "../../_generated/api";
import schema from "../../schema";
import { convexModules } from "../../test/moduleMaps";

const modules = convexModules;

// ── Identity fixtures ───────────────────────────────────────────────

const ORG_A = "org_a_test";
const ORG_B = "org_b_test";

const ADMIN_A = {
	subject: "user_admin_a",
	issuer: "https://api.workos.com",
	org_id: ORG_A,
	organization_name: "Org A",
	role: "admin",
	roles: JSON.stringify(["admin"]),
	permissions: JSON.stringify([]),
	user_email: "admin@orga.test",
	user_first_name: "Admin",
	user_last_name: "A",
};

const ADMIN_B = {
	subject: "user_admin_b",
	issuer: "https://api.workos.com",
	org_id: ORG_B,
	organization_name: "Org B",
	role: "admin",
	roles: JSON.stringify(["admin"]),
	permissions: JSON.stringify([]),
	user_email: "admin@orgb.test",
	user_first_name: "Admin",
	user_last_name: "B",
};

// ── Helpers ─────────────────────────────────────────────────────────

type TestHarness = ReturnType<typeof convexTest>;

function createTest() {
	const t = convexTest(schema, modules);
	registerAuditLogComponent(t, "auditLog");
	return t;
}

async function seedObjectDefs(
	t: TestHarness,
	orgId: string,
	opts?: { inactiveTarget?: boolean }
) {
	return t.run(async (ctx) => {
		const now = Date.now();
		const sourceId = await ctx.db.insert("objectDefs", {
			orgId,
			name: "Contact",
			singularLabel: "Contact",
			pluralLabel: "Contacts",
			icon: "user",
			isSystem: false,
			isActive: true,
			displayOrder: 0,
			createdAt: now,
			updatedAt: now,
			createdBy: "test",
		});
		const targetId = await ctx.db.insert("objectDefs", {
			orgId,
			name: "Company",
			singularLabel: "Company",
			pluralLabel: "Companies",
			icon: "building",
			isSystem: false,
			isActive: !opts?.inactiveTarget,
			displayOrder: 1,
			createdAt: now,
			updatedAt: now,
			createdBy: "test",
		});
		return { sourceId, targetId };
	});
}

// ── Tests ───────────────────────────────────────────────────────────

describe("createLinkType", () => {
	it("creates a linkTypeDef successfully", async () => {
		const t = createTest();
		const asAdmin = t.withIdentity(ADMIN_A);
		const { sourceId, targetId } = await seedObjectDefs(t, ORG_A);

		const linkTypeId = await asAdmin.mutation(
			api.crm.linkTypes.createLinkType,
			{
				name: "Works At",
				sourceObjectDefId: sourceId,
				targetObjectDefId: targetId,
				cardinality: "many_to_many",
			}
		);

		expect(linkTypeId).toBeDefined();

		const listed = await asAdmin.query(api.crm.linkTypes.listLinkTypes, {});
		expect(listed).toHaveLength(1);
		expect(listed[0].name).toBe("Works At");
		expect(listed[0].cardinality).toBe("many_to_many");
	});

	it("rejects inactive source objectDef", async () => {
		const t = createTest();
		const asAdmin = t.withIdentity(ADMIN_A);
		const { targetId } = await seedObjectDefs(t, ORG_A);

		const inactiveSourceId = await t.run(async (ctx) => {
			return ctx.db.insert("objectDefs", {
				orgId: ORG_A,
				name: "Inactive",
				singularLabel: "Inactive",
				pluralLabel: "Inactives",
				icon: "x",
				isSystem: false,
				isActive: false,
				displayOrder: 0,
				createdAt: Date.now(),
				updatedAt: Date.now(),
				createdBy: "test",
			});
		});

		await expect(
			asAdmin.mutation(api.crm.linkTypes.createLinkType, {
				name: "Bad Link",
				sourceObjectDefId: inactiveSourceId,
				targetObjectDefId: targetId,
				cardinality: "one_to_one",
			})
		).rejects.toThrow("Source object is not active");
	});

	it("rejects inactive target objectDef", async () => {
		const t = createTest();
		const asAdmin = t.withIdentity(ADMIN_A);
		const { sourceId, targetId } = await seedObjectDefs(t, ORG_A, {
			inactiveTarget: true,
		});

		await expect(
			asAdmin.mutation(api.crm.linkTypes.createLinkType, {
				name: "Bad Link",
				sourceObjectDefId: sourceId,
				targetObjectDefId: targetId,
				cardinality: "one_to_one",
			})
		).rejects.toThrow("Target object is not active");
	});

	it("rejects cross-org objectDef", async () => {
		const t = createTest();
		const asAdmin = t.withIdentity(ADMIN_A);
		const orgA = await seedObjectDefs(t, ORG_A);
		const orgB = await seedObjectDefs(t, ORG_B);

		await expect(
			asAdmin.mutation(api.crm.linkTypes.createLinkType, {
				name: "Cross Org",
				sourceObjectDefId: orgA.sourceId,
				targetObjectDefId: orgB.targetId,
				cardinality: "one_to_one",
			})
		).rejects.toThrow(ConvexError);
	});
});

describe("deactivateLinkType", () => {
	it("deactivates when no active links exist", async () => {
		const t = createTest();
		const asAdmin = t.withIdentity(ADMIN_A);
		const { sourceId, targetId } = await seedObjectDefs(t, ORG_A);

		const linkTypeId = await asAdmin.mutation(
			api.crm.linkTypes.createLinkType,
			{
				name: "To Deactivate",
				sourceObjectDefId: sourceId,
				targetObjectDefId: targetId,
				cardinality: "many_to_many",
			}
		);

		await asAdmin.mutation(api.crm.linkTypes.deactivateLinkType, {
			linkTypeDefId: linkTypeId,
		});

		const listed = await asAdmin.query(api.crm.linkTypes.listLinkTypes, {});
		expect(listed).toHaveLength(0);
	});

	it("blocks deactivation when active links exist", async () => {
		const t = createTest();
		const asAdmin = t.withIdentity(ADMIN_A);
		const { sourceId, targetId } = await seedObjectDefs(t, ORG_A);

		const linkTypeId = await asAdmin.mutation(
			api.crm.linkTypes.createLinkType,
			{
				name: "Has Links",
				sourceObjectDefId: sourceId,
				targetObjectDefId: targetId,
				cardinality: "many_to_many",
			}
		);

		// Seed an active recordLink directly
		await t.run(async (ctx) => {
			const recA = await ctx.db.insert("records", {
				orgId: ORG_A,
				objectDefId: sourceId,
				isDeleted: false,
				createdAt: Date.now(),
				updatedAt: Date.now(),
				createdBy: "test",
			});
			const recB = await ctx.db.insert("records", {
				orgId: ORG_A,
				objectDefId: targetId,
				isDeleted: false,
				createdAt: Date.now(),
				updatedAt: Date.now(),
				createdBy: "test",
			});
			await ctx.db.insert("recordLinks", {
				orgId: ORG_A,
				linkTypeDefId: linkTypeId,
				sourceObjectDefId: sourceId,
				sourceKind: "record",
				sourceId: recA as string,
				targetObjectDefId: targetId,
				targetKind: "record",
				targetId: recB as string,
				isDeleted: false,
				createdAt: Date.now(),
				createdBy: "test",
			});
		});

		await expect(
			asAdmin.mutation(api.crm.linkTypes.deactivateLinkType, {
				linkTypeDefId: linkTypeId,
			})
		).rejects.toThrow("active record links exist");
	});

	it("allows deactivation after all links are soft-deleted", async () => {
		const t = createTest();
		const asAdmin = t.withIdentity(ADMIN_A);
		const { sourceId, targetId } = await seedObjectDefs(t, ORG_A);

		const linkTypeId = await asAdmin.mutation(
			api.crm.linkTypes.createLinkType,
			{
				name: "Soft Deleted Links",
				sourceObjectDefId: sourceId,
				targetObjectDefId: targetId,
				cardinality: "many_to_many",
			}
		);

		await t.run(async (ctx) => {
			const recA = await ctx.db.insert("records", {
				orgId: ORG_A,
				objectDefId: sourceId,
				isDeleted: false,
				createdAt: Date.now(),
				updatedAt: Date.now(),
				createdBy: "test",
			});
			const recB = await ctx.db.insert("records", {
				orgId: ORG_A,
				objectDefId: targetId,
				isDeleted: false,
				createdAt: Date.now(),
				updatedAt: Date.now(),
				createdBy: "test",
			});
			await ctx.db.insert("recordLinks", {
				orgId: ORG_A,
				linkTypeDefId: linkTypeId,
				sourceObjectDefId: sourceId,
				sourceKind: "record",
				sourceId: recA as string,
				targetObjectDefId: targetId,
				targetKind: "record",
				targetId: recB as string,
				isDeleted: true,
				createdAt: Date.now(),
				createdBy: "test",
			});
		});

		await asAdmin.mutation(api.crm.linkTypes.deactivateLinkType, {
			linkTypeDefId: linkTypeId,
		});

		const listed = await asAdmin.query(api.crm.linkTypes.listLinkTypes, {});
		expect(listed).toHaveLength(0);
	});

	it("rejects cross-org deactivation", async () => {
		const t = createTest();
		const asAdminA = t.withIdentity(ADMIN_A);
		const asAdminB = t.withIdentity(ADMIN_B);
		const { sourceId, targetId } = await seedObjectDefs(t, ORG_A);

		const linkTypeId = await asAdminA.mutation(
			api.crm.linkTypes.createLinkType,
			{
				name: "Org A Type",
				sourceObjectDefId: sourceId,
				targetObjectDefId: targetId,
				cardinality: "many_to_many",
			}
		);

		await expect(
			asAdminB.mutation(api.crm.linkTypes.deactivateLinkType, {
				linkTypeDefId: linkTypeId,
			})
		).rejects.toThrow(ConvexError);
	});
});

describe("listLinkTypes", () => {
	it("returns only active link types for the current org", async () => {
		const t = createTest();
		const asAdminA = t.withIdentity(ADMIN_A);
		const asAdminB = t.withIdentity(ADMIN_B);
		const orgA = await seedObjectDefs(t, ORG_A);
		const orgB = await seedObjectDefs(t, ORG_B);

		await asAdminA.mutation(api.crm.linkTypes.createLinkType, {
			name: "Type 1",
			sourceObjectDefId: orgA.sourceId,
			targetObjectDefId: orgA.targetId,
			cardinality: "one_to_one",
		});
		const type2Id = await asAdminA.mutation(api.crm.linkTypes.createLinkType, {
			name: "Type 2",
			sourceObjectDefId: orgA.sourceId,
			targetObjectDefId: orgA.targetId,
			cardinality: "many_to_many",
		});
		await asAdminB.mutation(api.crm.linkTypes.createLinkType, {
			name: "Org B Type",
			sourceObjectDefId: orgB.sourceId,
			targetObjectDefId: orgB.targetId,
			cardinality: "one_to_many",
		});

		await asAdminA.mutation(api.crm.linkTypes.deactivateLinkType, {
			linkTypeDefId: type2Id,
		});

		const listedA = await asAdminA.query(api.crm.linkTypes.listLinkTypes, {});
		expect(listedA).toHaveLength(1);
		expect(listedA[0].name).toBe("Type 1");

		const listedB = await asAdminB.query(api.crm.linkTypes.listLinkTypes, {});
		expect(listedB).toHaveLength(1);
		expect(listedB[0].name).toBe("Org B Type");
	});
});
