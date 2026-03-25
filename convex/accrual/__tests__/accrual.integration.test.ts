import { makeFunctionReference } from "convex/server";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { FAIRLEND_STAFF_ORG_ID } from "../../constants";
import schema from "../../schema";
import { calculatePeriodAccrual } from "../interestMath";

const modules = import.meta.glob("/convex/**/*.ts");

const ADMIN_IDENTITY = {
	subject: "integration-admin",
	issuer: "https://api.workos.com",
	org_id: FAIRLEND_STAFF_ORG_ID,
	organization_name: "FairLend Staff",
	role: "admin",
	roles: JSON.stringify(["admin"]),
	permissions: JSON.stringify(["ledger:view", "ledger:correct"]),
	user_email: "integration-admin@fairlend.ca",
	user_first_name: "Integration",
	user_last_name: "Admin",
};

function lenderIdentity(subject: string) {
	return {
		subject,
		issuer: "https://api.workos.com",
		permissions: JSON.stringify(["ledger:view"]),
		user_email: `${subject}@fairlend.test`,
		user_first_name: "Accrual",
		user_last_name: "Tester",
	};
}

interface OwnershipPeriodSlice {
	fraction: number;
	fromDate: string;
	toDate: string;
}

interface AccruedInterestQueryArgs extends Record<string, unknown> {
	fromDate: string;
	lenderId: string;
	mortgageId: Id<"mortgages">;
	toDate: string;
}

interface AccruedInterestQueryResult {
	accruedInterest: number;
	fromDate: string;
	lenderId: string;
	mortgageId: string;
	periods: OwnershipPeriodSlice[];
	toDate: string;
}

interface MortgageAccrualQueryResult {
	accruedInterest: number;
	fromDate: string;
	interestRate: number;
	lenderBreakdowns: AccruedInterestQueryResult[];
	mortgageId: string;
	principal: number;
	toDate: string;
}

interface MortgageAccrualQueryArgs extends Record<string, unknown> {
	fromDate: string;
	mortgageId: Id<"mortgages">;
	toDate: string;
}

interface PortfolioAccrualQueryResult {
	accruedInterest: number;
	fromDate: string;
	lenderId: string;
	mortgageBreakdowns: AccruedInterestQueryResult[];
	toDate: string;
}

interface PortfolioAccrualQueryArgs extends Record<string, unknown> {
	fromDate: string;
	lenderId: string;
	toDate: string;
}

interface DailyAccrualQueryResult {
	accruedInterest: number;
	date: string;
	lenderBreakdowns: AccruedInterestQueryResult[];
	mortgageId: string;
}

interface DailyAccrualQueryArgs extends Record<string, unknown> {
	date: string;
	mortgageId: Id<"mortgages">;
}

const SINGLE_LENDER_QUERY = makeFunctionReference<
	"query",
	AccruedInterestQueryArgs,
	AccruedInterestQueryResult
>("accrual/calculateAccruedInterest:calculateAccruedInterest");
const BY_MORTGAGE_QUERY = makeFunctionReference<
	"query",
	MortgageAccrualQueryArgs,
	MortgageAccrualQueryResult
>("accrual/calculateAccruedByMortgage:calculateAccruedByMortgage");
const PORTFOLIO_QUERY = makeFunctionReference<
	"query",
	PortfolioAccrualQueryArgs,
	PortfolioAccrualQueryResult
>("accrual/calculateInvestorPortfolio:calculateInvestorPortfolioAccrual");
const DAILY_QUERY = makeFunctionReference<
	"query",
	DailyAccrualQueryArgs,
	DailyAccrualQueryResult
>("accrual/calculateDailyAccrual:calculateDailyAccrual");

const SYS_SOURCE = { type: "system" as const, channel: "test" };

function createTestHarness() {
	return convexTest(schema, modules);
}

function asAdmin(t: ReturnType<typeof createTestHarness>) {
	return t.withIdentity(ADMIN_IDENTITY);
}

function asLender(t: ReturnType<typeof createTestHarness>, lenderId: string) {
	return t.withIdentity(lenderIdentity(lenderId));
}

async function initCounter(t: ReturnType<typeof createTestHarness>) {
	await asAdmin(t).mutation(
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
	const auth = asAdmin(t);
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

describe("accrual integration", () => {
	it("exercises the public accrual queries against real mortgage rows and ledger activity", async () => {
		const t = createTestHarness();
		await initCounter(t);

		const firstMortgageId = await seedMortgageDoc(t);
		const secondMortgageId = await seedMortgageDoc(t, {
			interestRate: 0.12,
			principal: 250_000,
			termStartDate: "2026-02-01",
		});

		await mintAndIssue(t, String(firstMortgageId), "lender-a");
		await mintAndIssue(
			t,
			String(secondMortgageId),
			"lender-a",
			10_000,
			"2026-02-01"
		);
		await asAdmin(t).mutation(api.ledger.mutations.transferShares, {
			mortgageId: String(firstMortgageId),
			sellerLenderId: "lender-a",
			buyerLenderId: "lender-b",
			amount: 5000,
			effectiveDate: "2026-01-15",
			idempotencyKey: "transfer-accrual",
			source: SYS_SOURCE,
		});

		const lenderA = asLender(t, "lender-a");
		const lenderB = asLender(t, "lender-b");

		const sellerSingle = await lenderA.query(SINGLE_LENDER_QUERY, {
			fromDate: "2026-01-01",
			lenderId: "lender-a",
			mortgageId: firstMortgageId,
			toDate: "2026-01-31",
		});
		expect(sellerSingle).toEqual({
			mortgageId: String(firstMortgageId),
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
		expect(sellerSingle.accruedInterest).toBeCloseTo(
			calculatePeriodAccrual(0.1, 1, 100_000, 15) +
				calculatePeriodAccrual(0.1, 0.5, 100_000, 16),
			10
		);

		const buyerSingle = await lenderB.query(SINGLE_LENDER_QUERY, {
			fromDate: "2026-01-01",
			lenderId: "lender-b",
			mortgageId: firstMortgageId,
			toDate: "2026-01-31",
		});
		expect(buyerSingle).toEqual({
			mortgageId: String(firstMortgageId),
			lenderId: "lender-b",
			fromDate: "2026-01-01",
			toDate: "2026-01-31",
			accruedInterest: expect.any(Number),
			periods: [
				{
					fraction: 0.5,
					fromDate: "2026-01-16",
					toDate: "2026-01-31",
				},
			],
		});
		expect(buyerSingle.accruedInterest).toBeCloseTo(
			calculatePeriodAccrual(0.1, 0.5, 100_000, 16),
			10
		);

		const mortgageBreakdown = await lenderA.query(BY_MORTGAGE_QUERY, {
			fromDate: "2026-01-01",
			mortgageId: firstMortgageId,
			toDate: "2026-01-31",
		});
		expect(mortgageBreakdown).toMatchObject({
			mortgageId: String(firstMortgageId),
			fromDate: "2026-01-01",
			toDate: "2026-01-31",
			interestRate: 0.1,
			principal: 100_000,
		});
		expect(mortgageBreakdown.lenderBreakdowns).toHaveLength(2);
		expect(
			mortgageBreakdown.lenderBreakdowns.map((entry) => entry.lenderId)
		).toEqual(["lender-a", "lender-b"]);
		expect(mortgageBreakdown.accruedInterest).toBeCloseTo(
			sellerSingle.accruedInterest + buyerSingle.accruedInterest,
			10
		);

		const extendedFirstMortgage = await lenderA.query(SINGLE_LENDER_QUERY, {
			fromDate: "2026-01-01",
			lenderId: "lender-a",
			mortgageId: firstMortgageId,
			toDate: "2026-02-28",
		});

		const portfolio = await lenderA.query(PORTFOLIO_QUERY, {
			fromDate: "2026-01-01",
			lenderId: "lender-a",
			toDate: "2026-02-28",
		});
		expect(portfolio).toMatchObject({
			lenderId: "lender-a",
			fromDate: "2026-01-01",
			toDate: "2026-02-28",
		});
		const portfolioMortgageIds = portfolio.mortgageBreakdowns
			.map((entry) => entry.mortgageId)
			.sort((left, right) => left.localeCompare(right));
		const expectedMortgageIds = [
			String(firstMortgageId),
			String(secondMortgageId),
		].sort((left, right) => left.localeCompare(right));
		expect(portfolioMortgageIds).toEqual(expectedMortgageIds);
		expect(portfolio.accruedInterest).toBeCloseTo(
			extendedFirstMortgage.accruedInterest +
				calculatePeriodAccrual(0.12, 1, 250_000, 28),
			10
		);

		const daily = await lenderA.query(DAILY_QUERY, {
			date: "2026-01-16",
			mortgageId: firstMortgageId,
		});
		expect(daily).toMatchObject({
			mortgageId: String(firstMortgageId),
			date: "2026-01-16",
		});
		expect(daily.lenderBreakdowns).toHaveLength(2);
		expect(daily.lenderBreakdowns.map((entry) => entry.lenderId)).toEqual([
			"lender-a",
			"lender-b",
		]);
		expect(daily.accruedInterest).toBeCloseTo(
			calculatePeriodAccrual(0.1, 1, 100_000, 1),
			10
		);
		expect(daily.lenderBreakdowns[0].periods).toEqual([
			{
				fraction: 0.5,
				fromDate: "2026-01-16",
				toDate: "2026-01-16",
			},
		]);
		expect(daily.lenderBreakdowns[1].periods).toEqual([
			{
				fraction: 0.5,
				fromDate: "2026-01-16",
				toDate: "2026-01-16",
			},
		]);
	});

	it("60/40 split on 30-day query matches hand-calculated values", async () => {
		const t = createTestHarness();
		await initCounter(t);

		const mortgageId = await seedMortgageDoc(t);

		// Issue 10,000 (100%) to lender-a, then transfer 4,000 to lender-b
		// After transfer: lender-a=6,000 (60%), lender-b=4,000 (40%)
		await mintAndIssue(t, String(mortgageId), "lender-a");
		await asAdmin(t).mutation(api.ledger.mutations.transferShares, {
			mortgageId: String(mortgageId),
			sellerLenderId: "lender-a",
			buyerLenderId: "lender-b",
			amount: 4000,
			effectiveDate: "2026-01-01",
			idempotencyKey: "transfer-60-40",
			source: SYS_SOURCE,
		});

		const lenderA = asLender(t, "lender-a");
		const lenderB = asLender(t, "lender-b");

		const resultA = await lenderA.query(SINGLE_LENDER_QUERY, {
			fromDate: "2026-01-01",
			lenderId: "lender-a",
			mortgageId,
			toDate: "2026-01-30",
		});
		const resultB = await lenderB.query(SINGLE_LENDER_QUERY, {
			fromDate: "2026-01-01",
			lenderId: "lender-b",
			mortgageId,
			toDate: "2026-01-30",
		});

		// A accrual: 1 day at 100% + 29 days at 60% ≈ $504.11
		// B accrual: 29 days at 40% (Jan 2-30, since buyer starts day after transfer)
		// = 0.10 × 0.4 × 100000 × 29 / 365 ≈ $317.81
		expect(resultA.accruedInterest).toBeCloseTo(504.11, 2);
		expect(resultB.accruedInterest).toBeCloseTo(317.81, 2);

		// Combined accrual = rate × principal × 30 days / 365 ≈ $821.92
		const combined = resultA.accruedInterest + resultB.accruedInterest;
		expect(combined).toBeCloseTo(821.92, 1);
	});

	it("same query returns identical results (determinism check)", async () => {
		const t = createTestHarness();
		await initCounter(t);

		const mortgageId = await seedMortgageDoc(t);
		await mintAndIssue(t, String(mortgageId), "lender-a");
		await asAdmin(t).mutation(api.ledger.mutations.transferShares, {
			mortgageId: String(mortgageId),
			sellerLenderId: "lender-a",
			buyerLenderId: "lender-b",
			amount: 5000,
			effectiveDate: "2026-01-15",
			idempotencyKey: "determinism-transfer",
			source: SYS_SOURCE,
		});

		const lenderA = asLender(t, "lender-a");

		const [first, second] = await Promise.all([
			lenderA.query(SINGLE_LENDER_QUERY, {
				fromDate: "2026-01-01",
				lenderId: "lender-a",
				mortgageId,
				toDate: "2026-01-31",
			}),
			lenderA.query(SINGLE_LENDER_QUERY, {
				fromDate: "2026-01-01",
				lenderId: "lender-a",
				mortgageId,
				toDate: "2026-01-31",
			}),
		]);

		// Strict equality — same query same data must be identical
		expect(first.accruedInterest).toBe(second.accruedInterest);
		expect(first.periods).toEqual(second.periods);
		expect(first).toStrictEqual(second);
	});

	it("historical period query is deterministic after ownership changes", async () => {
		const t = createTestHarness();
		await initCounter(t);

		const mortgageId = await seedMortgageDoc(t);
		await mintAndIssue(t, String(mortgageId), "lender-a");

		// Transfer on Jan 15: lender-a → lender-b
		await asAdmin(t).mutation(api.ledger.mutations.transferShares, {
			mortgageId: String(mortgageId),
			sellerLenderId: "lender-a",
			buyerLenderId: "lender-b",
			amount: 5000,
			effectiveDate: "2026-01-15",
			idempotencyKey: "historical-transfer-1",
			source: SYS_SOURCE,
		});

		// Query the past period (Jan 1-14) — should be deterministic
		const lenderA = asLender(t, "lender-a");

		const [janQuery1, janQuery2] = await Promise.all([
			lenderA.query(SINGLE_LENDER_QUERY, {
				fromDate: "2026-01-01",
				lenderId: "lender-a",
				mortgageId,
				toDate: "2026-01-14",
			}),
			lenderA.query(SINGLE_LENDER_QUERY, {
				fromDate: "2026-01-01",
				lenderId: "lender-a",
				mortgageId,
				toDate: "2026-01-14",
			}),
		]);

		// Identical on repeated calls
		expect(janQuery1).toStrictEqual(janQuery2);
		expect(janQuery1.accruedInterest).toBeCloseTo(
			calculatePeriodAccrual(0.1, 1, 100_000, 14),
			10
		);

		// Now make another ownership change (lender-b transfers half to lender-c)
		await asAdmin(t).mutation(api.ledger.mutations.transferShares, {
			mortgageId: String(mortgageId),
			sellerLenderId: "lender-b",
			buyerLenderId: "lender-c",
			amount: 2500,
			effectiveDate: "2026-01-20",
			idempotencyKey: "historical-transfer-2",
			source: SYS_SOURCE,
		});

		// Re-query Jan 1-14 — must still return the same deterministic result
		const [janQuery3, janQuery4] = await Promise.all([
			lenderA.query(SINGLE_LENDER_QUERY, {
				fromDate: "2026-01-01",
				lenderId: "lender-a",
				mortgageId,
				toDate: "2026-01-14",
			}),
			lenderA.query(SINGLE_LENDER_QUERY, {
				fromDate: "2026-01-01",
				lenderId: "lender-a",
				mortgageId,
				toDate: "2026-01-14",
			}),
		]);

		// Must be identical to the earlier queries despite subsequent ownership changes
		expect(janQuery3).toStrictEqual(janQuery1);
		expect(janQuery4).toStrictEqual(janQuery1);

		// Jan 15-19: A was 100% on Jan 15, then 50% from Jan 16 onward
		// So the query returns two periods: Jan 15 at 100%, Jan 16-19 at 50%
		// Accrual = 1 day at 100% + 4 days at 50% = 0.10×1.0×100000×1/365 + 0.10×0.5×100000×4/365 ≈ $82.19
		const jan15to19 = await lenderA.query(SINGLE_LENDER_QUERY, {
			fromDate: "2026-01-15",
			lenderId: "lender-a",
			mortgageId,
			toDate: "2026-01-19",
		});
		expect(jan15to19.periods).toEqual([
			{ fraction: 1, fromDate: "2026-01-15", toDate: "2026-01-15" },
			{ fraction: 0.5, fromDate: "2026-01-16", toDate: "2026-01-19" },
		]);
		expect(jan15to19.accruedInterest).toBeCloseTo(82.19, 1);
	});
});
