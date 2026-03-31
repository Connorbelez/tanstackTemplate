import { ConvexError } from "convex/values";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "../../_generated/api";
import { FAIRLEND_STAFF_ORG_ID } from "../../constants";
import schema from "../../schema";
import { convexModules } from "../../test/moduleMaps";

const modules = convexModules;

// ── Auth identity for ledger tests ──────────────────────────────
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

function createTestHarness() {
	return convexTest(schema, modules);
}

function asLedgerUser(t: ReturnType<typeof createTestHarness>) {
	return t.withIdentity(LEDGER_TEST_IDENTITY);
}

// ── Sources ─────────────────────────────────────────────────────
const SYS_SOURCE = { type: "system" as const, channel: "test" };
const ADMIN_SOURCE = {
	type: "user" as const,
	actor: "admin-1",
	channel: "admin",
};

/**
 * Extract the error code from a ConvexError thrown in convex-test.
 * In convex-test, ConvexError.data is serialized as a JSON string,
 * so we need to parse it to extract the code field.
 */
function getConvexErrorCode(e: unknown): string {
	expect(e).toBeInstanceOf(ConvexError);
	if (!(e instanceof ConvexError)) {
		throw new Error("Expected ConvexError");
	}
	const data = e.data;
	if (typeof data === "string") {
		const parsed = JSON.parse(data) as { code?: string };
		return parsed.code ?? "";
	}
	if (typeof data === "object" && data !== null) {
		return (data as { code?: string }).code ?? "";
	}
	return "";
}

// ── Helpers ─────────────────────────────────────────────────────

async function initCounter(t: ReturnType<typeof createTestHarness>) {
	const auth = asLedgerUser(t);
	await auth.mutation(
		api.ledger.sequenceCounter.initializeSequenceCounter,
		{},
	);
}

async function mintMortgage(
	t: ReturnType<typeof createTestHarness>,
	mortgageId: string,
) {
	const auth = asLedgerUser(t);
	return auth.mutation(api.ledger.mutations.mintMortgage, {
		mortgageId,
		effectiveDate: "2026-01-01",
		idempotencyKey: `mint-${mortgageId}`,
		source: SYS_SOURCE,
	});
}

async function mintAndIssue(
	t: ReturnType<typeof createTestHarness>,
	mortgageId: string,
	lenderId: string,
	amount = 10_000,
) {
	const auth = asLedgerUser(t);
	const mintResult = await auth.mutation(api.ledger.mutations.mintMortgage, {
		mortgageId,
		effectiveDate: "2026-01-01",
		idempotencyKey: `mint-${mortgageId}`,
		source: SYS_SOURCE,
	});
	const issueResult = await auth.mutation(internal.ledger.mutations.issueShares, {
		mortgageId,
		lenderId,
		amount,
		effectiveDate: "2026-01-01",
		idempotencyKey: `issue-${mortgageId}-${lenderId}`,
		source: SYS_SOURCE,
	});
	return { mintResult, issueResult };
}

// ── T-020: Happy path — 6 original entry types ─────────────────

describe("PostEntry Pipeline — Happy Path (6 original entry types)", () => {
	it("MORTGAGE_MINTED: creates journal entry and TREASURY balance", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const auth = asLedgerUser(t);

		const { treasuryAccountId, journalEntry } = await mintMortgage(t, "m1");

		// Journal entry fields
		expect(journalEntry.entryType).toBe("MORTGAGE_MINTED");
		expect(journalEntry.amount).toBe(10_000);
		expect(journalEntry.mortgageId).toBe("m1");
		expect(journalEntry.sequenceNumber).toBeGreaterThan(0n);

		// TREASURY balance = 10,000
		expect(
			await auth.query(api.ledger.queries.getBalance, {
				accountId: treasuryAccountId,
			}),
		).toBe(10_000n);
	});

	it("SHARES_ISSUED: creates POSITION with correct balance", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const auth = asLedgerUser(t);

		const { mintResult, issueResult } = await mintAndIssue(
			t,
			"m1",
			"lender-a",
			5_000,
		);

		expect(issueResult.journalEntry.entryType).toBe("SHARES_ISSUED");
		expect(issueResult.journalEntry.amount).toBe(5_000);

		// POSITION = 5,000, TREASURY = 5,000
		expect(
			await auth.query(api.ledger.queries.getBalance, {
				accountId: issueResult.positionAccountId,
			}),
		).toBe(5_000n);
		expect(
			await auth.query(api.ledger.queries.getBalance, {
				accountId: mintResult.treasuryAccountId,
			}),
		).toBe(5_000n);
	});

	it("SHARES_TRANSFERRED: updates both POSITION balances", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const auth = asLedgerUser(t);

		await mintAndIssue(t, "m1", "seller");
		const { buyerAccountId, journalEntry } = await auth.mutation(
			internal.ledger.mutations.transferSharesInternal,
			{
				mortgageId: "m1",
				sellerLenderId: "seller",
				buyerLenderId: "buyer",
				amount: 5_000,
				effectiveDate: "2026-01-02",
				idempotencyKey: "transfer-1",
				source: SYS_SOURCE,
			},
		);

		expect(journalEntry.entryType).toBe("SHARES_TRANSFERRED");

		// Buyer = 5,000, seller = 5,000
		expect(
			await auth.query(api.ledger.queries.getBalance, {
				accountId: buyerAccountId,
			}),
		).toBe(5_000n);

		const sellerPositions = await auth.query(
			api.ledger.queries.getPositions,
			{ mortgageId: "m1" },
		);
		const sellerPos = sellerPositions.find((p) => p.lenderId === "seller");
		expect(sellerPos?.balance).toBe(5_000n);
	});

	it("SHARES_REDEEMED: decreases POSITION balance", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const auth = asLedgerUser(t);

		const { mintResult, issueResult } = await mintAndIssue(
			t,
			"m1",
			"lender-a",
		);

		const redeemEntry = await auth.mutation(
			internal.ledger.mutations.redeemSharesInternal,
			{
				mortgageId: "m1",
				lenderId: "lender-a",
				amount: 5_000,
				effectiveDate: "2026-01-02",
				idempotencyKey: "redeem-1",
				source: SYS_SOURCE,
			},
		);

		expect(redeemEntry.entryType).toBe("SHARES_REDEEMED");

		// POSITION = 5,000 (down from 10,000)
		expect(
			await auth.query(api.ledger.queries.getBalance, {
				accountId: issueResult.positionAccountId,
			}),
		).toBe(5_000n);
		// TREASURY = 5,000 (back from 0)
		expect(
			await auth.query(api.ledger.queries.getBalance, {
				accountId: mintResult.treasuryAccountId,
			}),
		).toBe(5_000n);
	});

	it("MORTGAGE_BURNED: returns supply to WORLD", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const auth = asLedgerUser(t);

		const { mintResult } = await mintAndIssue(t, "m1", "lender-a");

		// Redeem all first
		await auth.mutation(internal.ledger.mutations.redeemSharesInternal, {
			mortgageId: "m1",
			lenderId: "lender-a",
			amount: 10_000,
			effectiveDate: "2026-01-02",
			idempotencyKey: "redeem-all",
			source: SYS_SOURCE,
		});

		// Burn
		const burnEntry = await auth.mutation(
			api.ledger.mutations.burnMortgage,
			{
				mortgageId: "m1",
				effectiveDate: "2026-01-03",
				idempotencyKey: "burn-m1",
				source: SYS_SOURCE,
				reason: "mortgage completed",
			},
		);

		expect(burnEntry.entryType).toBe("MORTGAGE_BURNED");
		expect(burnEntry.amount).toBe(10_000);

		// TREASURY should be 0
		expect(
			await auth.query(api.ledger.queries.getBalance, {
				accountId: mintResult.treasuryAccountId,
			}),
		).toBe(0n);
	});

	it("CORRECTION: records causedBy, reason, and admin source", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const auth = asLedgerUser(t);

		const { mintResult, issueResult } = await mintAndIssue(
			t,
			"m1",
			"lender-a",
		);

		const correctionEntry = await t.mutation(
			internal.ledger.mutations.postEntryDirect,
			{
				entryType: "CORRECTION",
				mortgageId: "m1",
				debitAccountId: mintResult.treasuryAccountId,
				creditAccountId: issueResult.positionAccountId,
				amount: 1_000,
				effectiveDate: "2026-01-02",
				idempotencyKey: "correction-happy-path",
				source: ADMIN_SOURCE,
				causedBy: issueResult.journalEntry._id,
				reason: "Over-issuance correction",
			},
		);

		expect(correctionEntry.entryType).toBe("CORRECTION");
		expect(correctionEntry.causedBy).toBe(issueResult.journalEntry._id);
		expect(correctionEntry.reason).toBe("Over-issuance correction");
		expect(correctionEntry.source).toEqual(ADMIN_SOURCE);

		// Verify balances
		expect(
			await auth.query(api.ledger.queries.getBalance, {
				accountId: mintResult.treasuryAccountId,
			}),
		).toBe(1_000n);
		expect(
			await auth.query(api.ledger.queries.getBalance, {
				accountId: issueResult.positionAccountId,
			}),
		).toBe(9_000n);
	});
});

// ── T-021: Happy path — 3 reservation types ────────────────────

describe("PostEntry Pipeline — Reservation Types", () => {
	it("SHARES_RESERVED: creates journal entry but does NOT update cumulatives (AUDIT_ONLY)", async () => {
		const t = createTestHarness();
		await initCounter(t);

		// Set up two lenders with positions
		await mintAndIssue(t, "m1", "seller", 5_000);
		const auth = asLedgerUser(t);
		const { positionAccountId: buyerAccountId } = await auth.mutation(
			internal.ledger.mutations.issueShares,
			{
				mortgageId: "m1",
				lenderId: "buyer",
				amount: 5_000,
				effectiveDate: "2026-01-01",
				idempotencyKey: "issue-m1-buyer",
				source: SYS_SOURCE,
			},
		);

		// Get seller position account ID
		const sellerPositions = await auth.query(
			api.ledger.queries.getPositions,
			{ mortgageId: "m1" },
		);
		const sellerPos = sellerPositions.find((p) => p.lenderId === "seller");
		const sellerAccountId = sellerPos!.accountId;

		// Snapshot cumulatives BEFORE
		const sellerBefore = await t.run(async (ctx) =>
			ctx.db.get(sellerAccountId),
		);
		const buyerBefore = await t.run(async (ctx) =>
			ctx.db.get(buyerAccountId),
		);

		// Post SHARES_RESERVED via postEntryDirect
		const entry = await t.mutation(
			internal.ledger.mutations.postEntryDirect,
			{
				entryType: "SHARES_RESERVED",
				mortgageId: "m1",
				debitAccountId: buyerAccountId,
				creditAccountId: sellerAccountId,
				amount: 2_000,
				effectiveDate: "2026-01-02",
				idempotencyKey: "reserve-1",
				source: SYS_SOURCE,
			},
		);

		expect(entry.entryType).toBe("SHARES_RESERVED");
		expect(entry.amount).toBe(2_000);

		// CRITICAL: cumulatives must be UNCHANGED (AUDIT_ONLY)
		const sellerAfter = await t.run(async (ctx) =>
			ctx.db.get(sellerAccountId),
		);
		const buyerAfter = await t.run(async (ctx) =>
			ctx.db.get(buyerAccountId),
		);

		expect(sellerAfter!.cumulativeDebits).toBe(
			sellerBefore!.cumulativeDebits,
		);
		expect(sellerAfter!.cumulativeCredits).toBe(
			sellerBefore!.cumulativeCredits,
		);
		expect(buyerAfter!.cumulativeDebits).toBe(
			buyerBefore!.cumulativeDebits,
		);
		expect(buyerAfter!.cumulativeCredits).toBe(
			buyerBefore!.cumulativeCredits,
		);
	});

	it("SHARES_COMMITTED: creates journal entry and DOES update cumulatives", async () => {
		const t = createTestHarness();
		await initCounter(t);

		// Set up two lenders with positions
		await mintAndIssue(t, "m1", "seller", 5_000);
		const auth = asLedgerUser(t);
		const { positionAccountId: buyerAccountId } = await auth.mutation(
			internal.ledger.mutations.issueShares,
			{
				mortgageId: "m1",
				lenderId: "buyer",
				amount: 5_000,
				effectiveDate: "2026-01-01",
				idempotencyKey: "issue-m1-buyer",
				source: SYS_SOURCE,
			},
		);

		const sellerPositions = await auth.query(
			api.ledger.queries.getPositions,
			{ mortgageId: "m1" },
		);
		const sellerPos = sellerPositions.find((p) => p.lenderId === "seller");
		const sellerAccountId = sellerPos!.accountId;

		// Snapshot cumulatives BEFORE
		const sellerBefore = await t.run(async (ctx) =>
			ctx.db.get(sellerAccountId),
		);
		const buyerBefore = await t.run(async (ctx) =>
			ctx.db.get(buyerAccountId),
		);

		// Post SHARES_COMMITTED via postEntryDirect
		const entry = await t.mutation(
			internal.ledger.mutations.postEntryDirect,
			{
				entryType: "SHARES_COMMITTED",
				mortgageId: "m1",
				debitAccountId: buyerAccountId,
				creditAccountId: sellerAccountId,
				amount: 2_000,
				effectiveDate: "2026-01-02",
				idempotencyKey: "commit-1",
				source: SYS_SOURCE,
			},
		);

		expect(entry.entryType).toBe("SHARES_COMMITTED");

		// COMMITTED updates cumulatives normally
		const sellerAfter = await t.run(async (ctx) =>
			ctx.db.get(sellerAccountId),
		);
		const buyerAfter = await t.run(async (ctx) =>
			ctx.db.get(buyerAccountId),
		);

		expect(buyerAfter!.cumulativeDebits).toBe(
			buyerBefore!.cumulativeDebits + 2_000n,
		);
		expect(sellerAfter!.cumulativeCredits).toBe(
			sellerBefore!.cumulativeCredits + 2_000n,
		);
	});

	it("SHARES_VOIDED: creates journal entry but does NOT update cumulatives (AUDIT_ONLY)", async () => {
		const t = createTestHarness();
		await initCounter(t);

		// Set up two lenders with positions
		await mintAndIssue(t, "m1", "seller", 5_000);
		const auth = asLedgerUser(t);
		const { positionAccountId: buyerAccountId } = await auth.mutation(
			internal.ledger.mutations.issueShares,
			{
				mortgageId: "m1",
				lenderId: "buyer",
				amount: 5_000,
				effectiveDate: "2026-01-01",
				idempotencyKey: "issue-m1-buyer",
				source: SYS_SOURCE,
			},
		);

		const sellerPositions = await auth.query(
			api.ledger.queries.getPositions,
			{ mortgageId: "m1" },
		);
		const sellerPos = sellerPositions.find((p) => p.lenderId === "seller");
		const sellerAccountId = sellerPos!.accountId;

		// Snapshot cumulatives BEFORE
		const sellerBefore = await t.run(async (ctx) =>
			ctx.db.get(sellerAccountId),
		);
		const buyerBefore = await t.run(async (ctx) =>
			ctx.db.get(buyerAccountId),
		);

		// Post SHARES_VOIDED via postEntryDirect
		const entry = await t.mutation(
			internal.ledger.mutations.postEntryDirect,
			{
				entryType: "SHARES_VOIDED",
				mortgageId: "m1",
				debitAccountId: buyerAccountId,
				creditAccountId: sellerAccountId,
				amount: 2_000,
				effectiveDate: "2026-01-02",
				idempotencyKey: "void-1",
				source: SYS_SOURCE,
			},
		);

		expect(entry.entryType).toBe("SHARES_VOIDED");

		// CRITICAL: cumulatives must be UNCHANGED (AUDIT_ONLY)
		const sellerAfter = await t.run(async (ctx) =>
			ctx.db.get(sellerAccountId),
		);
		const buyerAfter = await t.run(async (ctx) =>
			ctx.db.get(buyerAccountId),
		);

		expect(sellerAfter!.cumulativeDebits).toBe(
			sellerBefore!.cumulativeDebits,
		);
		expect(sellerAfter!.cumulativeCredits).toBe(
			sellerBefore!.cumulativeCredits,
		);
		expect(buyerAfter!.cumulativeDebits).toBe(
			buyerBefore!.cumulativeDebits,
		);
		expect(buyerAfter!.cumulativeCredits).toBe(
			buyerBefore!.cumulativeCredits,
		);
	});
});

// ── T-022: Rejection tests — ConvexError codes ─────────────────

describe("PostEntry Pipeline — Rejection Tests (ConvexError codes)", () => {
	it("INVALID_AMOUNT: rejects amount of 0", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const { mintResult, issueResult } = await mintAndIssue(
			t,
			"m1",
			"lender-a",
		);

		try {
			await t.mutation(internal.ledger.mutations.postEntryDirect, {
				entryType: "CORRECTION",
				mortgageId: "m1",
				debitAccountId: issueResult.positionAccountId,
				creditAccountId: mintResult.treasuryAccountId,
				amount: 0,
				effectiveDate: "2026-01-02",
				idempotencyKey: "invalid-amount-zero",
				source: ADMIN_SOURCE,
				causedBy: issueResult.journalEntry._id,
				reason: "test",
			});
			expect.fail("Should have thrown");
		} catch (e) {
			expect(getConvexErrorCode(e)).toBe("INVALID_AMOUNT");
		}
	});

	it("SAME_ACCOUNT: rejects debitAccountId === creditAccountId", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const { issueResult } = await mintAndIssue(t, "m1", "lender-a");

		try {
			await t.mutation(internal.ledger.mutations.postEntryDirect, {
				entryType: "SHARES_TRANSFERRED",
				mortgageId: "m1",
				debitAccountId: issueResult.positionAccountId,
				creditAccountId: issueResult.positionAccountId,
				amount: 1_000,
				effectiveDate: "2026-01-02",
				idempotencyKey: "same-account",
				source: SYS_SOURCE,
			});
			expect.fail("Should have thrown");
		} catch (e) {
			expect(getConvexErrorCode(e)).toBe("SAME_ACCOUNT");
		}
	});

	it("ACCOUNT_NOT_FOUND: rejects non-existent account ID", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const { mintResult } = await mintAndIssue(t, "m1", "lender-a");

		// Use a valid-format ID that doesn't exist in the DB.
		// The fake ID "kh7ab0..." may fail Convex's ID validator before
		// reaching our code. Instead, test via regex on the thrown error.
		await expect(
			t.mutation(internal.ledger.mutations.postEntryDirect, {
				entryType: "SHARES_ISSUED",
				mortgageId: "m1",
				debitAccountId:
					"kh7ab0000000000000000000000000000" as typeof mintResult.treasuryAccountId,
				creditAccountId: mintResult.treasuryAccountId,
				amount: 1_000,
				effectiveDate: "2026-01-02",
				idempotencyKey: "account-not-found",
				source: SYS_SOURCE,
			}),
		).rejects.toThrow();
	});

	it("TYPE_MISMATCH: rejects SHARES_ISSUED with wrong account types", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const { mintResult, issueResult } = await mintAndIssue(
			t,
			"m1",
			"lender-a",
		);

		try {
			// SHARES_ISSUED expects debit=POSITION, credit=TREASURY
			// Passing debit=TREASURY (wrong type)
			await t.mutation(internal.ledger.mutations.postEntryDirect, {
				entryType: "SHARES_ISSUED",
				mortgageId: "m1",
				debitAccountId: mintResult.treasuryAccountId,
				creditAccountId: issueResult.positionAccountId,
				amount: 1_000,
				effectiveDate: "2026-01-02",
				idempotencyKey: "type-mismatch",
				source: SYS_SOURCE,
			});
			expect.fail("Should have thrown");
		} catch (e) {
			expect(getConvexErrorCode(e)).toBe("TYPE_MISMATCH");
		}
	});

	it("INSUFFICIENT_BALANCE: rejects amount > credit account balance", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const { mintResult, issueResult } = await mintAndIssue(
			t,
			"m1",
			"lender-a",
		);

		try {
			// lender-a has 10,000 — try to redeem 11,000
			await t.mutation(internal.ledger.mutations.postEntryDirect, {
				entryType: "SHARES_REDEEMED",
				mortgageId: "m1",
				debitAccountId: mintResult.treasuryAccountId,
				creditAccountId: issueResult.positionAccountId,
				amount: 11_000,
				effectiveDate: "2026-01-02",
				idempotencyKey: "insufficient-balance",
				source: SYS_SOURCE,
			});
			expect.fail("Should have thrown");
		} catch (e) {
			expect(getConvexErrorCode(e)).toBe("INSUFFICIENT_BALANCE");
		}
	});

	it("MIN_FRACTION_VIOLATED: transfer leaving seller with 500 units", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const auth = asLedgerUser(t);

		await mintAndIssue(t, "m1", "seller");

		// Transfer 9,500 leaves seller with 500 < MIN_FRACTION (1,000)
		try {
			await auth.mutation(internal.ledger.mutations.transferSharesInternal, {
				mortgageId: "m1",
				sellerLenderId: "seller",
				buyerLenderId: "buyer",
				amount: 9_500,
				effectiveDate: "2026-01-02",
				idempotencyKey: "min-fraction-violated",
				source: SYS_SOURCE,
			});
			expect.fail("Should have thrown");
		} catch (e) {
			expect(getConvexErrorCode(e)).toBe("MIN_FRACTION_VIOLATED");
		}
	});

	it("MORTGAGE_MISMATCH: cross-mortgage transfer via postEntryDirect", async () => {
		const t = createTestHarness();
		await initCounter(t);

		const m1 = await mintAndIssue(t, "m1", "lender-a");
		const m2 = await mintAndIssue(t, "m2", "lender-b");

		try {
			await t.mutation(internal.ledger.mutations.postEntryDirect, {
				entryType: "SHARES_TRANSFERRED",
				mortgageId: "m1",
				debitAccountId: m2.issueResult.positionAccountId,
				creditAccountId: m1.issueResult.positionAccountId,
				amount: 1_000,
				effectiveDate: "2026-01-02",
				idempotencyKey: "mortgage-mismatch",
				source: SYS_SOURCE,
			});
			expect.fail("Should have thrown");
		} catch (e) {
			expect(getConvexErrorCode(e)).toBe("MORTGAGE_MISMATCH");
		}
	});

	it("CORRECTION_REQUIRES_ADMIN: rejects system source on CORRECTION", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const { mintResult, issueResult } = await mintAndIssue(
			t,
			"m1",
			"lender-a",
		);

		try {
			// Credit = POSITION (has 10,000), debit = TREASURY (receives)
			// This avoids INSUFFICIENT_BALANCE firing first
			await t.mutation(internal.ledger.mutations.postEntryDirect, {
				entryType: "CORRECTION",
				mortgageId: "m1",
				debitAccountId: mintResult.treasuryAccountId,
				creditAccountId: issueResult.positionAccountId,
				amount: 1_000,
				effectiveDate: "2026-01-02",
				idempotencyKey: "correction-no-admin",
				source: SYS_SOURCE,
				causedBy: issueResult.journalEntry._id,
				reason: "test correction",
			});
			expect.fail("Should have thrown");
		} catch (e) {
			expect(getConvexErrorCode(e)).toBe("CORRECTION_REQUIRES_ADMIN");
		}
	});

	it("CORRECTION_REQUIRES_CAUSED_BY: rejects missing causedBy on CORRECTION", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const { mintResult, issueResult } = await mintAndIssue(
			t,
			"m1",
			"lender-a",
		);

		try {
			await t.mutation(internal.ledger.mutations.postEntryDirect, {
				entryType: "CORRECTION",
				mortgageId: "m1",
				debitAccountId: issueResult.positionAccountId,
				creditAccountId: mintResult.treasuryAccountId,
				amount: 1_000,
				effectiveDate: "2026-01-02",
				idempotencyKey: "correction-no-caused-by",
				source: ADMIN_SOURCE,
				reason: "test correction",
			});
			expect.fail("Should have thrown");
		} catch (e) {
			expect(getConvexErrorCode(e)).toBe("CORRECTION_REQUIRES_CAUSED_BY");
		}
	});

	it("CORRECTION_REQUIRES_REASON: rejects missing reason on CORRECTION", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const { mintResult, issueResult } = await mintAndIssue(
			t,
			"m1",
			"lender-a",
		);

		try {
			// Credit = POSITION (has 10,000), debit = TREASURY (receives)
			await t.mutation(internal.ledger.mutations.postEntryDirect, {
				entryType: "CORRECTION",
				mortgageId: "m1",
				debitAccountId: mintResult.treasuryAccountId,
				creditAccountId: issueResult.positionAccountId,
				amount: 1_000,
				effectiveDate: "2026-01-02",
				idempotencyKey: "correction-no-reason",
				source: ADMIN_SOURCE,
				causedBy: issueResult.journalEntry._id,
			});
			expect.fail("Should have thrown");
		} catch (e) {
			expect(getConvexErrorCode(e)).toBe("CORRECTION_REQUIRES_REASON");
		}
	});
});

// ── T-023: Idempotency, sequence monotonicity, sell-all, WORLD ──

describe("PostEntry Pipeline — Special Cases", () => {
	it("Idempotency: same idempotencyKey returns same entry, balances unchanged", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const auth = asLedgerUser(t);

		await mintMortgage(t, "m1");

		// First issue
		const first = await auth.mutation(internal.ledger.mutations.issueShares, {
			mortgageId: "m1",
			lenderId: "lender-a",
			amount: 5_000,
			effectiveDate: "2026-01-01",
			idempotencyKey: "idem-issue",
			source: SYS_SOURCE,
		});

		const balanceAfterFirst = await auth.query(
			api.ledger.queries.getBalance,
			{ accountId: first.positionAccountId },
		);

		// Second call with same key
		const second = await auth.mutation(internal.ledger.mutations.issueShares, {
			mortgageId: "m1",
			lenderId: "lender-a",
			amount: 5_000,
			effectiveDate: "2026-01-01",
			idempotencyKey: "idem-issue",
			source: SYS_SOURCE,
		});

		// Same entry returned
		expect(first.journalEntry._id).toBe(second.journalEntry._id);
		expect(first.journalEntry.sequenceNumber).toBe(
			second.journalEntry.sequenceNumber,
		);

		// Balance unchanged after replay
		const balanceAfterSecond = await auth.query(
			api.ledger.queries.getBalance,
			{ accountId: first.positionAccountId },
		);
		expect(balanceAfterSecond).toBe(balanceAfterFirst);
		expect(balanceAfterSecond).toBe(5_000n);
	});

	it("Sequence monotonicity: 3 entries have sequenceNumbers 1, 2, 3", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const auth = asLedgerUser(t);

		// Entry 1: mint
		await mintMortgage(t, "m1");

		// Entry 2: issue
		await auth.mutation(internal.ledger.mutations.issueShares, {
			mortgageId: "m1",
			lenderId: "lender-a",
			amount: 5_000,
			effectiveDate: "2026-01-01",
			idempotencyKey: "issue-1",
			source: SYS_SOURCE,
		});

		// Entry 3: issue another
		await auth.mutation(internal.ledger.mutations.issueShares, {
			mortgageId: "m1",
			lenderId: "lender-b",
			amount: 5_000,
			effectiveDate: "2026-01-01",
			idempotencyKey: "issue-2",
			source: SYS_SOURCE,
		});

		const history = await auth.query(
			api.ledger.queries.getMortgageHistory,
			{ mortgageId: "m1" },
		);

		expect(history).toHaveLength(3);
		expect(history[0].sequenceNumber).toBe(1n);
		expect(history[1].sequenceNumber).toBe(2n);
		expect(history[2].sequenceNumber).toBe(3n);
	});

	it("Sell-all: transfer all units (POSITION -> 0) succeeds", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const auth = asLedgerUser(t);

		await mintAndIssue(t, "m1", "seller");

		// Transfer all 10,000 units — full exit is allowed
		const { buyerAccountId } = await auth.mutation(
			internal.ledger.mutations.transferSharesInternal,
			{
				mortgageId: "m1",
				sellerLenderId: "seller",
				buyerLenderId: "buyer",
				amount: 10_000,
				effectiveDate: "2026-01-02",
				idempotencyKey: "sell-all",
				source: SYS_SOURCE,
			},
		);

		// Seller should have 0
		const positions = await auth.query(api.ledger.queries.getPositions, {
			mortgageId: "m1",
		});
		const sellerPos = positions.find((p) => p.lenderId === "seller");
		expect(sellerPos).toBeUndefined(); // zero-balance positions are excluded

		// Buyer should have 10,000
		expect(
			await auth.query(api.ledger.queries.getBalance, {
				accountId: buyerAccountId,
			}),
		).toBe(10_000n);
	});

	it("WORLD exemption: after mint, WORLD has negative posted balance", async () => {
		const t = createTestHarness();
		await initCounter(t);

		await mintMortgage(t, "m1");

		// Read WORLD account directly
		const worldAccount = await t.run(async (ctx) => {
			return ctx.db
				.query("ledger_accounts")
				.withIndex("by_type_and_mortgage", (q) =>
					q.eq("type", "WORLD").eq("mortgageId", undefined),
				)
				.first();
		});

		expect(worldAccount).not.toBeNull();
		// WORLD has 0 debits and 10,000 credits -> posted balance = -10,000
		const postedBalance =
			worldAccount!.cumulativeDebits - worldAccount!.cumulativeCredits;
		expect(postedBalance).toBe(-10_000n);
	});
});
