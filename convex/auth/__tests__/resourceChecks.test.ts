import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import type { Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import type { Viewer } from "../../fluent";
import schema from "../../schema";
import {
	canAccessAccrual,
	canAccessApplicationPackage,
	canAccessDeal,
	canAccessDispersal,
	canAccessDocument,
	canAccessLedgerPosition,
	canAccessMortgage,
} from "../resourceChecks";

const modules = import.meta.glob("/convex/**/*.ts");

// ── Viewer Factory ──────────────────────────────────────────────────

function makeViewer(overrides: Partial<Viewer> = {}): Viewer {
	return {
		authId: "default-auth-id",
		email: "test@example.com",
		firstName: "Test",
		lastName: "User",
		isFairLendAdmin: false,
		orgId: undefined,
		orgName: undefined,
		permissions: new Set<string>(),
		role: undefined,
		roles: new Set<string>(),
		...overrides,
	};
}

function adminViewer(overrides: Partial<Viewer> = {}): Viewer {
	return makeViewer({
		authId: "admin-auth-id",
		isFairLendAdmin: true,
		role: "admin",
		roles: new Set(["admin"]),
		...overrides,
	});
}

// ── Shared Constants ────────────────────────────────────────────────

const NOW = Date.now();

// ── Fixture Helpers ─────────────────────────────────────────────────

async function insertUser(
	ctx: MutationCtx,
	overrides: {
		authId: string;
		email?: string;
		firstName?: string;
		lastName?: string;
	}
) {
	return ctx.db.insert("users", {
		authId: overrides.authId,
		email: overrides.email ?? `${overrides.authId}@test.com`,
		firstName: overrides.firstName ?? "Test",
		lastName: overrides.lastName ?? "User",
	});
}

async function insertProperty(ctx: MutationCtx) {
	return ctx.db.insert("properties", {
		streetAddress: "123 Main St",
		city: "Toronto",
		province: "ON",
		postalCode: "M5V1A1",
		propertyType: "residential",
		createdAt: NOW,
	});
}

async function insertBroker(ctx: MutationCtx, userId: Id<"users">) {
	return ctx.db.insert("brokers", {
		userId,
		status: "active",
		createdAt: NOW,
	});
}

async function insertBorrower(ctx: MutationCtx, userId: Id<"users">) {
	return ctx.db.insert("borrowers", {
		userId,
		status: "active",
		createdAt: NOW,
	});
}

async function insertLender(
	ctx: MutationCtx,
	userId: Id<"users">,
	brokerId: Id<"brokers">
) {
	return ctx.db.insert("lenders", {
		userId,
		brokerId,
		accreditationStatus: "accredited",
		onboardingEntryPath: "self_signup",
		status: "active",
		createdAt: NOW,
	});
}

async function insertMortgage(
	ctx: MutationCtx,
	propertyId: Id<"properties">,
	brokerOfRecordId: Id<"brokers">,
	overrides: Partial<{
		status: string;
		assignedBrokerId: Id<"brokers">;
	}> = {}
) {
	return ctx.db.insert("mortgages", {
		status: overrides.status ?? "active",
		propertyId,
		principal: 500_000,
		interestRate: 5.5,
		rateType: "fixed",
		termMonths: 60,
		amortizationMonths: 300,
		paymentAmount: 3000,
		paymentFrequency: "monthly",
		loanType: "conventional",
		lienPosition: 1,
		interestAdjustmentDate: "2026-01-01",
		termStartDate: "2026-01-15",
		maturityDate: "2031-01-15",
		firstPaymentDate: "2026-02-15",
		brokerOfRecordId,
		createdAt: NOW,
		...(overrides.assignedBrokerId
			? { assignedBrokerId: overrides.assignedBrokerId }
			: {}),
	});
}

async function insertMortgageBorrower(
	ctx: MutationCtx,
	mortgageId: Id<"mortgages">,
	borrowerId: Id<"borrowers">
) {
	return ctx.db.insert("mortgageBorrowers", {
		mortgageId,
		borrowerId,
		role: "primary",
		addedAt: NOW,
	});
}

async function insertLedgerPosition(
	ctx: MutationCtx,
	mortgageId: Id<"mortgages">,
	lenderId: string,
	balance = 1000n
) {
	// Positive balance means debits > credits (balance = debits - credits)
	return ctx.db.insert("ledger_accounts", {
		type: "POSITION",
		mortgageId: mortgageId as string,
		lenderId,
		cumulativeDebits: balance,
		cumulativeCredits: 0n,
		createdAt: NOW,
	});
}

async function insertClosingTeamAssignment(
	ctx: MutationCtx,
	mortgageId: Id<"mortgages">,
	userId: string
) {
	return ctx.db.insert("closingTeamAssignments", {
		mortgageId,
		userId,
		role: "closing_lawyer",
		assignedBy: "admin-auth-id",
		assignedAt: NOW,
	});
}

async function insertDeal(
	ctx: MutationCtx,
	mortgageId: Id<"mortgages">,
	buyerId: string,
	sellerId: string
) {
	return ctx.db.insert("deals", {
		status: "active",
		mortgageId,
		buyerId,
		sellerId,
		fractionalShare: 100,
		createdAt: NOW,
		createdBy: "admin-auth-id",
	});
}

async function insertDealAccess(
	ctx: MutationCtx,
	userId: string,
	dealId: Id<"deals">,
	role:
		| "platform_lawyer"
		| "guest_lawyer"
		| "lender"
		| "borrower" = "platform_lawyer",
	status: "active" | "revoked" = "active"
) {
	return ctx.db.insert("dealAccess", {
		userId,
		dealId,
		role,
		grantedAt: NOW,
		grantedBy: "admin-auth-id",
		status,
	});
}

async function insertProvisionalApplication(
	ctx: MutationCtx,
	brokerId: Id<"brokers">,
	borrowerId: Id<"borrowers">
) {
	return ctx.db.insert("provisionalApplications", {
		status: "submitted",
		brokerId,
		borrowerId,
		normalizedData: {},
		fileIds: [],
		sourceType: "form",
		createdAt: NOW,
	});
}

async function insertApplicationPackage(
	ctx: MutationCtx,
	sourceApplicationId: Id<"provisionalApplications">,
	borrowerId: Id<"borrowers">,
	brokerId: Id<"brokers">,
	overrides: {
		status?: string;
		machineContext?: Record<string, unknown>;
	} = {}
) {
	return ctx.db.insert("applicationPackages", {
		status: overrides.status ?? "assembled",
		sourceApplicationId,
		currentVersion: 1,
		borrowerId,
		brokerId,
		createdAt: NOW,
		...(overrides.machineContext
			? { machineContext: overrides.machineContext }
			: {}),
	});
}

// ═══════════════════════════════════════════════════════════════════
// canAccessMortgage
// ═══════════════════════════════════════════════════════════════════

describe("canAccessMortgage", () => {
	it("admin — always true", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const userId = await insertUser(ctx, { authId: "broker-auth" });
			const brokerId = await insertBroker(ctx, userId);
			const propId = await insertProperty(ctx);
			const mortgageId = await insertMortgage(ctx, propId, brokerId);

			const viewer = adminViewer();
			const result = await canAccessMortgage(ctx, viewer, mortgageId);
			expect(result).toBe(true);
		});
	});

	it("borrower — own mortgage — true", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			// Create broker (needed for mortgage)
			const brokerUserId = await insertUser(ctx, { authId: "broker-auth" });
			const brokerId = await insertBroker(ctx, brokerUserId);
			const propId = await insertProperty(ctx);
			const mortgageId = await insertMortgage(ctx, propId, brokerId);

			// Create borrower linked to mortgage
			const borrowerUserId = await insertUser(ctx, {
				authId: "borrower-auth",
			});
			const borrowerId = await insertBorrower(ctx, borrowerUserId);
			await insertMortgageBorrower(ctx, mortgageId, borrowerId);

			const viewer = makeViewer({ authId: "borrower-auth" });
			const result = await canAccessMortgage(ctx, viewer, mortgageId);
			expect(result).toBe(true);
		});
	});

	it("borrower — other mortgage — false", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const brokerUserId = await insertUser(ctx, { authId: "broker-auth" });
			const brokerId = await insertBroker(ctx, brokerUserId);
			const propId = await insertProperty(ctx);
			const mortgageId = await insertMortgage(ctx, propId, brokerId);

			// Create borrower NOT linked to this mortgage
			const borrowerUserId = await insertUser(ctx, {
				authId: "borrower-auth",
			});
			await insertBorrower(ctx, borrowerUserId);

			const viewer = makeViewer({ authId: "borrower-auth" });
			const result = await canAccessMortgage(ctx, viewer, mortgageId);
			expect(result).toBe(false);
		});
	});

	it("broker — assigned (brokerOfRecord) — true", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const brokerUserId = await insertUser(ctx, { authId: "broker-auth" });
			const brokerId = await insertBroker(ctx, brokerUserId);
			const propId = await insertProperty(ctx);
			const mortgageId = await insertMortgage(ctx, propId, brokerId);

			const viewer = makeViewer({ authId: "broker-auth" });
			const result = await canAccessMortgage(ctx, viewer, mortgageId);
			expect(result).toBe(true);
		});
	});

	it("broker — other mortgage — false", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			// Mortgage belongs to a different broker
			const ownerBrokerUserId = await insertUser(ctx, {
				authId: "owner-broker-auth",
			});
			const ownerBrokerId = await insertBroker(ctx, ownerBrokerUserId);
			const propId = await insertProperty(ctx);
			const mortgageId = await insertMortgage(ctx, propId, ownerBrokerId);

			// Viewer is a different broker
			const otherBrokerUserId = await insertUser(ctx, {
				authId: "other-broker-auth",
			});
			await insertBroker(ctx, otherBrokerUserId);

			const viewer = makeViewer({ authId: "other-broker-auth" });
			const result = await canAccessMortgage(ctx, viewer, mortgageId);
			expect(result).toBe(false);
		});
	});

	it("lender — has POSITION with positive balance — true", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const brokerUserId = await insertUser(ctx, { authId: "broker-auth" });
			const brokerId = await insertBroker(ctx, brokerUserId);
			const propId = await insertProperty(ctx);
			const mortgageId = await insertMortgage(ctx, propId, brokerId);

			// Create lender with a POSITION account
			const lenderUserId = await insertUser(ctx, { authId: "lender-auth" });
			await insertLender(ctx, lenderUserId, brokerId);
			await insertLedgerPosition(ctx, mortgageId, "lender-auth", 5000n);

			const viewer = makeViewer({ authId: "lender-auth" });
			const result = await canAccessMortgage(ctx, viewer, mortgageId);
			expect(result).toBe(true);
		});
	});

	it("lender — no POSITION — false", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const brokerUserId = await insertUser(ctx, { authId: "broker-auth" });
			const brokerId = await insertBroker(ctx, brokerUserId);
			const propId = await insertProperty(ctx);
			const mortgageId = await insertMortgage(ctx, propId, brokerId);

			// Create lender but no ledger position
			const lenderUserId = await insertUser(ctx, { authId: "lender-auth" });
			await insertLender(ctx, lenderUserId, brokerId);

			const viewer = makeViewer({ authId: "lender-auth" });
			const result = await canAccessMortgage(ctx, viewer, mortgageId);
			expect(result).toBe(false);
		});
	});

	it("lawyer — assigned via closingTeamAssignment — true", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const brokerUserId = await insertUser(ctx, { authId: "broker-auth" });
			const brokerId = await insertBroker(ctx, brokerUserId);
			const propId = await insertProperty(ctx);
			const mortgageId = await insertMortgage(ctx, propId, brokerId);

			await insertClosingTeamAssignment(ctx, mortgageId, "lawyer-auth");

			const viewer = makeViewer({ authId: "lawyer-auth" });
			const result = await canAccessMortgage(ctx, viewer, mortgageId);
			expect(result).toBe(true);
		});
	});

	it("lawyer — not assigned — false", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const brokerUserId = await insertUser(ctx, { authId: "broker-auth" });
			const brokerId = await insertBroker(ctx, brokerUserId);
			const propId = await insertProperty(ctx);
			const mortgageId = await insertMortgage(ctx, propId, brokerId);

			// Lawyer is assigned to a DIFFERENT mortgage, not this one
			const propId2 = await insertProperty(ctx);
			const mortgageId2 = await insertMortgage(ctx, propId2, brokerId);
			await insertClosingTeamAssignment(ctx, mortgageId2, "lawyer-auth");

			const viewer = makeViewer({ authId: "lawyer-auth" });
			const result = await canAccessMortgage(ctx, viewer, mortgageId);
			expect(result).toBe(false);
		});
	});

	it("random user — no relationship — false", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const brokerUserId = await insertUser(ctx, { authId: "broker-auth" });
			const brokerId = await insertBroker(ctx, brokerUserId);
			const propId = await insertProperty(ctx);
			const mortgageId = await insertMortgage(ctx, propId, brokerId);

			const viewer = makeViewer({ authId: "random-user-auth" });
			const result = await canAccessMortgage(ctx, viewer, mortgageId);
			expect(result).toBe(false);
		});
	});

	it("lender — zero-balance POSITION — false", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const brokerUserId = await insertUser(ctx, { authId: "broker-auth" });
			const brokerId = await insertBroker(ctx, brokerUserId);
			const propId = await insertProperty(ctx);
			const mortgageId = await insertMortgage(ctx, propId, brokerId);

			// Create lender with a zero-balance POSITION account
			const lenderUserId = await insertUser(ctx, { authId: "lender-auth" });
			await insertLender(ctx, lenderUserId, brokerId);
			await insertLedgerPosition(ctx, mortgageId, "lender-auth", 0n);

			const viewer = makeViewer({ authId: "lender-auth" });
			const result = await canAccessMortgage(ctx, viewer, mortgageId);
			expect(result).toBe(false);
		});
	});

	it("lender — POSITION owned by different lender — false", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const brokerUserId = await insertUser(ctx, { authId: "broker-auth" });
			const brokerId = await insertBroker(ctx, brokerUserId);
			const propId = await insertProperty(ctx);
			const mortgageId = await insertMortgage(ctx, propId, brokerId);

			// Lender A owns the POSITION
			const lenderAUserId = await insertUser(ctx, {
				authId: "lender-a-auth",
			});
			await insertLender(ctx, lenderAUserId, brokerId);
			await insertLedgerPosition(ctx, mortgageId, "lender-a-auth", 5000n);

			// Lender B tries to access via lender A's position
			const lenderBUserId = await insertUser(ctx, {
				authId: "lender-b-auth",
			});
			await insertLender(ctx, lenderBUserId, brokerId);

			const viewer = makeViewer({ authId: "lender-b-auth" });
			const result = await canAccessMortgage(ctx, viewer, mortgageId);
			expect(result).toBe(false);
		});
	});
});

// ═══════════════════════════════════════════════════════════════════
// canAccessDeal
// ═══════════════════════════════════════════════════════════════════

describe("canAccessDeal", () => {
	it("admin — always true", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const brokerUserId = await insertUser(ctx, { authId: "broker-auth" });
			const brokerId = await insertBroker(ctx, brokerUserId);
			const propId = await insertProperty(ctx);
			const mortgageId = await insertMortgage(ctx, propId, brokerId);
			const dealId = await insertDeal(
				ctx,
				mortgageId,
				"buyer-auth",
				"seller-auth"
			);

			const viewer = adminViewer();
			const result = await canAccessDeal(ctx, viewer, dealId);
			expect(result).toBe(true);
		});
	});

	it("broker — owns deal's mortgage — true", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const brokerUserId = await insertUser(ctx, { authId: "broker-auth" });
			const brokerId = await insertBroker(ctx, brokerUserId);
			const propId = await insertProperty(ctx);
			const mortgageId = await insertMortgage(ctx, propId, brokerId);
			const dealId = await insertDeal(
				ctx,
				mortgageId,
				"buyer-auth",
				"seller-auth"
			);

			const viewer = makeViewer({ authId: "broker-auth" });
			const result = await canAccessDeal(ctx, viewer, dealId);
			expect(result).toBe(true);
		});
	});

	it("lender — is buyer — true", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const brokerUserId = await insertUser(ctx, { authId: "broker-auth" });
			const brokerId = await insertBroker(ctx, brokerUserId);
			const propId = await insertProperty(ctx);
			const mortgageId = await insertMortgage(ctx, propId, brokerId);
			const dealId = await insertDeal(
				ctx,
				mortgageId,
				"buyer-auth",
				"seller-auth"
			);

			const viewer = makeViewer({ authId: "buyer-auth" });
			const result = await canAccessDeal(ctx, viewer, dealId);
			expect(result).toBe(true);
		});
	});

	it("lender — is seller — true", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const brokerUserId = await insertUser(ctx, { authId: "broker-auth" });
			const brokerId = await insertBroker(ctx, brokerUserId);
			const propId = await insertProperty(ctx);
			const mortgageId = await insertMortgage(ctx, propId, brokerId);
			const dealId = await insertDeal(
				ctx,
				mortgageId,
				"buyer-auth",
				"seller-auth"
			);

			const viewer = makeViewer({ authId: "seller-auth" });
			const result = await canAccessDeal(ctx, viewer, dealId);
			expect(result).toBe(true);
		});
	});

	it("lawyer — assigned via closingTeamAssignment — true", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const brokerUserId = await insertUser(ctx, { authId: "broker-auth" });
			const brokerId = await insertBroker(ctx, brokerUserId);
			const propId = await insertProperty(ctx);
			const mortgageId = await insertMortgage(ctx, propId, brokerId);
			const dealId = await insertDeal(
				ctx,
				mortgageId,
				"buyer-auth",
				"seller-auth"
			);

			await insertClosingTeamAssignment(ctx, mortgageId, "lawyer-auth");

			const viewer = makeViewer({ authId: "lawyer-auth" });
			const result = await canAccessDeal(ctx, viewer, dealId);
			expect(result).toBe(true);
		});
	});

	it("lawyer — dealAccess active — true", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const brokerUserId = await insertUser(ctx, { authId: "broker-auth" });
			const brokerId = await insertBroker(ctx, brokerUserId);
			const propId = await insertProperty(ctx);
			const mortgageId = await insertMortgage(ctx, propId, brokerId);
			const dealId = await insertDeal(
				ctx,
				mortgageId,
				"buyer-auth",
				"seller-auth"
			);

			await insertDealAccess(
				ctx,
				"lawyer-auth",
				dealId,
				"platform_lawyer",
				"active"
			);

			const viewer = makeViewer({ authId: "lawyer-auth" });
			const result = await canAccessDeal(ctx, viewer, dealId);
			expect(result).toBe(true);
		});
	});

	it("other user — no relationship — false", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const brokerUserId = await insertUser(ctx, { authId: "broker-auth" });
			const brokerId = await insertBroker(ctx, brokerUserId);
			const propId = await insertProperty(ctx);
			const mortgageId = await insertMortgage(ctx, propId, brokerId);
			const dealId = await insertDeal(
				ctx,
				mortgageId,
				"buyer-auth",
				"seller-auth"
			);

			const viewer = makeViewer({ authId: "random-user-auth" });
			const result = await canAccessDeal(ctx, viewer, dealId);
			expect(result).toBe(false);
		});
	});

	it("lawyer — revoked dealAccess — false", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const brokerUserId = await insertUser(ctx, { authId: "broker-auth" });
			const brokerId = await insertBroker(ctx, brokerUserId);
			const propId = await insertProperty(ctx);
			const mortgageId = await insertMortgage(ctx, propId, brokerId);
			const dealId = await insertDeal(
				ctx,
				mortgageId,
				"buyer-auth",
				"seller-auth"
			);

			// Grant then revoke access
			await insertDealAccess(
				ctx,
				"lawyer-auth",
				dealId,
				"platform_lawyer",
				"revoked"
			);

			const viewer = makeViewer({ authId: "lawyer-auth" });
			const result = await canAccessDeal(ctx, viewer, dealId);
			expect(result).toBe(false);
		});
	});

	it("missing deal — false", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			// Create and then delete a deal to get a valid but non-existent ID
			const brokerUserId = await insertUser(ctx, { authId: "broker-auth" });
			const brokerId = await insertBroker(ctx, brokerUserId);
			const propId = await insertProperty(ctx);
			const mortgageId = await insertMortgage(ctx, propId, brokerId);
			const dealId = await insertDeal(
				ctx,
				mortgageId,
				"buyer-auth",
				"seller-auth"
			);
			await ctx.db.delete(dealId);

			const viewer = makeViewer({ authId: "buyer-auth" });
			const result = await canAccessDeal(ctx, viewer, dealId);
			expect(result).toBe(false);
		});
	});
});

// ═══════════════════════════════════════════════════════════════════
// canAccessLedgerPosition
// ═══════════════════════════════════════════════════════════════════

describe("canAccessLedgerPosition", () => {
	it("admin — always true", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const brokerUserId = await insertUser(ctx, { authId: "broker-auth" });
			const brokerId = await insertBroker(ctx, brokerUserId);
			const propId = await insertProperty(ctx);
			const mortgageId = await insertMortgage(ctx, propId, brokerId);

			const viewer = adminViewer();
			const result = await canAccessLedgerPosition(ctx, viewer, mortgageId);
			expect(result).toBe(true);
		});
	});

	it("lender — has POSITION — true", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const brokerUserId = await insertUser(ctx, { authId: "broker-auth" });
			const brokerId = await insertBroker(ctx, brokerUserId);
			const propId = await insertProperty(ctx);
			const mortgageId = await insertMortgage(ctx, propId, brokerId);

			const lenderUserId = await insertUser(ctx, { authId: "lender-auth" });
			await insertLender(ctx, lenderUserId, brokerId);
			await insertLedgerPosition(ctx, mortgageId, "lender-auth", 1000n);

			const viewer = makeViewer({ authId: "lender-auth" });
			const result = await canAccessLedgerPosition(ctx, viewer, mortgageId);
			expect(result).toBe(true);
		});
	});

	it("lender — no POSITION — false", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const brokerUserId = await insertUser(ctx, { authId: "broker-auth" });
			const brokerId = await insertBroker(ctx, brokerUserId);
			const propId = await insertProperty(ctx);
			const mortgageId = await insertMortgage(ctx, propId, brokerId);

			const lenderUserId = await insertUser(ctx, { authId: "lender-auth" });
			await insertLender(ctx, lenderUserId, brokerId);

			const viewer = makeViewer({ authId: "lender-auth" });
			const result = await canAccessLedgerPosition(ctx, viewer, mortgageId);
			expect(result).toBe(false);
		});
	});

	it("broker — assigned (brokerOfRecord) — true", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const brokerUserId = await insertUser(ctx, { authId: "broker-auth" });
			const brokerId = await insertBroker(ctx, brokerUserId);
			const propId = await insertProperty(ctx);
			const mortgageId = await insertMortgage(ctx, propId, brokerId);

			const viewer = makeViewer({ authId: "broker-auth" });
			const result = await canAccessLedgerPosition(ctx, viewer, mortgageId);
			expect(result).toBe(true);
		});
	});

	it("other user — false", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const brokerUserId = await insertUser(ctx, { authId: "broker-auth" });
			const brokerId = await insertBroker(ctx, brokerUserId);
			const propId = await insertProperty(ctx);
			const mortgageId = await insertMortgage(ctx, propId, brokerId);

			const viewer = makeViewer({ authId: "random-user-auth" });
			const result = await canAccessLedgerPosition(ctx, viewer, mortgageId);
			expect(result).toBe(false);
		});
	});
});

// ═══════════════════════════════════════════════════════════════════
// canAccessAccrual
// ═══════════════════════════════════════════════════════════════════

describe("canAccessAccrual", () => {
	it("admin — always true", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const viewer = adminViewer();
			const result = await canAccessAccrual(ctx, viewer, "some-lender-id");
			expect(result).toBe(true);
		});
	});

	it("lender — own investorId — true", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const brokerUserId = await insertUser(ctx, { authId: "broker-auth" });
			const brokerId = await insertBroker(ctx, brokerUserId);

			const lenderUserId = await insertUser(ctx, { authId: "lender-auth" });
			await insertLender(ctx, lenderUserId, brokerId);

			const viewer = makeViewer({ authId: "lender-auth" });
			const result = await canAccessAccrual(ctx, viewer, "lender-auth");
			expect(result).toBe(true);
		});
	});

	it("lender — other investorId — false", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const brokerUserId = await insertUser(ctx, { authId: "broker-auth" });
			const brokerId = await insertBroker(ctx, brokerUserId);

			const lenderUserId = await insertUser(ctx, { authId: "lender-auth" });
			await insertLender(ctx, lenderUserId, brokerId);

			const otherLenderUserId = await insertUser(ctx, {
				authId: "other-lender-auth",
			});
			await insertLender(ctx, otherLenderUserId, brokerId);

			const viewer = makeViewer({ authId: "lender-auth" });
			const result = await canAccessAccrual(ctx, viewer, "other-lender-auth");
			expect(result).toBe(false);
		});
	});

	it("broker — lender belongs to broker — true", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const brokerUserId = await insertUser(ctx, { authId: "broker-auth" });
			const brokerId = await insertBroker(ctx, brokerUserId);

			const lenderUserId = await insertUser(ctx, { authId: "lender-auth" });
			await insertLender(ctx, lenderUserId, brokerId);

			const viewer = makeViewer({ authId: "broker-auth" });
			const result = await canAccessAccrual(ctx, viewer, "lender-auth");
			expect(result).toBe(true);
		});
	});

	it("broker — lender belongs to different broker — false", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const broker1UserId = await insertUser(ctx, {
				authId: "broker1-auth",
			});
			const broker1Id = await insertBroker(ctx, broker1UserId);

			const broker2UserId = await insertUser(ctx, {
				authId: "broker2-auth",
			});
			await insertBroker(ctx, broker2UserId);

			// Lender belongs to broker1
			const lenderUserId = await insertUser(ctx, { authId: "lender-auth" });
			await insertLender(ctx, lenderUserId, broker1Id);

			// Viewer is broker2
			const viewer = makeViewer({ authId: "broker2-auth" });
			const result = await canAccessAccrual(ctx, viewer, "lender-auth");
			expect(result).toBe(false);
		});
	});

	it("random user — false", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const brokerUserId = await insertUser(ctx, { authId: "broker-auth" });
			const brokerId = await insertBroker(ctx, brokerUserId);

			const lenderUserId = await insertUser(ctx, { authId: "lender-auth" });
			await insertLender(ctx, lenderUserId, brokerId);

			const viewer = makeViewer({ authId: "random-user-auth" });
			const result = await canAccessAccrual(ctx, viewer, "lender-auth");
			expect(result).toBe(false);
		});
	});
});

// ═══════════════════════════════════════════════════════════════════
// canAccessDispersal
// ═══════════════════════════════════════════════════════════════════

describe("canAccessDispersal", () => {
	it("admin — always true", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const viewer = adminViewer();
			const result = await canAccessDispersal(ctx, viewer, "some-lender-id");
			expect(result).toBe(true);
		});
	});

	it("lender — own investorId — true", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const brokerUserId = await insertUser(ctx, { authId: "broker-auth" });
			const brokerId = await insertBroker(ctx, brokerUserId);

			const lenderUserId = await insertUser(ctx, { authId: "lender-auth" });
			await insertLender(ctx, lenderUserId, brokerId);

			const viewer = makeViewer({ authId: "lender-auth" });
			const result = await canAccessDispersal(ctx, viewer, "lender-auth");
			expect(result).toBe(true);
		});
	});

	it("lender — other investorId — false", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const brokerUserId = await insertUser(ctx, { authId: "broker-auth" });
			const brokerId = await insertBroker(ctx, brokerUserId);

			const lenderUserId = await insertUser(ctx, { authId: "lender-auth" });
			await insertLender(ctx, lenderUserId, brokerId);

			const otherLenderUserId = await insertUser(ctx, {
				authId: "other-lender-auth",
			});
			await insertLender(ctx, otherLenderUserId, brokerId);

			const viewer = makeViewer({ authId: "lender-auth" });
			const result = await canAccessDispersal(ctx, viewer, "other-lender-auth");
			expect(result).toBe(false);
		});
	});

	it("broker — no access even if lender belongs to broker", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const brokerUserId = await insertUser(ctx, { authId: "broker-auth" });
			const brokerId = await insertBroker(ctx, brokerUserId);

			const lenderUserId = await insertUser(ctx, { authId: "lender-auth" });
			await insertLender(ctx, lenderUserId, brokerId);

			// Broker should NOT have dispersal access
			const viewer = makeViewer({ authId: "broker-auth" });
			const result = await canAccessDispersal(ctx, viewer, "lender-auth");
			expect(result).toBe(false);
		});
	});
});

// ═══════════════════════════════════════════════════════════════════
// canAccessDocument
// ═══════════════════════════════════════════════════════════════════

describe("canAccessDocument", () => {
	it("admin — always true", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const viewer = adminViewer();
			const result = await canAccessDocument(ctx, viewer, "any-doc-id");
			expect(result).toBe(true);
		});
	});

	it("non-admin — always false (stub pending ENG-144)", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const viewer = makeViewer({ authId: "regular-user-auth" });
			const result = await canAccessDocument(ctx, viewer, "any-doc-id");
			expect(result).toBe(false);
		});
	});
});

// ═══════════════════════════════════════════════════════════════════
// canAccessApplicationPackage
// ═══════════════════════════════════════════════════════════════════

describe("canAccessApplicationPackage", () => {
	// Helper to create the full prerequisite chain for an application package
	async function setupApplicationPackage(
		ctx: MutationCtx,
		overrides: {
			status?: string;
			machineContext?: Record<string, unknown>;
		} = {}
	) {
		const brokerUserId = await insertUser(ctx, {
			authId: "setup-broker-auth",
		});
		const brokerId = await insertBroker(ctx, brokerUserId);
		const borrowerUserId = await insertUser(ctx, {
			authId: "setup-borrower-auth",
		});
		const borrowerId = await insertBorrower(ctx, borrowerUserId);
		const sourceAppId = await insertProvisionalApplication(
			ctx,
			brokerId,
			borrowerId
		);
		const packageId = await insertApplicationPackage(
			ctx,
			sourceAppId,
			borrowerId,
			brokerId,
			overrides
		);
		return { brokerId, borrowerId, sourceAppId, packageId };
	}

	it("admin — always true", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const { packageId } = await setupApplicationPackage(ctx);

			const viewer = adminViewer();
			const result = await canAccessApplicationPackage(ctx, viewer, packageId);
			expect(result).toBe(true);
		});
	});

	it("sr_underwriter — all packages true (assembled)", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const { packageId } = await setupApplicationPackage(ctx, {
				status: "assembled",
			});

			const viewer = makeViewer({
				authId: "sr-uw-auth",
				roles: new Set(["sr_underwriter"]),
			});
			const result = await canAccessApplicationPackage(ctx, viewer, packageId);
			expect(result).toBe(true);
		});
	});

	it("sr_underwriter — all packages true (under_review)", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const { packageId } = await setupApplicationPackage(ctx, {
				status: "under_review",
				machineContext: { claimedBy: "someone-else-auth" },
			});

			const viewer = makeViewer({
				authId: "sr-uw-auth",
				roles: new Set(["sr_underwriter"]),
			});
			const result = await canAccessApplicationPackage(ctx, viewer, packageId);
			expect(result).toBe(true);
		});
	});

	it("sr_underwriter — all packages true (decision_pending_review)", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const { packageId } = await setupApplicationPackage(ctx, {
				status: "decision_pending_review",
			});

			const viewer = makeViewer({
				authId: "sr-uw-auth",
				roles: new Set(["sr_underwriter"]),
			});
			const result = await canAccessApplicationPackage(ctx, viewer, packageId);
			expect(result).toBe(true);
		});
	});

	it("jr_underwriter — pool (assembled) — true", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const { packageId } = await setupApplicationPackage(ctx, {
				status: "assembled",
			});

			const viewer = makeViewer({
				authId: "jr-uw-auth",
				roles: new Set(["jr_underwriter"]),
			});
			const result = await canAccessApplicationPackage(ctx, viewer, packageId);
			expect(result).toBe(true);
		});
	});

	it("jr_underwriter — own claim (under_review, claimedBy self) — true", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const { packageId } = await setupApplicationPackage(ctx, {
				status: "under_review",
				machineContext: { claimedBy: "jr-uw-auth" },
			});

			const viewer = makeViewer({
				authId: "jr-uw-auth",
				roles: new Set(["jr_underwriter"]),
			});
			const result = await canAccessApplicationPackage(ctx, viewer, packageId);
			expect(result).toBe(true);
		});
	});

	it("jr_underwriter — other claim (under_review, claimedBy someone else) — false", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const { packageId } = await setupApplicationPackage(ctx, {
				status: "under_review",
				machineContext: { claimedBy: "someone-else-auth" },
			});

			const viewer = makeViewer({
				authId: "jr-uw-auth",
				roles: new Set(["jr_underwriter"]),
			});
			const result = await canAccessApplicationPackage(ctx, viewer, packageId);
			expect(result).toBe(false);
		});
	});

	it("underwriter role — pool (assembled) — true", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const { packageId } = await setupApplicationPackage(ctx, {
				status: "assembled",
			});

			const viewer = makeViewer({
				authId: "uw-auth",
				roles: new Set(["underwriter"]),
			});
			const result = await canAccessApplicationPackage(ctx, viewer, packageId);
			expect(result).toBe(true);
		});
	});

	it("review_decisions permission — decision_pending_review — true", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const { packageId } = await setupApplicationPackage(ctx, {
				status: "decision_pending_review",
			});

			const viewer = makeViewer({
				authId: "reviewer-auth",
				permissions: new Set(["underwriting:review_decisions"]),
			});
			const result = await canAccessApplicationPackage(ctx, viewer, packageId);
			expect(result).toBe(true);
		});
	});

	it("review_decisions permission — assembled — false (permission only covers decision_pending_review)", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const { packageId } = await setupApplicationPackage(ctx, {
				status: "assembled",
			});

			const viewer = makeViewer({
				authId: "reviewer-auth",
				permissions: new Set(["underwriting:review_decisions"]),
			});
			const result = await canAccessApplicationPackage(ctx, viewer, packageId);
			expect(result).toBe(false);
		});
	});

	it("random user — no roles or permissions — false", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const { packageId } = await setupApplicationPackage(ctx);

			const viewer = makeViewer({ authId: "random-user-auth" });
			const result = await canAccessApplicationPackage(ctx, viewer, packageId);
			expect(result).toBe(false);
		});
	});

	it("non-existent package — false", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			// Create and delete a package to get a valid but non-existent ID
			const { packageId } = await setupApplicationPackage(ctx);
			await ctx.db.delete(packageId);

			const viewer = makeViewer({
				authId: "sr-uw-auth",
				roles: new Set(["sr_underwriter"]),
			});
			const result = await canAccessApplicationPackage(ctx, viewer, packageId);
			expect(result).toBe(false);
		});
	});

	it("jr_underwriter — decision_pending_review — false", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const { packageId } = await setupApplicationPackage(ctx, {
				status: "decision_pending_review",
			});

			const viewer = makeViewer({
				authId: "jr-uw-auth",
				roles: new Set(["jr_underwriter"]),
			});
			const result = await canAccessApplicationPackage(ctx, viewer, packageId);
			expect(result).toBe(false);
		});
	});

	it("underwriter — decision_pending_review — false", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const { packageId } = await setupApplicationPackage(ctx, {
				status: "decision_pending_review",
			});

			const viewer = makeViewer({
				authId: "uw-auth",
				roles: new Set(["underwriter"]),
			});
			const result = await canAccessApplicationPackage(ctx, viewer, packageId);
			expect(result).toBe(false);
		});
	});

	it("review_decisions permission — under_review — false", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const { packageId } = await setupApplicationPackage(ctx, {
				status: "under_review",
				machineContext: { claimedBy: "someone-auth" },
			});

			const viewer = makeViewer({
				authId: "reviewer-auth",
				permissions: new Set(["underwriting:review_decisions"]),
			});
			const result = await canAccessApplicationPackage(ctx, viewer, packageId);
			expect(result).toBe(false);
		});
	});
});
