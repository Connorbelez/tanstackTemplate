/**
 * Deal access authorization tests.
 *
 * Covers: grant, revoke, query-level enforcement, admin bypass,
 * cross-deal isolation, idempotency, and soft-delete preservation.
 *
 * Uses convex-test with direct DB seeding (no full seed pipeline).
 */
import { ConvexError } from "convex/values";
import { convexTest } from "convex-test";
import { assert, beforeEach, describe, expect, it } from "vitest";
import { api, internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { FAIRLEND_STAFF_ORG_ID } from "../../constants";
import schema from "../../schema";

// ── Module glob ─────────────────────────────────────────────────────
const modules = import.meta.glob("/convex/**/*.ts");

// ── Identity fixtures ───────────────────────────────────────────────
const ADMIN_IDENTITY = {
	subject: "user_admin_test",
	issuer: "https://api.workos.com",
	org_id: FAIRLEND_STAFF_ORG_ID,
	organization_name: "FairLend Staff",
	role: "admin",
	roles: JSON.stringify(["admin"]),
	permissions: JSON.stringify(["deal:view", "deal:manage"]),
	user_email: "admin@fairlend.ca",
	user_first_name: "Test",
	user_last_name: "Admin",
};

const LAWYER_IDENTITY = {
	subject: "user_lawyer_test",
	issuer: "https://api.workos.com",
	org_id: "org_lawfirm_test",
	organization_name: "Test Law Firm",
	role: "lawyer",
	roles: JSON.stringify(["lawyer"]),
	permissions: JSON.stringify(["lawyer:access"]),
	user_email: "lawyer@test.fairlend.ca",
	user_first_name: "Test",
	user_last_name: "Lawyer",
};

const NO_ACCESS_IDENTITY = {
	subject: "user_noaccess_test",
	issuer: "https://api.workos.com",
	org_id: "org_random",
	organization_name: "Random Org",
	role: "member",
	roles: JSON.stringify(["member"]),
	permissions: JSON.stringify([]),
	user_email: "nobody@test.com",
	user_first_name: "No",
	user_last_name: "Access",
};

const EFFECT_SOURCE = {
	channel: "admin_dashboard" as const,
	actorId: "test-admin",
	actorType: "admin" as const,
};

// ── Seed helpers ────────────────────────────────────────────────────
type TestHarness = ReturnType<typeof convexTest>;

async function seedDealWithLawyer(
	t: TestHarness,
	overrides?: {
		lawyerId?: string | null; // null = explicitly no lawyer
		lawyerType?: "platform_lawyer" | "guest_lawyer";
		status?: string;
	}
) {
	return t.run(async (ctx) => {
		const userId = await ctx.db.insert("users", {
			authId: "seed-user",
			email: "seed@test.com",
			firstName: "Seed",
			lastName: "User",
		});
		const propertyId = await ctx.db.insert("properties", {
			streetAddress: "123 Test St",
			city: "Toronto",
			province: "ON",
			postalCode: "M5V 1A1",
			propertyType: "residential",
			createdAt: Date.now(),
		});
		const brokerId = await ctx.db.insert("brokers", {
			status: "active",
			userId,
			createdAt: Date.now(),
		});
		const mortgageId = await ctx.db.insert("mortgages", {
			status: "funded",
			propertyId,
			principal: 500_000,
			interestRate: 0.05,
			rateType: "fixed",
			termMonths: 60,
			amortizationMonths: 300,
			paymentAmount: 2908,
			paymentFrequency: "monthly",
			loanType: "conventional",
			lienPosition: 1,
			interestAdjustmentDate: "2026-01-01",
			termStartDate: "2026-01-01",
			maturityDate: "2031-01-01",
			firstPaymentDate: "2026-02-01",
			brokerOfRecordId: brokerId,
			createdAt: Date.now(),
		});
		const dealId = await ctx.db.insert("deals", {
			status: overrides?.status ?? "lawyerOnboarding.pending",
			mortgageId,
			buyerId: "buyer-user-1",
			sellerId: "seller-user-1",
			fractionalShare: 5000,
			...(overrides?.lawyerId === null
				? {}
				: {
						lawyerId: overrides?.lawyerId ?? LAWYER_IDENTITY.subject,
					}),
			lawyerType: overrides?.lawyerType ?? "platform_lawyer",
			createdAt: Date.now(),
			createdBy: "test-admin",
		});
		return { dealId, mortgageId, brokerId, propertyId };
	});
}

async function seedDealAccessRecord(
	t: TestHarness,
	dealId: Id<"deals">,
	userId: string,
	role: "platform_lawyer" | "guest_lawyer" | "lender" | "borrower",
	status: "active" | "revoked" = "active"
) {
	return t.run(async (ctx) => {
		return ctx.db.insert("dealAccess", {
			userId,
			dealId,
			role,
			grantedAt: Date.now(),
			grantedBy: "test-admin",
			status,
			...(status === "revoked" ? { revokedAt: Date.now() } : {}),
		});
	});
}

// ── Tests ───────────────────────────────────────────────────────────

describe("dealAccess mutations", () => {
	let t: TestHarness;
	let dealId: Id<"deals">;

	beforeEach(async () => {
		t = convexTest(schema, modules);
		const seed = await seedDealWithLawyer(t);
		dealId = seed.dealId;
	});

	describe("grantAccess", () => {
		it("creates a dealAccess record with correct fields", async () => {
			const accessId = await t.mutation(internal.deals.mutations.grantAccess, {
				userId: LAWYER_IDENTITY.subject,
				dealId,
				role: "platform_lawyer",
				grantedBy: "test-admin",
			});

			const record = await t.run(async (ctx) => ctx.db.get(accessId));
			assert(record, "dealAccess record should exist");
			expect(record.userId).toBe(LAWYER_IDENTITY.subject);
			expect(record.dealId).toBe(dealId);
			expect(record.role).toBe("platform_lawyer");
			expect(record.status).toBe("active");
			expect(record.grantedBy).toBe("test-admin");
			expect(record.grantedAt).toBeTypeOf("number");
			expect(record.revokedAt).toBeUndefined();
		});

		it("is idempotent — returns existing active record", async () => {
			const first = await t.mutation(internal.deals.mutations.grantAccess, {
				userId: LAWYER_IDENTITY.subject,
				dealId,
				role: "platform_lawyer",
				grantedBy: "test-admin",
			});
			const second = await t.mutation(internal.deals.mutations.grantAccess, {
				userId: LAWYER_IDENTITY.subject,
				dealId,
				role: "platform_lawyer",
				grantedBy: "other-admin",
			});

			expect(first).toBe(second);

			// Only one active record exists
			const records = await t.run(async (ctx) =>
				ctx.db
					.query("dealAccess")
					.withIndex("by_user_and_deal", (q) =>
						q.eq("userId", LAWYER_IDENTITY.subject).eq("dealId", dealId)
					)
					.collect()
			);
			const activeRecords = records.filter((r) => r.status === "active");
			expect(activeRecords).toHaveLength(1);
		});
	});

	describe("revokeAccess", () => {
		it("soft-revokes a record with revokedAt timestamp", async () => {
			const accessId = await seedDealAccessRecord(
				t,
				dealId,
				LAWYER_IDENTITY.subject,
				"platform_lawyer"
			);

			await t.mutation(internal.deals.mutations.revokeAccess, {
				accessId,
			});

			const record = await t.run(async (ctx) => ctx.db.get(accessId));
			assert(record, "dealAccess record should exist");
			expect(record.status).toBe("revoked");
			expect(record.revokedAt).toBeTypeOf("number");
			// grantedAt preserved
			expect(record.grantedAt).toBeTypeOf("number");
		});

		it("is idempotent — no-op on already revoked record", async () => {
			const accessId = await seedDealAccessRecord(
				t,
				dealId,
				LAWYER_IDENTITY.subject,
				"platform_lawyer",
				"revoked"
			);

			// Should not throw
			await t.mutation(internal.deals.mutations.revokeAccess, {
				accessId,
			});

			const record = await t.run(async (ctx) => ctx.db.get(accessId));
			assert(record, "dealAccess record should exist");
			expect(record.status).toBe("revoked");
		});
	});
});

describe("dealAccess effects", () => {
	let t: TestHarness;
	let dealId: Id<"deals">;

	beforeEach(async () => {
		t = convexTest(schema, modules);
		const seed = await seedDealWithLawyer(t);
		dealId = seed.dealId;
	});

	describe("createDealAccess", () => {
		it("creates dealAccess record on LAWYER_VERIFIED", async () => {
			await t.mutation(internal.engine.effects.dealAccess.createDealAccess, {
				entityId: dealId,
				entityType: "deal",
				eventType: "LAWYER_VERIFIED",
				journalEntryId: "test-journal-1",
				effectName: "createDealAccess",
				source: EFFECT_SOURCE,
			});

			const records = await t.run(async (ctx) =>
				ctx.db
					.query("dealAccess")
					.withIndex("by_deal", (q) => q.eq("dealId", dealId))
					.collect()
			);
			expect(records).toHaveLength(1);
			expect(records[0].userId).toBe(LAWYER_IDENTITY.subject);
			expect(records[0].role).toBe("platform_lawyer");
			expect(records[0].status).toBe("active");
		});

		it("is idempotent — fires twice, only one record", async () => {
			const effectArgs = {
				entityId: dealId,
				entityType: "deal" as const,
				eventType: "LAWYER_VERIFIED",
				journalEntryId: "test-journal-1",
				effectName: "createDealAccess",
				source: EFFECT_SOURCE,
			};

			await t.mutation(
				internal.engine.effects.dealAccess.createDealAccess,
				effectArgs
			);
			await t.mutation(internal.engine.effects.dealAccess.createDealAccess, {
				...effectArgs,
				journalEntryId: "test-journal-2",
			});

			const records = await t.run(async (ctx) =>
				ctx.db
					.query("dealAccess")
					.withIndex("by_deal", (q) => q.eq("dealId", dealId))
					.filter((q) => q.eq(q.field("status"), "active"))
					.collect()
			);
			expect(records).toHaveLength(1);
		});

		it("no-ops when deal has no lawyerId", async () => {
			const seed = await seedDealWithLawyer(t, {
				lawyerId: null,
			});

			await t.mutation(internal.engine.effects.dealAccess.createDealAccess, {
				entityId: seed.dealId,
				entityType: "deal",
				eventType: "LAWYER_VERIFIED",
				journalEntryId: "test-journal-nolawyer",
				effectName: "createDealAccess",
				source: EFFECT_SOURCE,
			});

			const records = await t.run(async (ctx) =>
				ctx.db
					.query("dealAccess")
					.withIndex("by_deal", (q) => q.eq("dealId", seed.dealId))
					.collect()
			);
			expect(records).toHaveLength(0);
		});
	});

	describe("revokeAllDealAccess", () => {
		it("revokes all active records for a deal", async () => {
			await seedDealAccessRecord(t, dealId, "lawyer-1", "platform_lawyer");
			await seedDealAccessRecord(t, dealId, "buyer-1", "lender");

			await t.mutation(internal.engine.effects.dealAccess.revokeAllDealAccess, {
				entityId: dealId,
				entityType: "deal",
				eventType: "DEAL_CANCELLED",
				journalEntryId: "test-journal-cancel",
				effectName: "revokeAllDealAccess",
				source: EFFECT_SOURCE,
			});

			const records = await t.run(async (ctx) =>
				ctx.db
					.query("dealAccess")
					.withIndex("by_deal", (q) => q.eq("dealId", dealId))
					.collect()
			);
			expect(records).toHaveLength(2);
			for (const record of records) {
				expect(record.status).toBe("revoked");
				expect(record.revokedAt).toBeTypeOf("number");
				// grantedAt preserved
				expect(record.grantedAt).toBeTypeOf("number");
			}
		});
	});

	describe("revokeLawyerAccess", () => {
		it("revokes lawyer records, retains buyer/seller", async () => {
			await seedDealAccessRecord(t, dealId, "lawyer-1", "platform_lawyer");
			await seedDealAccessRecord(t, dealId, "guest-lawyer-1", "guest_lawyer");
			await seedDealAccessRecord(t, dealId, "buyer-1", "lender");
			await seedDealAccessRecord(t, dealId, "seller-1", "borrower");

			await t.mutation(internal.engine.effects.dealAccess.revokeLawyerAccess, {
				entityId: dealId,
				entityType: "deal",
				eventType: "FUNDS_TRANSFER_COMPLETE",
				journalEntryId: "test-journal-confirm",
				effectName: "revokeLawyerAccess",
				source: EFFECT_SOURCE,
			});

			const records = await t.run(async (ctx) =>
				ctx.db
					.query("dealAccess")
					.withIndex("by_deal", (q) => q.eq("dealId", dealId))
					.collect()
			);

			const lawyerRecords = records.filter(
				(r) => r.role === "platform_lawyer" || r.role === "guest_lawyer"
			);
			const partyRecords = records.filter(
				(r) => r.role === "lender" || r.role === "borrower"
			);

			expect(lawyerRecords).toHaveLength(2);
			for (const r of lawyerRecords) {
				expect(r.status).toBe("revoked");
				expect(r.revokedAt).toBeTypeOf("number");
			}

			expect(partyRecords).toHaveLength(2);
			for (const r of partyRecords) {
				expect(r.status).toBe("active");
				expect(r.revokedAt).toBeUndefined();
			}
		});
	});
});

describe("activeDealAccessRecords query", () => {
	let t: TestHarness;
	let dealId: Id<"deals">;

	beforeEach(async () => {
		t = convexTest(schema, modules);
		const seed = await seedDealWithLawyer(t);
		dealId = seed.dealId;
	});

	it("returns active records for user with active access", async () => {
		await seedDealAccessRecord(
			t,
			dealId,
			LAWYER_IDENTITY.subject,
			"platform_lawyer"
		);

		const asLawyer = t.withIdentity(LAWYER_IDENTITY);
		const result = await asLawyer.query(
			api.deals.queries.activeDealAccessRecords,
			{ dealId }
		);

		expect(result).toHaveLength(1);
		expect(result[0].userId).toBe(LAWYER_IDENTITY.subject);
		expect(result[0].status).toBe("active");
	});

	it("throws ConvexError for user without access", async () => {
		const asNoAccess = t.withIdentity(NO_ACCESS_IDENTITY);
		await expect(
			asNoAccess.query(api.deals.queries.activeDealAccessRecords, {
				dealId,
			})
		).rejects.toThrow(ConvexError);
	});

	it("throws ConvexError for user with revoked access", async () => {
		await seedDealAccessRecord(
			t,
			dealId,
			LAWYER_IDENTITY.subject,
			"platform_lawyer",
			"revoked"
		);

		const asLawyer = t.withIdentity(LAWYER_IDENTITY);
		await expect(
			asLawyer.query(api.deals.queries.activeDealAccessRecords, {
				dealId,
			})
		).rejects.toThrow(ConvexError);
	});

	it("admin bypasses dealAccess check", async () => {
		// No dealAccess record for admin — should still work
		const asAdmin = t.withIdentity(ADMIN_IDENTITY);
		const result = await asAdmin.query(
			api.deals.queries.activeDealAccessRecords,
			{ dealId }
		);
		expect(result).toEqual([]);
	});

	it("cross-deal isolation — no access to unrelated deal", async () => {
		// Give lawyer access to dealId
		await seedDealAccessRecord(
			t,
			dealId,
			LAWYER_IDENTITY.subject,
			"platform_lawyer"
		);

		// Create a second deal
		const seed2 = await seedDealWithLawyer(t, {
			lawyerId: "other-lawyer",
		});

		const asLawyer = t.withIdentity(LAWYER_IDENTITY);

		// Can access first deal
		const result = await asLawyer.query(
			api.deals.queries.activeDealAccessRecords,
			{ dealId }
		);
		expect(result).toHaveLength(1);

		// Cannot access second deal
		await expect(
			asLawyer.query(api.deals.queries.activeDealAccessRecords, {
				dealId: seed2.dealId,
			})
		).rejects.toThrow(ConvexError);
	});
});

describe("dealAccess lifecycle", () => {
	let t: TestHarness;

	beforeEach(() => {
		t = convexTest(schema, modules);
	});

	it("same lawyer gets new access for different deal after revoke", async () => {
		const seed1 = await seedDealWithLawyer(t);
		const seed2 = await seedDealWithLawyer(t, {
			lawyerId: LAWYER_IDENTITY.subject,
		});

		// Grant access to deal 1
		const access1Id = await t.mutation(internal.deals.mutations.grantAccess, {
			userId: LAWYER_IDENTITY.subject,
			dealId: seed1.dealId,
			role: "platform_lawyer",
			grantedBy: "test-admin",
		});

		// Revoke access to deal 1
		await t.mutation(internal.deals.mutations.revokeAccess, {
			accessId: access1Id,
		});

		// Grant access to deal 2
		const access2Id = await t.mutation(internal.deals.mutations.grantAccess, {
			userId: LAWYER_IDENTITY.subject,
			dealId: seed2.dealId,
			role: "platform_lawyer",
			grantedBy: "test-admin",
		});

		// Deal 1 record is revoked
		const record1 = await t.run(async (ctx) => ctx.db.get(access1Id));
		assert(record1, "deal 1 access record should exist");
		expect(record1.status).toBe("revoked");

		// Deal 2 record is active
		const record2 = await t.run(async (ctx) => ctx.db.get(access2Id));
		assert(record2, "deal 2 access record should exist");
		expect(record2.status).toBe("active");
	});
});
