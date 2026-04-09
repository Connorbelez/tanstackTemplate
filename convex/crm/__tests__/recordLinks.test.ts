/**
 * Record link mutation tests.
 *
 * Covers: cardinality enforcement (one_to_one, one_to_many, many_to_many),
 * duplicate detection (forward + reverse), org isolation, and soft-delete.
 */

import { ConvexError } from "convex/values";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import schema from "../../schema";
import { convexModules } from "../../test/moduleMaps";
import { registerAuditLogComponent } from "../../test/registerAuditLogComponent";

const modules = convexModules;

// ── Identity fixtures ───────────────────────────────────────────────

const ORG_A = "org_a_test";
const ORG_B = "org_b_test";

const USER_A = {
	subject: "user_a",
	issuer: "https://api.workos.com",
	org_id: ORG_A,
	organization_name: "Org A",
	role: "admin",
	roles: JSON.stringify(["admin"]),
	permissions: JSON.stringify([]),
	user_email: "user@orga.test",
	user_first_name: "User",
	user_last_name: "A",
};

const USER_B = {
	subject: "user_b",
	issuer: "https://api.workos.com",
	org_id: ORG_B,
	organization_name: "Org B",
	role: "admin",
	roles: JSON.stringify(["admin"]),
	permissions: JSON.stringify([]),
	user_email: "user@orgb.test",
	user_first_name: "User",
	user_last_name: "B",
};

// ── Helpers ─────────────────────────────────────────────────────────

type TestHarness = ReturnType<typeof convexTest>;
type Cardinality = "one_to_one" | "one_to_many" | "many_to_many";

function createTest() {
	const t = convexTest(schema, modules);
	registerAuditLogComponent(t, "auditLog");
	return t;
}

interface TestFixture {
	linkTypeDefId: Id<"linkTypeDefs">;
	recordA: Id<"records">;
	recordB: Id<"records">;
	recordC: Id<"records">;
	sourceObjectDefId: Id<"objectDefs">;
	targetObjectDefId: Id<"objectDefs">;
}

async function seedFixture(
	t: TestHarness,
	orgId: string,
	cardinality: Cardinality
): Promise<TestFixture> {
	return t.run(async (ctx) => {
		const now = Date.now();
		const sourceObjectDefId = await ctx.db.insert("objectDefs", {
			orgId,
			name: "Person",
			singularLabel: "Person",
			pluralLabel: "People",
			icon: "user",
			isSystem: false,
			isActive: true,
			displayOrder: 0,
			createdAt: now,
			updatedAt: now,
			createdBy: "test",
		});
		const targetObjectDefId = await ctx.db.insert("objectDefs", {
			orgId,
			name: "Organization",
			singularLabel: "Organization",
			pluralLabel: "Organizations",
			icon: "building",
			isSystem: false,
			isActive: true,
			displayOrder: 1,
			createdAt: now,
			updatedAt: now,
			createdBy: "test",
		});
		const linkTypeDefId = await ctx.db.insert("linkTypeDefs", {
			orgId,
			name: "Employed By",
			sourceObjectDefId,
			targetObjectDefId,
			cardinality,
			isActive: true,
			createdAt: now,
		});
		const recordA = await ctx.db.insert("records", {
			orgId,
			objectDefId: sourceObjectDefId,
			isDeleted: false,
			createdAt: now,
			updatedAt: now,
			createdBy: "test",
		});
		const recordB = await ctx.db.insert("records", {
			orgId,
			objectDefId: sourceObjectDefId,
			isDeleted: false,
			createdAt: now,
			updatedAt: now,
			createdBy: "test",
		});
		const recordC = await ctx.db.insert("records", {
			orgId,
			objectDefId: targetObjectDefId,
			isDeleted: false,
			createdAt: now,
			updatedAt: now,
			createdBy: "test",
		});
		return {
			sourceObjectDefId,
			targetObjectDefId,
			linkTypeDefId,
			recordA,
			recordB,
			recordC,
		};
	});
}

// ── Cardinality tests ───────────────────────────────────────────────

describe("cardinality: one_to_one", () => {
	it("allows a single link", async () => {
		const t = createTest();
		const asUser = t.withIdentity(USER_A);
		const f = await seedFixture(t, ORG_A, "one_to_one");

		const linkId = await asUser.mutation(api.crm.recordLinks.createLink, {
			linkTypeDefId: f.linkTypeDefId,
			sourceKind: "record",
			sourceId: f.recordA as string,
			targetKind: "record",
			targetId: f.recordC as string,
		});
		expect(linkId).toBeDefined();
	});

	it("blocks second outbound link from same source", async () => {
		const t = createTest();
		const asUser = t.withIdentity(USER_A);
		const f = await seedFixture(t, ORG_A, "one_to_one");

		const recordD = await t.run(async (ctx) => {
			return ctx.db.insert("records", {
				orgId: ORG_A,
				objectDefId: f.targetObjectDefId,
				isDeleted: false,
				createdAt: Date.now(),
				updatedAt: Date.now(),
				createdBy: "test",
			});
		});

		await asUser.mutation(api.crm.recordLinks.createLink, {
			linkTypeDefId: f.linkTypeDefId,
			sourceKind: "record",
			sourceId: f.recordA as string,
			targetKind: "record",
			targetId: f.recordC as string,
		});

		await expect(
			asUser.mutation(api.crm.recordLinks.createLink, {
				linkTypeDefId: f.linkTypeDefId,
				sourceKind: "record",
				sourceId: f.recordA as string,
				targetKind: "record",
				targetId: recordD as string,
			})
		).rejects.toThrow("source already has a link");
	});

	it("blocks second inbound link to same target", async () => {
		const t = createTest();
		const asUser = t.withIdentity(USER_A);
		const f = await seedFixture(t, ORG_A, "one_to_one");

		await asUser.mutation(api.crm.recordLinks.createLink, {
			linkTypeDefId: f.linkTypeDefId,
			sourceKind: "record",
			sourceId: f.recordA as string,
			targetKind: "record",
			targetId: f.recordC as string,
		});

		await expect(
			asUser.mutation(api.crm.recordLinks.createLink, {
				linkTypeDefId: f.linkTypeDefId,
				sourceKind: "record",
				sourceId: f.recordB as string,
				targetKind: "record",
				targetId: f.recordC as string,
			})
		).rejects.toThrow("target already has");
	});
});

describe("cardinality: one_to_many", () => {
	it("allows one source to link to many targets", async () => {
		const t = createTest();
		const asUser = t.withIdentity(USER_A);
		const f = await seedFixture(t, ORG_A, "one_to_many");

		const recordD = await t.run(async (ctx) => {
			return ctx.db.insert("records", {
				orgId: ORG_A,
				objectDefId: f.targetObjectDefId,
				isDeleted: false,
				createdAt: Date.now(),
				updatedAt: Date.now(),
				createdBy: "test",
			});
		});

		await asUser.mutation(api.crm.recordLinks.createLink, {
			linkTypeDefId: f.linkTypeDefId,
			sourceKind: "record",
			sourceId: f.recordA as string,
			targetKind: "record",
			targetId: f.recordC as string,
		});

		const secondLink = await asUser.mutation(api.crm.recordLinks.createLink, {
			linkTypeDefId: f.linkTypeDefId,
			sourceKind: "record",
			sourceId: f.recordA as string,
			targetKind: "record",
			targetId: recordD as string,
		});
		expect(secondLink).toBeDefined();
	});

	it("blocks second inbound link to same target", async () => {
		const t = createTest();
		const asUser = t.withIdentity(USER_A);
		const f = await seedFixture(t, ORG_A, "one_to_many");

		await asUser.mutation(api.crm.recordLinks.createLink, {
			linkTypeDefId: f.linkTypeDefId,
			sourceKind: "record",
			sourceId: f.recordA as string,
			targetKind: "record",
			targetId: f.recordC as string,
		});

		await expect(
			asUser.mutation(api.crm.recordLinks.createLink, {
				linkTypeDefId: f.linkTypeDefId,
				sourceKind: "record",
				sourceId: f.recordB as string,
				targetKind: "record",
				targetId: f.recordC as string,
			})
		).rejects.toThrow("target already has an inbound link");
	});
});

describe("cardinality: many_to_many", () => {
	it("allows unlimited links", async () => {
		const t = createTest();
		const asUser = t.withIdentity(USER_A);
		const f = await seedFixture(t, ORG_A, "many_to_many");

		const recordD = await t.run(async (ctx) => {
			return ctx.db.insert("records", {
				orgId: ORG_A,
				objectDefId: f.targetObjectDefId,
				isDeleted: false,
				createdAt: Date.now(),
				updatedAt: Date.now(),
				createdBy: "test",
			});
		});

		await asUser.mutation(api.crm.recordLinks.createLink, {
			linkTypeDefId: f.linkTypeDefId,
			sourceKind: "record",
			sourceId: f.recordA as string,
			targetKind: "record",
			targetId: f.recordC as string,
		});
		await asUser.mutation(api.crm.recordLinks.createLink, {
			linkTypeDefId: f.linkTypeDefId,
			sourceKind: "record",
			sourceId: f.recordB as string,
			targetKind: "record",
			targetId: f.recordC as string,
		});
		const thirdLink = await asUser.mutation(api.crm.recordLinks.createLink, {
			linkTypeDefId: f.linkTypeDefId,
			sourceKind: "record",
			sourceId: f.recordA as string,
			targetKind: "record",
			targetId: recordD as string,
		});
		expect(thirdLink).toBeDefined();
	});
});

describe("soft-deleted links don't count toward cardinality", () => {
	it("allows re-linking after soft-delete in one_to_one", async () => {
		const t = createTest();
		const asUser = t.withIdentity(USER_A);
		const f = await seedFixture(t, ORG_A, "one_to_one");

		const linkId = await asUser.mutation(api.crm.recordLinks.createLink, {
			linkTypeDefId: f.linkTypeDefId,
			sourceKind: "record",
			sourceId: f.recordA as string,
			targetKind: "record",
			targetId: f.recordC as string,
		});

		await asUser.mutation(api.crm.recordLinks.deleteLink, { linkId });

		const newLinkId = await asUser.mutation(api.crm.recordLinks.createLink, {
			linkTypeDefId: f.linkTypeDefId,
			sourceKind: "record",
			sourceId: f.recordA as string,
			targetKind: "record",
			targetId: f.recordC as string,
		});
		expect(newLinkId).toBeDefined();
		expect(newLinkId).not.toBe(linkId);
	});
});

// ── Duplicate detection ─────────────────────────────────────────────

describe("duplicate detection", () => {
	it("rejects exact duplicate link", async () => {
		const t = createTest();
		const asUser = t.withIdentity(USER_A);
		const f = await seedFixture(t, ORG_A, "many_to_many");

		await asUser.mutation(api.crm.recordLinks.createLink, {
			linkTypeDefId: f.linkTypeDefId,
			sourceKind: "record",
			sourceId: f.recordA as string,
			targetKind: "record",
			targetId: f.recordC as string,
		});

		await expect(
			asUser.mutation(api.crm.recordLinks.createLink, {
				linkTypeDefId: f.linkTypeDefId,
				sourceKind: "record",
				sourceId: f.recordA as string,
				targetKind: "record",
				targetId: f.recordC as string,
			})
		).rejects.toThrow("already exists");
	});

	it("rejects reverse-direction duplicate (B→A after A→B)", async () => {
		const t = createTest();
		const asUser = t.withIdentity(USER_A);

		// Self-referential link type so both A→B and B→A are structurally valid
		const fixture = await t.run(async (ctx) => {
			const now = Date.now();
			const objectDefId = await ctx.db.insert("objectDefs", {
				orgId: ORG_A,
				name: "Person",
				singularLabel: "Person",
				pluralLabel: "People",
				icon: "user",
				isSystem: false,
				isActive: true,
				displayOrder: 0,
				createdAt: now,
				updatedAt: now,
				createdBy: "test",
			});
			const linkTypeDefId = await ctx.db.insert("linkTypeDefs", {
				orgId: ORG_A,
				name: "Knows",
				sourceObjectDefId: objectDefId,
				targetObjectDefId: objectDefId,
				cardinality: "many_to_many",
				isActive: true,
				createdAt: now,
			});
			const recordA = await ctx.db.insert("records", {
				orgId: ORG_A,
				objectDefId,
				isDeleted: false,
				createdAt: now,
				updatedAt: now,
				createdBy: "test",
			});
			const recordB = await ctx.db.insert("records", {
				orgId: ORG_A,
				objectDefId,
				isDeleted: false,
				createdAt: now,
				updatedAt: now,
				createdBy: "test",
			});
			return { linkTypeDefId, recordA, recordB };
		});

		// Create forward link: A → B
		await asUser.mutation(api.crm.recordLinks.createLink, {
			linkTypeDefId: fixture.linkTypeDefId,
			sourceKind: "record",
			sourceId: fixture.recordA as string,
			targetKind: "record",
			targetId: fixture.recordB as string,
		});

		// Attempt reverse link: B → A — should be rejected as duplicate
		await expect(
			asUser.mutation(api.crm.recordLinks.createLink, {
				linkTypeDefId: fixture.linkTypeDefId,
				sourceKind: "record",
				sourceId: fixture.recordB as string,
				targetKind: "record",
				targetId: fixture.recordA as string,
			})
		).rejects.toThrow("already exists");
	});

	it("allows same entities with different linkTypeDefId", async () => {
		const t = createTest();
		const asUser = t.withIdentity(USER_A);
		const f = await seedFixture(t, ORG_A, "many_to_many");

		const secondLinkTypeId = await t.run(async (ctx) => {
			return ctx.db.insert("linkTypeDefs", {
				orgId: ORG_A,
				name: "Owns",
				sourceObjectDefId: f.sourceObjectDefId,
				targetObjectDefId: f.targetObjectDefId,
				cardinality: "many_to_many",
				isActive: true,
				createdAt: Date.now(),
			});
		});

		await asUser.mutation(api.crm.recordLinks.createLink, {
			linkTypeDefId: f.linkTypeDefId,
			sourceKind: "record",
			sourceId: f.recordA as string,
			targetKind: "record",
			targetId: f.recordC as string,
		});

		const secondLink = await asUser.mutation(api.crm.recordLinks.createLink, {
			linkTypeDefId: secondLinkTypeId,
			sourceKind: "record",
			sourceId: f.recordA as string,
			targetKind: "record",
			targetId: f.recordC as string,
		});
		expect(secondLink).toBeDefined();
	});

	it("allows re-creation after soft-delete", async () => {
		const t = createTest();
		const asUser = t.withIdentity(USER_A);
		const f = await seedFixture(t, ORG_A, "many_to_many");

		const linkId = await asUser.mutation(api.crm.recordLinks.createLink, {
			linkTypeDefId: f.linkTypeDefId,
			sourceKind: "record",
			sourceId: f.recordA as string,
			targetKind: "record",
			targetId: f.recordC as string,
		});

		await asUser.mutation(api.crm.recordLinks.deleteLink, { linkId });

		const newId = await asUser.mutation(api.crm.recordLinks.createLink, {
			linkTypeDefId: f.linkTypeDefId,
			sourceKind: "record",
			sourceId: f.recordA as string,
			targetKind: "record",
			targetId: f.recordC as string,
		});
		expect(newId).toBeDefined();
	});
});

// ── Org isolation ───────────────────────────────────────────────────

describe("org isolation", () => {
	it("rejects link creation using another org's linkTypeDef", async () => {
		const t = createTest();
		const asUserB = t.withIdentity(USER_B);
		const orgAFixture = await seedFixture(t, ORG_A, "many_to_many");

		await expect(
			asUserB.mutation(api.crm.recordLinks.createLink, {
				linkTypeDefId: orgAFixture.linkTypeDefId,
				sourceKind: "record",
				sourceId: orgAFixture.recordA as string,
				targetKind: "record",
				targetId: orgAFixture.recordC as string,
			})
		).rejects.toThrow(ConvexError);
	});

	it("rejects deleteLink from another org", async () => {
		const t = createTest();
		const asUserA = t.withIdentity(USER_A);
		const asUserB = t.withIdentity(USER_B);
		const f = await seedFixture(t, ORG_A, "many_to_many");

		const linkId = await asUserA.mutation(api.crm.recordLinks.createLink, {
			linkTypeDefId: f.linkTypeDefId,
			sourceKind: "record",
			sourceId: f.recordA as string,
			targetKind: "record",
			targetId: f.recordC as string,
		});

		await expect(
			asUserB.mutation(api.crm.recordLinks.deleteLink, { linkId })
		).rejects.toThrow(ConvexError);
	});
});

// ── Soft-delete ─────────────────────────────────────────────────────

describe("soft-delete", () => {
	it("sets isDeleted=true without hard deleting", async () => {
		const t = createTest();
		const asUser = t.withIdentity(USER_A);
		const f = await seedFixture(t, ORG_A, "many_to_many");

		const linkId = await asUser.mutation(api.crm.recordLinks.createLink, {
			linkTypeDefId: f.linkTypeDefId,
			sourceKind: "record",
			sourceId: f.recordA as string,
			targetKind: "record",
			targetId: f.recordC as string,
		});

		await asUser.mutation(api.crm.recordLinks.deleteLink, { linkId });

		const link = await t.run(async (ctx) => ctx.db.get(linkId));
		expect(link).not.toBeNull();
		expect(link?.isDeleted).toBe(true);
	});

	it("rejects deleting an already-deleted link", async () => {
		const t = createTest();
		const asUser = t.withIdentity(USER_A);
		const f = await seedFixture(t, ORG_A, "many_to_many");

		const linkId = await asUser.mutation(api.crm.recordLinks.createLink, {
			linkTypeDefId: f.linkTypeDefId,
			sourceKind: "record",
			sourceId: f.recordA as string,
			targetKind: "record",
			targetId: f.recordC as string,
		});

		await asUser.mutation(api.crm.recordLinks.deleteLink, { linkId });

		await expect(
			asUser.mutation(api.crm.recordLinks.deleteLink, { linkId })
		).rejects.toThrow("already deleted");
	});
});
