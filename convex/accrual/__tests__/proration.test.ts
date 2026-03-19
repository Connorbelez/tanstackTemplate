import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { FAIRLEND_STAFF_ORG_ID } from "../../constants";
import schema from "../../schema";
import {
	calculateAccrualForPeriods,
	calculatePeriodAccrual,
} from "../interestMath";
import { getOwnershipPeriods } from "../ownershipPeriods";
import type { OwnershipPeriod } from "../types";

const modules = import.meta.glob("/convex/**/*.ts");

// ---------------------------------------------------------------------------
// Test identity and harness
// ---------------------------------------------------------------------------

const LEDGER_TEST_IDENTITY = {
	subject: "test-proration-user",
	issuer: "https://api.workos.com",
	org_id: FAIRLEND_STAFF_ORG_ID,
	organization_name: "FairLend Staff",
	role: "admin",
	roles: JSON.stringify(["admin"]),
	permissions: JSON.stringify(["ledger:view", "ledger:correct"]),
	user_email: "proration-test@fairlend.ca",
	user_first_name: "Proration",
	user_last_name: "Tester",
};

const SYS_SOURCE = { type: "system" as const, channel: "test" };

function createTestHarness() {
	return convexTest(schema, modules);
}

function asLedgerUser(t: ReturnType<typeof createTestHarness>) {
	return t.withIdentity(LEDGER_TEST_IDENTITY);
}

async function initLedger(t: ReturnType<typeof createTestHarness>) {
	const auth = asLedgerUser(t);
	await auth.mutation(api.ledger.sequenceCounter.initializeSequenceCounter, {});
	return auth;
}

async function mintMortgage(
	auth: ReturnType<typeof asLedgerUser>,
	mortgageId: string,
	idempotencyKey: string,
	effectiveDate = "2026-01-01"
) {
	return auth.mutation(api.ledger.mutations.mintMortgage, {
		mortgageId,
		effectiveDate,
		idempotencyKey,
		source: SYS_SOURCE,
	});
}

async function issueShares(
	auth: ReturnType<typeof asLedgerUser>,
	mortgageId: string,
	lenderId: string,
	amount: number,
	effectiveDate: string,
	idempotencyKey: string
) {
	return auth.mutation(internal.ledger.mutations.issueShares, {
		mortgageId,
		lenderId,
		amount,
		effectiveDate,
		idempotencyKey,
		source: SYS_SOURCE,
	});
}

async function reserveShares(
	auth: ReturnType<typeof asLedgerUser>,
	args: {
		amount: number;
		buyerLenderId: string;
		effectiveDate: string;
		idempotencyKey: string;
		mortgageId: string;
		sellerLenderId: string;
	}
) {
	return auth.mutation(internal.ledger.mutations.reserveShares, {
		...args,
		source: SYS_SOURCE,
	});
}

async function commitReservation(
	auth: ReturnType<typeof asLedgerUser>,
	args: {
		effectiveDate: string;
		idempotencyKey: string;
		reservationId: Id<"ledger_reservations">;
	}
) {
	return auth.mutation(internal.ledger.mutations.commitReservation, {
		...args,
		source: SYS_SOURCE,
	});
}

async function getPeriods(
	t: ReturnType<typeof createTestHarness>,
	mortgageId: string,
	lenderId: string
): Promise<OwnershipPeriod[]> {
	return t.run(async (ctx) =>
		getOwnershipPeriods({ db: ctx.db }, mortgageId, lenderId)
	);
}

// ---------------------------------------------------------------------------
// Constants — matches SPEC §8.3
// ---------------------------------------------------------------------------

const PRINCIPAL = 100_000;
const RATE = 0.1; // 10%
const TOTAL_SHARES = 10_000;

// ---------------------------------------------------------------------------
// exact proration — SPEC §8.3 acceptance criteria
// $100K@10%, 100% transferred Jan 15
// Seller: 15 days @ 100% = 15/365 * 0.10 * 100000 = $410.9589...
// Buyer:  16 days @ 100% = 16/365 * 0.10 * 100000 = $438.3561...
// Sum:    31 days single owner = 31/365 * 0.10 * 100000 = $849.3150...
// ---------------------------------------------------------------------------

describe("exact proration", () => {
	it("seller gets Jan 1-15, buyer gets Jan 16-31, sum equals single-owner accrual", async () => {
		const t = createTestHarness();
		const auth = await initLedger(t);

		// Mint mortgage effective Jan 1
		await mintMortgage(auth, "m-exact", "mint-exact", "2026-01-01");
		// Issue 100% (10,000 units) to seller on Jan 1
		await issueShares(
			auth,
			"m-exact",
			"seller",
			TOTAL_SHARES,
			"2026-01-01",
			"issue-exact"
		);

		// Seller transfers 100% (all 10,000 units) to buyer on Jan 15
		const reservation = await reserveShares(auth, {
			mortgageId: "m-exact",
			sellerLenderId: "seller",
			buyerLenderId: "buyer",
			amount: TOTAL_SHARES,
			effectiveDate: "2026-01-15",
			idempotencyKey: "reserve-exact",
		});
		await commitReservation(auth, {
			reservationId: reservation.reservationId,
			effectiveDate: "2026-01-15",
			idempotencyKey: "commit-exact",
		});

		const sellerPeriods = await getPeriods(t, "m-exact", "seller");
		const buyerPeriods = await getPeriods(t, "m-exact", "buyer");

		// Seller: Jan 1 → Jan 15 (15 days, 100%); balance goes to 0, no second period
		expect(sellerPeriods).toEqual([
			{
				lenderId: "seller",
				mortgageId: "m-exact",
				fraction: 1,
				fromDate: "2026-01-01",
				toDate: "2026-01-15",
			},
		]);

		// Buyer: Jan 16 → end (16 days, 100%)
		expect(buyerPeriods).toEqual([
			{
				lenderId: "buyer",
				mortgageId: "m-exact",
				fraction: 1,
				fromDate: "2026-01-16",
				toDate: null,
			},
		]);

		// Compute accruals for January
		const sellerAccrual = calculateAccrualForPeriods(
			sellerPeriods,
			RATE,
			PRINCIPAL,
			"2026-01-01",
			"2026-01-31"
		);
		const buyerAccrual = calculateAccrualForPeriods(
			buyerPeriods,
			RATE,
			PRINCIPAL,
			"2026-01-01",
			"2026-01-31"
		);
		const singleOwner = calculatePeriodAccrual(RATE, 1, PRINCIPAL, 31);

		// SPEC §8.3 hand-calculated values
		const expectedSeller = (RATE * 1 * PRINCIPAL * 15) / 365;
		const expectedBuyer = (RATE * 1 * PRINCIPAL * 16) / 365;

		expect(sellerAccrual).toBeCloseTo(expectedSeller, 2); // ~$410.96
		expect(buyerAccrual).toBeCloseTo(expectedBuyer, 2); // ~$438.36
		expect(sellerAccrual + buyerAccrual).toBeCloseTo(singleOwner, 10); // exact invariant

		// Verify the specific dollar amounts from SPEC §8.3
		expect(sellerAccrual).toBeCloseTo(410.96, 1);
		expect(buyerAccrual).toBeCloseTo(438.36, 1);
	});

	it("sum of seller + buyer accrual equals single-owner accrual (invariant)", async () => {
		const t = createTestHarness();
		const auth = await initLedger(t);

		await mintMortgage(auth, "m-invariant", "mint-invariant", "2026-01-01");
		await issueShares(
			auth,
			"m-invariant",
			"seller",
			TOTAL_SHARES,
			"2026-01-01",
			"issue-invariant"
		);

		const reservation = await reserveShares(auth, {
			mortgageId: "m-invariant",
			sellerLenderId: "seller",
			buyerLenderId: "buyer",
			amount: TOTAL_SHARES,
			effectiveDate: "2026-01-15",
			idempotencyKey: "reserve-invariant",
		});
		await commitReservation(auth, {
			reservationId: reservation.reservationId,
			effectiveDate: "2026-01-15",
			idempotencyKey: "commit-invariant",
		});

		const sellerPeriods = await getPeriods(t, "m-invariant", "seller");
		const buyerPeriods = await getPeriods(t, "m-invariant", "buyer");

		const sellerAccrual = calculateAccrualForPeriods(
			sellerPeriods,
			RATE,
			PRINCIPAL,
			"2026-01-01",
			"2026-01-31"
		);
		const buyerAccrual = calculateAccrualForPeriods(
			buyerPeriods,
			RATE,
			PRINCIPAL,
			"2026-01-01",
			"2026-01-31"
		);
		const singleOwner = calculatePeriodAccrual(RATE, 1, PRINCIPAL, 31);

		// Key invariant from SPEC §8.3: no rounding occurs in accrual, use exact equality
		expect(sellerAccrual + buyerAccrual).toBe(singleOwner);
	});
});

// ---------------------------------------------------------------------------
// partial transfer — SPEC §8.3 acceptance criteria
// A=60%, B=40%, A sells 30% to C on Jan 20
// A: 20d @ 60% + 11d @ 30% (two periods)
// B: 31d @ 40% (unchanged)
// C: 11d @ 30% (from Jan 21)
// ---------------------------------------------------------------------------

describe("partial transfer", () => {
	it("A sells 30% to C on Jan 20 — A has two periods, B unchanged, C from Jan 21", async () => {
		const t = createTestHarness();
		const auth = await initLedger(t);

		await mintMortgage(auth, "m-partial", "mint-partial", "2026-01-01");
		// A holds 60% (6,000 units), B holds 40% (4,000 units)
		await issueShares(
			auth,
			"m-partial",
			"lender-a",
			6000,
			"2026-01-01",
			"issue-partial-a"
		);
		await issueShares(
			auth,
			"m-partial",
			"lender-b",
			4000,
			"2026-01-01",
			"issue-partial-b"
		);

		// A transfers 30% (3,000 units) to C on Jan 20
		const reservation = await reserveShares(auth, {
			mortgageId: "m-partial",
			sellerLenderId: "lender-a",
			buyerLenderId: "lender-c",
			amount: 3000,
			effectiveDate: "2026-01-20",
			idempotencyKey: "reserve-partial",
		});
		await commitReservation(auth, {
			reservationId: reservation.reservationId,
			effectiveDate: "2026-01-20",
			idempotencyKey: "commit-partial",
		});

		const aPeriods = await getPeriods(t, "m-partial", "lender-a");
		const bPeriods = await getPeriods(t, "m-partial", "lender-b");
		const cPeriods = await getPeriods(t, "m-partial", "lender-c");

		// A: Jan 1-19 @ 60%, Jan 21 onwards @ 30% (two periods after transfer)
		expect(aPeriods).toEqual([
			{
				lenderId: "lender-a",
				mortgageId: "m-partial",
				fraction: 0.6,
				fromDate: "2026-01-01",
				toDate: "2026-01-20",
			},
			{
				lenderId: "lender-a",
				mortgageId: "m-partial",
				fraction: 0.3,
				fromDate: "2026-01-21",
				toDate: null,
			},
		]);

		// B: unchanged 40% for entire January
		expect(bPeriods).toEqual([
			{
				lenderId: "lender-b",
				mortgageId: "m-partial",
				fraction: 0.4,
				fromDate: "2026-01-01",
				toDate: null,
			},
		]);

		// C: starts Jan 21 @ 30%
		expect(cPeriods).toEqual([
			{
				lenderId: "lender-c",
				mortgageId: "m-partial",
				fraction: 0.3,
				fromDate: "2026-01-21",
				toDate: null,
			},
		]);

		// Compute accruals
		const aAccrual = calculateAccrualForPeriods(
			aPeriods,
			RATE,
			PRINCIPAL,
			"2026-01-01",
			"2026-01-31"
		);
		const bAccrual = calculateAccrualForPeriods(
			bPeriods,
			RATE,
			PRINCIPAL,
			"2026-01-01",
			"2026-01-31"
		);
		const cAccrual = calculateAccrualForPeriods(
			cPeriods,
			RATE,
			PRINCIPAL,
			"2026-01-01",
			"2026-01-31"
		);

		// A: 20 days @ 60% + 11 days @ 30%
		const expectedA =
			(RATE * 0.6 * PRINCIPAL * 20) / 365 + (RATE * 0.3 * PRINCIPAL * 11) / 365;
		// B: 31 days @ 40%
		const expectedB = (RATE * 0.4 * PRINCIPAL * 31) / 365;
		// C: 11 days @ 30%
		const expectedC = (RATE * 0.3 * PRINCIPAL * 11) / 365;

		expect(aAccrual).toBeCloseTo(expectedA, 5);
		expect(bAccrual).toBeCloseTo(expectedB, 5);
		expect(cAccrual).toBeCloseTo(expectedC, 5);

		// All three sum to single owner (invariant)
		const singleOwner = calculatePeriodAccrual(RATE, 1, PRINCIPAL, 31);
		expect(aAccrual + bAccrual + cAccrual).toBeCloseTo(singleOwner, 10);
	});
});

// ---------------------------------------------------------------------------
// closing first of month — seller gets 1 day
// ---------------------------------------------------------------------------

describe("closing first of month", () => {
	it("seller gets exactly 1 day when deal closes on Jan 1", async () => {
		const t = createTestHarness();
		const auth = await initLedger(t);

		await mintMortgage(auth, "m-first", "mint-first", "2026-01-01");
		await issueShares(
			auth,
			"m-first",
			"seller",
			TOTAL_SHARES,
			"2026-01-01",
			"issue-first"
		);

		// Transfer on Jan 1 → seller gets only Jan 1 (1 day)
		const reservation = await reserveShares(auth, {
			mortgageId: "m-first",
			sellerLenderId: "seller",
			buyerLenderId: "buyer",
			amount: TOTAL_SHARES,
			effectiveDate: "2026-01-01",
			idempotencyKey: "reserve-first",
		});
		await commitReservation(auth, {
			reservationId: reservation.reservationId,
			effectiveDate: "2026-01-01",
			idempotencyKey: "commit-first",
		});

		const sellerPeriods = await getPeriods(t, "m-first", "seller");
		const buyerPeriods = await getPeriods(t, "m-first", "buyer");

		// Seller: Jan 1 only (1 day); balance goes to 0, no second period
		expect(sellerPeriods).toEqual([
			{
				lenderId: "seller",
				mortgageId: "m-first",
				fraction: 1,
				fromDate: "2026-01-01",
				toDate: "2026-01-01",
			},
		]);

		// Buyer: starts Jan 2
		expect(buyerPeriods).toEqual([
			{
				lenderId: "buyer",
				mortgageId: "m-first",
				fraction: 1,
				fromDate: "2026-01-02",
				toDate: null,
			},
		]);

		// Seller: 1 day of accrual
		const sellerAccrual = calculateAccrualForPeriods(
			sellerPeriods,
			RATE,
			PRINCIPAL,
			"2026-01-01",
			"2026-01-31"
		);
		const expectedSeller = (RATE * 1 * PRINCIPAL * 1) / 365;
		expect(sellerAccrual).toBeCloseTo(expectedSeller, 5);

		// Invariant: seller + buyer = single owner
		const buyerAccrual = calculateAccrualForPeriods(
			buyerPeriods,
			RATE,
			PRINCIPAL,
			"2026-01-01",
			"2026-01-31"
		);
		const singleOwner = calculatePeriodAccrual(RATE, 1, PRINCIPAL, 31);
		expect(sellerAccrual + buyerAccrual).toBe(singleOwner);
	});
});

// ---------------------------------------------------------------------------
// closing last of month — seller gets full month
// ---------------------------------------------------------------------------

describe("closing last of month", () => {
	it("seller gets full month when deal closes on Jan 31", async () => {
		const t = createTestHarness();
		const auth = await initLedger(t);

		await mintMortgage(auth, "m-last", "mint-last", "2026-01-01");
		await issueShares(
			auth,
			"m-last",
			"seller",
			TOTAL_SHARES,
			"2026-01-01",
			"issue-last"
		);

		// Transfer on Jan 31 → seller's period includes Jan 31 (31 days total)
		const reservation = await reserveShares(auth, {
			mortgageId: "m-last",
			sellerLenderId: "seller",
			buyerLenderId: "buyer",
			amount: TOTAL_SHARES,
			effectiveDate: "2026-01-31",
			idempotencyKey: "reserve-last",
		});
		await commitReservation(auth, {
			reservationId: reservation.reservationId,
			effectiveDate: "2026-01-31",
			idempotencyKey: "commit-last",
		});

		const sellerPeriods = await getPeriods(t, "m-last", "seller");
		const buyerPeriods = await getPeriods(t, "m-last", "buyer");

		// Seller: Jan 1 → Jan 31 (31 days, full month); balance goes to 0, no second period
		expect(sellerPeriods).toEqual([
			{
				lenderId: "seller",
				mortgageId: "m-last",
				fraction: 1,
				fromDate: "2026-01-01",
				toDate: "2026-01-31",
			},
		]);

		// Buyer: starts Feb 1 (outside January query range)
		expect(buyerPeriods).toEqual([
			{
				lenderId: "buyer",
				mortgageId: "m-last",
				fraction: 1,
				fromDate: "2026-02-01",
				toDate: null,
			},
		]);

		// Seller: 31 days of accrual (full month)
		const sellerAccrual = calculateAccrualForPeriods(
			sellerPeriods,
			RATE,
			PRINCIPAL,
			"2026-01-01",
			"2026-01-31"
		);
		const expectedSeller = (RATE * 1 * PRINCIPAL * 31) / 365;
		expect(sellerAccrual).toBeCloseTo(expectedSeller, 5);

		// Buyer: 0 days within January
		const buyerAccrual = calculateAccrualForPeriods(
			buyerPeriods,
			RATE,
			PRINCIPAL,
			"2026-01-01",
			"2026-01-31"
		);
		expect(buyerAccrual).toBe(0);

		// Invariant still holds: seller + buyer = single owner (31 days)
		const singleOwner = calculatePeriodAccrual(RATE, 1, PRINCIPAL, 31);
		expect(sellerAccrual + buyerAccrual).toBe(singleOwner);
	});
});

// ---------------------------------------------------------------------------
// invariant — parameterized across multiple dates
// ---------------------------------------------------------------------------

describe("invariant: seller_accrual + buyer_accrual = single_owner_accrual", () => {
	// Transfer dates covering various month positions
	const transferDates = [
		"2026-01-05", // early month
		"2026-01-15", // mid month
		"2026-01-20", // late month
		"2026-01-28", // last week
		"2026-02-15", // leap year Feb
		"2026-04-30", // 30-day month
		"2026-12-31", // last day of year
	];

	it.each(transferDates)("holds for transfer on %s", async (transferDate) => {
		const t = createTestHarness();
		const auth = await initLedger(t);

		const mortgageId = `m-invariant-${transferDate}`;
		await mintMortgage(auth, mortgageId, `mint-${transferDate}`, "2026-01-01");
		await issueShares(
			auth,
			mortgageId,
			"seller",
			TOTAL_SHARES,
			"2026-01-01",
			`issue-${transferDate}`
		);

		const reservation = await reserveShares(auth, {
			mortgageId,
			sellerLenderId: "seller",
			buyerLenderId: "buyer",
			amount: TOTAL_SHARES,
			effectiveDate: transferDate,
			idempotencyKey: `reserve-${transferDate}`,
		});
		await commitReservation(auth, {
			reservationId: reservation.reservationId,
			effectiveDate: transferDate,
			idempotencyKey: `commit-${transferDate}`,
		});

		const sellerPeriods = await getPeriods(t, mortgageId, "seller");
		const buyerPeriods = await getPeriods(t, mortgageId, "buyer");

		// Query full year 2026
		const sellerAccrual = calculateAccrualForPeriods(
			sellerPeriods,
			RATE,
			PRINCIPAL,
			"2026-01-01",
			"2026-12-31"
		);
		const buyerAccrual = calculateAccrualForPeriods(
			buyerPeriods,
			RATE,
			PRINCIPAL,
			"2026-01-01",
			"2026-12-31"
		);
		const singleOwner = calculatePeriodAccrual(RATE, 1, PRINCIPAL, 365);

		// Exact equality — no rounding in accrual computation
		expect(sellerAccrual + buyerAccrual).toBe(singleOwner);
	});
});
