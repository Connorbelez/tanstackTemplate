import { describe, expect, it } from "vitest";
import { api } from "../../_generated/api";
import {
	type TestHarness,
	SYS_SOURCE,
	asLedgerUser,
	createTestHarness,
	executeCommitReservation,
	executeReserveShares,
	executeVoidReservation,
	getAccount,
	initCounter,
} from "./testUtils";

// ── Helpers ─────────────────────────────────────────────────────

/**
 * Look up a journal entry by idempotency key and return its timestamp.
 * Throws if not found.
 */
async function getEntryTimestamp(
	t: TestHarness,
	idempotencyKey: string,
): Promise<number> {
	const entry = await t.run(async (ctx) =>
		ctx.db
			.query("ledger_journal_entries")
			.withIndex("by_idempotency", (q) =>
				q.eq("idempotencyKey", idempotencyKey),
			)
			.first(),
	);
	if (!entry) {
		throw new Error(
			`Journal entry with idempotencyKey "${idempotencyKey}" not found`,
		);
	}
	return entry.timestamp;
}

// ── Test 1: Deterministic getPositionsAt ────────────────────────

describe("point-in-time determinism", () => {
	it("getPositionsAt same timestamp returns identical results regardless of later entries", async () => {
		const t = createTestHarness();
		const auth = asLedgerUser(t);
		await initCounter(auth);

		// mintAndIssue(M1, [A: 5000, B: 5000])
		await auth.mutation(api.ledger.mutations.mintAndIssue, {
			mortgageId: "M1",
			allocations: [
				{ lenderId: "A", amount: 5_000 },
				{ lenderId: "B", amount: 5_000 },
			],
			effectiveDate: "2026-01-01",
			idempotencyKey: "mint-pit-M1",
			source: SYS_SOURCE,
		});

		// transferShares(A->C, 2000)
		await auth.mutation(api.ledger.mutations.transferShares, {
			mortgageId: "M1",
			sellerLenderId: "A",
			buyerLenderId: "C",
			amount: 2_000,
			effectiveDate: "2026-01-02",
			idempotencyKey: "xfer-pit-M1-A-C",
			source: SYS_SOURCE,
		});

		// Read timestamp t1 from the transfer entry
		const t1 = await getEntryTimestamp(t, "xfer-pit-M1-A-C");

		// getPositionsAt(M1, t1) -> snapshot S1
		// Using exact timestamp — lte("timestamp", t1) includes entries at t1
		const s1 = await auth.query(api.ledger.queries.getPositionsAt, {
			mortgageId: "M1",
			asOf: t1,
		});

		// Force a timestamp gap so B->D gets a strictly later timestamp
		await new Promise((r) => setTimeout(r, 2));

		// transferShares(B->D, 1000) -- add more entries after t1
		await auth.mutation(api.ledger.mutations.transferShares, {
			mortgageId: "M1",
			sellerLenderId: "B",
			buyerLenderId: "D",
			amount: 1_000,
			effectiveDate: "2026-01-03",
			idempotencyKey: "xfer-pit-M1-B-D",
			source: SYS_SOURCE,
		});

		// Verify the later entry has a strictly greater timestamp
		const t2 = await getEntryTimestamp(t, "xfer-pit-M1-B-D");
		expect(t2).toBeGreaterThan(t1);

		// getPositionsAt(M1, t1) -> snapshot S2 (same asOf, after more entries exist)
		const s2 = await auth.query(api.ledger.queries.getPositionsAt, {
			mortgageId: "M1",
			asOf: t1,
		});

		// S1 deep-equals S2 (deterministic)
		// Sort both by lenderId for stable comparison
		const sort = (
			arr: Array<{ lenderId: string; balance: bigint }>,
		) => [...arr].sort((a, b) => a.lenderId.localeCompare(b.lenderId));

		expect(sort(s1)).toEqual(sort(s2));

		// Verify actual values in the snapshot
		const posMap: Record<string, bigint> = {};
		for (const p of s1) {
			posMap[p.lenderId] = p.balance;
		}
		expect(posMap.A).toBe(3_000n);
		expect(posMap.B).toBe(5_000n);
		expect(posMap.C).toBe(2_000n);
	});
});

// ── Test 2: getBalanceAt correctness ────────────────────────────

describe("point-in-time balances", () => {
	it("getBalanceAt returns correct balance at each point in time", async () => {
		const t = createTestHarness();
		const auth = asLedgerUser(t);
		await initCounter(auth);

		// mintAndIssue(M1, [A: 5000, B: 5000])
		await auth.mutation(api.ledger.mutations.mintAndIssue, {
			mortgageId: "M1",
			allocations: [
				{ lenderId: "A", amount: 5_000 },
				{ lenderId: "B", amount: 5_000 },
			],
			effectiveDate: "2026-01-01",
			idempotencyKey: "mint-bal-M1",
			source: SYS_SOURCE,
		});

		// Read t0 from SHARES_ISSUED entries
		const t0 = await getEntryTimestamp(t, "mint-bal-M1:issue:A");

		// Get account IDs after mint (before transfer, so we can reference them)
		const accountA = await getAccount(t, "M1", "A");

		// Verify A's balance at t0 (after issue, before transfer) = 5000n
		// Since issue happens at t0, querying at t0 includes it
		const balA_atIssue = await auth.query(api.ledger.queries.getBalanceAt, {
			accountId: accountA._id,
			asOf: t0,
		});
		expect(balA_atIssue).toBe(5_000n);

		// Verify A's balance before the issue = 0n
		const balA_before = await auth.query(api.ledger.queries.getBalanceAt, {
			accountId: accountA._id,
			asOf: t0 - 1,
		});
		expect(balA_before).toBe(0n);

		// Force a timestamp gap so the transfer gets a strictly later timestamp than t0
		await new Promise((r) => setTimeout(r, 2));

		// transferShares(A->C, 2000), read t1
		await auth.mutation(api.ledger.mutations.transferShares, {
			mortgageId: "M1",
			sellerLenderId: "A",
			buyerLenderId: "C",
			amount: 2_000,
			effectiveDate: "2026-01-02",
			idempotencyKey: "xfer-bal-M1-A-C",
			source: SYS_SOURCE,
		});
		const t1 = await getEntryTimestamp(t, "xfer-bal-M1-A-C");
		expect(t1).toBeGreaterThan(t0);

		const accountC = await getAccount(t, "M1", "C");

		// getBalanceAt(A.accountId, t1 + 1) -> 3000n (after transfer)
		const balA_t1 = await auth.query(api.ledger.queries.getBalanceAt, {
			accountId: accountA._id,
			asOf: t1 + 1,
		});
		expect(balA_t1).toBe(3_000n);

		// getBalanceAt(C.accountId, t0 - 1) -> 0n (C didn't exist before issue)
		const balC_before = await auth.query(api.ledger.queries.getBalanceAt, {
			accountId: accountC._id,
			asOf: t0 - 1,
		});
		expect(balC_before).toBe(0n);

		// getBalanceAt(C.accountId, t1 + 1) -> 2000n (after transfer)
		const balC_t1 = await auth.query(api.ledger.queries.getBalanceAt, {
			accountId: accountC._id,
			asOf: t1 + 1,
		});
		expect(balC_t1).toBe(2_000n);
	});
});

// ── Test 3: Audit-only entries don't affect point-in-time balance ─

describe("audit-only entries and point-in-time", () => {
	it("audit-only entries (SHARES_RESERVED, SHARES_VOIDED) don't affect point-in-time balance", async () => {
		const t = createTestHarness();
		const auth = asLedgerUser(t);
		await initCounter(auth);

		// mintAndIssue(M1, [A: 5000, B: 5000])
		await auth.mutation(api.ledger.mutations.mintAndIssue, {
			mortgageId: "M1",
			allocations: [
				{ lenderId: "A", amount: 5_000 },
				{ lenderId: "B", amount: 5_000 },
			],
			effectiveDate: "2026-01-01",
			idempotencyKey: "mint-audit-M1",
			source: SYS_SOURCE,
		});

		const accountA = await getAccount(t, "M1", "A");

		// reserveShares(A->C, 2000), read timestamp
		const reservation = await executeReserveShares(t, {
			mortgageId: "M1",
			sellerLenderId: "A",
			buyerLenderId: "C",
			amount: 2_000,
			effectiveDate: "2026-01-02",
			idempotencyKey: "reserve-audit-M1-A-C",
			source: SYS_SOURCE,
		});
		const tReserve = reservation.journalEntry.timestamp;

		// getBalanceAt(A.accountId, after reserve) -> still 5000n (SHARES_RESERVED is audit-only)
		const balAfterReserve = await auth.query(
			api.ledger.queries.getBalanceAt,
			{
				accountId: accountA._id,
				asOf: tReserve + 1,
			},
		);
		expect(balAfterReserve).toBe(5_000n);

		// voidReservation, read timestamp
		const voidResult = await executeVoidReservation(t, {
			reservationId: reservation.reservationId,
			reason: "test void",
			effectiveDate: "2026-01-03",
			idempotencyKey: "void-audit-M1-A-C",
			source: SYS_SOURCE,
		});
		const tVoid = voidResult.journalEntry.timestamp;

		// getBalanceAt(A.accountId, after void) -> still 5000n
		const balAfterVoid = await auth.query(
			api.ledger.queries.getBalanceAt,
			{
				accountId: accountA._id,
				asOf: tVoid + 1,
			},
		);
		expect(balAfterVoid).toBe(5_000n);
	});

	it("SHARES_COMMITTED DOES affect point-in-time balance", async () => {
		const t = createTestHarness();
		const auth = asLedgerUser(t);
		await initCounter(auth);

		// mintAndIssue(M1, [A: 5000, B: 5000])
		await auth.mutation(api.ledger.mutations.mintAndIssue, {
			mortgageId: "M1",
			allocations: [
				{ lenderId: "A", amount: 5_000 },
				{ lenderId: "B", amount: 5_000 },
			],
			effectiveDate: "2026-01-01",
			idempotencyKey: "mint-commit-M1",
			source: SYS_SOURCE,
		});

		// reserveShares(A->C, 2000) then commitReservation
		const reservation = await executeReserveShares(t, {
			mortgageId: "M1",
			sellerLenderId: "A",
			buyerLenderId: "C",
			amount: 2_000,
			effectiveDate: "2026-01-02",
			idempotencyKey: "reserve-commit-M1-A-C",
			source: SYS_SOURCE,
		});

		const commitResult = await executeCommitReservation(t, {
			reservationId: reservation.reservationId,
			effectiveDate: "2026-01-03",
			idempotencyKey: "commit-pit-M1-A-C",
			source: SYS_SOURCE,
		});
		const t3 = commitResult.journalEntry.timestamp;

		// Get account IDs
		const accountA = await getAccount(t, "M1", "A");
		const accountC = await getAccount(t, "M1", "C");

		// getBalanceAt(A.accountId, t3 + 1) -> 3000n (SHARES_COMMITTED updates cumulatives)
		const balA = await auth.query(api.ledger.queries.getBalanceAt, {
			accountId: accountA._id,
			asOf: t3 + 1,
		});
		expect(balA).toBe(3_000n);

		// getBalanceAt(C.accountId, t3 + 1) -> 2000n
		const balC = await auth.query(api.ledger.queries.getBalanceAt, {
			accountId: accountC._id,
			asOf: t3 + 1,
		});
		expect(balC).toBe(2_000n);
	});
});
