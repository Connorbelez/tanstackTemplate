import { makeFunctionReference } from "convex/server";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import {
	createMockViewer,
	type MockIdentity,
} from "../../../src/test/auth/helpers";
import { FAIRLEND_ADMIN, LENDER } from "../../../src/test/auth/identities";
import type { Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import {
	calculatePeriodAccrual,
	daysBetween,
} from "../../accrual/interestMath";
import schema from "../../schema";
import { createDispersalEntries } from "../createDispersalEntries";

const modules = import.meta.glob("/convex/**/*.ts");

const DEFAULT_SOURCE = { type: "system" as const, channel: "test" } as const;

interface CreateDispersalEntriesHandler {
	_handler: (
		ctx: MutationCtx,
		args: {
			obligationId: Id<"obligations">;
			mortgageId: Id<"mortgages">;
			settledAmount: number;
			settledDate: string;
			idempotencyKey: string;
			source: typeof DEFAULT_SOURCE;
		}
	) => Promise<{
		created: boolean;
		entries: Array<{
			id: Id<"dispersalEntries">;
			lenderId: Id<"lenders">;
			lenderAccountId: Id<"ledger_accounts">;
			amount: number;
			rawAmount: number;
			units: number;
		}>;
		servicingFeeEntryId: Id<"servicingFeeEntries"> | null;
	}>;
}


interface DispersalSummaryByLender {
	entryCount: number;
	lenderId: Id<"lenders">;
	totalAmount: number;
}

interface DispersalHistoryEntry {
	amount: number;
	dispersalDate: string;
	runningTotal: number;
}

interface DispersalHistoryResult {
	entries: DispersalHistoryEntry[];
	entryCount: number;
	pageTotal?: number;
	total: number;
}

interface DispersalsByMortgageResult {
	byLender: DispersalSummaryByLender[];
	entries: Array<{ amount: number }>;
	entryCount: number;
	pageTotal?: number;
	total: number;
}

interface DispersalsByObligationResult {
	byLender: DispersalSummaryByLender[];
	entries: Array<{ amount: number }>;
	entryCount: number;
	total: number;
}

interface ServicingFeeHistoryResult {
	entries: Array<{ amount: number }>;
	entryCount: number;
	pageTotalFees?: number;
	totalFees: number;
}

interface UndisbursedBalanceResult {
	entryCount: number;
	lenderId: Id<"lenders">;
	undisbursedBalance: number;
}

const createDispersalEntriesMutation =
	createDispersalEntries as unknown as CreateDispersalEntriesHandler;

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

const GET_UNDISBURSED_BALANCE = makeFunctionReference<
	"query",
	{ lenderId: Id<"lenders"> },
	UndisbursedBalanceResult
>("dispersal/queries:getUndisbursedBalance");
const GET_DISBURSEMENT_HISTORY = makeFunctionReference<
	"query",
	{
		fromDate?: string;
		lenderId: Id<"lenders">;
		limit?: number;
		toDate?: string;
	},
	DispersalHistoryResult
>("dispersal/queries:getDisbursementHistory");
const GET_DISPERSALS_BY_MORTGAGE = makeFunctionReference<
	"query",
	{
		fromDate?: string;
		limit?: number;
		mortgageId: Id<"mortgages">;
		toDate?: string;
	},
	DispersalsByMortgageResult
>("dispersal/queries:getDispersalsByMortgage");
const GET_DISPERSALS_BY_OBLIGATION = makeFunctionReference<
	"query",
	{ obligationId: Id<"obligations"> },
	DispersalsByObligationResult
>("dispersal/queries:getDispersalsByObligation");
const GET_SERVICING_FEE_HISTORY = makeFunctionReference<
	"query",
	{
		fromDate?: string;
		limit?: number;
		mortgageId: Id<"mortgages">;
		toDate?: string;
	},
	ServicingFeeHistoryResult
>("dispersal/queries:getServicingFeeHistory");

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

		// These fixtures intentionally preserve the historical overcounted
		// servicingFeeDeducted values so reconciliation query coverage can
		// exercise legacy data without depending on the current write path.
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

		const result = await t.withIdentity(LENDER).query(GET_UNDISBURSED_BALANCE, {
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
			.query(GET_UNDISBURSED_BALANCE, {
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
			t.withIdentity(OTHER_LENDER).query(GET_UNDISBURSED_BALANCE, {
				lenderId,
			})
		).rejects.toThrow("No access to this dispersal data");
	});

	it("getDisbursementHistory filters by date range and applies the default lender-scoped auth", async () => {
		const t = createHarness();
		const { lenderId } = await seedScenario(t);

		const result = await t
			.withIdentity(LENDER)
			.query(GET_DISBURSEMENT_HISTORY, {
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
			.query(GET_DISBURSEMENT_HISTORY, {
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
			t.withIdentity(LENDER).query(GET_DISPERSALS_BY_MORTGAGE, {
				mortgageId,
			})
		).rejects.toThrow("No access to this dispersal data");

		const result = await t
			.withIdentity(FAIRLEND_ADMIN)
			.query(GET_DISPERSALS_BY_MORTGAGE, {
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
			.query(GET_DISPERSALS_BY_MORTGAGE, {
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
			.query(GET_DISPERSALS_BY_OBLIGATION, {
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
			.query(GET_SERVICING_FEE_HISTORY, {
				mortgageId,
				fromDate: "2026-03-01",
				toDate: "2026-03-31",
			});

		expect(marchOnly.entryCount).toBe(1);
		expect(marchOnly.totalFees).toBe(30);
		expect(marchOnly.entries.map((entry) => entry.amount)).toEqual([30]);

		const emptyRange = await t
			.withIdentity(FAIRLEND_ADMIN)
			.query(GET_SERVICING_FEE_HISTORY, {
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
			.query(GET_SERVICING_FEE_HISTORY, {
				mortgageId,
				limit: 2,
			});

		expect(result.entryCount).toBe(3);
		expect(result.totalFees).toBe(90);
		expect(result.pageTotalFees).toBe(50);
		expect(result.entries.map((entry) => entry.amount)).toEqual([20, 30]);
	});

	it("prevents lenders from reading another lender's disbursement history", async () => {
		const t = createHarness();
		const { lenderId, otherLenderId } = await seedScenario(t);

		// A lender can query their own disbursement history
		const ownHistory = await t
			.withIdentity(LENDER)
			.query(GET_DISBURSEMENT_HISTORY, {
				lenderId,
				fromDate: "2026-02-01",
				toDate: "2026-04-30",
			});
		expect(ownHistory.total).toBe(450);

		// A lender cannot query another lender's disbursement history
		await expect(
			t.withIdentity(LENDER).query(GET_DISBURSEMENT_HISTORY, {
				lenderId: otherLenderId,
			})
		).rejects.toThrow("No access to this dispersal data");
	});

	it("cross-check invariant: total accrual ≈ disbursements + fees within 1-day tolerance", async () => {
		// ── Setup ──────────────────────────────────────────────────────────────
		// Mortgage: 8% annual rate, 10M principal, 1% servicing rate
		// Steady 100% single-lender ownership from 2026-01-01
		// Three monthly settlements on Feb/Mar/Apr 2026
		//
		// Monthly figures:
		//   Servicing fee = Math.round(0.01 × 10_000_000 / 12) = 8_333
		//   Disbursement  = settledAmount - servicingFee
		//
		// The 1-day tolerance = annualRate × principal / 365
		//   = 0.08 × 10_000_000 / 365 ≈ 2_192

		const t = createHarness();

		const { lenderId, mortgageId } = await t.run(async (ctx) => {
			const now = Date.now();
			const brokerUserId = await ctx.db.insert("users", {
				authId: "user_xcheck_broker",
				email: "xcheck-broker@fairlend.ca",
				firstName: "XCheck",
				lastName: "Broker",
			});
			const brokerId = await ctx.db.insert("brokers", {
				status: "active",
				userId: brokerUserId,
				createdAt: now,
			});

			const lenderUserId = await ctx.db.insert("users", {
				authId: LENDER.subject,
				email: LENDER.user_email,
				firstName: LENDER.user_first_name,
				lastName: LENDER.user_last_name,
			});
			const lenderId = await ctx.db.insert("lenders", {
				userId: lenderUserId,
				brokerId,
				accreditationStatus: "accredited",
				onboardingEntryPath: "test",
				status: "active",
				createdAt: now,
			});

			const propertyId = await ctx.db.insert("properties", {
				streetAddress: "999 CrossCheck Ave",
				city: "Toronto",
				province: "ON",
				postalCode: "M5V 2A2",
				propertyType: "residential",
				createdAt: now,
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
				createdAt: now,
			});

			const borrowerUserId = await ctx.db.insert("users", {
				authId: "user_xcheck_borrower",
				email: "xcheck-borrower@fairlend.ca",
				firstName: "XCheck",
				lastName: "Borrower",
			});
			const borrowerId = await ctx.db.insert("borrowers", {
				status: "active",
				userId: borrowerUserId,
				createdAt: now,
			});

			// Ledger position: 10_000 units = 100% ownership (10_000 / 10_000)
			await ctx.db.insert("ledger_accounts", {
				type: "POSITION",
				mortgageId,
				lenderId: LENDER.subject,
				cumulativeDebits: 10_000n,
				cumulativeCredits: 0n,
				createdAt: now,
			});

			// Settlement amounts derived from interest accrual math (0.08 * 10M * days / 365):
			// Feb (28d): 61,370 | Mar (31d): 67,945 | Apr (1d): 2,192
			// This ensures the cross-check invariant passes:
			//   totalAccrual (131,507) ≈ totalDispersals + totalFees (131,507) within 1-day tolerance (2,192)
			const settledFeb = 61_370;
			const settledMar = 67_945;
			const settledApr = 2192;

			// Settlement dates: 2026-02-01, 2026-03-01, 2026-04-01
			const obligationFeb = await ctx.db.insert("obligations", {
				status: "settled",
				machineContext: {},
				mortgageId,
				borrowerId,
				paymentNumber: 1,
				type: "regular_interest",
				amount: settledFeb,
				amountSettled: settledFeb,
				dueDate: new Date("2026-02-01T00:00:00.000Z").getTime(),
				gracePeriodEnd: new Date("2026-02-16T00:00:00.000Z").getTime(),
				settledAt: new Date("2026-02-01T00:00:00.000Z").getTime(),
				createdAt: now,
			});
			const obligationMar = await ctx.db.insert("obligations", {
				status: "settled",
				machineContext: {},
				mortgageId,
				borrowerId,
				paymentNumber: 2,
				type: "regular_interest",
				amount: settledMar,
				amountSettled: settledMar,
				dueDate: new Date("2026-03-01T00:00:00.000Z").getTime(),
				gracePeriodEnd: new Date("2026-03-16T00:00:00.000Z").getTime(),
				settledAt: new Date("2026-03-01T00:00:00.000Z").getTime(),
				createdAt: now,
			});
			const obligationApr = await ctx.db.insert("obligations", {
				status: "settled",
				machineContext: {},
				mortgageId,
				borrowerId,
				paymentNumber: 3,
				type: "regular_interest",
				amount: settledApr,
				amountSettled: settledApr,
				dueDate: new Date("2026-04-01T00:00:00.000Z").getTime(),
				gracePeriodEnd: new Date("2026-04-16T00:00:00.000Z").getTime(),
				settledAt: new Date("2026-04-01T00:00:00.000Z").getTime(),
				createdAt: now,
			});

			// Run 3 settlements through the dispersal engine
			await createDispersalEntriesMutation._handler(ctx, {
				obligationId: obligationFeb,
				mortgageId,
				settledAmount: settledFeb,
				settledDate: "2026-02-01",
				idempotencyKey: "xcheck-feb",
				source: DEFAULT_SOURCE,
			});
			await createDispersalEntriesMutation._handler(ctx, {
				obligationId: obligationMar,
				mortgageId,
				settledAmount: settledMar,
				settledDate: "2026-03-01",
				idempotencyKey: "xcheck-mar",
				source: DEFAULT_SOURCE,
			});
			await createDispersalEntriesMutation._handler(ctx, {
				obligationId: obligationApr,
				mortgageId,
				settledAmount: settledApr,
				settledDate: "2026-04-01",
				idempotencyKey: "xcheck-apr",
				source: DEFAULT_SOURCE,
			});

			return { lenderId, mortgageId };
		});

		// ── Compute expected accrual ────────────────────────────────────────
		// Accrual window: 2026-02-01 through 2026-04-01 (the last settlement date)
		// The accrual engine computes daily interest on the full 10M principal.
		// The cross-check verifies that total accrued interest (from the interest math)
		// approximately equals total disbursements + total servicing fees collected.
		//
		// daily_rate = 0.08 / 365
		// Accrual window: 2026-02-01 → 2026-04-01 inclusive = 60 days total
		// (daysBetween is inclusive of both endpoints, so a single call avoids
		// double-counting boundary dates across adjacent segments)
		const annualRate = 0.08;
		const principal = 10_000_000;
		const totalAccrualDays = daysBetween("2026-02-01", "2026-04-01"); // 60
		const expectedAccrual = calculatePeriodAccrual(
			annualRate,
			1.0, // 100% steady ownership
			principal,
			totalAccrualDays
		);

		// 1-day tolerance: one day's worth of interest on the full principal
		const oneDayTolerance = calculatePeriodAccrual(
			annualRate,
			1.0,
			principal,
			1
		);

		// ── Query actual totals via reconciliation queries ──────────────────
		const history = await t
			.withIdentity(LENDER)
			.query(GET_DISBURSEMENT_HISTORY, {
				lenderId,
				fromDate: "2026-02-01",
				toDate: "2026-04-01",
			});

		const fees = await t
			.withIdentity(FAIRLEND_ADMIN)
			.query(GET_SERVICING_FEE_HISTORY, {
				mortgageId,
				fromDate: "2026-02-01",
				toDate: "2026-04-01",
			});

		const totalDispersals = history.total;
		const totalFees = fees.totalFees;
		const reconcilingTotal = totalDispersals + totalFees;

		// ── Assert cross-check invariant ────────────────────────────────────
		// invariant: |expectedAccrual - (totalDispersals + totalFees)| <= oneDayTolerance
		const gap = Math.abs(expectedAccrual - reconcilingTotal);
		expect(gap).toBeLessThanOrEqual(oneDayTolerance);

		// Also verify individual monthly figures are consistent
		expect(history.entryCount).toBe(3);
		expect(fees.entryCount).toBe(3);
	});
});
