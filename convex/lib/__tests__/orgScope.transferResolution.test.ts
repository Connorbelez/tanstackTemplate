import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import type { MutationCtx } from "../../_generated/server";
import schema from "../../schema";
import { orgIdForTransferRequest } from "../orgScope";

const modules = import.meta.glob("/convex/**/*.ts");

const WORKOS_ORG = "org_workos_test_001";

async function seedBrokerMortgageLenderBorrower(
	ctx: MutationCtx,
	options: {
		mortgageOrgId?: string;
		brokerOrgId?: string;
		lenderOrgId?: string;
		borrowerOrgId?: string;
	}
) {
	const now = Date.now();
	const brokerUserId = await ctx.db.insert("users", {
		authId: `auth-broker-${now}`,
		email: `broker-${now}@test.fairlend`,
		firstName: "B",
		lastName: "R",
	});
	const brokerId = await ctx.db.insert("brokers", {
		status: "active",
		userId: brokerUserId,
		createdAt: now,
		orgId: options.brokerOrgId ?? WORKOS_ORG,
	});

	const propertyId = await ctx.db.insert("properties", {
		streetAddress: "1 Test St",
		city: "Toronto",
		province: "ON",
		postalCode: "M5V1A1",
		propertyType: "residential",
		createdAt: now,
	});

	const mortgageId = await ctx.db.insert("mortgages", {
		orgId: options.mortgageOrgId,
		status: "active",
		machineContext: { lastPaymentAt: 0, missedPayments: 0 },
		lastTransitionAt: now,
		propertyId,
		principal: 50_000_000,
		interestRate: 5.5,
		rateType: "fixed",
		termMonths: 60,
		amortizationMonths: 300,
		paymentAmount: 300_000,
		paymentFrequency: "monthly",
		loanType: "conventional",
		lienPosition: 1,
		interestAdjustmentDate: "2026-01-01",
		termStartDate: "2026-01-01",
		maturityDate: "2031-01-01",
		firstPaymentDate: "2026-02-01",
		brokerOfRecordId: brokerId,
		createdAt: now,
	});

	const lenderUserId = await ctx.db.insert("users", {
		authId: `auth-lender-${now}`,
		email: `lender-${now}@test.fairlend`,
		firstName: "L",
		lastName: "N",
	});
	const lenderId = await ctx.db.insert("lenders", {
		userId: lenderUserId,
		brokerId,
		orgId: options.lenderOrgId,
		accreditationStatus: "accredited",
		onboardingEntryPath: "/test",
		status: "active",
		createdAt: now,
	});

	const borrowerUserId = await ctx.db.insert("users", {
		authId: `auth-borrower-${now}`,
		email: `borrower-${now}@test.fairlend`,
		firstName: "B",
		lastName: "W",
	});
	const borrowerId = await ctx.db.insert("borrowers", {
		status: "active",
		userId: borrowerUserId,
		orgId: options.borrowerOrgId,
		createdAt: now,
	});

	const obligationId = await ctx.db.insert("obligations", {
		status: "upcoming",
		lastTransitionAt: now,
		mortgageId,
		borrowerId,
		paymentNumber: 1,
		type: "regular_interest",
		amount: 100_000,
		amountSettled: 0,
		dueDate: now,
		gracePeriodEnd: now + 86_400_000,
		createdAt: now,
	});

	return {
		brokerId,
		mortgageId,
		lenderId,
		borrowerId,
		obligationId,
	};
}

describe("orgIdForTransferRequest", () => {
	it("uses mortgage.orgId when present", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const ids = await seedBrokerMortgageLenderBorrower(ctx, {
				mortgageOrgId: WORKOS_ORG,
				brokerOrgId: "org_other_broker",
			});
			const resolved = await orgIdForTransferRequest(ctx, {
				mortgageId: ids.mortgageId,
			});
			expect(resolved).toBe(WORKOS_ORG);
		});
	});

	it("falls back to broker org when mortgage.orgId is missing", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const ids = await seedBrokerMortgageLenderBorrower(ctx, {
				mortgageOrgId: undefined,
				brokerOrgId: WORKOS_ORG,
			});
			const resolved = await orgIdForTransferRequest(ctx, {
				mortgageId: ids.mortgageId,
			});
			expect(resolved).toBe(WORKOS_ORG);
		});
	});

	it("resolves obligation via mortgage broker chain when obligation.orgId missing", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const ids = await seedBrokerMortgageLenderBorrower(ctx, {
				mortgageOrgId: undefined,
				brokerOrgId: WORKOS_ORG,
			});
			const resolved = await orgIdForTransferRequest(ctx, {
				obligationId: ids.obligationId,
			});
			expect(resolved).toBe(WORKOS_ORG);
		});
	});

	it("uses lender broker org when lender.orgId is missing", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const ids = await seedBrokerMortgageLenderBorrower(ctx, {
				mortgageOrgId: undefined,
				brokerOrgId: WORKOS_ORG,
				lenderOrgId: undefined,
			});
			const resolved = await orgIdForTransferRequest(ctx, {
				lenderId: ids.lenderId,
			});
			expect(resolved).toBe(WORKOS_ORG);
		});
	});

	it("resolves deal via mortgage when deal.orgId is missing", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const ids = await seedBrokerMortgageLenderBorrower(ctx, {
				mortgageOrgId: undefined,
				brokerOrgId: WORKOS_ORG,
			});
			const dealId = await ctx.db.insert("deals", {
				status: "confirmed",
				mortgageId: ids.mortgageId,
				buyerId: "buyer-domain-id",
				sellerId: "seller-domain-id",
				fractionalShare: 1000,
				createdAt: Date.now(),
				createdBy: "test",
			});
			const resolved = await orgIdForTransferRequest(ctx, {
				dealId,
			});
			expect(resolved).toBe(WORKOS_ORG);
		});
	});

	it("uses borrower.orgId when set", async () => {
		const t = convexTest(schema, modules);
		const borrowerOrg = "org_borrower_only";
		await t.run(async (ctx) => {
			const ids = await seedBrokerMortgageLenderBorrower(ctx, {
				mortgageOrgId: undefined,
				brokerOrgId: WORKOS_ORG,
				borrowerOrgId: borrowerOrg,
			});
			const resolved = await orgIdForTransferRequest(ctx, {
				borrowerId: ids.borrowerId,
			});
			expect(resolved).toBe(borrowerOrg);
		});
	});
});
