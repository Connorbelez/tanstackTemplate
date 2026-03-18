/**
 * Concurrency test suite for the Mortgage Ownership Ledger.
 *
 * convex-test serializes mutations — true OCC conflicts aren't directly
 * testable in this harness. These tests verify that balance checks and
 * idempotency guards correctly serialize sequential operations that
 * *would* conflict under concurrency. Convex's runtime guarantees OCC
 * retry behavior in production.
 *
 * @see SPEC 1.3 §6.4, ENG-36 acceptance criteria
 */
import { describe, expect, it } from "vitest";
import { api, internal } from "../../_generated/api";
import { TOTAL_SUPPLY } from "../constants";
import {
	type AuthenticatedHarness,
	SYS_SOURCE,
	asLedgerUser,
	createTestHarness,
	executeCommitReservation,
	executeReserveShares,
	getConvexErrorCode,
	initCounter,
} from "./testUtils.test";

/**
 * Mint a mortgage and issue shares to multiple lenders.
 * Allocations are validated by the underlying mutations.
 */
async function mintAndIssueMultiple(
	auth: AuthenticatedHarness,
	mortgageId: string,
	allocations: Array<{ lenderId: string; amount: number }>,
) {
	await auth.mutation(api.ledger.mutations.mintMortgage, {
		mortgageId,
		effectiveDate: "2026-01-01",
		idempotencyKey: `mint-${mortgageId}`,
		source: SYS_SOURCE,
	});

	const results = [];
	for (const { lenderId, amount } of allocations) {
		const result = await auth.mutation(
			internal.ledger.mutations.issueShares,
			{
				mortgageId,
				lenderId,
				amount,
				effectiveDate: "2026-01-01",
				idempotencyKey: `issue-${mortgageId}-${lenderId}`,
				source: SYS_SOURCE,
			},
		);
		results.push(result);
	}
	return results;
}

// ── T-080: Concurrent transfers on same mortgage ────────────────

describe("concurrent transfers on same mortgage", () => {
	it("T-080a: two sequential transfers from same seller both succeed when balance is sufficient", async () => {
		const t = createTestHarness();
		const auth = asLedgerUser(t);
		await initCounter(auth);

		// Setup: A=5,000, B=3,000, C=2,000
		await mintAndIssueMultiple(auth, "m-conc-transfer", [
			{ lenderId: "A", amount: 5_000 },
			{ lenderId: "B", amount: 3_000 },
			{ lenderId: "C", amount: 2_000 },
		]);

		// Transfer A→B 2,000 (A goes from 5,000 to 3,000)
		await auth.mutation(api.ledger.mutations.transferShares, {
			mortgageId: "m-conc-transfer",
			sellerLenderId: "A",
			buyerLenderId: "B",
			amount: 2_000,
			effectiveDate: "2026-01-02",
			idempotencyKey: "xfer-ab-2k",
			source: SYS_SOURCE,
		});

		// Transfer A→C 2,000 (A goes from 3,000 to 1,000)
		await auth.mutation(api.ledger.mutations.transferShares, {
			mortgageId: "m-conc-transfer",
			sellerLenderId: "A",
			buyerLenderId: "C",
			amount: 2_000,
			effectiveDate: "2026-01-02",
			idempotencyKey: "xfer-ac-2k",
			source: SYS_SOURCE,
		});

		// Assert final balances
		const balanceA = await auth.query(api.ledger.queries.getPositions, {
			mortgageId: "m-conc-transfer",
		});

		const positions = new Map(
			balanceA.map((p) => [p.lenderId, Number(p.balance)]),
		);
		expect(positions.get("A")).toBe(1_000);
		expect(positions.get("B")).toBe(5_000);
		expect(positions.get("C")).toBe(4_000);

		// Supply invariant
		const invariant = await auth.query(
			api.ledger.validation.validateSupplyInvariant,
			{ mortgageId: "m-conc-transfer" },
		);
		expect(invariant.valid).toBe(true);
		expect(invariant.total).toBe(TOTAL_SUPPLY);
	});

	it("T-080b: second transfer rejected when first depletes available balance", async () => {
		const t = createTestHarness();
		const auth = asLedgerUser(t);
		await initCounter(auth);

		// Setup: A=5,000, B=3,000, C=2,000
		await mintAndIssueMultiple(auth, "m-conc-reject", [
			{ lenderId: "A", amount: 5_000 },
			{ lenderId: "B", amount: 3_000 },
			{ lenderId: "C", amount: 2_000 },
		]);

		// Transfer A→B 4,000 (A goes from 5,000 to 1,000 — at min fraction)
		await auth.mutation(api.ledger.mutations.transferShares, {
			mortgageId: "m-conc-reject",
			sellerLenderId: "A",
			buyerLenderId: "B",
			amount: 4_000,
			effectiveDate: "2026-01-02",
			idempotencyKey: "xfer-conc-ab",
			source: SYS_SOURCE,
		});

		// Transfer A→C 2,000 — should fail (A only has 1,000 left,
		// and transferring 2,000 would leave A at -1,000 which is impossible)
		try {
			await auth.mutation(api.ledger.mutations.transferShares, {
				mortgageId: "m-conc-reject",
				sellerLenderId: "A",
				buyerLenderId: "C",
				amount: 2_000,
				effectiveDate: "2026-01-02",
				idempotencyKey: "xfer-conc-ac",
				source: SYS_SOURCE,
			});
			expect.fail("Expected second transfer to be rejected");
		} catch (error) {
			const code = getConvexErrorCode(error);
			// Either insufficient balance or min-fraction violation
			expect(["INSUFFICIENT_BALANCE", "MIN_FRACTION_VIOLATED"]).toContain(
				code,
			);
		}

		// Verify A still has 1,000 (from first transfer only)
		const balances = await auth.query(api.ledger.queries.getPositions, {
			mortgageId: "m-conc-reject",
		});
		const positions = new Map(
			balances.map((p) => [p.lenderId, Number(p.balance)]),
		);
		expect(positions.get("A")).toBe(1_000);
		expect(positions.get("B")).toBe(7_000);
		expect(positions.get("C")).toBe(2_000);

		// Supply invariant still holds
		const invariant = await auth.query(
			api.ledger.validation.validateSupplyInvariant,
			{ mortgageId: "m-conc-reject" },
		);
		expect(invariant.valid).toBe(true);
	});
});

// ── T-081: Double-mint OCC serialization ────────────────────────

describe("double-mint prevention", () => {
	it("T-081: second mint of same mortgage rejected, only one TREASURY exists", async () => {
		const t = createTestHarness();
		const auth = asLedgerUser(t);
		await initCounter(auth);

		// First mint succeeds
		await auth.mutation(api.ledger.mutations.mintMortgage, {
			mortgageId: "m-double-mint",
			effectiveDate: "2026-01-01",
			idempotencyKey: "mint-double-1",
			source: SYS_SOURCE,
		});

		// Second mint with different idempotencyKey — rejected
		try {
			await auth.mutation(api.ledger.mutations.mintMortgage, {
				mortgageId: "m-double-mint",
				effectiveDate: "2026-01-01",
				idempotencyKey: "mint-double-2",
				source: SYS_SOURCE,
			});
			expect.fail("Expected double-mint to be rejected");
		} catch (error) {
			expect(getConvexErrorCode(error)).toBe("ALREADY_MINTED");
		}

		// Verify only one TREASURY account exists
		const treasuries = await t.run(async (ctx) =>
			ctx.db
				.query("ledger_accounts")
				.withIndex("by_type_and_mortgage", (q) =>
					q.eq("type", "TREASURY").eq("mortgageId", "m-double-mint"),
				)
				.collect(),
		);
		expect(treasuries).toHaveLength(1);

		// Verify TREASURY balance = TOTAL_SUPPLY (10,000)
		const balance = await auth.query(api.ledger.queries.getBalance, {
			accountId: treasuries[0]._id,
		});
		expect(balance).toBe(TOTAL_SUPPLY);
	});
});

// ── T-082: Sequence number integrity ────────────────────────────

describe("sequence number integrity under concurrent writes", () => {
	it("T-082: sequence numbers remain gap-free after multiple write operations", async () => {
		const t = createTestHarness();
		const auth = asLedgerUser(t);
		await initCounter(auth);

		// mint(seq 1) + issue A(seq 2) + issue B(seq 3) = 3 entries from mintAndIssueMultiple
		// Then: transfer(seq 4) + transfer(seq 5) + redeem(seq 6) = 3 more entries
		await mintAndIssueMultiple(auth, "m-seq-gap", [
			{ lenderId: "A", amount: 5_000 },
			{ lenderId: "B", amount: 5_000 },
		]);

		// Transfer A→B 2,000
		await auth.mutation(api.ledger.mutations.transferShares, {
			mortgageId: "m-seq-gap",
			sellerLenderId: "A",
			buyerLenderId: "B",
			amount: 2_000,
			effectiveDate: "2026-01-02",
			idempotencyKey: "xfer-seq-1",
			source: SYS_SOURCE,
		});

		// Transfer B→A 1,000
		await auth.mutation(api.ledger.mutations.transferShares, {
			mortgageId: "m-seq-gap",
			sellerLenderId: "B",
			buyerLenderId: "A",
			amount: 1_000,
			effectiveDate: "2026-01-02",
			idempotencyKey: "xfer-seq-2",
			source: SYS_SOURCE,
		});

		// Redeem A 2,000 (returns to treasury)
		await auth.mutation(api.ledger.mutations.redeemShares, {
			mortgageId: "m-seq-gap",
			lenderId: "A",
			amount: 2_000,
			effectiveDate: "2026-01-03",
			idempotencyKey: "redeem-seq-1",
			source: SYS_SOURCE,
		});

		// Fetch all journal entries ordered by sequenceNumber
		const history = await auth.query(api.ledger.queries.getMortgageHistory, {
			mortgageId: "m-seq-gap",
		});

		// Should have 6 entries: mint, issueA, issueB, transferAB, transferBA, redeemA
		expect(history).toHaveLength(6);

		// Verify contiguous sequence [1, 2, 3, 4, 5, 6] with no gaps
		for (let i = 0; i < history.length; i++) {
			expect(history[i].sequenceNumber).toBe(BigInt(i + 1));
		}
	});
});

// ── T-083: Supply invariant under interleaved operations ────────

describe("supply invariant under concurrent scenarios", () => {
	it("T-083: invariant holds after interleaved operations on same mortgage", async () => {
		const t = createTestHarness();
		const auth = asLedgerUser(t);
		await initCounter(auth);

		// Setup: A=5,000, B=5,000
		await mintAndIssueMultiple(auth, "m-invariant", [
			{ lenderId: "A", amount: 5_000 },
			{ lenderId: "B", amount: 5_000 },
		]);

		// Interleaved operations:
		// 1. Transfer A→B 2,000 (A=3,000, B=7,000)
		await auth.mutation(api.ledger.mutations.transferShares, {
			mortgageId: "m-invariant",
			sellerLenderId: "A",
			buyerLenderId: "B",
			amount: 2_000,
			effectiveDate: "2026-01-02",
			idempotencyKey: "xfer-inv-1",
			source: SYS_SOURCE,
		});

		// 2. Transfer B→A 1,000 (A=4,000, B=6,000)
		await auth.mutation(api.ledger.mutations.transferShares, {
			mortgageId: "m-invariant",
			sellerLenderId: "B",
			buyerLenderId: "A",
			amount: 1_000,
			effectiveDate: "2026-01-02",
			idempotencyKey: "xfer-inv-2",
			source: SYS_SOURCE,
		});

		// 3. Redeem A 2,000 (A=2,000, treasury gets 2,000 back)
		await auth.mutation(api.ledger.mutations.redeemShares, {
			mortgageId: "m-invariant",
			lenderId: "A",
			amount: 2_000,
			effectiveDate: "2026-01-03",
			idempotencyKey: "redeem-inv-1",
			source: SYS_SOURCE,
		});

		// Verify supply invariant: treasury + all positions = 10,000
		const invariant = await auth.query(
			api.ledger.validation.validateSupplyInvariant,
			{ mortgageId: "m-invariant" },
		);
		expect(invariant.valid).toBe(true);
		expect(invariant.total).toBe(TOTAL_SUPPLY);

		// Verify individual positions
		const positions = await auth.query(api.ledger.queries.getPositions, {
			mortgageId: "m-invariant",
		});
		const balanceMap = new Map(
			positions.map((p) => [p.lenderId, Number(p.balance)]),
		);
		expect(balanceMap.get("A")).toBe(2_000);
		expect(balanceMap.get("B")).toBe(6_000);

		// Treasury should hold the redeemed 2,000
		expect(invariant.treasuryBalance).toBe(2_000n);
	});

	it("T-083b: invariant holds after reservation lifecycle mixed with direct transfers", async () => {
		const t = createTestHarness();
		const auth = asLedgerUser(t);
		await initCounter(auth);

		// Setup: A=6,000, B=4,000
		await mintAndIssueMultiple(auth, "m-inv-mixed", [
			{ lenderId: "A", amount: 6_000 },
			{ lenderId: "B", amount: 4_000 },
		]);

		// 1. Reserve 3,000 from A → C
		const reserveResult = await executeReserveShares(t, {
			mortgageId: "m-inv-mixed",
			sellerLenderId: "A",
			buyerLenderId: "C",
			amount: 3_000,
			effectiveDate: "2026-01-02",
			idempotencyKey: "reserve-inv-mixed",
			source: SYS_SOURCE,
		});

		// 2. Direct transfer B→A 1,000 while reservation is pending
		await auth.mutation(api.ledger.mutations.transferShares, {
			mortgageId: "m-inv-mixed",
			sellerLenderId: "B",
			buyerLenderId: "A",
			amount: 1_000,
			effectiveDate: "2026-01-02",
			idempotencyKey: "xfer-inv-mixed",
			source: SYS_SOURCE,
		});

		// 3. Commit reservation
		await executeCommitReservation(t, {
			reservationId: reserveResult.reservationId,
			effectiveDate: "2026-01-03",
			idempotencyKey: "commit-inv-mixed",
			source: SYS_SOURCE,
		});

		// Verify supply invariant
		const invariant = await auth.query(
			api.ledger.validation.validateSupplyInvariant,
			{ mortgageId: "m-inv-mixed" },
		);
		expect(invariant.valid).toBe(true);
		expect(invariant.total).toBe(TOTAL_SUPPLY);

		// Expected balances:
		// A: started 6,000, reserved -3,000 (committed), received +1,000 from B = 4,000
		// B: started 4,000, transferred -1,000 to A = 3,000
		// C: received 3,000 from committed reservation = 3,000
		// Treasury: 0 (all shares distributed)
		const positions = await auth.query(api.ledger.queries.getPositions, {
			mortgageId: "m-inv-mixed",
		});
		const balanceMap = new Map(
			positions.map((p) => [p.lenderId, Number(p.balance)]),
		);
		expect(balanceMap.get("A")).toBe(4_000);
		expect(balanceMap.get("B")).toBe(3_000);
		expect(balanceMap.get("C")).toBe(3_000);
		expect(invariant.treasuryBalance).toBe(0n);
	});
});
