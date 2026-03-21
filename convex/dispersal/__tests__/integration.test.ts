import { makeFunctionReference } from "convex/server";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { calculatePeriodAccrual } from "../../accrual/interestMath";
import { FAIRLEND_STAFF_ORG_ID } from "../../constants";
import schema from "../../schema";
import { createDispersalEntries } from "../createDispersalEntries";

const modules = import.meta.glob("/convex/**/*.ts");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

type CreateDispersalEntriesResult = Awaited<
	ReturnType<CreateDispersalEntriesHandler["_handler"]>
>;

interface CreateDispersalEntriesHandler {
	_handler: (
		ctx: MutationCtx,
		args: {
			obligationId: Id<"obligations">;
			mortgageId: Id<"mortgages">;
			settledAmount: number;
			settledDate: string;
			idempotencyKey: string;
			source: { type: "system"; channel: "test" };
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
	lenderId: Id<"lenders">;
	runningTotal: number;
}

interface DispersalsByObligationResult {
	byLender: DispersalSummaryByLender[];
	entries: Array<{
		amount: number;
		lenderId: Id<"lenders">;
	}>;
	entryCount: number;
	total: number;
}

interface DisbursementHistoryResult {
	entries: DispersalHistoryEntry[];
	entryCount: number;
	pageTotal?: number;
	total: number;
}

interface UndisbursedBalanceResult {
	entryCount: number;
	lenderId: Id<"lenders">;
	undisbursedBalance: number;
}

type TestHarness = ReturnType<typeof convexTest>;

// ---------------------------------------------------------------------------
// Function references
// ---------------------------------------------------------------------------

const SINGLE_LENDER_QUERY = makeFunctionReference<
	"query",
	AccruedInterestQueryArgs,
	AccruedInterestQueryResult
>("accrual/calculateAccruedInterest:calculateAccruedInterest");
const GET_DISPERSALS_BY_OBLIGATION = makeFunctionReference<
	"query",
	{ obligationId: Id<"obligations"> },
	DispersalsByObligationResult
>("dispersal/queries:getDispersalsByObligation");
const GET_DISBURSEMENT_HISTORY = makeFunctionReference<
	"query",
	{
		fromDate?: string;
		lenderId: Id<"lenders">;
		limit?: number;
		toDate?: string;
	},
	DisbursementHistoryResult
>("dispersal/queries:getDisbursementHistory");
const GET_UNDISBURSED_BALANCE = makeFunctionReference<
	"query",
	{ lenderId: Id<"lenders"> },
	UndisbursedBalanceResult
>("dispersal/queries:getUndisbursedBalance");

const SYS_SOURCE = { type: "system" as const, channel: "test" } as const;

// ---------------------------------------------------------------------------
// Identity helpers
// ---------------------------------------------------------------------------

const ADMIN_IDENTITY = {
	subject: "integration-admin",
	issuer: "https://api.workos.com",
	org_id: FAIRLEND_STAFF_ORG_ID,
	organization_name: "FairLend Staff",
	role: "admin",
	roles: JSON.stringify(["admin"]),
	permissions: JSON.stringify([
		"ledger:view",
		"ledger:correct",
		"dispersal:view",
	]),
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

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

function createHarness() {
	return convexTest(schema, modules);
}

function asAdmin(t: TestHarness) {
	return t.withIdentity(ADMIN_IDENTITY);
}

function asLender(t: TestHarness, lenderId: string) {
	return t.withIdentity(lenderIdentity(lenderId));
}

async function initCounter(t: TestHarness) {
	await asAdmin(t).mutation(
		api.ledger.sequenceCounter.initializeSequenceCounter,
		{}
	);
}

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

interface SeedMortgageResult {
	borrowerId: Id<"borrowers">;
	lenderAId: Id<"lenders">;
	lenderBId: Id<"lenders">;
	mortgageId: Id<"mortgages">;
}

/**
 * Seeds broker, borrower, lenders, and mortgage.
 *
 * Principal is stored in CENTS in the mortgages table (10_000_000 = $100,000).
 * Mint/issue uses ownership UNITS: 6000 units = 60% of 10_000 total.
 * The ledger stores principal in cents; calculatePeriodAccrual returns in cents.
 *
 * Each lender is created in the DB so createDispersalEntries can resolve
 * authId → lenderId via requireLenderIdForAuthId.
 */
async function seedMortgageDoc(
	t: TestHarness,
	options: {
		principal?: number;
		interestRate?: number;
		annualServicingRate?: number;
		termStartDate?: string;
	} = {}
): Promise<SeedMortgageResult> {
	const principal = options.principal ?? 10_000_000;
	const interestRate = options.interestRate ?? 0.1;
	const annualServicingRate = options.annualServicingRate ?? 0.01;
	const termStartDate = options.termStartDate ?? "2026-01-01";

	return t.run(async (ctx) => {
		const now = Date.now();

		// Broker
		const brokerUserId = await ctx.db.insert("users", {
			authId: `broker-${now}`,
			email: `broker-${now}@fairlend.test`,
			firstName: "Broker",
			lastName: "Tester",
		});
		const brokerId = await ctx.db.insert("brokers", {
			status: "active",
			userId: brokerUserId,
			createdAt: now,
		});

		// Borrower
		const borrowerUserId = await ctx.db.insert("users", {
			authId: `borrower-${now}`,
			email: `borrower-${now}@fairlend.test`,
			firstName: "Borrower",
			lastName: "Tester",
		});
		const borrowerId = await ctx.db.insert("borrowers", {
			status: "active",
			userId: borrowerUserId,
			createdAt: now,
		});

		// Lenders (created in DB so createDispersalEntries can resolve them)
		const lenderAUserId = await ctx.db.insert("users", {
			authId: "lender-a",
			email: "lender-a@fairlend.test",
			firstName: "Lender",
			lastName: "A",
		});
		const lenderAId = await ctx.db.insert("lenders", {
			userId: lenderAUserId,
			brokerId,
			accreditationStatus: "accredited",
			onboardingEntryPath: "/tests/lender-a",
			status: "active",
			createdAt: now,
		});

		const lenderBUserId = await ctx.db.insert("users", {
			authId: "lender-b",
			email: "lender-b@fairlend.test",
			firstName: "Lender",
			lastName: "B",
		});
		const lenderBId = await ctx.db.insert("lenders", {
			userId: lenderBUserId,
			brokerId,
			accreditationStatus: "accredited",
			onboardingEntryPath: "/tests/lender-b",
			status: "active",
			createdAt: now,
		});

		// Property
		const propertyId = await ctx.db.insert("properties", {
			streetAddress: "1 Dispersal Street",
			city: "Toronto",
			province: "ON",
			postalCode: "M5V1E1",
			propertyType: "residential",
			createdAt: now,
		});

		// Mortgage (principal stored in CENTS)
		const mortgageId = await ctx.db.insert("mortgages", {
			status: "active",
			machineContext: { missedPayments: 0, lastPaymentAt: 0 },
			lastTransitionAt: now,
			propertyId,
			principal,
			interestRate,
			annualServicingRate,
			rateType: "fixed",
			termMonths: 12,
			amortizationMonths: 12,
			paymentAmount: 100_000,
			paymentFrequency: "monthly",
			loanType: "conventional",
			lienPosition: 1,
			interestAdjustmentDate: termStartDate,
			termStartDate,
			maturityDate: "2026-12-31",
			firstPaymentDate: "2026-02-01",
			brokerOfRecordId: brokerId,
			createdAt: now,
		});

		return { mortgageId, borrowerId, lenderAId, lenderBId };
	});
}

/**
 * Mints the mortgage and issues `amount` units to `lenderId`.
 * The authId "lender-a"/"lender-b" must match the authId in the lenders table.
 * Units: 6000 = 60% of 10000 total, 4000 = 40%, 10000 = 100%.
 */
async function mintAndIssue(
	t: TestHarness,
	mortgageId: Id<"mortgages">,
	lenderId: string,
	amount: number,
	effectiveDate: string
) {
	const auth = asAdmin(t);
	await auth.mutation(api.ledger.mutations.mintMortgage, {
		mortgageId,
		effectiveDate,
		idempotencyKey: `mint-${mortgageId}`,
		source: SYS_SOURCE,
	});
	await auth.mutation(internal.ledger.mutations.issueShares, {
		mortgageId,
		lenderId,
		amount,
		effectiveDate,
		idempotencyKey: `issue-${mortgageId}-${lenderId}`,
		source: SYS_SOURCE,
	});
}

/**
 * Seeds a settled obligation.
 */
async function seedTestObligation(
	t: TestHarness,
	mortgageId: Id<"mortgages">,
	borrowerId: Id<"borrowers">,
	amount: number,
	settledDate: string
) {
	return t.run(async (ctx) => {
		const now = Date.now();
		return ctx.db.insert("obligations", {
			status: "settled",
			mortgageId,
			borrowerId,
			paymentNumber: 1,
			type: "regular_interest",
			amount,
			amountSettled: amount,
			dueDate: Date.parse(`${settledDate}T00:00:00Z`),
			gracePeriodEnd: Date.parse(`${settledDate}T00:00:00Z`),
			settledAt: Date.parse(`${settledDate}T00:00:00Z`),
			createdAt: now,
		});
	});
}

const createDispersalEntriesMutation =
	createDispersalEntries as unknown as CreateDispersalEntriesHandler;

async function runCreateDispersal(
	t: TestHarness,
	args: {
		obligationId: Id<"obligations">;
		mortgageId: Id<"mortgages">;
		settledAmount: number;
		settledDate: string;
		idempotencyKey: string;
	}
): Promise<CreateDispersalEntriesResult> {
	return t.run(async (ctx) =>
		createDispersalEntriesMutation._handler(ctx, {
			...args,
			source: SYS_SOURCE,
		})
	);
}

// ---------------------------------------------------------------------------
// Test 1: fullChain — A(60%) B(40%), 31-day accrual, settle $833.33
// ---------------------------------------------------------------------------

/**
 * Test 1 seeds $100K @ 10% mortgage with A(60%) B(40%) and settles $833.33.
 *
 * Principal stored in cents: 10_000_000 = $100,000.
 * calculatePeriodAccrual returns in SAME unit as principal input (cents).
 * Actual accrued interest: calculatePeriodAccrual(0.10, 0.6, 10_000_000, 31) ≈ 50_958.90 cents.
 *
 * Settlement $833.33 → servicing fee = 0.01 × 10_000_000 / 12 = 8_333 cents.
 * Distributable = 83_333 - 8_333 = 75_000 cents.
 * A = 75_000 × 0.60 = 45_000 cents; B = 75_000 × 0.40 = 30_000 cents.
 */
describe("dispersal integration — fullChain", () => {
	it("exercises seed → accrue → settle → disperse end-to-end", async () => {
		const t = createHarness();
		await initCounter(t);

		const { mortgageId, borrowerId } = await seedMortgageDoc(t, {
			principal: 10_000_000,
			interestRate: 0.1,
			annualServicingRate: 0.01,
			termStartDate: "2026-01-01",
		});

		// A: 6000 units (60% of 10000), B: 4000 units (40%)
		await mintAndIssue(t, mortgageId, "lender-a", 6000, "2026-01-01");
		await mintAndIssue(t, mortgageId, "lender-b", 4000, "2026-01-01");

		// --- Accrual queries (informational) -------------------------------
		const lenderA = asLender(t, "lender-a");
		const lenderB = asLender(t, "lender-b");

		// Query A's 31-day accrual: Jan 1–31 inclusive = 31 days.
		// mortgage.principal = 10_000_000 (cents = $100,000).
		// calculatePeriodAccrual returns in cents when principal is in cents.
		// 0.10 × 0.6 × 10_000_000 × 31 / 365 ≈ 50_958.90 cents = $509.59.
		const aAccrual = await lenderA.query(SINGLE_LENDER_QUERY, {
			fromDate: "2026-01-01",
			lenderId: "lender-a",
			mortgageId,
			toDate: "2026-01-31",
		});
		expect(aAccrual.accruedInterest).toBeCloseTo(
			calculatePeriodAccrual(0.1, 0.6, 10_000_000, 31),
			8
		);
		expect(aAccrual.periods).toEqual([
			{ fraction: 0.6, fromDate: "2026-01-01", toDate: "2026-01-31" },
		]);

		// B's 31-day accrual: 0.10 × 0.4 × 10_000_000 × 31 / 365 ≈ 33_904.11 cents.
		const bAccrual = await lenderB.query(SINGLE_LENDER_QUERY, {
			fromDate: "2026-01-01",
			lenderId: "lender-b",
			mortgageId,
			toDate: "2026-01-31",
		});
		expect(bAccrual.accruedInterest).toBeCloseTo(
			calculatePeriodAccrual(0.1, 0.4, 10_000_000, 31),
			8
		);
		expect(bAccrual.periods).toEqual([
			{ fraction: 0.4, fromDate: "2026-01-01", toDate: "2026-01-31" },
		]);

		// --- Settle obligation -----------------------------------------
		const settledAmount = 83_333; // $833.33 in cents
		const obligationId = await seedTestObligation(
			t,
			mortgageId,
			borrowerId,
			settledAmount,
			"2026-01-31"
		);

		// --- Create dispersal entries ----------------------------------
		const result = await runCreateDispersal(t, {
			obligationId,
			mortgageId,
			settledAmount,
			settledDate: "2026-01-31",
			idempotencyKey: "test:fullChain:obligation-1",
		});

		expect(result.created).toBe(true);
		expect(result.entries).toHaveLength(2);
		expect(result.servicingFeeEntryId).toBeTruthy();

		// Servicing fee: 0.01 × 10_000_000 / 12 = 8_333 cents.
		// Distributable: 83_333 - 8_333 = 75_000 cents.
		// A = 75_000 × 0.60 = 45_000 cents; B = 75_000 × 0.40 = 30_000 cents.
		const sorted = [...result.entries].sort((a, b) => b.amount - a.amount);
		expect(sorted[0]?.amount).toBe(45_000); // A (60% share)
		expect(sorted[1]?.amount).toBe(30_000); // B (40% share)

		// --- Persistence check ----------------------------------------
		const persistedEntries = (
			await t.run(async (ctx) =>
				Promise.all(result.entries.map((entry) => ctx.db.get(entry.id)))
			)
		).filter((e) => e !== null);
		expect(persistedEntries).toHaveLength(2);

		const feeEntry = await t.run(async (ctx) =>
			result.servicingFeeEntryId ? ctx.db.get(result.servicingFeeEntryId) : null
		);
		expect(feeEntry?.amount).toBe(8333);
		expect(feeEntry?.annualRate).toBe(0.01);
		expect(feeEntry?.principalBalance).toBe(10_000_000);

		// --- Reconciliation queries ------------------------------------
		const admin = asAdmin(t);

		// getDispersalsByObligation
		const byObligation = await admin.query(GET_DISPERSALS_BY_OBLIGATION, {
			obligationId,
		});
		expect(byObligation.entries).toHaveLength(2);
		expect(byObligation.total).toBe(75_000);

		// Identify lender IDs from persisted entries
		const lenderAEntry = persistedEntries.find(
			(e) => e?.calculationDetails.ownershipFraction === 0.6
		);
		const lenderBEntry = persistedEntries.find(
			(e) => e?.calculationDetails.ownershipFraction === 0.4
		);
		expect(lenderAEntry).toBeDefined();
		expect(lenderBEntry).toBeDefined();
		if (!(lenderAEntry && lenderBEntry)) {
			throw new Error("Expected persisted lender dispersal entries to exist");
		}

		// getUndisbursedBalance — A and B each have one pending entry
		const undisbursedA = await admin.query(GET_UNDISBURSED_BALANCE, {
			lenderId: lenderAEntry.lenderId,
		});
		expect(undisbursedA.undisbursedBalance).toBe(45_000);
		expect(undisbursedA.entryCount).toBe(1);

		const undisbursedB = await admin.query(GET_UNDISBURSED_BALANCE, {
			lenderId: lenderBEntry.lenderId,
		});
		expect(undisbursedB.undisbursedBalance).toBe(30_000);
		expect(undisbursedB.entryCount).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// Test 2: dealCloseProration — A(100%) → day 15 transfer 50% to B
// ---------------------------------------------------------------------------

/**

 */
describe("dispersal integration — dealCloseProration", () => {
	it("handles A(100%) → day-15 transfer → A(50%) B(50%) proration and dispersal", async () => {
		const t = createHarness();
		await initCounter(t);

		const { mortgageId, borrowerId } = await seedMortgageDoc(t, {
			principal: 10_000_000,
			interestRate: 0.1,
			annualServicingRate: 0.01,
			termStartDate: "2026-01-01",
		});

		// A starts with 10_000 units (100%)
		await mintAndIssue(t, mortgageId, "lender-a", 10_000, "2026-01-01");

		// Day 15: A transfers 5000 units to B → A=5000 (50%), B=5000 (50%)
		await asAdmin(t).mutation(api.ledger.mutations.transferShares, {
			mortgageId,
			sellerLenderId: "lender-a",
			buyerLenderId: "lender-b",
			amount: 5000,
			effectiveDate: "2026-01-15",
			idempotencyKey: "test:dealClose:transfer",
			source: SYS_SOURCE,
		});

		const lenderA = asLender(t, "lender-a");
		const lenderB = asLender(t, "lender-b");

		// A's accrual: 15 days @ 100% + 16 days @ 50% ownership.
		// Actual: calculatePeriodAccrual(0.10, 1.0, 10_000_000, 15) +
		//         calculatePeriodAccrual(0.10, 0.5, 10_000_000, 16) ≈ 84_931.51 cents.
		const aAccrual = await lenderA.query(SINGLE_LENDER_QUERY, {
			fromDate: "2026-01-01",
			lenderId: "lender-a",
			mortgageId,
			toDate: "2026-01-31",
		});
		expect(aAccrual.periods).toEqual([
			{ fraction: 1, fromDate: "2026-01-01", toDate: "2026-01-15" },
			{ fraction: 0.5, fromDate: "2026-01-16", toDate: "2026-01-31" },
		]);
		expect(aAccrual.accruedInterest).toBeCloseTo(
			calculatePeriodAccrual(0.1, 1.0, 10_000_000, 15) +
				calculatePeriodAccrual(0.1, 0.5, 10_000_000, 16),
			8
		);

		// B's accrual: 16 days @ 50% ownership (starts day 16).
		// Actual: calculatePeriodAccrual(0.10, 0.5, 10_000_000, 16) ≈ 21_917.81 cents.
		const bAccrual = await lenderB.query(SINGLE_LENDER_QUERY, {
			fromDate: "2026-01-01",
			lenderId: "lender-b",
			mortgageId,
			toDate: "2026-01-31",
		});
		expect(bAccrual.periods).toEqual([
			{ fraction: 0.5, fromDate: "2026-01-16", toDate: "2026-01-31" },
		]);
		expect(bAccrual.accruedInterest).toBeCloseTo(
			calculatePeriodAccrual(0.1, 0.5, 10_000_000, 16),
			8
		);

		// --- Settle and disperse (post-transfer ownership: 50/50) -----
		const settledAmount = 83_333;
		const obligationId = await seedTestObligation(
			t,
			mortgageId,
			borrowerId,
			settledAmount,
			"2026-01-31"
		);

		const result = await runCreateDispersal(t, {
			obligationId,
			mortgageId,
			settledAmount,
			settledDate: "2026-01-31",
			idempotencyKey: "test:dealClose:obligation-1",
		});

		expect(result.created).toBe(true);
		expect(result.entries).toHaveLength(2);

		// After transfer: A=5000/10000=50%, B=5000/10000=50%.
		// Dispersal: (83_333 - 8_333) × 50% = 37_500 each.
		const sorted = [...result.entries].sort((a, b) => b.amount - a.amount);
		expect(sorted[0]?.amount).toBe(37_500);
		expect(sorted[1]?.amount).toBe(37_500);
	});
});

// ---------------------------------------------------------------------------
// Test 3: multipleSettlements — A(60%) B(40%), 3 sequential obligations
// ---------------------------------------------------------------------------

/**

 */
describe("dispersal integration — multipleSettlements", () => {
	it("accumulates undisbursed balances across sequential settlements", async () => {
		const t = createHarness();
		await initCounter(t);

		const { mortgageId, borrowerId } = await seedMortgageDoc(t, {
			principal: 10_000_000,
			interestRate: 0.1,
			annualServicingRate: 0.01,
			termStartDate: "2026-01-01",
		});

		// A: 6000 units (60%), B: 4000 units (40%)
		await mintAndIssue(t, mortgageId, "lender-a", 6000, "2026-01-01");
		await mintAndIssue(t, mortgageId, "lender-b", 4000, "2026-01-01");

		const admin = asAdmin(t);

		for (let i = 1; i <= 3; i++) {
			const settledAmount = 50_000;
			const settledDate = "2026-01-31";
			const obligationId = await seedTestObligation(
				t,
				mortgageId,
				borrowerId,
				settledAmount,
				settledDate
			);

			const result = await runCreateDispersal(t, {
				obligationId,
				mortgageId,
				settledAmount,
				settledDate,
				idempotencyKey: `test:multi:obligation-${i}`,
			});

			expect(result.created).toBe(true);
			expect(result.entries).toHaveLength(2);

			// Each settlement: (50_000 - 8_333) = 41_667 distributable.
			// A = 41_667 × 0.60 = 25_000; B = 41_667 × 0.40 = 16_667.
			const sorted = [...result.entries].sort((a, b) => b.amount - a.amount);
			expect(sorted[0]?.amount).toBe(25_000); // A (60% share)
			expect(sorted[1]?.amount).toBe(16_667); // B (40% share)

			// Verify obligation lookup
			const byObligation = await admin.query(GET_DISPERSALS_BY_OBLIGATION, {
				obligationId,
			});
			expect(byObligation.entries).toHaveLength(2);
			expect(byObligation.total).toBe(41_667);
		}

		// --- Final undisbursed balance check ----------------------------
		// After 3 settlements: A = 3 × 25_000 = 75_000; B = 3 × 16_667 = 50_001.
		// Note: 16_667 × 3 = 50_001 due to rounding (16666.67 × 3 = 50000.01 → 50001).
		// Note: we do NOT seed a 4th obligation — it would require a nested t.run() deadlock.
		// Verify A's accumulation via getDisbursementHistory
		// We need the lenderId from a known entry
		const firstEntry = (await t.run(async (ctx) =>
			ctx.db.query("dispersalEntries").first()
		)) as { lenderId: Id<"lenders"> } | undefined;
		expect(firstEntry).toBeDefined();
		if (!firstEntry) {
			throw new Error("Expected at least one dispersal entry");
		}

		const historyA = await admin.query(GET_DISBURSEMENT_HISTORY, {
			lenderId: firstEntry.lenderId,
		});

		// All 3 entries for this lender
		const aEntries = historyA.entries.filter(
			(entry) => entry.amount === 25_000
		);
		expect(aEntries).toHaveLength(3);
		expect(historyA.total).toBe(75_000);

		// Verify B's accumulation (16_667 × 3 = 50_001 due to rounding)
		// Get B's lenderId from entries with amount = 16_667
		const bEntryResult = (await t.run(async (ctx) => {
			const all = await ctx.db.query("dispersalEntries").collect();
			return all.find(
				(e) =>
					e.calculationDetails.ownershipFraction === 0.4 && e.amount === 16_667
			);
		})) as { lenderId: Id<"lenders"> } | undefined | null;
		expect(bEntryResult).toBeDefined();
		if (!bEntryResult) {
			throw new Error("Expected a dispersal entry for lender B");
		}

		const historyB = await admin.query(GET_DISBURSEMENT_HISTORY, {
			lenderId: bEntryResult.lenderId,
		});
		expect(historyB.total).toBe(50_001);
		expect(historyB.entries).toHaveLength(3);
	});
});
