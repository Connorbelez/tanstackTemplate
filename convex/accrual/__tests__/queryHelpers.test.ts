import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "../../_generated/api";
import { FAIRLEND_STAFF_ORG_ID } from "../../constants";
import schema from "../../schema";
import { calculatePeriodAccrual } from "../interestMath";
import {
	buildDailyAccrualBreakdown,
	buildLenderAccrualResult,
	buildMortgageAccrualBreakdown,
	buildPortfolioAccrualBreakdown,
} from "../queryHelpers";

const modules = import.meta.glob("/convex/**/*.ts");

const LEDGER_TEST_IDENTITY = {
	subject: "test-ledger-user",
	issuer: "https://api.workos.com",
	org_id: FAIRLEND_STAFF_ORG_ID,
	organization_name: "FairLend Staff",
	role: "admin",
	roles: JSON.stringify(["admin"]),
	permissions: JSON.stringify(["ledger:view", "ledger:correct"]),
	user_email: "ledger-test@fairlend.ca",
	user_first_name: "Ledger",
	user_last_name: "Tester",
};

const SYS_SOURCE = { type: "system" as const, channel: "test" };

function createTestHarness() {
	return convexTest(schema, modules);
}

function asLedgerUser(t: ReturnType<typeof createTestHarness>) {
	return t.withIdentity(LEDGER_TEST_IDENTITY);
}

async function initCounter(t: ReturnType<typeof createTestHarness>) {
	await asLedgerUser(t).mutation(
		api.ledger.sequenceCounter.initializeSequenceCounter,
		{}
	);
}

async function seedMortgageDoc(
	t: ReturnType<typeof createTestHarness>,
	overrides: {
		interestRate: number;
		principal: number;
		termStartDate: string;
	} = {
		interestRate: 0.1,
		principal: 100_000,
		termStartDate: "2026-01-01",
	}
) {
	return t.run(async (ctx) => {
		const createdAt = Date.now();
		const brokerUserId = await ctx.db.insert("users", {
			authId: `broker-${createdAt}`,
			email: `broker-${createdAt}@fairlend.test`,
			firstName: "Broker",
			lastName: "Tester",
		});
		const brokerId = await ctx.db.insert("brokers", {
			status: "active",
			userId: brokerUserId,
			createdAt,
		});
		const propertyId = await ctx.db.insert("properties", {
			streetAddress: "1 Accrual Street",
			city: "Toronto",
			province: "ON",
			postalCode: "M5V1E1",
			propertyType: "residential",
			createdAt,
		});
		return ctx.db.insert("mortgages", {
			status: "active",
			machineContext: { missedPayments: 0, lastPaymentAt: 0 },
			lastTransitionAt: createdAt,
			propertyId,
			principal: overrides.principal,
			interestRate: overrides.interestRate,
			rateType: "fixed",
			termMonths: 12,
			amortizationMonths: 12,
			paymentAmount: 1000,
			paymentFrequency: "monthly",
			loanType: "conventional",
			lienPosition: 1,
			interestAdjustmentDate: overrides.termStartDate,
			termStartDate: overrides.termStartDate,
			maturityDate: "2026-12-31",
			firstPaymentDate: "2026-02-01",
			brokerOfRecordId: brokerId,
			createdAt,
		});
	});
}

async function mintAndIssue(
	t: ReturnType<typeof createTestHarness>,
	mortgageId: string,
	lenderId: string,
	amount = 10_000,
	effectiveDate = "2026-01-01"
) {
	const auth = asLedgerUser(t);
	await auth.mutation(api.ledger.mutations.mintMortgage, {
		mortgageId,
		effectiveDate,
		idempotencyKey: `mint-${mortgageId}`,
		source: SYS_SOURCE,
	});
	return auth.mutation(internal.ledger.mutations.issueShares, {
		mortgageId,
		lenderId,
		amount,
		effectiveDate,
		idempotencyKey: `issue-${mortgageId}-${lenderId}`,
		source: SYS_SOURCE,
	});
}

describe("accrual query helpers", () => {
	it("builds lender accrual results from ownership periods", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const mortgageId = await seedMortgageDoc(t);

		await mintAndIssue(t, String(mortgageId), "lender-a");
		await asLedgerUser(t).mutation(api.ledger.mutations.transferShares, {
			mortgageId: String(mortgageId),
			sellerLenderId: "lender-a",
			buyerLenderId: "lender-b",
			amount: 5000,
			effectiveDate: "2026-01-15",
			idempotencyKey: "transfer-accrual",
			source: SYS_SOURCE,
		});

		const result = await t.run(async (ctx) =>
			buildLenderAccrualResult(
				ctx,
				mortgageId,
				"lender-a",
				"2026-01-01",
				"2026-01-31"
			)
		);

		expect(result).toEqual({
			mortgageId: String(mortgageId),
			lenderId: "lender-a",
			fromDate: "2026-01-01",
			toDate: "2026-01-31",
			accruedInterest: expect.any(Number),
			periods: [
				{
					fraction: 1,
					fromDate: "2026-01-01",
					toDate: "2026-01-15",
				},
				{
					fraction: 0.5,
					fromDate: "2026-01-16",
					toDate: "2026-01-31",
				},
			],
		});

		const expected =
			calculatePeriodAccrual(0.1, 1, 100_000, 15) +
			calculatePeriodAccrual(0.1, 0.5, 100_000, 16);
		expect(result.accruedInterest).toBeCloseTo(expected, 10);
	});

	it("aggregates mortgage accrual across lenders", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const mortgageId = await seedMortgageDoc(t);

		await mintAndIssue(t, String(mortgageId), "seller");
		await asLedgerUser(t).mutation(api.ledger.mutations.transferShares, {
			mortgageId: String(mortgageId),
			sellerLenderId: "seller",
			buyerLenderId: "buyer",
			amount: 5000,
			effectiveDate: "2026-01-15",
			idempotencyKey: "transfer-mortgage",
			source: SYS_SOURCE,
		});

		const result = await t.run(async (ctx) =>
			buildMortgageAccrualBreakdown(ctx, mortgageId, "2026-01-01", "2026-01-31")
		);

		expect(result.mortgageId).toBe(String(mortgageId));
		expect(result.lenderBreakdowns).toHaveLength(2);
		expect(result.lenderBreakdowns.map((entry) => entry.lenderId)).toEqual([
			"buyer",
			"seller",
		]);

		const expected =
			calculatePeriodAccrual(0.1, 1, 100_000, 15) +
			calculatePeriodAccrual(0.1, 0.5, 100_000, 16) +
			calculatePeriodAccrual(0.1, 0.5, 100_000, 16);
		expect(result.accruedInterest).toBeCloseTo(expected, 10);
	});

	it("reuses the mortgage flow for daily accrual", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const mortgageId = await seedMortgageDoc(t);

		await mintAndIssue(t, String(mortgageId), "lender-a");
		await asLedgerUser(t).mutation(api.ledger.mutations.transferShares, {
			mortgageId: String(mortgageId),
			sellerLenderId: "lender-a",
			buyerLenderId: "lender-b",
			amount: 5000,
			effectiveDate: "2026-01-15",
			idempotencyKey: "transfer-daily",
			source: SYS_SOURCE,
		});

		const result = await t.run(async (ctx) =>
			buildDailyAccrualBreakdown(ctx, mortgageId, "2026-01-16")
		);

		expect(result.date).toBe("2026-01-16");
		expect(result.lenderBreakdowns).toHaveLength(2);
		expect(result.accruedInterest).toBeCloseTo(
			calculatePeriodAccrual(0.1, 1, 100_000, 1),
			10
		);
	});

	it("aggregates portfolio accrual across active mortgages", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const firstMortgageId = await seedMortgageDoc(t);
		const secondMortgageId = await seedMortgageDoc(t, {
			interestRate: 0.12,
			principal: 250_000,
			termStartDate: "2026-02-01",
		});

		await mintAndIssue(t, String(firstMortgageId), "portfolio-lender");
		await mintAndIssue(t, String(secondMortgageId), "portfolio-lender");

		const result = await t.run(async (ctx) =>
			buildPortfolioAccrualBreakdown(
				ctx,
				"portfolio-lender",
				"2026-01-01",
				"2026-01-31"
			)
		);

		expect(result.lenderId).toBe("portfolio-lender");
		expect(result.mortgageBreakdowns).toHaveLength(2);
		expect(result.mortgageBreakdowns.map((entry) => entry.mortgageId)).toEqual([
			String(firstMortgageId),
			String(secondMortgageId),
		]);
		expect(result.accruedInterest).toBeCloseTo(
			calculatePeriodAccrual(0.1, 1, 100_000, 31) +
				calculatePeriodAccrual(0.12, 1, 250_000, 31),
			10
		);
	});
});
