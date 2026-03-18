import { describe, expect, it } from "vitest";
import { api } from "../../_generated/api";
import { getAvailableBalance, getPostedBalance } from "../accounts";
import {
	SYS_SOURCE,
	asLedgerUser,
	createTestHarness,
	executeCommitReservation,
	executeReserveShares,
	getAccount,
	getConvexErrorCode,
	initCounter,
} from "./testUtils.test";

// ── Test 1: Complete Lifecycle ──────────────────────────────────

describe("full lifecycle", () => {
	it("complete lifecycle: mintAndIssue -> reserve -> commit -> redeem -> burn", async () => {
		const t = createTestHarness();
		const auth = asLedgerUser(t);
		await initCounter(auth);

		// Step 1: mintAndIssue(M1, allocations: [A: 5000, B: 5000])
		await auth.mutation(api.ledger.mutations.mintAndIssue, {
			mortgageId: "M1",
			allocations: [
				{ lenderId: "A", amount: 5_000 },
				{ lenderId: "B", amount: 5_000 },
			],
			effectiveDate: "2026-01-01",
			idempotencyKey: "mint-M1",
			source: SYS_SOURCE,
		});

		// Step 2: validateSupplyInvariant(M1) -> valid, total=10000
		const inv1 = await auth.query(
			api.ledger.queries.validateSupplyInvariant,
			{ mortgageId: "M1" },
		);
		expect(inv1.valid).toBe(true);
		expect(inv1.total).toBe(10_000n);

		// Step 3: reserveShares(2000 A->C)
		const reservation = await executeReserveShares(t, {
			mortgageId: "M1",
			sellerLenderId: "A",
			buyerLenderId: "C",
			amount: 2_000,
			effectiveDate: "2026-01-02",
			idempotencyKey: "reserve-M1-A-C",
			source: SYS_SOURCE,
		});

		// Step 4: Verify A.available = 3000 (5000 posted - 2000 pending)
		const accountA = await getAccount(t, "M1", "A");
		expect(getAvailableBalance(accountA)).toBe(3_000n);

		// Step 5: validateSupplyInvariant -> still valid (pending doesn't affect invariant)
		const inv2 = await auth.query(
			api.ledger.queries.validateSupplyInvariant,
			{ mortgageId: "M1" },
		);
		expect(inv2.valid).toBe(true);

		// Step 6: commitReservation
		await executeCommitReservation(t, {
			reservationId: reservation.reservationId,
			effectiveDate: "2026-01-03",
			idempotencyKey: "commit-M1-A-C",
			source: SYS_SOURCE,
		});

		// Step 7: getPositions -> A=3000, B=5000, C=2000
		const positions = await auth.query(api.ledger.queries.getPositions, {
			mortgageId: "M1",
		});
		const posMap: Record<string, bigint> = {};
		for (const p of positions) {
			posMap[p.lenderId] = p.balance;
		}
		expect(posMap.A).toBe(3_000n);
		expect(posMap.B).toBe(5_000n);
		expect(posMap.C).toBe(2_000n);

		// Step 8: validateSupplyInvariant -> valid
		const inv3 = await auth.query(
			api.ledger.queries.validateSupplyInvariant,
			{ mortgageId: "M1" },
		);
		expect(inv3.valid).toBe(true);

		// Step 9: redeemShares(A: 3000 full exit -> 0)
		await auth.mutation(api.ledger.mutations.redeemShares, {
			mortgageId: "M1",
			lenderId: "A",
			amount: 3_000,
			effectiveDate: "2026-01-04",
			idempotencyKey: "redeem-M1-A",
			source: SYS_SOURCE,
		});

		// Step 10: redeemShares(B: 5000 full exit -> 0)
		await auth.mutation(api.ledger.mutations.redeemShares, {
			mortgageId: "M1",
			lenderId: "B",
			amount: 5_000,
			effectiveDate: "2026-01-04",
			idempotencyKey: "redeem-M1-B",
			source: SYS_SOURCE,
		});

		// Step 11: redeemShares(C: 2000 full exit -> 0)
		await auth.mutation(api.ledger.mutations.redeemShares, {
			mortgageId: "M1",
			lenderId: "C",
			amount: 2_000,
			effectiveDate: "2026-01-04",
			idempotencyKey: "redeem-M1-C",
			source: SYS_SOURCE,
		});

		// Step 12: validateSupplyInvariant -> valid, treasury=10000
		const inv4 = await auth.query(
			api.ledger.queries.validateSupplyInvariant,
			{ mortgageId: "M1" },
		);
		expect(inv4.valid).toBe(true);
		expect(inv4.treasury).toBe(10_000n);

		// Step 13: burnMortgage(M1)
		await auth.mutation(api.ledger.mutations.burnMortgage, {
			mortgageId: "M1",
			effectiveDate: "2026-01-05",
			idempotencyKey: "burn-M1",
			source: SYS_SOURCE,
			reason: "lifecycle test burn",
		});

		// Step 14: validateSupplyInvariant -> valid (burned state)
		const inv5 = await auth.query(
			api.ledger.queries.validateSupplyInvariant,
			{ mortgageId: "M1" },
		);
		expect(inv5.valid).toBe(true);
	});

	it("sell-all exception vs min-fraction enforcement", async () => {
		const t = createTestHarness();
		const auth = asLedgerUser(t);
		await initCounter(auth);

		// mintAndIssue(M2, [A: 5000, B: 5000])
		await auth.mutation(api.ledger.mutations.mintAndIssue, {
			mortgageId: "M2",
			allocations: [
				{ lenderId: "A", amount: 5_000 },
				{ lenderId: "B", amount: 5_000 },
			],
			effectiveDate: "2026-01-01",
			idempotencyKey: "mint-M2",
			source: SYS_SOURCE,
		});

		// transferShares(A->C, 5000) -> accepted (sell-all, A goes to 0)
		await auth.mutation(api.ledger.mutations.transferShares, {
			mortgageId: "M2",
			sellerLenderId: "A",
			buyerLenderId: "C",
			amount: 5_000,
			effectiveDate: "2026-01-02",
			idempotencyKey: "xfer-M2-A-C-sellall",
			source: SYS_SOURCE,
		});

		// Verify A.posted = 0, C.posted = 5000
		const accountA = await getAccount(t, "M2", "A");
		expect(getPostedBalance(accountA)).toBe(0n);
		const accountC = await getAccount(t, "M2", "C");
		expect(getPostedBalance(accountC)).toBe(5_000n);

		// mintAndIssue(M3, [D: 5000, E: 5000])
		await auth.mutation(api.ledger.mutations.mintAndIssue, {
			mortgageId: "M3",
			allocations: [
				{ lenderId: "D", amount: 5_000 },
				{ lenderId: "E", amount: 5_000 },
			],
			effectiveDate: "2026-01-01",
			idempotencyKey: "mint-M3",
			source: SYS_SOURCE,
		});

		// redeemShares(D, 4500 -> leaving 500) -> rejected MIN_FRACTION_VIOLATED
		try {
			await auth.mutation(api.ledger.mutations.redeemShares, {
				mortgageId: "M3",
				lenderId: "D",
				amount: 4_500,
				effectiveDate: "2026-01-02",
				idempotencyKey: "redeem-M3-D-partial",
				source: SYS_SOURCE,
			});
			expect.fail("Expected MIN_FRACTION_VIOLATED rejection");
		} catch (error) {
			expect(getConvexErrorCode(error)).toBe("MIN_FRACTION_VIOLATED");
		}

		// redeemShares(D, 5000 -> leaving 0) -> accepted (sell-all)
		await auth.mutation(api.ledger.mutations.redeemShares, {
			mortgageId: "M3",
			lenderId: "D",
			amount: 5_000,
			effectiveDate: "2026-01-02",
			idempotencyKey: "redeem-M3-D-sellall",
			source: SYS_SOURCE,
		});

		const accountD = await getAccount(t, "M3", "D");
		expect(getPostedBalance(accountD)).toBe(0n);
	});

	it("multi-mortgage isolation: operations on M1 don't affect M2", async () => {
		const t = createTestHarness();
		const auth = asLedgerUser(t);
		await initCounter(auth);

		// mintAndIssue(M1, [A: 10000])
		await auth.mutation(api.ledger.mutations.mintAndIssue, {
			mortgageId: "M1",
			allocations: [{ lenderId: "A", amount: 10_000 }],
			effectiveDate: "2026-01-01",
			idempotencyKey: "mint-iso-M1",
			source: SYS_SOURCE,
		});

		// mintAndIssue(M2, [A: 5000, B: 5000])
		await auth.mutation(api.ledger.mutations.mintAndIssue, {
			mortgageId: "M2",
			allocations: [
				{ lenderId: "A", amount: 5_000 },
				{ lenderId: "B", amount: 5_000 },
			],
			effectiveDate: "2026-01-01",
			idempotencyKey: "mint-iso-M2",
			source: SYS_SOURCE,
		});

		// transferShares M1 (A->C, 5000)
		await auth.mutation(api.ledger.mutations.transferShares, {
			mortgageId: "M1",
			sellerLenderId: "A",
			buyerLenderId: "C",
			amount: 5_000,
			effectiveDate: "2026-01-02",
			idempotencyKey: "xfer-iso-M1-A-C",
			source: SYS_SOURCE,
		});

		// redeemShares M1 (A->treasury, 5000)
		await auth.mutation(api.ledger.mutations.redeemShares, {
			mortgageId: "M1",
			lenderId: "A",
			amount: 5_000,
			effectiveDate: "2026-01-03",
			idempotencyKey: "redeem-iso-M1-A",
			source: SYS_SOURCE,
		});

		// redeemShares M1 (C->treasury, 5000)
		await auth.mutation(api.ledger.mutations.redeemShares, {
			mortgageId: "M1",
			lenderId: "C",
			amount: 5_000,
			effectiveDate: "2026-01-03",
			idempotencyKey: "redeem-iso-M1-C",
			source: SYS_SOURCE,
		});

		// burnMortgage M1
		await auth.mutation(api.ledger.mutations.burnMortgage, {
			mortgageId: "M1",
			effectiveDate: "2026-01-04",
			idempotencyKey: "burn-iso-M1",
			source: SYS_SOURCE,
			reason: "isolation test burn",
		});

		// validateSupplyInvariant M1 -> valid (burned)
		const invM1 = await auth.query(
			api.ledger.queries.validateSupplyInvariant,
			{ mortgageId: "M1" },
		);
		expect(invM1.valid).toBe(true);

		// validateSupplyInvariant M2 -> valid, total=10000 (unaffected)
		const invM2 = await auth.query(
			api.ledger.queries.validateSupplyInvariant,
			{ mortgageId: "M2" },
		);
		expect(invM2.valid).toBe(true);
		expect(invM2.total).toBe(10_000n);

		// Verify M2 positions unchanged
		const positionsM2 = await auth.query(api.ledger.queries.getPositions, {
			mortgageId: "M2",
		});
		const posMapM2: Record<string, bigint> = {};
		for (const p of positionsM2) {
			posMapM2[p.lenderId] = p.balance;
		}
		expect(posMapM2.A).toBe(5_000n);
		expect(posMapM2.B).toBe(5_000n);
	});
});

// ── Test T-006: Multi-mortgage lifecycle with reservations ──────

describe("multi-mortgage lifecycle with reservations", () => {
	it("reserve + commit across two mortgages where same buyer participates", async () => {
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
			idempotencyKey: "mint-multi-M1",
			source: SYS_SOURCE,
		});

		// mintAndIssue(M2, [C: 6000, D: 4000])
		await auth.mutation(api.ledger.mutations.mintAndIssue, {
			mortgageId: "M2",
			allocations: [
				{ lenderId: "C", amount: 6_000 },
				{ lenderId: "D", amount: 4_000 },
			],
			effectiveDate: "2026-01-01",
			idempotencyKey: "mint-multi-M2",
			source: SYS_SOURCE,
		});

		// Reserve on M1: A->BuyerX, 2000
		const reserveM1 = await executeReserveShares(t, {
			mortgageId: "M1",
			sellerLenderId: "A",
			buyerLenderId: "BuyerX",
			amount: 2_000,
			dealId: "deal-m1",
			effectiveDate: "2026-01-02",
			idempotencyKey: "reserve-multi-M1-A-BuyerX",
			source: SYS_SOURCE,
		});

		// Reserve on M2: C->BuyerX, 3000 (same buyer in different mortgage)
		const reserveM2 = await executeReserveShares(t, {
			mortgageId: "M2",
			sellerLenderId: "C",
			buyerLenderId: "BuyerX",
			amount: 3_000,
			dealId: "deal-m2",
			effectiveDate: "2026-01-02",
			idempotencyKey: "reserve-multi-M2-C-BuyerX",
			source: SYS_SOURCE,
		});

		// Verify available balances during reservation phase
		const accountA = await getAccount(t, "M1", "A");
		expect(getAvailableBalance(accountA)).toBe(3_000n); // 5000 - 2000

		const accountC = await getAccount(t, "M2", "C");
		expect(getAvailableBalance(accountC)).toBe(3_000n); // 6000 - 3000

		// Both supply invariants still valid during pending
		const invM1Pre = await auth.query(
			api.ledger.queries.validateSupplyInvariant,
			{ mortgageId: "M1" },
		);
		expect(invM1Pre.valid).toBe(true);

		const invM2Pre = await auth.query(
			api.ledger.queries.validateSupplyInvariant,
			{ mortgageId: "M2" },
		);
		expect(invM2Pre.valid).toBe(true);

		// Commit both reservations
		await executeCommitReservation(t, {
			reservationId: reserveM1.reservationId,
			effectiveDate: "2026-01-03",
			idempotencyKey: "commit-multi-M1",
			source: SYS_SOURCE,
		});

		await executeCommitReservation(t, {
			reservationId: reserveM2.reservationId,
			effectiveDate: "2026-01-03",
			idempotencyKey: "commit-multi-M2",
			source: SYS_SOURCE,
		});

		// Verify M1 positions: A=3000, B=5000, BuyerX=2000
		const positionsM1 = await auth.query(api.ledger.queries.getPositions, {
			mortgageId: "M1",
		});
		const posMapM1: Record<string, bigint> = {};
		for (const p of positionsM1) {
			posMapM1[p.lenderId] = p.balance;
		}
		expect(posMapM1.A).toBe(3_000n);
		expect(posMapM1.B).toBe(5_000n);
		expect(posMapM1.BuyerX).toBe(2_000n);

		// Verify M2 positions: C=3000, D=4000, BuyerX=3000
		const positionsM2 = await auth.query(api.ledger.queries.getPositions, {
			mortgageId: "M2",
		});
		const posMapM2: Record<string, bigint> = {};
		for (const p of positionsM2) {
			posMapM2[p.lenderId] = p.balance;
		}
		expect(posMapM2.C).toBe(3_000n);
		expect(posMapM2.D).toBe(4_000n);
		expect(posMapM2.BuyerX).toBe(3_000n);

		// Both invariants valid after commits
		const invM1Post = await auth.query(
			api.ledger.queries.validateSupplyInvariant,
			{ mortgageId: "M1" },
		);
		expect(invM1Post.valid).toBe(true);
		expect(invM1Post.total).toBe(10_000n);

		const invM2Post = await auth.query(
			api.ledger.queries.validateSupplyInvariant,
			{ mortgageId: "M2" },
		);
		expect(invM2Post.valid).toBe(true);
		expect(invM2Post.total).toBe(10_000n);
	});
});
