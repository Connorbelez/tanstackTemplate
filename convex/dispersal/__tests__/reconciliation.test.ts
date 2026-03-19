import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import {
	createMockViewer,
	type MockIdentity,
} from "../../../src/test/auth/helpers";
import { FAIRLEND_ADMIN, LENDER } from "../../../src/test/auth/identities";
import { api } from "../../_generated/api";
import type { MutationCtx } from "../../_generated/server";
import schema from "../../schema";

const modules = import.meta.glob("/convex/**/*.ts");

const OTHER_LENDER = createMockViewer({
	roles: ["lender"],
	subject: "user_other_lender_test",
	email: "other-lender@test.fairlend.ca",
	firstName: "Other",
	lastName: "Lender",
});

const EMPTY_LENDER = createMockViewer({
	roles: ["lender"],
	subject: "user_empty_lender_test",
	email: "empty-lender@test.fairlend.ca",
	firstName: "Empty",
	lastName: "Lender",
});

function createHarness() {
	return convexTest(schema, modules);
}

async function insertUser(
	ctx: Pick<MutationCtx, "db">,
	identity: MockIdentity
) {
	return ctx.db.insert("users", {
		authId: identity.subject,
		email: identity.user_email,
		firstName: identity.user_first_name,
		lastName: identity.user_last_name,
	});
}

async function seedScenario(t: ReturnType<typeof createHarness>) {
	return t.run(async (ctx) => {
		const brokerUserId = await ctx.db.insert("users", {
			authId: "user_broker_seed",
			email: "broker-seed@fairlend.ca",
			firstName: "Broker",
			lastName: "Seed",
		});
		const brokerId = await ctx.db.insert("brokers", {
			status: "active",
			userId: brokerUserId,
			createdAt: Date.now(),
		});

		const lenderUserId = await insertUser(ctx, LENDER);
		const lenderId = await ctx.db.insert("lenders", {
			userId: lenderUserId,
			brokerId,
			accreditationStatus: "accredited",
			onboardingEntryPath: "test",
			status: "active",
			createdAt: Date.now(),
		});

		const otherLenderUserId = await insertUser(ctx, OTHER_LENDER);
		const otherLenderId = await ctx.db.insert("lenders", {
			userId: otherLenderUserId,
			brokerId,
			accreditationStatus: "accredited",
			onboardingEntryPath: "test",
			status: "active",
			createdAt: Date.now(),
		});

		const emptyLenderUserId = await insertUser(ctx, EMPTY_LENDER);
		const emptyLenderId = await ctx.db.insert("lenders", {
			userId: emptyLenderUserId,
			brokerId,
			accreditationStatus: "accredited",
			onboardingEntryPath: "test",
			status: "active",
			createdAt: Date.now(),
		});

		const propertyId = await ctx.db.insert("properties", {
			streetAddress: "123 Dispersal Test St",
			city: "Toronto",
			province: "ON",
			postalCode: "M5V 1A1",
			propertyType: "residential",
			createdAt: Date.now(),
		});

		const mortgageId = await ctx.db.insert("mortgages", {
			status: "active",
			propertyId,
			principal: 10_000_000,
			interestRate: 0.08,
			rateType: "fixed",
			termMonths: 12,
			amortizationMonths: 12,
			paymentAmount: 83_333,
			paymentFrequency: "monthly",
			loanType: "conventional",
			lienPosition: 1,
			annualServicingRate: 0.01,
			interestAdjustmentDate: "2026-01-01",
			termStartDate: "2026-01-01",
			maturityDate: "2027-01-01",
			firstPaymentDate: "2026-02-01",
			brokerOfRecordId: brokerId,
			createdAt: Date.now(),
		});

		const borrowerUserId = await ctx.db.insert("users", {
			authId: "user_borrower_seed",
			email: "borrower-seed@fairlend.ca",
			firstName: "Borrower",
			lastName: "Seed",
		});
		const borrowerId = await ctx.db.insert("borrowers", {
			status: "active",
			userId: borrowerUserId,
			createdAt: Date.now(),
		});

		const obligationA = await ctx.db.insert("obligations", {
			status: "settled",
			machineContext: {},
			mortgageId,
			borrowerId,
			paymentNumber: 1,
			type: "regular_interest",
			amount: 150,
			amountSettled: 150,
			dueDate: new Date("2026-02-01T00:00:00.000Z").getTime(),
			gracePeriodEnd: new Date("2026-02-16T00:00:00.000Z").getTime(),
			createdAt: Date.now(),
		});
		const obligationB = await ctx.db.insert("obligations", {
			status: "settled",
			machineContext: {},
			mortgageId,
			borrowerId,
			paymentNumber: 2,
			type: "regular_interest",
			amount: 500,
			amountSettled: 500,
			dueDate: new Date("2026-03-01T00:00:00.000Z").getTime(),
			gracePeriodEnd: new Date("2026-03-16T00:00:00.000Z").getTime(),
			createdAt: Date.now(),
		});
		const obligationC = await ctx.db.insert("obligations", {
			status: "settled",
			machineContext: {},
			mortgageId,
			borrowerId,
			paymentNumber: 3,
			type: "regular_interest",
			amount: 190,
			amountSettled: 190,
			dueDate: new Date("2026-04-01T00:00:00.000Z").getTime(),
			gracePeriodEnd: new Date("2026-04-16T00:00:00.000Z").getTime(),
			createdAt: Date.now(),
		});

		const lenderAccountId = await ctx.db.insert("ledger_accounts", {
			type: "POSITION",
			mortgageId,
			lenderId: LENDER.subject,
			cumulativeDebits: 6000n,
			cumulativeCredits: 0n,
			createdAt: Date.now(),
		});
		const otherLenderAccountId = await ctx.db.insert("ledger_accounts", {
			type: "POSITION",
			mortgageId,
			lenderId: OTHER_LENDER.subject,
			cumulativeDebits: 4000n,
			cumulativeCredits: 0n,
			createdAt: Date.now(),
		});

		await ctx.db.insert("dispersalEntries", {
			mortgageId,
			lenderId,
			lenderAccountId,
			amount: 100,
			dispersalDate: "2026-02-01",
			obligationId: obligationA,
			servicingFeeDeducted: 20,
			status: "pending",
			idempotencyKey: "disp-a-l1",
			calculationDetails: {
				settledAmount: 150,
				servicingFee: 20,
				distributableAmount: 130,
				ownershipUnits: 6000,
				totalUnits: 10_000,
				ownershipFraction: 0.6,
				rawAmount: 100,
				roundedAmount: 100,
			},
			createdAt: 1,
		});
		await ctx.db.insert("dispersalEntries", {
			mortgageId,
			lenderId: otherLenderId,
			lenderAccountId: otherLenderAccountId,
			amount: 50,
			dispersalDate: "2026-02-01",
			obligationId: obligationA,
			servicingFeeDeducted: 20,
			status: "pending",
			idempotencyKey: "disp-a-l2",
			calculationDetails: {
				settledAmount: 150,
				servicingFee: 20,
				distributableAmount: 130,
				ownershipUnits: 4000,
				totalUnits: 10_000,
				ownershipFraction: 0.4,
				rawAmount: 50,
				roundedAmount: 50,
			},
			createdAt: 2,
		});
		await ctx.db.insert("dispersalEntries", {
			mortgageId,
			lenderId,
			lenderAccountId,
			amount: 200,
			dispersalDate: "2026-03-01",
			obligationId: obligationB,
			servicingFeeDeducted: 30,
			status: "pending",
			idempotencyKey: "disp-b-l1",
			calculationDetails: {
				settledAmount: 500,
				servicingFee: 30,
				distributableAmount: 470,
				ownershipUnits: 4000,
				totalUnits: 10_000,
				ownershipFraction: 0.4,
				rawAmount: 200,
				roundedAmount: 200,
			},
			createdAt: 3,
		});
		await ctx.db.insert("dispersalEntries", {
			mortgageId,
			lenderId: otherLenderId,
			lenderAccountId: otherLenderAccountId,
			amount: 300,
			dispersalDate: "2026-03-01",
			obligationId: obligationB,
			servicingFeeDeducted: 30,
			status: "pending",
			idempotencyKey: "disp-b-l2",
			calculationDetails: {
				settledAmount: 500,
				servicingFee: 30,
				distributableAmount: 470,
				ownershipUnits: 6000,
				totalUnits: 10_000,
				ownershipFraction: 0.6,
				rawAmount: 300,
				roundedAmount: 300,
			},
			createdAt: 4,
		});
		await ctx.db.insert("dispersalEntries", {
			mortgageId,
			lenderId,
			lenderAccountId,
			amount: 150,
			dispersalDate: "2026-04-01",
			obligationId: obligationC,
			servicingFeeDeducted: 40,
			status: "pending",
			idempotencyKey: "disp-c-l1",
			calculationDetails: {
				settledAmount: 190,
				servicingFee: 40,
				distributableAmount: 150,
				ownershipUnits: 10_000,
				totalUnits: 10_000,
				ownershipFraction: 1,
				rawAmount: 150,
				roundedAmount: 150,
			},
			createdAt: 5,
		});

		await ctx.db.insert("servicingFeeEntries", {
			mortgageId,
			obligationId: obligationA,
			amount: 20,
			annualRate: 0.01,
			principalBalance: 100_000,
			date: "2026-02-01",
			createdAt: 6,
		});
		await ctx.db.insert("servicingFeeEntries", {
			mortgageId,
			obligationId: obligationB,
			amount: 30,
			annualRate: 0.01,
			principalBalance: 100_000,
			date: "2026-03-01",
			createdAt: 7,
		});
		await ctx.db.insert("servicingFeeEntries", {
			mortgageId,
			obligationId: obligationC,
			amount: 40,
			annualRate: 0.01,
			principalBalance: 100_000,
			date: "2026-04-01",
			createdAt: 8,
		});

		return {
			lenderId,
			otherLenderId,
			emptyLenderId,
			mortgageId,
			obligationA,
			obligationB,
			obligationC,
		};
	});
}

describe("dispersal reconciliation queries", () => {
	it("getUndisbursedBalance returns the pending total for the calling lender", async () => {
		const t = createHarness();
		const { lenderId } = await seedScenario(t);

		const result = await t
			.withIdentity(LENDER)
			.query(api.dispersal.queries.getUndisbursedBalance, {
				lenderId,
			});

		expect(result).toEqual({
			lenderId,
			entryCount: 3,
			undisbursedBalance: 450,
		});
	});

	it("getUndisbursedBalance returns zero for a lender with no entries", async () => {
		const t = createHarness();
		const { emptyLenderId } = await seedScenario(t);

		const result = await t
			.withIdentity(FAIRLEND_ADMIN)
			.query(api.dispersal.queries.getUndisbursedBalance, {
				lenderId: emptyLenderId,
			});

		expect(result).toEqual({
			lenderId: emptyLenderId,
			entryCount: 0,
			undisbursedBalance: 0,
		});
	});

	it("getUndisbursedBalance rejects a different lender", async () => {
		const t = createHarness();
		const { lenderId } = await seedScenario(t);

		await expect(
			t
				.withIdentity(OTHER_LENDER)
				.query(api.dispersal.queries.getUndisbursedBalance, {
					lenderId,
				})
		).rejects.toThrow("No access to this dispersal data");
	});

	it("getDisbursementHistory filters by date range and applies the default lender-scoped auth", async () => {
		const t = createHarness();
		const { lenderId } = await seedScenario(t);

		const result = await t
			.withIdentity(LENDER)
			.query(api.dispersal.queries.getDisbursementHistory, {
				lenderId,
				fromDate: "2026-03-01",
				toDate: "2026-04-30",
			});

		expect(result.total).toBe(350);
		expect(result.entryCount).toBe(2);
		expect(result.entries.map((entry) => entry.amount)).toEqual([200, 150]);
		expect(result.entries.map((entry) => entry.dispersalDate)).toEqual([
			"2026-03-01",
			"2026-04-01",
		]);
		expect(result.entries.map((entry) => entry.runningTotal)).toEqual([
			200, 350,
		]);
	});

	it("getDisbursementHistory returns overall totals when limit pagination is applied", async () => {
		const t = createHarness();
		const { lenderId } = await seedScenario(t);

		const result = await t
			.withIdentity(LENDER)
			.query(api.dispersal.queries.getDisbursementHistory, {
				lenderId,
				limit: 2,
			});

		expect(result.entryCount).toBe(3);
		expect(result.total).toBe(450);
		expect(result.pageTotal).toBe(300);
		expect(result.entries.map((entry) => entry.amount)).toEqual([100, 200]);
	});

	it("getDispersalsByMortgage is admin-only and returns per-lender breakdowns", async () => {
		const t = createHarness();
		const { mortgageId, lenderId, otherLenderId } = await seedScenario(t);

		await expect(
			t
				.withIdentity(LENDER)
				.query(api.dispersal.queries.getDispersalsByMortgage, {
					mortgageId,
				})
		).rejects.toThrow("No access to this dispersal data");

		const result = await t
			.withIdentity(FAIRLEND_ADMIN)
			.query(api.dispersal.queries.getDispersalsByMortgage, {
				mortgageId,
			});

		expect(result.entryCount).toBe(5);
		expect(result.total).toBe(800);
		expect(result.byLender).toEqual([
			{ lenderId, entryCount: 3, totalAmount: 450 },
			{ lenderId: otherLenderId, entryCount: 2, totalAmount: 350 },
		]);
	});

	it("getDispersalsByMortgage keeps overall aggregates when limit is applied", async () => {
		const t = createHarness();
		const { mortgageId, lenderId, otherLenderId } = await seedScenario(t);

		const result = await t
			.withIdentity(FAIRLEND_ADMIN)
			.query(api.dispersal.queries.getDispersalsByMortgage, {
				mortgageId,
				limit: 2,
			});

		expect(result.entryCount).toBe(5);
		expect(result.total).toBe(800);
		expect(result.pageTotal).toBe(150);
		expect(result.entries.map((entry) => entry.amount)).toEqual([100, 50]);
		expect(result.byLender).toEqual([
			{ lenderId, entryCount: 3, totalAmount: 450 },
			{ lenderId: otherLenderId, entryCount: 2, totalAmount: 350 },
		]);
	});

	it("getDispersalsByObligation returns all entries for a payment with totals", async () => {
		const t = createHarness();
		const { obligationB, lenderId, otherLenderId } = await seedScenario(t);

		const result = await t
			.withIdentity(FAIRLEND_ADMIN)
			.query(api.dispersal.queries.getDispersalsByObligation, {
				obligationId: obligationB,
			});

		expect(result.entryCount).toBe(2);
		expect(result.total).toBe(500);
		expect(result.entries.map((entry) => entry.amount)).toEqual([200, 300]);
		expect(result.byLender).toEqual([
			{ lenderId, entryCount: 1, totalAmount: 200 },
			{ lenderId: otherLenderId, entryCount: 1, totalAmount: 300 },
		]);
	});

	it("getServicingFeeHistory filters by date range and returns zero for empty ranges", async () => {
		const t = createHarness();
		const { mortgageId } = await seedScenario(t);

		const marchOnly = await t
			.withIdentity(FAIRLEND_ADMIN)
			.query(api.dispersal.queries.getServicingFeeHistory, {
				mortgageId,
				fromDate: "2026-03-01",
				toDate: "2026-03-31",
			});

		expect(marchOnly.entryCount).toBe(1);
		expect(marchOnly.totalFees).toBe(30);
		expect(marchOnly.entries.map((entry) => entry.amount)).toEqual([30]);

		const emptyRange = await t
			.withIdentity(FAIRLEND_ADMIN)
			.query(api.dispersal.queries.getServicingFeeHistory, {
				mortgageId,
				fromDate: "2027-01-01",
				toDate: "2027-01-31",
			});

		expect(emptyRange.entryCount).toBe(0);
		expect(emptyRange.totalFees).toBe(0);
		expect(emptyRange.entries).toEqual([]);
	});

	it("getServicingFeeHistory keeps overall totals when limit is applied", async () => {
		const t = createHarness();
		const { mortgageId } = await seedScenario(t);

		const result = await t
			.withIdentity(FAIRLEND_ADMIN)
			.query(api.dispersal.queries.getServicingFeeHistory, {
				mortgageId,
				limit: 2,
			});

		expect(result.entryCount).toBe(3);
		expect(result.totalFees).toBe(90);
		expect(result.pageTotalFees).toBe(50);
		expect(result.entries.map((entry) => entry.amount)).toEqual([20, 30]);
	});
});
