import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import type { Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import type { Viewer } from "../../fluent";
import schema from "../../schema";
import { convexModules } from "../../test/moduleMaps";
import {
	canAccessAccrual,
	canAccessApplicationPackage,
	canAccessBorrowerEntity,
	canAccessCashLedgerAccount,
	canAccessCounterpartyResource,
	canAccessDeal,
	canAccessDispersal,
	canAccessDocument,
	canAccessLedgerPosition,
	canAccessLenderEntity,
	canAccessMortgage,
	canAccessObligation,
	canAccessTransferRequest,
	canAccessWorkoutPlan,
} from "../resourceChecks";

const modules = convexModules;

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
		pendingDebits: 0n,
		pendingCredits: 0n,
		createdAt: NOW,
	});
}

async function insertLedgerReservation(
	ctx: MutationCtx,
	mortgageId: Id<"mortgages">,
	sellerAccountId: Id<"ledger_accounts">,
	buyerAccountId: Id<"ledger_accounts">,
	reserveJournalEntryId: Id<"ledger_journal_entries">,
	overrides: {
		status?: "pending" | "committed" | "voided";
		dealId?: string;
		amount?: number;
	} = {}
) {
	return ctx.db.insert("ledger_reservations", {
		mortgageId: mortgageId as string,
		sellerAccountId,
		buyerAccountId,
		amount: overrides.amount ?? 1000,
		status: overrides.status ?? "pending",
		dealId: overrides.dealId,
		reserveJournalEntryId,
		createdAt: NOW,
	});
}

async function insertSequenceCounter(ctx: MutationCtx, value = 1n) {
	return ctx.db.insert("ledger_sequence_counters", {
		name: "ledger_sequence" as const,
		value,
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

async function insertDocumentPrereqs(ctx: MutationCtx) {
	// convex-test supports storage.store() at runtime but the mutation type
	// definition (StorageWriter) doesn't expose it — cast through unknown.
	const storageId = await (
		ctx.storage as unknown as {
			store: (blob: Blob) => Promise<Id<"_storage">>;
		}
	).store(new Blob(["fake"]));
	const basePdfId = await ctx.db.insert("documentBasePdfs", {
		name: "test-base.pdf",
		fileRef: storageId,
		fileHash: "abc123",
		fileSize: 1024,
		pageCount: 1,
		pageDimensions: [{ page: 1, width: 612, height: 792 }],
		uploadedAt: NOW,
	});
	const templateId = await ctx.db.insert("documentTemplates", {
		name: "Test Template",
		basePdfId,
		basePdfHash: "abc123",
		draft: { fields: [], signatories: [] },
		hasDraftChanges: false,
		createdAt: NOW,
		updatedAt: NOW,
	});
	return { storageId, templateId };
}

async function insertGeneratedDocument(
	ctx: MutationCtx,
	templateId: Id<"documentTemplates">,
	pdfStorageId: Id<"_storage">,
	entityType:
		| "mortgage"
		| "deal"
		| "applicationPackage"
		| "provisionalApplication",
	entityId: string,
	sensitivityTier: "public" | "private" | "sensitive"
) {
	return ctx.db.insert("generatedDocuments", {
		name: "Test Document",
		templateId,
		templateVersionUsed: 1,
		pdfStorageId,
		entityType,
		entityId,
		sensitivityTier,
		signingStatus: "not_applicable",
		generatedBy: "system",
		generatedAt: NOW,
		updatedAt: NOW,
	});
}

describe("canAccessDocument", () => {
	it("admin — always true", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const { templateId, storageId } = await insertDocumentPrereqs(ctx);
			const brokerUserId = await insertUser(ctx, { authId: "broker-auth" });
			const brokerId = await insertBroker(ctx, brokerUserId);
			const propId = await insertProperty(ctx);
			const mortgageId = await insertMortgage(ctx, propId, brokerId);
			const docId = await insertGeneratedDocument(
				ctx,
				templateId,
				storageId,
				"mortgage",
				mortgageId,
				"sensitive"
			);

			const viewer = adminViewer();
			const result = await canAccessDocument(ctx, viewer, docId);
			expect(result).toBe(true);
		});
	});

	it("admin — non-existent document — true", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const { templateId, storageId } = await insertDocumentPrereqs(ctx);
			const brokerUserId = await insertUser(ctx, { authId: "broker-auth" });
			const brokerId = await insertBroker(ctx, brokerUserId);
			const propId = await insertProperty(ctx);
			const mortgageId = await insertMortgage(ctx, propId, brokerId);
			const docId = await insertGeneratedDocument(
				ctx,
				templateId,
				storageId,
				"mortgage",
				mortgageId,
				"sensitive"
			);
			// Delete the document so it no longer exists
			await ctx.db.delete(docId);

			// Admin short-circuits before DB lookup — should still return true
			const viewer = adminViewer();
			const result = await canAccessDocument(ctx, viewer, docId);
			expect(result).toBe(true);
		});
	});

	it("non-existent document — false", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const { templateId, storageId } = await insertDocumentPrereqs(ctx);
			const brokerUserId = await insertUser(ctx, { authId: "broker-auth" });
			const brokerId = await insertBroker(ctx, brokerUserId);
			const propId = await insertProperty(ctx);
			const mortgageId = await insertMortgage(ctx, propId, brokerId);
			const docId = await insertGeneratedDocument(
				ctx,
				templateId,
				storageId,
				"mortgage",
				mortgageId,
				"public"
			);
			await ctx.db.delete(docId);

			const viewer = makeViewer({ authId: "broker-auth" });
			const result = await canAccessDocument(ctx, viewer, docId);
			expect(result).toBe(false);
		});
	});

	// ── Public tier: entity access is sufficient ──────────────────

	it("public + mortgage — broker assigned — true", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const { templateId, storageId } = await insertDocumentPrereqs(ctx);
			const brokerUserId = await insertUser(ctx, { authId: "broker-auth" });
			const brokerId = await insertBroker(ctx, brokerUserId);
			const propId = await insertProperty(ctx);
			const mortgageId = await insertMortgage(ctx, propId, brokerId);
			const docId = await insertGeneratedDocument(
				ctx,
				templateId,
				storageId,
				"mortgage",
				mortgageId,
				"public"
			);

			const viewer = makeViewer({ authId: "broker-auth" });
			const result = await canAccessDocument(ctx, viewer, docId);
			expect(result).toBe(true);
		});
	});

	it("public + mortgage — random user — false", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const { templateId, storageId } = await insertDocumentPrereqs(ctx);
			const brokerUserId = await insertUser(ctx, { authId: "broker-auth" });
			const brokerId = await insertBroker(ctx, brokerUserId);
			const propId = await insertProperty(ctx);
			const mortgageId = await insertMortgage(ctx, propId, brokerId);
			const docId = await insertGeneratedDocument(
				ctx,
				templateId,
				storageId,
				"mortgage",
				mortgageId,
				"public"
			);

			const viewer = makeViewer({ authId: "random-user" });
			const result = await canAccessDocument(ctx, viewer, docId);
			expect(result).toBe(false);
		});
	});

	it("public + deal — buyer — true", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const { templateId, storageId } = await insertDocumentPrereqs(ctx);
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
			const docId = await insertGeneratedDocument(
				ctx,
				templateId,
				storageId,
				"deal",
				dealId,
				"public"
			);

			const viewer = makeViewer({ authId: "buyer-auth" });
			const result = await canAccessDocument(ctx, viewer, docId);
			expect(result).toBe(true);
		});
	});

	it("public + applicationPackage — sr_underwriter — true", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const { templateId, storageId } = await insertDocumentPrereqs(ctx);
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
				brokerId
			);
			const docId = await insertGeneratedDocument(
				ctx,
				templateId,
				storageId,
				"applicationPackage",
				packageId,
				"public"
			);

			const viewer = makeViewer({
				authId: "sr-uw-auth",
				roles: new Set(["sr_underwriter"]),
			});
			const result = await canAccessDocument(ctx, viewer, docId);
			expect(result).toBe(true);
		});
	});

	it("public + provisionalApplication — owning broker — true", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const { templateId, storageId } = await insertDocumentPrereqs(ctx);
			const brokerUserId = await insertUser(ctx, { authId: "broker-auth" });
			const brokerId = await insertBroker(ctx, brokerUserId);
			const borrowerUserId = await insertUser(ctx, {
				authId: "borrower-auth",
			});
			const borrowerId = await insertBorrower(ctx, borrowerUserId);
			const appId = await insertProvisionalApplication(
				ctx,
				brokerId,
				borrowerId
			);
			const docId = await insertGeneratedDocument(
				ctx,
				templateId,
				storageId,
				"provisionalApplication",
				appId,
				"public"
			);

			const viewer = makeViewer({ authId: "broker-auth" });
			const result = await canAccessDocument(ctx, viewer, docId);
			expect(result).toBe(true);
		});
	});

	it("public + provisionalApplication — random user — false", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const { templateId, storageId } = await insertDocumentPrereqs(ctx);
			const brokerUserId = await insertUser(ctx, { authId: "broker-auth" });
			const brokerId = await insertBroker(ctx, brokerUserId);
			const borrowerUserId = await insertUser(ctx, {
				authId: "borrower-auth",
			});
			const borrowerId = await insertBorrower(ctx, borrowerUserId);
			const appId = await insertProvisionalApplication(
				ctx,
				brokerId,
				borrowerId
			);
			const docId = await insertGeneratedDocument(
				ctx,
				templateId,
				storageId,
				"provisionalApplication",
				appId,
				"public"
			);

			const viewer = makeViewer({ authId: "random-user" });
			const result = await canAccessDocument(ctx, viewer, docId);
			expect(result).toBe(false);
		});
	});

	// ── Private tier: entity access + dealAccess ──────────────────

	it("private + deal — has active dealAccess — true", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const { templateId, storageId } = await insertDocumentPrereqs(ctx);
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
			await insertDealAccess(ctx, "lawyer-auth", dealId, "platform_lawyer");
			const docId = await insertGeneratedDocument(
				ctx,
				templateId,
				storageId,
				"deal",
				dealId,
				"private"
			);

			// Lawyer has dealAccess + canAccessDeal (via dealAccess)
			const viewer = makeViewer({ authId: "lawyer-auth" });
			const result = await canAccessDocument(ctx, viewer, docId);
			expect(result).toBe(true);
		});
	});

	it("private + deal — entity access but no dealAccess — false", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const { templateId, storageId } = await insertDocumentPrereqs(ctx);
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
			const docId = await insertGeneratedDocument(
				ctx,
				templateId,
				storageId,
				"deal",
				dealId,
				"private"
			);

			// Buyer can access the deal entity, but has no dealAccess record
			const viewer = makeViewer({ authId: "buyer-auth" });
			const result = await canAccessDocument(ctx, viewer, docId);
			expect(result).toBe(false);
		});
	});

	it("private + mortgage — has dealAccess on related deal — true", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const { templateId, storageId } = await insertDocumentPrereqs(ctx);
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
			await insertDealAccess(ctx, "lawyer-auth", dealId, "platform_lawyer");
			// Lawyer needs mortgage access too — assign via closingTeam
			await insertClosingTeamAssignment(ctx, mortgageId, "lawyer-auth");
			const docId = await insertGeneratedDocument(
				ctx,
				templateId,
				storageId,
				"mortgage",
				mortgageId,
				"private"
			);

			const viewer = makeViewer({ authId: "lawyer-auth" });
			const result = await canAccessDocument(ctx, viewer, docId);
			expect(result).toBe(true);
		});
	});

	it("private + mortgage — no dealAccess on any deal — false", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const { templateId, storageId } = await insertDocumentPrereqs(ctx);
			const brokerUserId = await insertUser(ctx, { authId: "broker-auth" });
			const brokerId = await insertBroker(ctx, brokerUserId);
			const propId = await insertProperty(ctx);
			const mortgageId = await insertMortgage(ctx, propId, brokerId);
			await insertDeal(ctx, mortgageId, "buyer-auth", "seller-auth");
			const docId = await insertGeneratedDocument(
				ctx,
				templateId,
				storageId,
				"mortgage",
				mortgageId,
				"private"
			);

			// Broker has entity access to mortgage but no dealAccess
			const viewer = makeViewer({ authId: "broker-auth" });
			const result = await canAccessDocument(ctx, viewer, docId);
			expect(result).toBe(false);
		});
	});

	it("private + applicationPackage — no deal access gate for pre-deal entity — false", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const { templateId, storageId } = await insertDocumentPrereqs(ctx);
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
				brokerId
			);
			const docId = await insertGeneratedDocument(
				ctx,
				templateId,
				storageId,
				"applicationPackage",
				packageId,
				"private"
			);

			// sr_underwriter has entity access, but pre-deal entities have no deal
			// to check dealAccess against — private tier cannot be satisfied
			const viewer = makeViewer({
				authId: "sr-uw-auth",
				roles: new Set(["sr_underwriter"]),
			});
			const result = await canAccessDocument(ctx, viewer, docId);
			expect(result).toBe(false);
		});
	});

	it("sensitive + applicationPackage — sr_underwriter with permission — false (no deal)", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const { templateId, storageId } = await insertDocumentPrereqs(ctx);
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
				brokerId
			);
			const docId = await insertGeneratedDocument(
				ctx,
				templateId,
				storageId,
				"applicationPackage",
				packageId,
				"sensitive"
			);

			// Even with entity access and the permission, there is no deal to
			// satisfy the dealAccess gate — sensitive tier on pre-deal entities
			// is inaccessible to non-admins
			const viewer = makeViewer({
				authId: "sr-uw-auth",
				roles: new Set(["sr_underwriter"]),
				permissions: new Set(["documents:sensitive_access"]),
			});
			const result = await canAccessDocument(ctx, viewer, docId);
			expect(result).toBe(false);
		});
	});

	it("sensitive + applicationPackage — sr_underwriter without permission — false", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const { templateId, storageId } = await insertDocumentPrereqs(ctx);
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
				brokerId
			);
			const docId = await insertGeneratedDocument(
				ctx,
				templateId,
				storageId,
				"applicationPackage",
				packageId,
				"sensitive"
			);

			// sr_underwriter has entity access but no documents:sensitive_access
			const viewer = makeViewer({
				authId: "sr-uw-auth",
				roles: new Set(["sr_underwriter"]),
			});
			const result = await canAccessDocument(ctx, viewer, docId);
			expect(result).toBe(false);
		});
	});

	// ── Sensitive tier: entity + dealAccess + permission ──────────

	it("sensitive + deal — dealAccess + permission — true", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const { templateId, storageId } = await insertDocumentPrereqs(ctx);
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
			await insertDealAccess(ctx, "lawyer-auth", dealId, "platform_lawyer");
			const docId = await insertGeneratedDocument(
				ctx,
				templateId,
				storageId,
				"deal",
				dealId,
				"sensitive"
			);

			const viewer = makeViewer({
				authId: "lawyer-auth",
				permissions: new Set(["documents:sensitive_access"]),
			});
			const result = await canAccessDocument(ctx, viewer, docId);
			expect(result).toBe(true);
		});
	});

	it("sensitive + deal — dealAccess but NO permission — false", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const { templateId, storageId } = await insertDocumentPrereqs(ctx);
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
			await insertDealAccess(ctx, "lawyer-auth", dealId, "platform_lawyer");
			const docId = await insertGeneratedDocument(
				ctx,
				templateId,
				storageId,
				"deal",
				dealId,
				"sensitive"
			);

			// Has dealAccess but no documents:sensitive_access permission
			const viewer = makeViewer({ authId: "lawyer-auth" });
			const result = await canAccessDocument(ctx, viewer, docId);
			expect(result).toBe(false);
		});
	});

	it("sensitive + deal — revoked dealAccess — false", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const { templateId, storageId } = await insertDocumentPrereqs(ctx);
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
				"revoked"
			);
			const docId = await insertGeneratedDocument(
				ctx,
				templateId,
				storageId,
				"deal",
				dealId,
				"sensitive"
			);

			const viewer = makeViewer({
				authId: "lawyer-auth",
				permissions: new Set(["documents:sensitive_access"]),
			});
			const result = await canAccessDocument(ctx, viewer, docId);
			expect(result).toBe(false);
		});
	});

	it("sensitive + mortgage — dealAccess + permission — true", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const { templateId, storageId } = await insertDocumentPrereqs(ctx);
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
			await insertDealAccess(ctx, "lawyer-auth", dealId, "platform_lawyer");
			// Lawyer needs mortgage access via closingTeamAssignment
			await insertClosingTeamAssignment(ctx, mortgageId, "lawyer-auth");
			const docId = await insertGeneratedDocument(
				ctx,
				templateId,
				storageId,
				"mortgage",
				mortgageId,
				"sensitive"
			);

			const viewer = makeViewer({
				authId: "lawyer-auth",
				permissions: new Set(["documents:sensitive_access"]),
			});
			const result = await canAccessDocument(ctx, viewer, docId);
			expect(result).toBe(true);
		});
	});

	it("sensitive + mortgage — dealAccess but NO permission — false", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const { templateId, storageId } = await insertDocumentPrereqs(ctx);
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
			await insertDealAccess(ctx, "lawyer-auth", dealId, "platform_lawyer");
			// Lawyer needs mortgage access via closingTeamAssignment
			await insertClosingTeamAssignment(ctx, mortgageId, "lawyer-auth");
			const docId = await insertGeneratedDocument(
				ctx,
				templateId,
				storageId,
				"mortgage",
				mortgageId,
				"sensitive"
			);

			// Has entity access and dealAccess but no documents:sensitive_access permission
			const viewer = makeViewer({ authId: "lawyer-auth" });
			const result = await canAccessDocument(ctx, viewer, docId);
			expect(result).toBe(false);
		});
	});

	it("sensitive + mortgage — entity access but no dealAccess — false", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const { templateId, storageId } = await insertDocumentPrereqs(ctx);
			const brokerUserId = await insertUser(ctx, { authId: "broker-auth" });
			const brokerId = await insertBroker(ctx, brokerUserId);
			const propId = await insertProperty(ctx);
			const mortgageId = await insertMortgage(ctx, propId, brokerId);
			await insertDeal(ctx, mortgageId, "buyer-auth", "seller-auth");
			// Lawyer has mortgage access via closingTeamAssignment but no dealAccess
			await insertClosingTeamAssignment(ctx, mortgageId, "lawyer-auth");
			const docId = await insertGeneratedDocument(
				ctx,
				templateId,
				storageId,
				"mortgage",
				mortgageId,
				"sensitive"
			);

			const viewer = makeViewer({
				authId: "lawyer-auth",
				permissions: new Set(["documents:sensitive_access"]),
			});
			const result = await canAccessDocument(ctx, viewer, docId);
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

// ═══════════════════════════════════════════════════════════════════
// Ledger table coverage: ledger_reservations, ledger_sequence_counters
// ═══════════════════════════════════════════════════════════════════

describe("ledger_reservations — access via parent mortgage", () => {
	it("lender with pending reservation still has access via POSITION balance", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const brokerUserId = await insertUser(ctx, { authId: "broker-auth" });
			const brokerId = await insertBroker(ctx, brokerUserId);
			const propId = await insertProperty(ctx);
			const mortgageId = await insertMortgage(ctx, propId, brokerId);

			// Create lender with a POSITION account that has pending amounts
			const lenderUserId = await insertUser(ctx, { authId: "lender-auth" });
			await insertLender(ctx, lenderUserId, brokerId);
			const positionId = await ctx.db.insert("ledger_accounts", {
				type: "POSITION",
				mortgageId: mortgageId as string,
				lenderId: "lender-auth",
				cumulativeDebits: 5000n,
				cumulativeCredits: 0n,
				pendingDebits: 0n,
				pendingCredits: 1000n,
				createdAt: NOW,
			});

			// Insert a journal entry to serve as the reservation's required reference
			await insertSequenceCounter(ctx, 1n);
			const journalEntryId = await ctx.db.insert("ledger_journal_entries", {
				sequenceNumber: 1n,
				entryType: "SHARES_RESERVED",
				mortgageId: mortgageId as string,
				effectiveDate: "2026-01-01",
				timestamp: NOW,
				debitAccountId: positionId,
				creditAccountId: positionId,
				amount: 1000,
				idempotencyKey: "test-reserve-1",
				source: { type: "system" },
			});

			// Create the reservation referencing the position accounts
			await insertLedgerReservation(
				ctx,
				mortgageId,
				positionId,
				positionId,
				journalEntryId,
				{ status: "pending", amount: 1000 }
			);

			// Lender still has access since cumulative balance (5000) is positive
			const viewer = makeViewer({ authId: "lender-auth" });
			const result = await canAccessMortgage(ctx, viewer, mortgageId);
			expect(result).toBe(true);
		});
	});

	it("admin can access mortgage with reservations", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const brokerUserId = await insertUser(ctx, { authId: "broker-auth" });
			const brokerId = await insertBroker(ctx, brokerUserId);
			const propId = await insertProperty(ctx);
			const mortgageId = await insertMortgage(ctx, propId, brokerId);

			const positionId = await ctx.db.insert("ledger_accounts", {
				type: "POSITION",
				mortgageId: mortgageId as string,
				lenderId: "some-lender",
				cumulativeDebits: 5000n,
				cumulativeCredits: 0n,
				pendingDebits: 0n,
				pendingCredits: 2000n,
				createdAt: NOW,
			});

			await insertSequenceCounter(ctx, 1n);
			const journalEntryId = await ctx.db.insert("ledger_journal_entries", {
				sequenceNumber: 1n,
				entryType: "SHARES_RESERVED",
				mortgageId: mortgageId as string,
				effectiveDate: "2026-01-01",
				timestamp: NOW,
				debitAccountId: positionId,
				creditAccountId: positionId,
				amount: 2000,
				idempotencyKey: "test-reserve-admin-1",
				source: { type: "system" },
			});

			await insertLedgerReservation(
				ctx,
				mortgageId,
				positionId,
				positionId,
				journalEntryId,
				{ status: "pending", amount: 2000 }
			);

			const viewer = adminViewer();
			const result = await canAccessMortgage(ctx, viewer, mortgageId);
			expect(result).toBe(true);
		});
	});
});

describe("ledger_sequence_counters — table insertable", () => {
	it("sequence counter can be seeded and read back", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const counterId = await insertSequenceCounter(ctx, 42n);
			const counter = await ctx.db.get(counterId);
			expect(counter).not.toBeNull();
			expect(counter?.name).toBe("ledger_sequence");
			expect(counter?.value).toBe(42n);
		});
	});
});

describe("pendingDebits / pendingCredits — field presence in ledger_accounts", () => {
	it("POSITION account with only pending balance — no access (pending not counted for access)", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const brokerUserId = await insertUser(ctx, { authId: "broker-auth" });
			const brokerId = await insertBroker(ctx, brokerUserId);
			const propId = await insertProperty(ctx);
			const mortgageId = await insertMortgage(ctx, propId, brokerId);

			const lenderUserId = await insertUser(ctx, { authId: "lender-auth" });
			await insertLender(ctx, lenderUserId, brokerId);

			// Zero cumulative balance, but non-zero pending debits
			await ctx.db.insert("ledger_accounts", {
				type: "POSITION",
				mortgageId: mortgageId as string,
				lenderId: "lender-auth",
				cumulativeDebits: 0n,
				cumulativeCredits: 0n,
				pendingDebits: 5000n,
				pendingCredits: 0n,
				createdAt: NOW,
			});

			// pendingDebits alone should NOT grant access (computeBalance uses cumulative only)
			const viewer = makeViewer({ authId: "lender-auth" });
			const result = await canAccessMortgage(ctx, viewer, mortgageId);
			expect(result).toBe(false);
		});
	});

	it("POSITION account with cumulative and pending — access based on cumulative", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const brokerUserId = await insertUser(ctx, { authId: "broker-auth" });
			const brokerId = await insertBroker(ctx, brokerUserId);
			const propId = await insertProperty(ctx);
			const mortgageId = await insertMortgage(ctx, propId, brokerId);

			const lenderUserId = await insertUser(ctx, { authId: "lender-auth" });
			await insertLender(ctx, lenderUserId, brokerId);

			// Positive cumulative balance with pending credits (future reservation)
			await ctx.db.insert("ledger_accounts", {
				type: "POSITION",
				mortgageId: mortgageId as string,
				lenderId: "lender-auth",
				cumulativeDebits: 5000n,
				cumulativeCredits: 0n,
				pendingDebits: 0n,
				pendingCredits: 5000n,
				createdAt: NOW,
			});

			// Should still have access — cumulative balance is positive (5000 - 0 = 5000)
			const viewer = makeViewer({ authId: "lender-auth" });
			const result = await canAccessMortgage(ctx, viewer, mortgageId);
			expect(result).toBe(true);
		});
	});

	it("ledger position access — pending fields respected on account with positive cumulative", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const brokerUserId = await insertUser(ctx, { authId: "broker-auth" });
			const brokerId = await insertBroker(ctx, brokerUserId);
			const propId = await insertProperty(ctx);
			const mortgageId = await insertMortgage(ctx, propId, brokerId);

			const lenderUserId = await insertUser(ctx, { authId: "lender-auth" });
			await insertLender(ctx, lenderUserId, brokerId);

			await ctx.db.insert("ledger_accounts", {
				type: "POSITION",
				mortgageId: mortgageId as string,
				lenderId: "lender-auth",
				cumulativeDebits: 3000n,
				cumulativeCredits: 0n,
				pendingDebits: 1000n,
				pendingCredits: 2000n,
				createdAt: NOW,
			});

			const viewer = makeViewer({ authId: "lender-auth" });
			const result = await canAccessLedgerPosition(ctx, viewer, mortgageId);
			expect(result).toBe(true);
		});
	});
});

describe("payment resource helpers", () => {
	it("canAccessLenderEntity allows the lender and their broker", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const brokerUserId = await insertUser(ctx, { authId: "broker-auth" });
			const brokerId = await insertBroker(ctx, brokerUserId);
			const lenderUserId = await insertUser(ctx, { authId: "lender-auth" });
			const lenderId = await insertLender(ctx, lenderUserId, brokerId);

			expect(
				await canAccessLenderEntity(
					ctx,
					makeViewer({ authId: "lender-auth" }),
					lenderId
				)
			).toBe(true);
			expect(
				await canAccessLenderEntity(
					ctx,
					makeViewer({ authId: "broker-auth" }),
					lenderId
				)
			).toBe(true);
			expect(
				await canAccessLenderEntity(
					ctx,
					makeViewer({ authId: "other-auth" }),
					lenderId
				)
			).toBe(false);
		});
	});

	it("canAccessBorrowerEntity and canAccessObligation follow borrower ownership", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const brokerUserId = await insertUser(ctx, { authId: "broker-auth" });
			const brokerId = await insertBroker(ctx, brokerUserId);
			const borrowerUserId = await insertUser(ctx, { authId: "borrower-auth" });
			const borrowerId = await insertBorrower(ctx, borrowerUserId);
			const propertyId = await insertProperty(ctx);
			const mortgageId = await insertMortgage(ctx, propertyId, brokerId);
			await insertMortgageBorrower(ctx, mortgageId, borrowerId);
			const obligationId = await ctx.db.insert("obligations", {
				status: "upcoming",
				machineContext: {},
				lastTransitionAt: NOW,
				mortgageId,
				borrowerId,
				paymentNumber: 1,
				type: "regular_interest",
				amount: 25_000,
				amountSettled: 0,
				dueDate: NOW,
				gracePeriodEnd: NOW,
				createdAt: NOW,
			});

			const viewer = makeViewer({ authId: "borrower-auth" });
			expect(await canAccessBorrowerEntity(ctx, viewer, borrowerId)).toBe(true);
			expect(await canAccessObligation(ctx, viewer, obligationId)).toBe(true);
		});
	});

	it("canAccessBorrowerEntity scopes third-party access to the matching mortgage", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const brokerAUserId = await insertUser(ctx, { authId: "broker-a" });
			const brokerAId = await insertBroker(ctx, brokerAUserId);
			const brokerBUserId = await insertUser(ctx, { authId: "broker-b" });
			const brokerBId = await insertBroker(ctx, brokerBUserId);
			const borrowerUserId = await insertUser(ctx, { authId: "borrower-auth" });
			const borrowerId = await insertBorrower(ctx, borrowerUserId);

			const propertyAId = await insertProperty(ctx);
			const mortgageAId = await insertMortgage(ctx, propertyAId, brokerAId);
			await insertMortgageBorrower(ctx, mortgageAId, borrowerId);

			const propertyBId = await insertProperty(ctx);
			const mortgageBId = await insertMortgage(ctx, propertyBId, brokerBId);
			await insertMortgageBorrower(ctx, mortgageBId, borrowerId);

			const viewer = makeViewer({ authId: "broker-a" });
			expect(await canAccessBorrowerEntity(ctx, viewer, borrowerId)).toBe(
				false
			);
			expect(
				await canAccessBorrowerEntity(ctx, viewer, borrowerId, mortgageAId)
			).toBe(true);
			expect(
				await canAccessBorrowerEntity(ctx, viewer, borrowerId, mortgageBId)
			).toBe(false);
		});
	});

	it("canAccessCounterpartyResource rejects trust for non-admin viewers", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const viewer = makeViewer({ authId: "member-auth" });
			expect(
				await canAccessCounterpartyResource(ctx, viewer, "trust", "trust-001")
			).toBe(false);
		});
	});

	it("canAccessTransferRequest and canAccessWorkoutPlan follow mortgage access", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const brokerUserId = await insertUser(ctx, { authId: "broker-auth" });
			const brokerId = await insertBroker(ctx, brokerUserId);
			const propertyId = await insertProperty(ctx);
			const mortgageId = await insertMortgage(ctx, propertyId, brokerId);

			const transferId = await ctx.db.insert("transferRequests", {
				status: "pending",
				direction: "inbound",
				transferType: "borrower_interest_collection",
				amount: 15_000,
				currency: "CAD",
				counterpartyType: "borrower",
				counterpartyId: "borrower-demo",
				providerCode: "manual",
				idempotencyKey: "resource-check-transfer",
				source: {
					actorId: "test",
					actorType: "system",
					channel: "admin_dashboard",
				},
				mortgageId,
				createdAt: NOW,
				lastTransitionAt: NOW,
			});

			const workoutPlanId = await ctx.db.insert("workoutPlans", {
				mortgageId,
				name: "Workout",
				rationale: "Test",
				status: "draft",
				strategy: {
					kind: "custom_schedule",
					installments: [],
				},
				createdByActorId: "test",
				createdByActorType: "admin",
				createdAt: NOW,
				updatedAt: NOW,
			});

			const viewer = makeViewer({ authId: "broker-auth" });
			expect(await canAccessTransferRequest(ctx, viewer, transferId)).toBe(
				true
			);
			expect(await canAccessWorkoutPlan(ctx, viewer, workoutPlanId)).toBe(true);
		});
	});

	it("canAccessCashLedgerAccount follows mortgage-linked receivable ownership", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const brokerUserId = await insertUser(ctx, { authId: "broker-auth" });
			const brokerId = await insertBroker(ctx, brokerUserId);
			const borrowerUserId = await insertUser(ctx, { authId: "borrower-auth" });
			const borrowerId = await insertBorrower(ctx, borrowerUserId);
			const propertyId = await insertProperty(ctx);
			const mortgageId = await insertMortgage(ctx, propertyId, brokerId);
			await insertMortgageBorrower(ctx, mortgageId, borrowerId);
			const obligationId = await ctx.db.insert("obligations", {
				status: "upcoming",
				machineContext: {},
				lastTransitionAt: NOW,
				mortgageId,
				borrowerId,
				paymentNumber: 1,
				type: "regular_interest",
				amount: 30_000,
				amountSettled: 0,
				dueDate: NOW,
				gracePeriodEnd: NOW,
				createdAt: NOW,
			});
			const accountId = await ctx.db.insert("cash_ledger_accounts", {
				family: "BORROWER_RECEIVABLE",
				mortgageId,
				obligationId,
				borrowerId,
				cumulativeDebits: 30_000n,
				cumulativeCredits: 0n,
				createdAt: NOW,
			});

			const viewer = makeViewer({ authId: "borrower-auth" });
			expect(await canAccessCashLedgerAccount(ctx, viewer, accountId)).toBe(
				true
			);
		});
	});
});
