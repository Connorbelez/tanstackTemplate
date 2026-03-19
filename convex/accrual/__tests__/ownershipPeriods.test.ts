import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { FAIRLEND_STAFF_ORG_ID } from "../../constants";
import schema from "../../schema";
import { getOwnershipPeriods } from "../ownershipPeriods";

const modules = import.meta.glob("/convex/**/*.ts");

const LEDGER_TEST_IDENTITY = {
	subject: "test-accrual-user",
	issuer: "https://api.workos.com",
	org_id: FAIRLEND_STAFF_ORG_ID,
	organization_name: "FairLend Staff",
	role: "admin",
	roles: JSON.stringify(["admin"]),
	permissions: JSON.stringify(["ledger:view", "ledger:correct"]),
	user_email: "accrual-test@fairlend.ca",
	user_first_name: "Accrual",
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
	idempotencyKey: string
) {
	return auth.mutation(api.ledger.mutations.mintMortgage, {
		mortgageId,
		effectiveDate: "2026-01-01",
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

async function transferShares(
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
	return auth.mutation(internal.ledger.mutations.transferSharesInternal, {
		...args,
		source: SYS_SOURCE,
	});
}

async function redeemShares(
	auth: ReturnType<typeof asLedgerUser>,
	args: {
		amount: number;
		effectiveDate: string;
		idempotencyKey: string;
		mortgageId: string;
		lenderId: string;
	}
) {
	return auth.mutation(internal.ledger.mutations.redeemSharesInternal, {
		...args,
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
) {
	return t.run(async (ctx) =>
		getOwnershipPeriods({ db: ctx.db }, mortgageId, lenderId)
	);
}

describe("getOwnershipPeriods", () => {
	it("returns one open period for a single owner", async () => {
		const t = createTestHarness();
		const auth = await initLedger(t);

		await mintMortgage(auth, "m-period-single", "mint-single");
		await issueShares(
			auth,
			"m-period-single",
			"lender-a",
			10_000,
			"2026-01-01",
			"issue-single"
		);

		const periods = await getPeriods(t, "m-period-single", "lender-a");
		expect(periods).toEqual([
			{
				lenderId: "lender-a",
				mortgageId: "m-period-single",
				fraction: 1,
				fromDate: "2026-01-01",
				toDate: null,
			},
		]);
	});

	it("keeps the closing date with the seller and starts the buyer the day after on SHARES_COMMITTED", async () => {
		const t = createTestHarness();
		const auth = await initLedger(t);

		await mintMortgage(auth, "m-period-commit", "mint-commit");
		await issueShares(
			auth,
			"m-period-commit",
			"seller",
			10_000,
			"2026-01-01",
			"issue-commit-seller"
		);

		const reservation = await reserveShares(auth, {
			mortgageId: "m-period-commit",
			sellerLenderId: "seller",
			buyerLenderId: "buyer",
			amount: 5000,
			effectiveDate: "2026-01-15",
			idempotencyKey: "reserve-commit",
		});

		await commitReservation(auth, {
			reservationId: reservation.reservationId,
			effectiveDate: "2026-01-15",
			idempotencyKey: "commit-commit",
		});

		const sellerPeriods = await getPeriods(t, "m-period-commit", "seller");
		const buyerPeriods = await getPeriods(t, "m-period-commit", "buyer");

		expect(sellerPeriods).toEqual([
			{
				lenderId: "seller",
				mortgageId: "m-period-commit",
				fraction: 1,
				fromDate: "2026-01-01",
				toDate: "2026-01-15",
			},
			{
				lenderId: "seller",
				mortgageId: "m-period-commit",
				fraction: 0.5,
				fromDate: "2026-01-16",
				toDate: null,
			},
		]);

		expect(buyerPeriods).toEqual([
			{
				lenderId: "buyer",
				mortgageId: "m-period-commit",
				fraction: 0.5,
				fromDate: "2026-01-16",
				toDate: null,
			},
		]);
	});

	it("returns a correct period chain for multiple sequential transfers", async () => {
		const t = createTestHarness();
		const auth = await initLedger(t);

		await mintMortgage(auth, "m-period-chain", "mint-chain");
		await issueShares(
			auth,
			"m-period-chain",
			"lender-a",
			10_000,
			"2026-01-01",
			"issue-chain"
		);
		await transferShares(auth, {
			mortgageId: "m-period-chain",
			sellerLenderId: "lender-a",
			buyerLenderId: "lender-b",
			amount: 3000,
			effectiveDate: "2026-01-10",
			idempotencyKey: "transfer-chain-1",
		});
		await transferShares(auth, {
			mortgageId: "m-period-chain",
			sellerLenderId: "lender-a",
			buyerLenderId: "lender-c",
			amount: 3000,
			effectiveDate: "2026-01-20",
			idempotencyKey: "transfer-chain-2",
		});

		await expect(getPeriods(t, "m-period-chain", "lender-a")).resolves.toEqual([
			{
				lenderId: "lender-a",
				mortgageId: "m-period-chain",
				fraction: 1,
				fromDate: "2026-01-01",
				toDate: "2026-01-10",
			},
			{
				lenderId: "lender-a",
				mortgageId: "m-period-chain",
				fraction: 0.7,
				fromDate: "2026-01-11",
				toDate: "2026-01-20",
			},
			{
				lenderId: "lender-a",
				mortgageId: "m-period-chain",
				fraction: 0.4,
				fromDate: "2026-01-21",
				toDate: null,
			},
		]);

		await expect(getPeriods(t, "m-period-chain", "lender-b")).resolves.toEqual([
			{
				lenderId: "lender-b",
				mortgageId: "m-period-chain",
				fraction: 0.3,
				fromDate: "2026-01-11",
				toDate: null,
			},
		]);

		await expect(getPeriods(t, "m-period-chain", "lender-c")).resolves.toEqual([
			{
				lenderId: "lender-c",
				mortgageId: "m-period-chain",
				fraction: 0.3,
				fromDate: "2026-01-21",
				toDate: null,
			},
		]);
	});

	it("closes the final period on full exit", async () => {
		const t = createTestHarness();
		const auth = await initLedger(t);

		await mintMortgage(auth, "m-period-exit", "mint-exit");
		await issueShares(
			auth,
			"m-period-exit",
			"lender-a",
			10_000,
			"2026-01-01",
			"issue-exit"
		);
		await redeemShares(auth, {
			mortgageId: "m-period-exit",
			lenderId: "lender-a",
			amount: 10_000,
			effectiveDate: "2026-01-15",
			idempotencyKey: "redeem-exit",
		});

		const periods = await getPeriods(t, "m-period-exit", "lender-a");
		expect(periods).toEqual([
			{
				lenderId: "lender-a",
				mortgageId: "m-period-exit",
				fraction: 1,
				fromDate: "2026-01-01",
				toDate: "2026-01-15",
			},
		]);
	});

	it("ignores SHARES_RESERVED and SHARES_VOIDED entries", async () => {
		const t = createTestHarness();
		const auth = await initLedger(t);

		await mintMortgage(auth, "m-period-audit", "mint-audit");
		await issueShares(
			auth,
			"m-period-audit",
			"seller",
			10_000,
			"2026-01-01",
			"issue-audit"
		);

		const reservation = await reserveShares(auth, {
			mortgageId: "m-period-audit",
			sellerLenderId: "seller",
			buyerLenderId: "buyer",
			amount: 3000,
			effectiveDate: "2026-01-10",
			idempotencyKey: "reserve-audit",
		});

		await auth.mutation(internal.ledger.mutations.voidReservation, {
			reservationId: reservation.reservationId,
			reason: "cancelled",
			effectiveDate: "2026-01-11",
			idempotencyKey: "void-audit",
			source: SYS_SOURCE,
		});

		const sellerPeriods = await getPeriods(t, "m-period-audit", "seller");
		const buyerPeriods = await getPeriods(t, "m-period-audit", "buyer");

		expect(sellerPeriods).toEqual([
			{
				lenderId: "seller",
				mortgageId: "m-period-audit",
				fraction: 1,
				fromDate: "2026-01-01",
				toDate: null,
			},
		]);
		expect(buyerPeriods).toEqual([]);
	});
});
