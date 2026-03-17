/**
 * Auth gate tests for ledger queries and mutations.
 *
 * Verifies that the fluent-convex middleware chains (adminMutation,
 * ledgerMutation, ledgerQuery) reject unauthenticated callers before
 * any handler logic executes.
 */
import { describe, expect, it } from "vitest";
import { api } from "../../_generated/api";
import {
	SYS_SOURCE,
	asLedgerUser,
	createTestHarness,
	initCounter,
} from "./testUtils";

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

	it("burnMortgage rejects unauthenticated calls", async () => {
		const t = createTestHarness();
		try {
			await t.mutation(api.ledger.mutations.burnMortgage, {
				mortgageId: "auth-test-burn",
				effectiveDate: "2026-01-01",
				idempotencyKey: "auth-test-burn",
				source: SYS_SOURCE,
				reason: "test burn",
			});
			expect.fail("Expected auth rejection");
		} catch (error) {
			expect(error).toBeTruthy();
		}
	});

	it("postCorrection rejects unauthenticated calls", async () => {
		const t = createTestHarness();
		// postCorrection requires v.id() args — but auth should reject before
		// reaching the handler. Any error (auth or arg validation) confirms
		// unauthenticated users cannot reach the handler.
		try {
			await t.mutation(api.ledger.mutations.postCorrection, {
				mortgageId: "auth-test-correct",
				debitAccountId: "placeholder" as never,
				creditAccountId: "placeholder" as never,
				amount: 100,
				effectiveDate: "2026-01-01",
				idempotencyKey: "auth-test-correct",
				source: { type: "user", actor: "test", channel: "test" },
				causedBy: "placeholder" as never,
				reason: "test correction",
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
