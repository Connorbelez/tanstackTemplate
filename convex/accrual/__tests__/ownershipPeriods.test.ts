import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "../../_generated/api";
import { FAIRLEND_STAFF_ORG_ID } from "../../constants";
import schema from "../../schema";
import { getOwnershipPeriods } from "../ownershipPeriods";

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

async function mintAndIssue(
	t: ReturnType<typeof createTestHarness>,
	mortgageId: string,
	lenderId: string,
	amount = 10_000
) {
	const auth = asLedgerUser(t);
	await auth.mutation(api.ledger.mutations.mintMortgage, {
		mortgageId,
		effectiveDate: "2026-01-01",
		idempotencyKey: `mint-${mortgageId}`,
		source: SYS_SOURCE,
	});
	return auth.mutation(internal.ledger.mutations.issueShares, {
		mortgageId,
		lenderId,
		amount,
		effectiveDate: "2026-01-01",
		idempotencyKey: `issue-${mortgageId}-${lenderId}`,
		source: SYS_SOURCE,
	});
}

describe("getOwnershipPeriods", () => {
	it("returns a single open period for an untouched position", async () => {
		const t = createTestHarness();
		await initCounter(t);
		await mintAndIssue(t, "m-single", "lender-a");

		const periods = await t.run(async (ctx) =>
			getOwnershipPeriods(ctx, "m-single", "lender-a")
		);

		expect(periods).toEqual([
			{
				lenderId: "lender-a",
				mortgageId: "m-single",
				fraction: 1,
				fromDate: "2026-01-01",
				toDate: null,
			},
		]);
	});

	it("splits periods on transfer and gives the closing date to the seller", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const auth = asLedgerUser(t);

		await mintAndIssue(t, "m-transfer", "seller");
		await auth.mutation(api.ledger.mutations.transferShares, {
			mortgageId: "m-transfer",
			sellerLenderId: "seller",
			buyerLenderId: "buyer",
			amount: 5000,
			effectiveDate: "2026-01-15",
			idempotencyKey: "transfer-m-transfer",
			source: SYS_SOURCE,
		});

		const sellerPeriods = await t.run(async (ctx) =>
			getOwnershipPeriods(ctx, "m-transfer", "seller")
		);
		const buyerPeriods = await t.run(async (ctx) =>
			getOwnershipPeriods(ctx, "m-transfer", "buyer")
		);

		expect(sellerPeriods).toEqual([
			{
				lenderId: "seller",
				mortgageId: "m-transfer",
				fraction: 1,
				fromDate: "2026-01-01",
				toDate: "2026-01-15",
			},
			{
				lenderId: "seller",
				mortgageId: "m-transfer",
				fraction: 0.5,
				fromDate: "2026-01-16",
				toDate: null,
			},
		]);
		expect(buyerPeriods).toEqual([
			{
				lenderId: "buyer",
				mortgageId: "m-transfer",
				fraction: 0.5,
				fromDate: "2026-01-16",
				toDate: null,
			},
		]);
	});

	it("reconstructs multiple periods deterministically from real ledger rows", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const auth = asLedgerUser(t);

		await mintAndIssue(t, "m-multi", "seller");
		await auth.mutation(api.ledger.mutations.transferShares, {
			mortgageId: "m-multi",
			sellerLenderId: "seller",
			buyerLenderId: "buyer-1",
			amount: 2000,
			effectiveDate: "2026-02-01",
			idempotencyKey: "transfer-1",
			source: SYS_SOURCE,
		});
		await auth.mutation(api.ledger.mutations.transferShares, {
			mortgageId: "m-multi",
			sellerLenderId: "seller",
			buyerLenderId: "buyer-2",
			amount: 2000,
			effectiveDate: "2026-03-01",
			idempotencyKey: "transfer-2",
			source: SYS_SOURCE,
		});

		const first = await t.run(async (ctx) =>
			getOwnershipPeriods(ctx, "m-multi", "seller")
		);
		const second = await t.run(async (ctx) =>
			getOwnershipPeriods(ctx, "m-multi", "seller")
		);

		expect(first).toEqual(second);
		expect(first).toEqual([
			{
				lenderId: "seller",
				mortgageId: "m-multi",
				fraction: 1,
				fromDate: "2026-01-01",
				toDate: "2026-02-01",
			},
			{
				lenderId: "seller",
				mortgageId: "m-multi",
				fraction: 0.8,
				fromDate: "2026-02-02",
				toDate: "2026-03-01",
			},
			{
				lenderId: "seller",
				mortgageId: "m-multi",
				fraction: 0.6,
				fromDate: "2026-03-02",
				toDate: null,
			},
		]);
	});

	it("ignores audit-only reserve and void entries", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const auth = asLedgerUser(t);

		await mintAndIssue(t, "m-audit", "seller");
		await auth.mutation(internal.ledger.mutations.reserveShares, {
			mortgageId: "m-audit",
			sellerLenderId: "seller",
			buyerLenderId: "buyer",
			amount: 2000,
			effectiveDate: "2026-01-15",
			idempotencyKey: "reserve-audit",
			source: SYS_SOURCE,
		});
		const reservation = await t.run(async (ctx) => {
			const reservations = await ctx.db.query("ledger_reservations").collect();
			return reservations.find((row) => row.mortgageId === "m-audit");
		});
		expect(reservation).toBeDefined();
		if (!reservation) {
			return;
		}
		await auth.mutation(internal.ledger.mutations.voidReservation, {
			reservationId: reservation._id,
			reason: "test void",
			effectiveDate: "2026-01-16",
			idempotencyKey: "void-audit",
			source: SYS_SOURCE,
		});

		const sellerPeriods = await t.run(async (ctx) =>
			getOwnershipPeriods(ctx, "m-audit", "seller")
		);
		const buyerPeriods = await t.run(async (ctx) =>
			getOwnershipPeriods(ctx, "m-audit", "buyer")
		);

		expect(sellerPeriods).toEqual([
			{
				lenderId: "seller",
				mortgageId: "m-audit",
				fraction: 1,
				fromDate: "2026-01-01",
				toDate: null,
			},
		]);
		expect(buyerPeriods).toEqual([]);
	});
});
