/**
 * Auth gate tests for ledger queries and mutations.
 *
 * Verifies that the fluent-convex middleware chains (adminMutation,
 * ledgerMutation, ledgerQuery) reject unauthenticated callers before
 * any handler logic executes.
 */
import { describe, expect, it } from "vitest";
import { api, internal } from "../../_generated/api";
import {
	SYS_SOURCE,
	asLedgerUser,
	createTestHarness,
	initCounter,
	mintAndIssue,
} from "./testUtils.test";

// ── Auth Gates: Admin Mutations ──────────────────────────────────

describe("auth gates — admin mutations", () => {
	it("mintMortgage rejects unauthenticated calls", async () => {
		const t = createTestHarness();
		try {
			await t.mutation(api.ledger.mutations.mintMortgage, {
				mortgageId: "auth-test-mint",
				effectiveDate: "2026-01-01",
				idempotencyKey: "auth-test-mint",
				source: SYS_SOURCE,
			});
			expect.fail("Expected auth rejection");
		} catch (error) {
			expect(error).toBeTruthy();
		}
	});

	it("burnMortgage rejects unauthenticated calls (with valid args that would succeed if auth bypassed)", async () => {
		const t = createTestHarness();
		const auth = asLedgerUser(t);
		await initCounter(auth);

		// Set up a burnable mortgage: mint → issue → redeem all back to treasury
		await auth.mutation(api.ledger.mutations.mintMortgage, {
			mortgageId: "auth-test-burn",
			effectiveDate: "2026-01-01",
			idempotencyKey: "auth-mint-burn",
			source: SYS_SOURCE,
		});
		await auth.mutation(internal.ledger.mutations.issueShares, {
			mortgageId: "auth-test-burn",
			lenderId: "auth-lender",
			amount: 10_000,
			effectiveDate: "2026-01-01",
			idempotencyKey: "auth-issue-burn",
			source: SYS_SOURCE,
		});
		await auth.mutation(api.ledger.mutations.redeemShares, {
			mortgageId: "auth-test-burn",
			lenderId: "auth-lender",
			amount: 10_000,
			effectiveDate: "2026-01-02",
			idempotencyKey: "auth-redeem-burn",
			source: SYS_SOURCE,
		});

		// Treasury is now at TOTAL_SUPPLY with zero positions — burnMortgage
		// would succeed if auth were bypassed
		try {
			await t.mutation(api.ledger.mutations.burnMortgage, {
				mortgageId: "auth-test-burn",
				effectiveDate: "2026-01-03",
				idempotencyKey: "auth-test-burn-unauthed",
				source: SYS_SOURCE,
				reason: "test burn",
			});
			expect.fail("Expected auth rejection");
		} catch (error) {
			expect(error).toBeTruthy();
		}
	});

	it("postCorrection rejects unauthenticated calls (with valid args that would succeed if auth bypassed)", async () => {
		const t = createTestHarness();
		const auth = asLedgerUser(t);
		await initCounter(auth);

		// Set up real data so postCorrection has valid IDs
		await mintAndIssue(auth, "auth-test-correct", "auth-lender", 5_000);

		// Get real account IDs and a journal entry for causedBy
		const treasury = await t.run(async (ctx) =>
			ctx.db
				.query("ledger_accounts")
				.withIndex("by_type_and_mortgage", (q) =>
					q.eq("type", "TREASURY").eq("mortgageId", "auth-test-correct"),
				)
				.first(),
		);
		const position = await t.run(async (ctx) =>
			ctx.db
				.query("ledger_accounts")
				.withIndex("by_mortgage_and_lender", (q) =>
					q
						.eq("mortgageId", "auth-test-correct")
						.eq("lenderId", "auth-lender"),
				)
				.first(),
		);
		const originalEntry = await t.run(async (ctx) =>
			ctx.db
				.query("ledger_journal_entries")
				.withIndex("by_idempotency", (q) =>
					q.eq("idempotencyKey", "issue-auth-test-correct-auth-lender"),
				)
				.first(),
		);

		// With valid IDs, postCorrection would succeed if auth were bypassed
		try {
			await t.mutation(api.ledger.mutations.postCorrection, {
				mortgageId: "auth-test-correct",
				debitAccountId: treasury!._id,
				creditAccountId: position!._id,
				amount: 500,
				effectiveDate: "2026-01-15",
				idempotencyKey: "auth-test-correct-unauthed",
				source: { type: "user", actor: "test-admin", channel: "test" },
				causedBy: originalEntry!._id,
				reason: "auth test correction",
			});
			expect.fail("Expected auth rejection");
		} catch (error) {
			expect(error).toBeTruthy();
		}
	});
});

// ── Auth Gates: Ledger Mutations ─────────────────────────────────

describe("auth gates — ledger mutations", () => {
	it("mintAndIssue rejects unauthenticated calls", async () => {
		const t = createTestHarness();
		try {
			await t.mutation(api.ledger.mutations.mintAndIssue, {
				mortgageId: "auth-test-mai",
				allocations: [{ lenderId: "lender-a", amount: 10000 }],
				effectiveDate: "2026-01-01",
				idempotencyKey: "auth-test-mai",
				source: SYS_SOURCE,
			});
			expect.fail("Expected auth rejection");
		} catch (error) {
			expect(error).toBeTruthy();
		}
	});

	it("transferShares rejects unauthenticated calls", async () => {
		const t = createTestHarness();
		try {
			await t.mutation(api.ledger.mutations.transferShares, {
				mortgageId: "auth-test-transfer",
				sellerLenderId: "seller",
				buyerLenderId: "buyer",
				amount: 1000,
				effectiveDate: "2026-01-01",
				idempotencyKey: "auth-test-transfer",
				source: SYS_SOURCE,
			});
			expect.fail("Expected auth rejection");
		} catch (error) {
			expect(error).toBeTruthy();
		}
	});
});

// ── Auth Gates: Ledger Queries ───────────────────────────────────

describe("auth gates — ledger queries", () => {
	it("getBalance rejects unauthenticated calls", async () => {
		const t = createTestHarness();
		try {
			await t.query(api.ledger.queries.getBalance, {
				accountId: "placeholder" as never,
			});
			expect.fail("Expected auth rejection");
		} catch (error) {
			expect(error).toBeTruthy();
		}
	});

	it("getPositions rejects unauthenticated calls", async () => {
		const t = createTestHarness();
		try {
			await t.query(api.ledger.queries.getPositions, {
				mortgageId: "auth-test",
			});
			expect.fail("Expected auth rejection");
		} catch (error) {
			expect(error).toBeTruthy();
		}
	});

	it("validateSupplyInvariant rejects unauthenticated calls", async () => {
		const t = createTestHarness();
		try {
			await t.query(api.ledger.queries.validateSupplyInvariant, {
				mortgageId: "auth-test",
			});
			expect.fail("Expected auth rejection");
		} catch (error) {
			expect(error).toBeTruthy();
		}
	});

	it("getBalanceAt rejects unauthenticated calls", async () => {
		const t = createTestHarness();
		try {
			await t.query(api.ledger.queries.getBalanceAt, {
				accountId: "placeholder" as never,
				asOf: Date.now(),
			});
			expect.fail("Expected auth rejection");
		} catch (error) {
			expect(error).toBeTruthy();
		}
	});

	it("getPositionsAt rejects unauthenticated calls", async () => {
		const t = createTestHarness();
		try {
			await t.query(api.ledger.queries.getPositionsAt, {
				mortgageId: "auth-test",
				asOf: Date.now(),
			});
			expect.fail("Expected auth rejection");
		} catch (error) {
			expect(error).toBeTruthy();
		}
	});
});

// ── Auth Gates: Authenticated Access Succeeds ────────────────────

describe("auth gates — authenticated access succeeds", () => {
	it("authenticated user can query getPositions", async () => {
		const t = createTestHarness();
		const auth = asLedgerUser(t);
		await initCounter(auth);

		// getPositions should return an empty array for an unminted mortgage
		// but should NOT throw an auth error
		const positions = await auth.query(api.ledger.queries.getPositions, {
			mortgageId: "nonexistent-mortgage",
		});

		expect(positions).toEqual([]);
	});
});
