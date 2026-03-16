import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../../_generated/api";
import { FAIRLEND_STAFF_ORG_ID } from "../../constants";
import schema from "../../schema";

const modules = import.meta.glob("/convex/**/*.ts");

// ── Auth identity for ledger tests ──────────────────────────────
// FairLend admin with ledger:view + ledger:correct permissions.
// Covers ledgerQuery, ledgerMutation, adminQuery, and adminMutation chains.
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

/** Return an authenticated test context with ledger permissions. */
function asLedgerUser(t: ReturnType<typeof createTestHarness>) {
	return t.withIdentity(LEDGER_TEST_IDENTITY);
}

// ── Helpers ───────────────────────────────────────────────────────

const SYS_SOURCE = { type: "system" as const, channel: "test" };
const ADMIN_SOURCE = {
	type: "user" as const,
	actor: "admin-1",
	channel: "admin",
};

/** Initialize the sequence counter — must be called before any ledger mutation. */
async function initCounter(t: ReturnType<typeof createTestHarness>) {
	const auth = asLedgerUser(t);
	await auth.mutation(
		api.ledger.sequenceCounter.initializeSequenceCounter,
		{},
	);
}

async function mintAndIssue(
	t: ReturnType<typeof createTestHarness>,
	mortgageId: string,
	lenderId: string,
	amount = 10_000
) {
	const auth = asLedgerUser(t);
	const mintResult = await auth.mutation(api.ledger.mutations.mintMortgage, {
		mortgageId,
		effectiveDate: "2026-01-01",
		idempotencyKey: `mint-${mortgageId}`,
		source: SYS_SOURCE,
	});
	const issueResult = await auth.mutation(api.ledger.mutations.issueShares, {
		mortgageId,
		lenderId,
		amount,
		effectiveDate: "2026-01-01",
		idempotencyKey: `issue-${mortgageId}-${lenderId}`,
		source: SYS_SOURCE,
	});
	return { mintResult, issueResult };
}

// ── T-041: Full lifecycle test ────────────────────────────────────

describe("Ledger Full Lifecycle", () => {
	it("T-041: mintMortgage → issueShares → transferShares → redeemShares → burnMortgage", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const auth = asLedgerUser(t);

		// 1. Mint mortgage
		const { treasuryAccountId } = await auth.mutation(
			api.ledger.mutations.mintMortgage,
			{
				mortgageId: "m1",
				effectiveDate: "2026-01-01",
				idempotencyKey: "mint-m1",
				source: SYS_SOURCE,
			}
		);

		// Verify TREASURY = 10,000
		const treasuryBalance = await auth.query(api.ledger.queries.getBalance, {
			accountId: treasuryAccountId,
		});
		expect(treasuryBalance).toBe(10_000n);

		// 2. Issue all to lender A
		const { positionAccountId: posA } = await auth.mutation(
			api.ledger.mutations.issueShares,
			{
				mortgageId: "m1",
				lenderId: "lender-a",
				amount: 10_000,
				effectiveDate: "2026-01-01",
				idempotencyKey: "issue-a",
				source: SYS_SOURCE,
			}
		);

		expect(
			await auth.query(api.ledger.queries.getBalance, {
				accountId: treasuryAccountId,
			})
		).toBe(0n);
		expect(
			await auth.query(api.ledger.queries.getBalance, {
				accountId: posA,
			})
		).toBe(10_000n);

		// 3. Transfer 5,000 from A to B
		const { buyerAccountId: posB } = await auth.mutation(
			api.ledger.mutations.transferShares,
			{
				mortgageId: "m1",
				sellerLenderId: "lender-a",
				buyerLenderId: "lender-b",
				amount: 5_000,
				effectiveDate: "2026-01-02",
				idempotencyKey: "transfer-a-b",
				source: SYS_SOURCE,
			}
		);

		expect(
			await auth.query(api.ledger.queries.getBalance, { accountId: posA })
		).toBe(5_000n);
		expect(
			await auth.query(api.ledger.queries.getBalance, { accountId: posB })
		).toBe(5_000n);

		// Supply invariant should hold
		const invariant = await auth.query(
			api.ledger.validation.validateSupplyInvariant,
			{ mortgageId: "m1" }
		);
		expect(invariant.valid).toBe(true);

		// 4. Redeem B's 5,000
		await auth.mutation(api.ledger.mutations.redeemShares, {
			mortgageId: "m1",
			lenderId: "lender-b",
			amount: 5_000,
			effectiveDate: "2026-01-03",
			idempotencyKey: "redeem-b",
			source: SYS_SOURCE,
		});

		expect(
			await auth.query(api.ledger.queries.getBalance, { accountId: posB })
		).toBe(0n);

		// 5. Redeem A's 5,000
		await auth.mutation(api.ledger.mutations.redeemShares, {
			mortgageId: "m1",
			lenderId: "lender-a",
			amount: 5_000,
			effectiveDate: "2026-01-03",
			idempotencyKey: "redeem-a",
			source: SYS_SOURCE,
		});

		expect(
			await auth.query(api.ledger.queries.getBalance, {
				accountId: treasuryAccountId,
			})
		).toBe(10_000n);

		// 6. Burn
		await auth.mutation(api.ledger.mutations.burnMortgage, {
			mortgageId: "m1",
			effectiveDate: "2026-01-04",
			idempotencyKey: "burn-m1",
			source: SYS_SOURCE,
			reason: "Mortgage paid off",
		});

		// Treasury should be 0 after burn
		expect(
			await auth.query(api.ledger.queries.getBalance, {
				accountId: treasuryAccountId,
			})
		).toBe(0n);
	});
});

// ── Transfer validation tests ─────────────────────────────────────

describe("Transfer Validation", () => {
	it("T-042: transferShares creates buyer POSITION on first purchase", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const auth = asLedgerUser(t);
		await mintAndIssue(t, "m1", "seller");

		const { buyerAccountId } = await auth.mutation(
			api.ledger.mutations.transferShares,
			{
				mortgageId: "m1",
				sellerLenderId: "seller",
				buyerLenderId: "new-buyer",
				amount: 5_000,
				effectiveDate: "2026-01-02",
				idempotencyKey: "transfer-1",
				source: SYS_SOURCE,
			}
		);

		expect(buyerAccountId).toBeDefined();
		expect(
			await auth.query(api.ledger.queries.getBalance, {
				accountId: buyerAccountId,
			})
		).toBe(5_000n);
	});

	it("T-043: transferShares rejects cross-mortgage transfer", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const auth = asLedgerUser(t);
		await mintAndIssue(t, "m1", "lender-a");
		await mintAndIssue(t, "m2", "lender-b");

		// Try to transfer from lender-a on m1 to lender-b, but seller has no position on m2
		await expect(
			auth.mutation(api.ledger.mutations.transferShares, {
				mortgageId: "m2",
				sellerLenderId: "lender-a",
				buyerLenderId: "lender-c",
				amount: 1_000,
				effectiveDate: "2026-01-02",
				idempotencyKey: "cross-transfer",
				source: SYS_SOURCE,
			})
		).rejects.toThrow(/No POSITION account/);
	});

	it("T-044: transferShares allows seller full exit (balance → 0)", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const auth = asLedgerUser(t);
		await mintAndIssue(t, "m1", "seller");

		// Transfer all 10,000 — full exit is allowed
		await auth.mutation(api.ledger.mutations.transferShares, {
			mortgageId: "m1",
			sellerLenderId: "seller",
			buyerLenderId: "buyer",
			amount: 10_000,
			effectiveDate: "2026-01-02",
			idempotencyKey: "full-exit",
			source: SYS_SOURCE,
		});

		// Verify positions
		const positions = await auth.query(api.ledger.queries.getPositions, {
			mortgageId: "m1",
		});
		expect(positions).toHaveLength(1);
		expect(positions[0].lenderId).toBe("buyer");
		expect(positions[0].balance).toBe(10_000n);
	});

	it("T-045: transferShares rejects seller remainder between 1-999", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const auth = asLedgerUser(t);
		await mintAndIssue(t, "m1", "seller");

		// Transfer 9,500 leaves seller with 500 — below minimum
		await expect(
			auth.mutation(api.ledger.mutations.transferShares, {
				mortgageId: "m1",
				sellerLenderId: "seller",
				buyerLenderId: "buyer",
				amount: 9_500,
				effectiveDate: "2026-01-02",
				idempotencyKey: "bad-remainder",
				source: SYS_SOURCE,
			})
		).rejects.toThrow(/Seller post-transfer.*violates minimum position/);
	});

	it("T-046: transferShares rejects buyer position below 1,000", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const auth = asLedgerUser(t);
		await mintAndIssue(t, "m1", "seller");

		// Transfer 500 to buyer — below minimum
		await expect(
			auth.mutation(api.ledger.mutations.transferShares, {
				mortgageId: "m1",
				sellerLenderId: "seller",
				buyerLenderId: "buyer",
				amount: 500,
				effectiveDate: "2026-01-02",
				idempotencyKey: "tiny-buy",
				source: SYS_SOURCE,
			})
		).rejects.toThrow(/Buyer post-transfer.*violates minimum position/);
	});

	it("T-047: transferShares rejects insufficient seller balance", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const auth = asLedgerUser(t);
		await mintAndIssue(t, "m1", "seller", 5_000);

		await expect(
			auth.mutation(api.ledger.mutations.transferShares, {
				mortgageId: "m1",
				sellerLenderId: "seller",
				buyerLenderId: "buyer",
				amount: 6_000,
				effectiveDate: "2026-01-02",
				idempotencyKey: "oversell",
				source: SYS_SOURCE,
			})
		).rejects.toThrow(/Seller balance.*< transfer amount/);
	});

	it("T-047b: rejected transfer leaves state unchanged", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const auth = asLedgerUser(t);
		const { issueResult } = await mintAndIssue(t, "m1", "seller", 5_000);

		// Record state before rejection
		const balanceBefore = await auth.query(api.ledger.queries.getBalance, {
			accountId: issueResult.positionAccountId,
		});
		const historyBefore = await auth.query(
			api.ledger.queries.getMortgageHistory,
			{
				mortgageId: "m1",
			}
		);

		// Attempt transfer that exceeds balance — must reject
		await expect(
			auth.mutation(api.ledger.mutations.transferShares, {
				mortgageId: "m1",
				sellerLenderId: "seller",
				buyerLenderId: "buyer",
				amount: 6_000,
				effectiveDate: "2026-01-02",
				idempotencyKey: "oversell-rollback",
				source: SYS_SOURCE,
			})
		).rejects.toThrow();

		// Verify state unchanged: balance same, no new journal entries
		const balanceAfter = await auth.query(api.ledger.queries.getBalance, {
			accountId: issueResult.positionAccountId,
		});
		expect(balanceAfter).toBe(balanceBefore);

		const historyAfter = await auth.query(
			api.ledger.queries.getMortgageHistory,
			{
				mortgageId: "m1",
			}
		);
		expect(historyAfter).toHaveLength(historyBefore.length);
	});

	it("T-048: transferShares reuses existing buyer POSITION on buy-back", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const auth = asLedgerUser(t);
		await mintAndIssue(t, "m1", "seller");

		// First transfer to buyer
		const { buyerAccountId: firstId } = await auth.mutation(
			api.ledger.mutations.transferShares,
			{
				mortgageId: "m1",
				sellerLenderId: "seller",
				buyerLenderId: "buyer",
				amount: 5_000,
				effectiveDate: "2026-01-02",
				idempotencyKey: "t1",
				source: SYS_SOURCE,
			}
		);

		// Transfer back to seller (full exit for buyer)
		await auth.mutation(api.ledger.mutations.transferShares, {
			mortgageId: "m1",
			sellerLenderId: "buyer",
			buyerLenderId: "seller",
			amount: 5_000,
			effectiveDate: "2026-01-03",
			idempotencyKey: "t2",
			source: SYS_SOURCE,
		});

		// Transfer back to buyer again — same account should be reused
		const { buyerAccountId: secondId } = await auth.mutation(
			api.ledger.mutations.transferShares,
			{
				mortgageId: "m1",
				sellerLenderId: "seller",
				buyerLenderId: "buyer",
				amount: 3_000,
				effectiveDate: "2026-01-04",
				idempotencyKey: "t3",
				source: SYS_SOURCE,
			}
		);

		expect(secondId).toBe(firstId);
	});
});

// ── Issuance & Redemption tests ───────────────────────────────────

describe("Issuance & Redemption", () => {
	it("T-049: issueShares creates POSITION account on first purchase", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const auth = asLedgerUser(t);
		await auth.mutation(api.ledger.mutations.mintMortgage, {
			mortgageId: "m1",
			effectiveDate: "2026-01-01",
			idempotencyKey: "mint-m1",
			source: SYS_SOURCE,
		});

		const { positionAccountId } = await auth.mutation(
			api.ledger.mutations.issueShares,
			{
				mortgageId: "m1",
				lenderId: "lender-a",
				amount: 5_000,
				effectiveDate: "2026-01-01",
				idempotencyKey: "issue-a",
				source: SYS_SOURCE,
			}
		);

		expect(positionAccountId).toBeDefined();
		expect(
			await auth.query(api.ledger.queries.getBalance, {
				accountId: positionAccountId,
			})
		).toBe(5_000n);
	});

	it("T-050: issueShares rejects when TREASURY balance insufficient", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const auth = asLedgerUser(t);
		await mintAndIssue(t, "m1", "lender-a");

		// Treasury is now 0 — can't issue more
		await expect(
			auth.mutation(api.ledger.mutations.issueShares, {
				mortgageId: "m1",
				lenderId: "lender-b",
				amount: 1_000,
				effectiveDate: "2026-01-02",
				idempotencyKey: "over-issue",
				source: SYS_SOURCE,
			})
		).rejects.toThrow(/Treasury balance.*< issuance amount/);
	});

	it("T-051: issueShares rejects resulting position < 1,000", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const auth = asLedgerUser(t);
		await auth.mutation(api.ledger.mutations.mintMortgage, {
			mortgageId: "m1",
			effectiveDate: "2026-01-01",
			idempotencyKey: "mint-m1",
			source: SYS_SOURCE,
		});

		await expect(
			auth.mutation(api.ledger.mutations.issueShares, {
				mortgageId: "m1",
				lenderId: "lender-a",
				amount: 500,
				effectiveDate: "2026-01-01",
				idempotencyKey: "tiny-issue",
				source: SYS_SOURCE,
			})
		).rejects.toThrow(/Position post-issuance.*violates minimum position/);
	});

	it("T-052: redeemShares full exit (position → 0) allowed", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const auth = asLedgerUser(t);
		await mintAndIssue(t, "m1", "lender-a", 5_000);

		await auth.mutation(api.ledger.mutations.redeemShares, {
			mortgageId: "m1",
			lenderId: "lender-a",
			amount: 5_000,
			effectiveDate: "2026-01-02",
			idempotencyKey: "full-redeem",
			source: SYS_SOURCE,
		});

		// Verify no positions left
		const positions = await auth.query(api.ledger.queries.getPositions, {
			mortgageId: "m1",
		});
		expect(positions).toHaveLength(0);
	});

	it("T-053: redeemShares rejects remainder between 1-999", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const auth = asLedgerUser(t);
		await mintAndIssue(t, "m1", "lender-a", 5_000);

		await expect(
			auth.mutation(api.ledger.mutations.redeemShares, {
				mortgageId: "m1",
				lenderId: "lender-a",
				amount: 4_500,
				effectiveDate: "2026-01-02",
				idempotencyKey: "bad-redeem",
				source: SYS_SOURCE,
			})
		).rejects.toThrow(/Position post-redemption.*violates minimum position/);
	});

	it("T-054: redeemShares throws if lender has no POSITION", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const auth = asLedgerUser(t);
		await auth.mutation(api.ledger.mutations.mintMortgage, {
			mortgageId: "m1",
			effectiveDate: "2026-01-01",
			idempotencyKey: "mint-m1",
			source: SYS_SOURCE,
		});

		await expect(
			auth.mutation(api.ledger.mutations.redeemShares, {
				mortgageId: "m1",
				lenderId: "ghost",
				amount: 1_000,
				effectiveDate: "2026-01-02",
				idempotencyKey: "ghost-redeem",
				source: SYS_SOURCE,
			})
		).rejects.toThrow(/No POSITION account/);
	});
});

// ── Tier 1 postEntry strict behavior ──────────────────────────────

describe("Tier 1 postEntry Strict Behavior", () => {
	it("T-055: postEntry throws when debitAccountId doesn't exist", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const auth = asLedgerUser(t);
		const { treasuryAccountId } = await auth.mutation(
			api.ledger.mutations.mintMortgage,
			{
				mortgageId: "m1",
				effectiveDate: "2026-01-01",
				idempotencyKey: "mint-m1",
				source: SYS_SOURCE,
			}
		);

		await expect(
			auth.mutation(api.ledger.mutations.postEntry, {
				entryType: "SHARES_ISSUED",
				mortgageId: "m1",
				debitAccountId:
					"kh7ab0000000000000000000000000000" as typeof treasuryAccountId,
				creditAccountId: treasuryAccountId,
				amount: 1_000,
				effectiveDate: "2026-01-01",
				idempotencyKey: "bad-debit",
				source: SYS_SOURCE,
			})
		).rejects.toThrow();
	});

	it("T-057: postEntry works with pre-resolved account IDs and returns correct journal entry", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const auth = asLedgerUser(t);
		const { mintResult, issueResult } = await mintAndIssue(
			t,
			"m1",
			"lender-a"
		);

		// Use Tier 1 postEntry directly to redeem 1,000 shares
		const entry = await auth.mutation(api.ledger.mutations.postEntry, {
			entryType: "SHARES_REDEEMED",
			mortgageId: "m1",
			debitAccountId: mintResult.treasuryAccountId,
			creditAccountId: issueResult.positionAccountId,
			amount: 1_000,
			effectiveDate: "2026-02-15",
			idempotencyKey: "direct-redeem-1",
			source: SYS_SOURCE,
		});

		// Verify journal entry fields
		expect(entry.entryType).toBe("SHARES_REDEEMED");
		expect(entry.amount).toBe(1_000);
		expect(entry.debitAccountId).toBe(mintResult.treasuryAccountId);
		expect(entry.creditAccountId).toBe(issueResult.positionAccountId);
		expect(entry.mortgageId).toBe("m1");
		expect(entry.effectiveDate).toBe("2026-02-15");
		expect(entry.idempotencyKey).toBe("direct-redeem-1");
		expect(entry.source).toEqual(SYS_SOURCE);
		expect(entry.sequenceNumber).toBeGreaterThan(0n);
		expect(entry.timestamp).toBeGreaterThan(0);

		// Verify balances updated correctly
		expect(
			await auth.query(api.ledger.queries.getBalance, {
				accountId: mintResult.treasuryAccountId,
			})
		).toBe(1_000n);
		expect(
			await auth.query(api.ledger.queries.getBalance, {
				accountId: issueResult.positionAccountId,
			})
		).toBe(9_000n);
	});

	it("T-056: postEntry throws when creditAccountId doesn't exist", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const auth = asLedgerUser(t);
		const { treasuryAccountId } = await auth.mutation(
			api.ledger.mutations.mintMortgage,
			{
				mortgageId: "m1",
				effectiveDate: "2026-01-01",
				idempotencyKey: "mint-m1",
				source: SYS_SOURCE,
			}
		);

		await expect(
			auth.mutation(api.ledger.mutations.postEntry, {
				entryType: "SHARES_ISSUED",
				mortgageId: "m1",
				debitAccountId: treasuryAccountId,
				creditAccountId:
					"kh7ab0000000000000000000000000000" as typeof treasuryAccountId,
				amount: 1_000,
				effectiveDate: "2026-01-01",
				idempotencyKey: "bad-credit",
				source: SYS_SOURCE,
			})
		).rejects.toThrow();
	});
});

// ── Mint & Burn tests ─────────────────────────────────────────────

describe("Mint & Burn", () => {
	it("T-058: mintMortgage rejects double-mint", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const auth = asLedgerUser(t);
		await auth.mutation(api.ledger.mutations.mintMortgage, {
			mortgageId: "m1",
			effectiveDate: "2026-01-01",
			idempotencyKey: "mint-m1",
			source: SYS_SOURCE,
		});

		await expect(
			auth.mutation(api.ledger.mutations.mintMortgage, {
				mortgageId: "m1",
				effectiveDate: "2026-01-01",
				idempotencyKey: "mint-m1-dup",
				source: SYS_SOURCE,
			})
		).rejects.toThrow(/already minted/);
	});

	it("T-059: burnMortgage rejects when POSITION accounts still have balance", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const auth = asLedgerUser(t);
		await mintAndIssue(t, "m1", "lender-a");

		await expect(
			auth.mutation(api.ledger.mutations.burnMortgage, {
				mortgageId: "m1",
				effectiveDate: "2026-01-02",
				idempotencyKey: "burn-m1",
				source: SYS_SOURCE,
				reason: "test",
			})
		).rejects.toThrow(/TREASURY balance/);
	});

	it("T-060: burnMortgage rejects when TREASURY != 10,000", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const auth = asLedgerUser(t);
		await mintAndIssue(t, "m1", "lender-a", 5_000);

		await expect(
			auth.mutation(api.ledger.mutations.burnMortgage, {
				mortgageId: "m1",
				effectiveDate: "2026-01-02",
				idempotencyKey: "burn-m1",
				source: SYS_SOURCE,
				reason: "test",
			})
		).rejects.toThrow(/TREASURY balance/);
	});
});

// ── CORRECTION tests ──────────────────────────────────────────────

describe("CORRECTION", () => {
	it("T-061: CORRECTION requires source.type == 'user' with actor", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const auth = asLedgerUser(t);
		const { mintResult, issueResult } = await mintAndIssue(
			t,
			"m1",
			"lender-a"
		);

		await expect(
			auth.mutation(api.ledger.mutations.postEntry, {
				entryType: "CORRECTION",
				mortgageId: "m1",
				debitAccountId: issueResult.positionAccountId,
				creditAccountId: mintResult.treasuryAccountId,
				amount: 1_000,
				effectiveDate: "2026-01-02",
				idempotencyKey: "correction-1",
				source: { type: "system" },
				causedBy: issueResult.journalEntry._id,
				reason: "test correction",
			})
		).rejects.toThrow(/CORRECTION requires source.type = 'user'/);
	});

	it("T-062: CORRECTION requires causedBy reference", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const auth = asLedgerUser(t);
		const { mintResult, issueResult } = await mintAndIssue(
			t,
			"m1",
			"lender-a"
		);

		await expect(
			auth.mutation(api.ledger.mutations.postEntry, {
				entryType: "CORRECTION",
				mortgageId: "m1",
				debitAccountId: issueResult.positionAccountId,
				creditAccountId: mintResult.treasuryAccountId,
				amount: 1_000,
				effectiveDate: "2026-01-02",
				idempotencyKey: "correction-2",
				source: ADMIN_SOURCE,
				reason: "test correction",
			})
		).rejects.toThrow(/CORRECTION requires causedBy/);
	});

	it("T-063: CORRECTION requires reason string", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const auth = asLedgerUser(t);
		const { mintResult, issueResult } = await mintAndIssue(
			t,
			"m1",
			"lender-a"
		);

		await expect(
			auth.mutation(api.ledger.mutations.postEntry, {
				entryType: "CORRECTION",
				mortgageId: "m1",
				debitAccountId: issueResult.positionAccountId,
				creditAccountId: mintResult.treasuryAccountId,
				amount: 1_000,
				effectiveDate: "2026-01-02",
				idempotencyKey: "correction-3",
				source: ADMIN_SOURCE,
				causedBy: issueResult.journalEntry._id,
			})
		).rejects.toThrow(/CORRECTION requires a reason/);
	});

	it("T-064b: valid CORRECTION updates balances and preserves supply invariant", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const auth = asLedgerUser(t);
		const { mintResult, issueResult } = await mintAndIssue(
			t,
			"m1",
			"lender-a"
		);

		// Correction: move 1,000 units from POSITION back to TREASURY
		const correctionEntry = await auth.mutation(
			api.ledger.mutations.postEntry,
			{
				entryType: "CORRECTION",
				mortgageId: "m1",
				debitAccountId: mintResult.treasuryAccountId,
				creditAccountId: issueResult.positionAccountId,
				amount: 1_000,
				effectiveDate: "2026-01-02",
				idempotencyKey: "correction-happy",
				source: ADMIN_SOURCE,
				causedBy: issueResult.journalEntry._id,
				reason: "Over-issuance correction",
			}
		);

		// Verify the correction entry was written
		expect(correctionEntry.entryType).toBe("CORRECTION");
		expect(correctionEntry.amount).toBe(1_000);
		expect(correctionEntry.reason).toBe("Over-issuance correction");
		expect(correctionEntry.causedBy).toBe(issueResult.journalEntry._id);

		// Verify balances updated
		expect(
			await auth.query(api.ledger.queries.getBalance, {
				accountId: mintResult.treasuryAccountId,
			})
		).toBe(1_000n);
		expect(
			await auth.query(api.ledger.queries.getBalance, {
				accountId: issueResult.positionAccountId,
			})
		).toBe(9_000n);

		// Supply invariant must still hold
		const invariant = await auth.query(
			api.ledger.validation.validateSupplyInvariant,
			{ mortgageId: "m1" }
		);
		expect(invariant.valid).toBe(true);
		expect(invariant.total).toBe(10_000n);
	});

	it("T-064: CORRECTION enforces balance checks", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const auth = asLedgerUser(t);
		const { mintResult, issueResult } = await mintAndIssue(
			t,
			"m1",
			"lender-a"
		);

		// Try correction that would make position negative (taking 11,000 from a 10,000 position)
		await expect(
			auth.mutation(api.ledger.mutations.postEntry, {
				entryType: "CORRECTION",
				mortgageId: "m1",
				debitAccountId: mintResult.treasuryAccountId,
				creditAccountId: issueResult.positionAccountId,
				amount: 11_000,
				effectiveDate: "2026-01-02",
				idempotencyKey: "correction-4",
				source: ADMIN_SOURCE,
				causedBy: issueResult.journalEntry._id,
				reason: "bad correction",
			})
		).rejects.toThrow(/position balance negative/);
	});

	it("T-064c: CORRECTION rejects cross-mortgage unit movement", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const auth = asLedgerUser(t);
		const m1 = await mintAndIssue(t, "m1", "lender-a");
		const m2 = await mintAndIssue(t, "m2", "lender-b");

		// Attempt CORRECTION moving units from m1 POSITION to m2 TREASURY
		await expect(
			auth.mutation(api.ledger.mutations.postEntry, {
				entryType: "CORRECTION",
				mortgageId: "m1",
				debitAccountId: m2.mintResult.treasuryAccountId,
				creditAccountId: m1.issueResult.positionAccountId,
				amount: 1_000,
				effectiveDate: "2026-01-02",
				idempotencyKey: "correction-cross",
				source: ADMIN_SOURCE,
				causedBy: m1.issueResult.journalEntry._id,
				reason: "cross-mortgage correction attempt",
			})
		).rejects.toThrow(/cannot move units between different mortgages/i);
	});
});

// ── Idempotency & Sequencing tests ────────────────────────────────

describe("Idempotency & Sequencing", () => {
	it("T-065: same idempotencyKey returns existing entry, no double-post", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const auth = asLedgerUser(t);
		await auth.mutation(api.ledger.mutations.mintMortgage, {
			mortgageId: "m1",
			effectiveDate: "2026-01-01",
			idempotencyKey: "mint-m1",
			source: SYS_SOURCE,
		});

		const first = await auth.mutation(api.ledger.mutations.issueShares, {
			mortgageId: "m1",
			lenderId: "lender-a",
			amount: 5_000,
			effectiveDate: "2026-01-01",
			idempotencyKey: "issue-idem",
			source: SYS_SOURCE,
		});

		const second = await auth.mutation(api.ledger.mutations.issueShares, {
			mortgageId: "m1",
			lenderId: "lender-a",
			amount: 5_000,
			effectiveDate: "2026-01-01",
			idempotencyKey: "issue-idem",
			source: SYS_SOURCE,
		});

		// Should return same journal entry
		expect(first.journalEntry._id).toBe(second.journalEntry._id);

		// Idempotent replay must return the identical sequenceNumber (gap-free numbering)
		expect(first.journalEntry.sequenceNumber).toBe(
			second.journalEntry.sequenceNumber,
		);

		// Verify the sequence counter was NOT advanced by the replay
		const counterAfterReplay = await t.run(async (ctx) => {
			const doc = await ctx.db
				.query("ledger_sequence_counters")
				.withIndex("by_name", (q) => q.eq("name", "ledger_sequence"))
				.unique();
			return doc!.value;
		});
		// mintMortgage (seq 1) + issueShares (seq 2) = counter should be 2,
		// NOT 3 from a duplicate issueShares
		expect(counterAfterReplay).toBe(2n);

		// Balance should be 5,000 not 10,000
		expect(
			await auth.query(api.ledger.queries.getBalance, {
				accountId: first.positionAccountId,
			})
		).toBe(5_000n);
	});

	it("T-066: sequence numbers are monotonic and gap-free", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const auth = asLedgerUser(t);
		await auth.mutation(api.ledger.mutations.mintMortgage, {
			mortgageId: "m1",
			effectiveDate: "2026-01-01",
			idempotencyKey: "mint-m1",
			source: SYS_SOURCE,
		});

		await auth.mutation(api.ledger.mutations.issueShares, {
			mortgageId: "m1",
			lenderId: "lender-a",
			amount: 5_000,
			effectiveDate: "2026-01-01",
			idempotencyKey: "issue-1",
			source: SYS_SOURCE,
		});

		await auth.mutation(api.ledger.mutations.issueShares, {
			mortgageId: "m1",
			lenderId: "lender-b",
			amount: 5_000,
			effectiveDate: "2026-01-01",
			idempotencyKey: "issue-2",
			source: SYS_SOURCE,
		});

		const history = await auth.query(api.ledger.queries.getMortgageHistory, {
			mortgageId: "m1",
		});

		expect(history).toHaveLength(3);
		expect(history[0].sequenceNumber).toBe(1n);
		expect(history[1].sequenceNumber).toBe(2n);
		expect(history[2].sequenceNumber).toBe(3n);
	});
});

// ── getLenderPositions tests ────────────────────────────────────

describe("Lender Position Queries", () => {
	it("T-022b: getLenderPositions returns positions across multiple mortgages", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const auth = asLedgerUser(t);
		await mintAndIssue(t, "m1", "lender-a", 5_000);
		await mintAndIssue(t, "m2", "lender-a", 3_000);

		// Also issue to lender-b on m1 so lender-a doesn't hold everything
		await auth.mutation(api.ledger.mutations.issueShares, {
			mortgageId: "m1",
			lenderId: "lender-b",
			amount: 5_000,
			effectiveDate: "2026-01-01",
			idempotencyKey: "issue-m1-b",
			source: SYS_SOURCE,
		});

		const positions = await auth.query(
			api.ledger.queries.getLenderPositions,
			{
				lenderId: "lender-a",
			}
		);

		expect(positions).toHaveLength(2);
		const mortgageIds = positions.map((p) => p.mortgageId).sort();
		expect(mortgageIds).toEqual(["m1", "m2"]);

		const m1Pos = positions.find((p) => p.mortgageId === "m1");
		const m2Pos = positions.find((p) => p.mortgageId === "m2");
		expect(m1Pos?.balance).toBe(5_000n);
		expect(m2Pos?.balance).toBe(3_000n);
	});

	it("T-022b-zero: getLenderPositions excludes zero-balance positions", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const auth = asLedgerUser(t);
		await mintAndIssue(t, "m1", "lender-a");

		// Transfer all away — lender-a has 0 balance
		await auth.mutation(api.ledger.mutations.transferShares, {
			mortgageId: "m1",
			sellerLenderId: "lender-a",
			buyerLenderId: "lender-b",
			amount: 10_000,
			effectiveDate: "2026-01-02",
			idempotencyKey: "transfer-all",
			source: SYS_SOURCE,
		});

		const positions = await auth.query(
			api.ledger.queries.getLenderPositions,
			{
				lenderId: "lender-a",
			}
		);
		expect(positions).toHaveLength(0);
	});
});

// ── Point-in-time & History tests ─────────────────────────────────

describe("Point-in-Time & History", () => {
	it("T-067: getPositionsAt shows pre-transfer state", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const auth = asLedgerUser(t);
		await mintAndIssue(t, "m1", "lender-a");

		// Record time before transfer
		const beforeTransfer = Date.now();

		// Small delay to ensure distinct timestamps
		await new Promise((r) => setTimeout(r, 10));

		await auth.mutation(api.ledger.mutations.transferShares, {
			mortgageId: "m1",
			sellerLenderId: "lender-a",
			buyerLenderId: "lender-b",
			amount: 5_000,
			effectiveDate: "2026-01-02",
			idempotencyKey: "transfer-1",
			source: SYS_SOURCE,
		});

		// Query at time before transfer — should show only lender-a with 10,000
		const positionsBefore = await auth.query(
			api.ledger.queries.getPositionsAt,
			{
				mortgageId: "m1",
				asOf: beforeTransfer,
			}
		);
		expect(positionsBefore).toHaveLength(1);
		expect(positionsBefore[0].lenderId).toBe("lender-a");
		expect(positionsBefore[0].balance).toBe(10_000n);
	});

	it("T-068: getBalanceAt reconstructs balance at various timestamps", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const auth = asLedgerUser(t);
		const { treasuryAccountId } = await auth.mutation(
			api.ledger.mutations.mintMortgage,
			{
				mortgageId: "m1",
				effectiveDate: "2026-01-01",
				idempotencyKey: "mint-m1",
				source: SYS_SOURCE,
			}
		);

		const afterMint = Date.now();
		await new Promise((r) => setTimeout(r, 10));

		const { positionAccountId } = await auth.mutation(
			api.ledger.mutations.issueShares,
			{
				mortgageId: "m1",
				lenderId: "lender-a",
				amount: 6_000,
				effectiveDate: "2026-01-01",
				idempotencyKey: "issue-a",
				source: SYS_SOURCE,
			}
		);

		const afterIssue = Date.now();

		// At afterMint: treasury = 10,000, position doesn't exist yet in journal
		const treasuryAtMint = await auth.query(
			api.ledger.queries.getBalanceAt,
			{
				accountId: treasuryAccountId,
				asOf: afterMint,
			}
		);
		expect(treasuryAtMint).toBe(10_000n);

		// At afterIssue: treasury = 4,000, position = 6,000
		const treasuryAtIssue = await auth.query(
			api.ledger.queries.getBalanceAt,
			{
				accountId: treasuryAccountId,
				asOf: afterIssue,
			}
		);
		expect(treasuryAtIssue).toBe(4_000n);

		const positionAtIssue = await auth.query(
			api.ledger.queries.getBalanceAt,
			{
				accountId: positionAccountId,
				asOf: afterIssue,
			}
		);
		expect(positionAtIssue).toBe(6_000n);
	});

	it("T-069: getMortgageHistory returns entries in sequence order", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const auth = asLedgerUser(t);
		await mintAndIssue(t, "m1", "lender-a");

		const history = await auth.query(api.ledger.queries.getMortgageHistory, {
			mortgageId: "m1",
		});

		expect(history.length).toBeGreaterThanOrEqual(2);
		for (let i = 1; i < history.length; i++) {
			expect(history[i].sequenceNumber).toBeGreaterThan(
				history[i - 1].sequenceNumber
			);
		}
	});

	it("T-070: getAccountHistory returns entries touching an account", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const auth = asLedgerUser(t);
		const { issueResult } = await mintAndIssue(t, "m1", "lender-a");

		await auth.mutation(api.ledger.mutations.transferShares, {
			mortgageId: "m1",
			sellerLenderId: "lender-a",
			buyerLenderId: "lender-b",
			amount: 5_000,
			effectiveDate: "2026-01-02",
			idempotencyKey: "transfer-1",
			source: SYS_SOURCE,
		});

		const history = await auth.query(api.ledger.queries.getAccountHistory, {
			accountId: issueResult.positionAccountId,
		});

		// Should have issuance + transfer = 2 entries
		expect(history).toHaveLength(2);
	});

	it("T-069b: getMortgageHistory filters by from/to date range", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const auth = asLedgerUser(t);
		await mintAndIssue(t, "m1", "lender-a");

		const afterIssue = Date.now();
		await new Promise((r) => setTimeout(r, 10));

		await auth.mutation(api.ledger.mutations.transferShares, {
			mortgageId: "m1",
			sellerLenderId: "lender-a",
			buyerLenderId: "lender-b",
			amount: 5_000,
			effectiveDate: "2026-01-02",
			idempotencyKey: "transfer-1",
			source: SYS_SOURCE,
		});

		// Only entries AFTER the issue (should get just the transfer)
		const filtered = await auth.query(api.ledger.queries.getMortgageHistory, {
			mortgageId: "m1",
			from: afterIssue + 1,
		});
		expect(filtered).toHaveLength(1);
		expect(filtered[0].entryType).toBe("SHARES_TRANSFERRED");

		// Only entries BEFORE the transfer (should get mint + issue)
		const beforeTransfer = await auth.query(
			api.ledger.queries.getMortgageHistory,
			{
				mortgageId: "m1",
				to: afterIssue,
			}
		);
		expect(beforeTransfer).toHaveLength(2);
	});

	it("T-069c: getMortgageHistory respects limit", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const auth = asLedgerUser(t);
		await mintAndIssue(t, "m1", "lender-a");

		await auth.mutation(api.ledger.mutations.transferShares, {
			mortgageId: "m1",
			sellerLenderId: "lender-a",
			buyerLenderId: "lender-b",
			amount: 5_000,
			effectiveDate: "2026-01-02",
			idempotencyKey: "transfer-1",
			source: SYS_SOURCE,
		});

		// 3 entries total (mint, issue, transfer) — limit to 2
		const limited = await auth.query(api.ledger.queries.getMortgageHistory, {
			mortgageId: "m1",
			limit: 2,
		});
		expect(limited).toHaveLength(2);
		// Should be first 2 by sequence order
		expect(limited[0].sequenceNumber).toBe(1n);
		expect(limited[1].sequenceNumber).toBe(2n);
	});

	it("T-070b: getAccountHistory filters by from/to date range", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const auth = asLedgerUser(t);
		const { issueResult } = await mintAndIssue(t, "m1", "lender-a");

		const afterIssue = Date.now();
		await new Promise((r) => setTimeout(r, 10));

		await auth.mutation(api.ledger.mutations.transferShares, {
			mortgageId: "m1",
			sellerLenderId: "lender-a",
			buyerLenderId: "lender-b",
			amount: 5_000,
			effectiveDate: "2026-01-02",
			idempotencyKey: "transfer-1",
			source: SYS_SOURCE,
		});

		// lender-a's account: issuance (before afterIssue) + transfer (after afterIssue)
		// Filter to only entries after issuance
		const filtered = await auth.query(api.ledger.queries.getAccountHistory, {
			accountId: issueResult.positionAccountId,
			from: afterIssue + 1,
		});
		expect(filtered).toHaveLength(1);
		expect(filtered[0].entryType).toBe("SHARES_TRANSFERRED");
	});
});

// ── Validation & Cursor tests ─────────────────────────────────────

describe("Validation & Cursors", () => {
	it("T-071: validateSupplyInvariant returns valid=true for healthy mortgage", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const auth = asLedgerUser(t);
		await mintAndIssue(t, "m1", "lender-a", 5_000);

		const result = await auth.query(
			api.ledger.validation.validateSupplyInvariant,
			{ mortgageId: "m1" }
		);

		expect(result.valid).toBe(true);
		expect(result.total).toBe(10_000n);
	});

	it("T-072: consumer cursor lifecycle: create, advance, reset", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const auth = asLedgerUser(t);

		// Get cursor — should be null initially
		const initial = await auth.query(api.ledger.cursors.getCursor, {
			consumerId: "accrual_engine",
		});
		expect(initial).toBeNull();

		// Advance cursor
		await auth.mutation(api.ledger.cursors.advanceCursor, {
			consumerId: "accrual_engine",
			lastProcessedSequence: 5n,
		});

		const after = await auth.query(api.ledger.cursors.getCursor, {
			consumerId: "accrual_engine",
		});
		expect(after?.lastProcessedSequence).toBe(5n);

		// Reset cursor
		await auth.mutation(api.ledger.cursors.resetCursor, {
			consumerId: "accrual_engine",
		});

		const reset = await auth.query(api.ledger.cursors.getCursor, {
			consumerId: "accrual_engine",
		});
		expect(reset?.lastProcessedSequence).toBe(0n);
	});
});

// ── Common rejection tests ────────────────────────────────────────

describe("Common Rejections", () => {
	it("T-073: amount <= 0 is rejected", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const auth = asLedgerUser(t);
		const { mintResult, issueResult } = await mintAndIssue(
			t,
			"m1",
			"lender-a"
		);

		await expect(
			auth.mutation(api.ledger.mutations.postEntry, {
				entryType: "CORRECTION",
				mortgageId: "m1",
				debitAccountId: issueResult.positionAccountId,
				creditAccountId: mintResult.treasuryAccountId,
				amount: 0,
				effectiveDate: "2026-01-02",
				idempotencyKey: "zero-amount",
				source: ADMIN_SOURCE,
				causedBy: issueResult.journalEntry._id,
				reason: "test",
			})
		).rejects.toThrow(/Amount must be positive/);
	});

	it("T-074: self-transfer (debit == credit) is rejected", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const auth = asLedgerUser(t);
		const { issueResult } = await mintAndIssue(t, "m1", "lender-a");

		await expect(
			auth.mutation(api.ledger.mutations.postEntry, {
				entryType: "CORRECTION",
				mortgageId: "m1",
				debitAccountId: issueResult.positionAccountId,
				creditAccountId: issueResult.positionAccountId,
				amount: 1_000,
				effectiveDate: "2026-01-02",
				idempotencyKey: "self-transfer",
				source: ADMIN_SOURCE,
				causedBy: issueResult.journalEntry._id,
				reason: "test",
			})
		).rejects.toThrow(/Debit and credit accounts must be different/);
	});

	it("T-075: SHARES_ISSUED rejects wrong account types (POSITION as credit instead of TREASURY)", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const auth = asLedgerUser(t);
		const { mintResult, issueResult } = await mintAndIssue(
			t,
			"m1",
			"lender-a",
			5_000
		);

		// Issue to a second lender so we have two different POSITION accounts
		await auth.mutation(api.ledger.mutations.issueShares, {
			mortgageId: "m1",
			lenderId: "lender-b",
			amount: 5_000,
			effectiveDate: "2026-01-01",
			idempotencyKey: "issue-b",
			source: SYS_SOURCE,
		});

		// SHARES_ISSUED expects debit=POSITION, credit=TREASURY
		// Pass debit=TREASURY (wrong), credit=POSITION (wrong) — two different IDs
		await expect(
			auth.mutation(api.ledger.mutations.postEntry, {
				entryType: "SHARES_ISSUED",
				mortgageId: "m1",
				debitAccountId: mintResult.treasuryAccountId,
				creditAccountId: issueResult.positionAccountId,
				amount: 1_000,
				effectiveDate: "2026-01-02",
				idempotencyKey: "wrong-types-1",
				source: SYS_SOURCE,
			})
		).rejects.toThrow(/must be POSITION/);
	});

	it("T-075b: MORTGAGE_MINTED rejects wrong account types", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const auth = asLedgerUser(t);
		const { mintResult, issueResult } = await mintAndIssue(
			t,
			"m1",
			"lender-a"
		);

		// MORTGAGE_MINTED expects debit=TREASURY, credit=WORLD
		// Pass debit=POSITION (wrong), credit=TREASURY (wrong)
		await expect(
			auth.mutation(api.ledger.mutations.postEntry, {
				entryType: "MORTGAGE_MINTED",
				mortgageId: "m1",
				debitAccountId: issueResult.positionAccountId,
				creditAccountId: mintResult.treasuryAccountId,
				amount: 10_000,
				effectiveDate: "2026-01-02",
				idempotencyKey: "wrong-types-2",
				source: SYS_SOURCE,
			})
		).rejects.toThrow(/must be TREASURY/);
	});

	it("T-075c: SHARES_REDEEMED rejects wrong account types", async () => {
		const t = createTestHarness();
		await initCounter(t);
		const auth = asLedgerUser(t);
		const { mintResult, issueResult } = await mintAndIssue(
			t,
			"m1",
			"lender-a"
		);

		// SHARES_REDEEMED expects debit=TREASURY, credit=POSITION
		// Pass debit=POSITION (wrong), credit=TREASURY (wrong)
		await expect(
			auth.mutation(api.ledger.mutations.postEntry, {
				entryType: "SHARES_REDEEMED",
				mortgageId: "m1",
				debitAccountId: issueResult.positionAccountId,
				creditAccountId: mintResult.treasuryAccountId,
				amount: 1_000,
				effectiveDate: "2026-01-02",
				idempotencyKey: "wrong-types-3",
				source: SYS_SOURCE,
			})
		).rejects.toThrow(/must be TREASURY/);
	});
});
