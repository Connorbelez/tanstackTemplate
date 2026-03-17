import { ConvexError } from "convex/values";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "../../_generated/api";
import { FAIRLEND_STAFF_ORG_ID } from "../../constants";
import schema from "../../schema";
import { getPostedBalance } from "../accounts";
import {
	type TestHarness,
	asLedgerUser,
	createTestHarness as createSharedTestHarness,
	getConvexErrorCode,
	initCounter,
	mintAndIssue,
} from "./testUtils";

const modules = import.meta.glob("/convex/**/*.ts");

// ── Auth identity ────────────────────────────────────────────────
const ADMIN_IDENTITY = {
	subject: "test-convenience-admin",
	issuer: "https://api.workos.com",
	org_id: FAIRLEND_STAFF_ORG_ID,
	organization_name: "FairLend Staff",
	role: "admin",
	roles: JSON.stringify(["admin"]),
	permissions: JSON.stringify(["ledger:view", "ledger:correct"]),
	user_email: "admin@fairlend.ca",
	user_first_name: "Test",
	user_last_name: "Admin",
};

function createTestHarness() {
	return convexTest(schema, modules);
}

function asAdmin(t: ReturnType<typeof createTestHarness>) {
	return t.withIdentity(ADMIN_IDENTITY);
}

// ── Helpers ──────────────────────────────────────────────────────

const SYS_SOURCE = { type: "system" as const, channel: "test" };

async function bootstrap(t: ReturnType<typeof createTestHarness>) {
	const admin = asAdmin(t);
	await admin.mutation(api.ledger.bootstrap.bootstrapLedger, {});
}

async function mintMortgage(
	t: ReturnType<typeof createTestHarness>,
	mortgageId: string
) {
	const admin = asAdmin(t);
	return admin.mutation(api.ledger.mutations.mintMortgage, {
		mortgageId,
		effectiveDate: "2026-01-01",
		idempotencyKey: `mint-${mortgageId}`,
		source: SYS_SOURCE,
	});
}

async function issueAll(
	t: ReturnType<typeof createTestHarness>,
	mortgageId: string,
	lenderId: string,
	amount = 10_000
) {
	const admin = asAdmin(t);
	return admin.mutation(internal.ledger.mutations.issueShares, {
		mortgageId,
		lenderId,
		amount,
		effectiveDate: "2026-01-01",
		idempotencyKey: `issue-${mortgageId}-${lenderId}-${amount}`,
		source: SYS_SOURCE,
	});
}

async function getBalance(
	t: ReturnType<typeof createTestHarness>,
	accountId: string
) {
	const admin = asAdmin(t);
	return admin.query(api.ledger.queries.getBalance, {
		accountId: accountId as never,
	});
}

// ── issueShares ──────────────────────────────────────────────────

describe("issueShares", () => {
	it("happy path: TREASURY → POSITION, balance correct", async () => {
		const t = createTestHarness();
		await bootstrap(t);
		const { treasuryAccountId } = await mintMortgage(t, "m1");

		const { positionAccountId, journalEntry } = await asAdmin(t).mutation(
			internal.ledger.mutations.issueShares,
			{
				mortgageId: "m1",
				lenderId: "lender-a",
				amount: 5000,
				effectiveDate: "2026-01-01",
				idempotencyKey: "issue-m1-a",
				source: SYS_SOURCE,
			}
		);

		expect(positionAccountId).toBeDefined();
		expect(journalEntry.entryType).toBe("SHARES_ISSUED");
		expect(journalEntry.amount).toBe(5000);

		const posBalance = await getBalance(t, positionAccountId);
		expect(posBalance).toBe(5000n);

		const treasuryBalance = await getBalance(t, treasuryAccountId);
		expect(treasuryBalance).toBe(5000n);
	});

	it("creates POSITION on demand if it doesn't exist", async () => {
		const t = createTestHarness();
		await bootstrap(t);
		await mintMortgage(t, "m1");

		// First issue creates the POSITION
		const { positionAccountId: first } = await asAdmin(t).mutation(
			internal.ledger.mutations.issueShares,
			{
				mortgageId: "m1",
				lenderId: "new-lender",
				amount: 3000,
				effectiveDate: "2026-01-01",
				idempotencyKey: "issue-m1-new-1",
				source: SYS_SOURCE,
			}
		);

		// Second issue reuses the same POSITION
		const { positionAccountId: second } = await asAdmin(t).mutation(
			internal.ledger.mutations.issueShares,
			{
				mortgageId: "m1",
				lenderId: "new-lender",
				amount: 2000,
				effectiveDate: "2026-01-01",
				idempotencyKey: "issue-m1-new-2",
				source: SYS_SOURCE,
			}
		);

		expect(first).toBe(second);
		const balance = await getBalance(t, first);
		expect(balance).toBe(5000n);
	});

	it("rejects if no TREASURY (mortgage not minted)", async () => {
		const t = createTestHarness();
		await bootstrap(t);

		await expect(
			asAdmin(t).mutation(internal.ledger.mutations.issueShares, {
				mortgageId: "unminted",
				lenderId: "lender-a",
				amount: 5000,
				effectiveDate: "2026-01-01",
				idempotencyKey: "issue-unminted",
				source: SYS_SOURCE,
			})
		).rejects.toThrow(ConvexError);
	});

	it("rejects min fraction violation: issuing 500 units (< 1,000)", async () => {
		const t = createTestHarness();
		await bootstrap(t);
		await mintMortgage(t, "m1");

		await expect(
			asAdmin(t).mutation(internal.ledger.mutations.issueShares, {
				mortgageId: "m1",
				lenderId: "lender-a",
				amount: 500,
				effectiveDate: "2026-01-01",
				idempotencyKey: "issue-m1-small",
				source: SYS_SOURCE,
			})
		).rejects.toThrow(ConvexError);
	});

	it("accepts issuing exactly 1,000 units (= minimum)", async () => {
		const t = createTestHarness();
		await bootstrap(t);
		await mintMortgage(t, "m1");

		const { positionAccountId } = await asAdmin(t).mutation(
			internal.ledger.mutations.issueShares,
			{
				mortgageId: "m1",
				lenderId: "lender-a",
				amount: 1000,
				effectiveDate: "2026-01-01",
				idempotencyKey: "issue-m1-min",
				source: SYS_SOURCE,
			}
		);

		const balance = await getBalance(t, positionAccountId);
		expect(balance).toBe(1000n);
	});

	it("idempotency: same key returns existing entry", async () => {
		const t = createTestHarness();
		await bootstrap(t);
		await mintMortgage(t, "m1");

		const first = await asAdmin(t).mutation(
			internal.ledger.mutations.issueShares,
			{
				mortgageId: "m1",
				lenderId: "lender-a",
				amount: 5000,
				effectiveDate: "2026-01-01",
				idempotencyKey: "issue-idem",
				source: SYS_SOURCE,
			}
		);

		const second = await asAdmin(t).mutation(
			internal.ledger.mutations.issueShares,
			{
				mortgageId: "m1",
				lenderId: "lender-a",
				amount: 5000,
				effectiveDate: "2026-01-01",
				idempotencyKey: "issue-idem",
				source: SYS_SOURCE,
			}
		);

		expect(first.journalEntry._id).toBe(second.journalEntry._id);
		// Balance should reflect only one issuance
		const balance = await getBalance(t, first.positionAccountId);
		expect(balance).toBe(5000n);
	});
});

// ── transferShares ───────────────────────────────────────────────

describe("transferShares", () => {
	it("happy path: seller POSITION → buyer POSITION, balances correct", async () => {
		const t = createTestHarness();
		await bootstrap(t);
		await mintMortgage(t, "m1");
		const { positionAccountId: sellerPos } = await issueAll(t, "m1", "seller", 10_000);

		const { buyerAccountId } = await asAdmin(t).mutation(
			internal.ledger.mutations.transferShares,
			{
				mortgageId: "m1",
				sellerLenderId: "seller",
				buyerLenderId: "buyer",
				amount: 3000,
				effectiveDate: "2026-01-01",
				idempotencyKey: "xfer-m1",
				source: SYS_SOURCE,
			}
		);

		const sellerBalance = await getBalance(t, sellerPos);
		expect(sellerBalance).toBe(7000n);

		const buyerBalance = await getBalance(t, buyerAccountId);
		expect(buyerBalance).toBe(3000n);
	});

	it("creates buyer POSITION on demand", async () => {
		const t = createTestHarness();
		await bootstrap(t);
		await mintMortgage(t, "m1");
		await issueAll(t, "m1", "seller", 10_000);

		const { buyerAccountId } = await asAdmin(t).mutation(
			internal.ledger.mutations.transferShares,
			{
				mortgageId: "m1",
				sellerLenderId: "seller",
				buyerLenderId: "brand-new-buyer",
				amount: 5000,
				effectiveDate: "2026-01-01",
				idempotencyKey: "xfer-new-buyer",
				source: SYS_SOURCE,
			}
		);

		expect(buyerAccountId).toBeDefined();
		const balance = await getBalance(t, buyerAccountId);
		expect(balance).toBe(5000n);
	});

	it("rejects if seller has no POSITION", async () => {
		const t = createTestHarness();
		await bootstrap(t);
		await mintMortgage(t, "m1");

		await expect(
			asAdmin(t).mutation(internal.ledger.mutations.transferShares, {
				mortgageId: "m1",
				sellerLenderId: "nonexistent",
				buyerLenderId: "buyer",
				amount: 1000,
				effectiveDate: "2026-01-01",
				idempotencyKey: "xfer-no-seller",
				source: SYS_SOURCE,
			})
		).rejects.toThrow(ConvexError);
	});

	it("rejects if seller has insufficient available balance", async () => {
		const t = createTestHarness();
		await bootstrap(t);
		await mintMortgage(t, "m1");
		await issueAll(t, "m1", "seller", 5000);

		await expect(
			asAdmin(t).mutation(internal.ledger.mutations.transferShares, {
				mortgageId: "m1",
				sellerLenderId: "seller",
				buyerLenderId: "buyer",
				amount: 6000,
				effectiveDate: "2026-01-01",
				idempotencyKey: "xfer-insufficient",
				source: SYS_SOURCE,
			})
		).rejects.toThrow(ConvexError);
	});

	it("sell-all exception: transfer leaving seller at exactly 0 → accepted", async () => {
		const t = createTestHarness();
		await bootstrap(t);
		await mintMortgage(t, "m1");
		const { positionAccountId: sellerPos } = await issueAll(
			t,
			"m1",
			"seller",
			5000
		);

		// Transfer all 5000 to buyer — seller goes to 0
		await asAdmin(t).mutation(internal.ledger.mutations.transferShares, {
			mortgageId: "m1",
			sellerLenderId: "seller",
			buyerLenderId: "buyer",
			amount: 5000,
			effectiveDate: "2026-01-01",
			idempotencyKey: "xfer-sellall",
			source: SYS_SOURCE,
		});

		const sellerBalance = await getBalance(t, sellerPos);
		expect(sellerBalance).toBe(0n);
	});

	it("min fraction violation: transfer leaving seller at 500 → rejected", async () => {
		const t = createTestHarness();
		await bootstrap(t);
		await mintMortgage(t, "m1");
		await issueAll(t, "m1", "seller", 5000);

		// Transfer 4500, leaving seller with 500 (< 1000 min, != 0)
		await expect(
			asAdmin(t).mutation(internal.ledger.mutations.transferShares, {
				mortgageId: "m1",
				sellerLenderId: "seller",
				buyerLenderId: "buyer",
				amount: 4500,
				effectiveDate: "2026-01-01",
				idempotencyKey: "xfer-minfrac",
				source: SYS_SOURCE,
			})
		).rejects.toThrow(ConvexError);
	});

	it("min fraction: buyer resulting position must be >= 1,000", async () => {
		const t = createTestHarness();
		await bootstrap(t);
		await mintMortgage(t, "m1");
		await issueAll(t, "m1", "seller", 10_000);

		// Transfer 500 to a new buyer — buyer would have 500 (< 1000 min)
		await expect(
			asAdmin(t).mutation(internal.ledger.mutations.transferShares, {
				mortgageId: "m1",
				sellerLenderId: "seller",
				buyerLenderId: "buyer",
				amount: 500,
				effectiveDate: "2026-01-01",
				idempotencyKey: "xfer-buyer-minfrac",
				source: SYS_SOURCE,
			})
		).rejects.toThrow(ConvexError);
	});

	it("idempotency: same key returns existing entry", async () => {
		const t = createTestHarness();
		await bootstrap(t);
		await mintMortgage(t, "m1");
		await issueAll(t, "m1", "seller", 10_000);

		const first = await asAdmin(t).mutation(
			internal.ledger.mutations.transferShares,
			{
				mortgageId: "m1",
				sellerLenderId: "seller",
				buyerLenderId: "buyer",
				amount: 3000,
				effectiveDate: "2026-01-01",
				idempotencyKey: "xfer-idem",
				source: SYS_SOURCE,
			}
		);

		const second = await asAdmin(t).mutation(
			internal.ledger.mutations.transferShares,
			{
				mortgageId: "m1",
				sellerLenderId: "seller",
				buyerLenderId: "buyer",
				amount: 3000,
				effectiveDate: "2026-01-01",
				idempotencyKey: "xfer-idem",
				source: SYS_SOURCE,
			}
		);

		expect(first.journalEntry._id).toBe(second.journalEntry._id);
	});
});

// ── redeemShares ─────────────────────────────────────────────────

describe("redeemShares", () => {
	it("happy path: POSITION → TREASURY, balances correct", async () => {
		const t = createTestHarness();
		await bootstrap(t);
		const { treasuryAccountId } = await mintMortgage(t, "m1");
		const { positionAccountId } = await issueAll(t, "m1", "lender-a", 10_000);

		await asAdmin(t).mutation(internal.ledger.mutations.redeemShares, {
			mortgageId: "m1",
			lenderId: "lender-a",
			amount: 3000,
			effectiveDate: "2026-01-01",
			idempotencyKey: "redeem-m1-a",
			source: SYS_SOURCE,
		});

		const posBalance = await getBalance(t, positionAccountId);
		expect(posBalance).toBe(7000n);

		const treasuryBalance = await getBalance(t, treasuryAccountId);
		expect(treasuryBalance).toBe(3000n);
	});

	it("rejects if no TREASURY", async () => {
		const t = createTestHarness();
		await bootstrap(t);

		await expect(
			asAdmin(t).mutation(internal.ledger.mutations.redeemShares, {
				mortgageId: "unminted",
				lenderId: "lender-a",
				amount: 1000,
				effectiveDate: "2026-01-01",
				idempotencyKey: "redeem-no-treasury",
				source: SYS_SOURCE,
			})
		).rejects.toThrow(ConvexError);
	});

	it("rejects if lender has no POSITION", async () => {
		const t = createTestHarness();
		await bootstrap(t);
		await mintMortgage(t, "m1");

		await expect(
			asAdmin(t).mutation(internal.ledger.mutations.redeemShares, {
				mortgageId: "m1",
				lenderId: "nonexistent",
				amount: 1000,
				effectiveDate: "2026-01-01",
				idempotencyKey: "redeem-no-pos",
				source: SYS_SOURCE,
			})
		).rejects.toThrow(ConvexError);
	});

	it("rejects if insufficient available balance", async () => {
		const t = createTestHarness();
		await bootstrap(t);
		await mintMortgage(t, "m1");
		await issueAll(t, "m1", "lender-a", 5000);

		await expect(
			asAdmin(t).mutation(internal.ledger.mutations.redeemShares, {
				mortgageId: "m1",
				lenderId: "lender-a",
				amount: 6000,
				effectiveDate: "2026-01-01",
				idempotencyKey: "redeem-insufficient",
				source: SYS_SOURCE,
			})
		).rejects.toThrow(ConvexError);
	});

	it("sell-all exception: redeem to exactly 0 → accepted", async () => {
		const t = createTestHarness();
		await bootstrap(t);
		await mintMortgage(t, "m1");
		const { positionAccountId } = await issueAll(t, "m1", "lender-a", 5000);

		await asAdmin(t).mutation(internal.ledger.mutations.redeemShares, {
			mortgageId: "m1",
			lenderId: "lender-a",
			amount: 5000,
			effectiveDate: "2026-01-01",
			idempotencyKey: "redeem-all",
			source: SYS_SOURCE,
		});

		const balance = await getBalance(t, positionAccountId);
		expect(balance).toBe(0n);
	});

	it("min fraction violation: redeem leaving position at 800 → rejected", async () => {
		const t = createTestHarness();
		await bootstrap(t);
		await mintMortgage(t, "m1");
		await issueAll(t, "m1", "lender-a", 5000);

		// Redeem 4200, leaving 800 (< 1000 min, != 0)
		await expect(
			asAdmin(t).mutation(internal.ledger.mutations.redeemShares, {
				mortgageId: "m1",
				lenderId: "lender-a",
				amount: 4200,
				effectiveDate: "2026-01-01",
				idempotencyKey: "redeem-minfrac",
				source: SYS_SOURCE,
			})
		).rejects.toThrow(ConvexError);
	});

	it("idempotency: same key returns existing entry", async () => {
		const t = createTestHarness();
		await bootstrap(t);
		await mintMortgage(t, "m1");
		await issueAll(t, "m1", "lender-a", 10_000);

		const first = await asAdmin(t).mutation(
			internal.ledger.mutations.redeemShares,
			{
				mortgageId: "m1",
				lenderId: "lender-a",
				amount: 3000,
				effectiveDate: "2026-01-01",
				idempotencyKey: "redeem-idem",
				source: SYS_SOURCE,
			}
		);

		const second = await asAdmin(t).mutation(
			internal.ledger.mutations.redeemShares,
			{
				mortgageId: "m1",
				lenderId: "lender-a",
				amount: 3000,
				effectiveDate: "2026-01-01",
				idempotencyKey: "redeem-idem",
				source: SYS_SOURCE,
			}
		);

		expect(first._id).toBe(second._id);
		// Balance should reflect only one redemption
		const balance = await getBalance(t, first.creditAccountId);
		expect(balance).toBe(7000n);
	});
});

// ── postCorrection ───────────────────────────────────────────────

describe("postCorrection", () => {
	const ADMIN_SOURCE = { type: "user" as const, actor: "admin-user-123" };

	async function getTreasuryAccount(t: TestHarness, mortgageId: string) {
		return t.run(async (ctx) =>
			ctx.db
				.query("ledger_accounts")
				.withIndex("by_type_and_mortgage", (q) =>
					q.eq("type", "TREASURY").eq("mortgageId", mortgageId),
				)
				.first(),
		);
	}

	async function getPositionAccount(
		t: TestHarness,
		mortgageId: string,
		lenderId: string,
	) {
		return t.run(async (ctx) =>
			ctx.db
				.query("ledger_accounts")
				.withIndex("by_mortgage_and_lender", (q) =>
					q.eq("mortgageId", mortgageId).eq("lenderId", lenderId),
				)
				.first(),
		);
	}

	async function getOriginalEntry(t: TestHarness, idempotencyKey: string) {
		return t.run(async (ctx) =>
			ctx.db
				.query("ledger_journal_entries")
				.withIndex("by_idempotency", (q) =>
					q.eq("idempotencyKey", idempotencyKey),
				)
				.first(),
		);
	}

	it("creates offset entry referencing original, original unmodified", async () => {
		const t = createSharedTestHarness();
		const auth = asLedgerUser(t);
		await initCounter(auth);
		await mintAndIssue(auth, "m-correction-happy", "lender-a", 5000);

		const treasury = await getTreasuryAccount(t, "m-correction-happy");
		const position = await getPositionAccount(
			t,
			"m-correction-happy",
			"lender-a",
		);
		expect(treasury).not.toBeNull();
		expect(position).not.toBeNull();

		const originalEntry = await getOriginalEntry(
			t,
			"issue-m-correction-happy-lender-a",
		);
		expect(originalEntry).not.toBeNull();

		// Save original entry state for comparison
		const originalEntrySnapshot = { ...originalEntry };

		const correctionResult = await asAdmin(t).mutation(
			api.ledger.mutations.postCorrection,
			{
				mortgageId: "m-correction-happy",
				debitAccountId: treasury!._id,
				creditAccountId: position!._id,
				amount: 500,
				effectiveDate: "2026-01-15",
				idempotencyKey: "correction-happy",
				source: ADMIN_SOURCE,
				causedBy: originalEntry!._id,
				reason: "test correction",
			},
		);

		// Assert: new CORRECTION journal entry exists with causedBy pointing to original
		expect(correctionResult.entryType).toBe("CORRECTION");
		expect(correctionResult.causedBy).toBe(originalEntry!._id);
		expect(correctionResult.reason).toBe("test correction");
		expect(correctionResult.source).toMatchObject(ADMIN_SOURCE);

		// Assert: original journal entry is unchanged
		const originalAfter = await getOriginalEntry(
			t,
			"issue-m-correction-happy-lender-a",
		);
		expect(originalAfter!._id).toBe(originalEntrySnapshot!._id);
		expect(originalAfter!.entryType).toBe(originalEntrySnapshot!.entryType);
		expect(originalAfter!.amount).toBe(originalEntrySnapshot!.amount);

		// Assert: A.posted = 4500 (5000 - 500), TREASURY.posted = 5500 (5000 + 500)
		const positionAfter = await getPositionAccount(
			t,
			"m-correction-happy",
			"lender-a",
		);
		const treasuryAfter = await getTreasuryAccount(t, "m-correction-happy");
		expect(getPostedBalance(positionAfter!)).toBe(4500n);
		expect(getPostedBalance(treasuryAfter!)).toBe(5500n);
	});

	it("rejects correction with system source (requires source.type='user')", async () => {
		const t = createSharedTestHarness();
		const auth = asLedgerUser(t);
		await initCounter(auth);
		await mintAndIssue(auth, "m-correction-sys", "lender-a", 5000);

		const treasury = await getTreasuryAccount(t, "m-correction-sys");
		const position = await getPositionAccount(
			t,
			"m-correction-sys",
			"lender-a",
		);
		const originalEntry = await getOriginalEntry(
			t,
			"issue-m-correction-sys-lender-a",
		);

		try {
			await asAdmin(t).mutation(api.ledger.mutations.postCorrection, {
				mortgageId: "m-correction-sys",
				debitAccountId: treasury!._id,
				creditAccountId: position!._id,
				amount: 500,
				effectiveDate: "2026-01-15",
				idempotencyKey: "correction-sys-source",
				source: { type: "system" as const },
				causedBy: originalEntry!._id,
				reason: "test correction",
			});
			expect.fail("Should have thrown");
		} catch (error) {
			expect(getConvexErrorCode(error)).toBe("CORRECTION_REQUIRES_ADMIN");
		}
	});

	it("rejects correction with user source but no actor", async () => {
		const t = createSharedTestHarness();
		const auth = asLedgerUser(t);
		await initCounter(auth);
		await mintAndIssue(auth, "m-correction-no-actor", "lender-a", 5000);

		const treasury = await getTreasuryAccount(t, "m-correction-no-actor");
		const position = await getPositionAccount(
			t,
			"m-correction-no-actor",
			"lender-a",
		);
		const originalEntry = await getOriginalEntry(
			t,
			"issue-m-correction-no-actor-lender-a",
		);

		try {
			await asAdmin(t).mutation(api.ledger.mutations.postCorrection, {
				mortgageId: "m-correction-no-actor",
				debitAccountId: treasury!._id,
				creditAccountId: position!._id,
				amount: 500,
				effectiveDate: "2026-01-15",
				idempotencyKey: "correction-no-actor",
				source: { type: "user" as const },
				causedBy: originalEntry!._id,
				reason: "test correction",
			});
			expect.fail("Should have thrown");
		} catch (error) {
			expect(getConvexErrorCode(error)).toBe("CORRECTION_REQUIRES_ADMIN");
		}
	});

	it("rejects correction with empty reason", async () => {
		const t = createSharedTestHarness();
		const auth = asLedgerUser(t);
		await initCounter(auth);
		await mintAndIssue(auth, "m-correction-empty-reason", "lender-a", 5000);

		const treasury = await getTreasuryAccount(
			t,
			"m-correction-empty-reason",
		);
		const position = await getPositionAccount(
			t,
			"m-correction-empty-reason",
			"lender-a",
		);
		const originalEntry = await getOriginalEntry(
			t,
			"issue-m-correction-empty-reason-lender-a",
		);

		try {
			await asAdmin(t).mutation(api.ledger.mutations.postCorrection, {
				mortgageId: "m-correction-empty-reason",
				debitAccountId: treasury!._id,
				creditAccountId: position!._id,
				amount: 500,
				effectiveDate: "2026-01-15",
				idempotencyKey: "correction-empty-reason",
				source: ADMIN_SOURCE,
				causedBy: originalEntry!._id,
				reason: "",
			});
			expect.fail("Should have thrown");
		} catch (error) {
			expect(getConvexErrorCode(error)).toBe("CORRECTION_REQUIRES_REASON");
		}
	});

	it("idempotency: same idempotencyKey returns existing entry", async () => {
		const t = createSharedTestHarness();
		const auth = asLedgerUser(t);
		await initCounter(auth);
		await mintAndIssue(auth, "m-correction-idem", "lender-a", 5000);

		const treasury = await getTreasuryAccount(t, "m-correction-idem");
		const position = await getPositionAccount(
			t,
			"m-correction-idem",
			"lender-a",
		);
		const originalEntry = await getOriginalEntry(
			t,
			"issue-m-correction-idem-lender-a",
		);

		const correctionArgs = {
			mortgageId: "m-correction-idem",
			debitAccountId: treasury!._id,
			creditAccountId: position!._id,
			amount: 500,
			effectiveDate: "2026-01-15",
			idempotencyKey: "correction-idem",
			source: ADMIN_SOURCE,
			causedBy: originalEntry!._id,
			reason: "test correction",
		};

		const first = await asAdmin(t).mutation(
			api.ledger.mutations.postCorrection,
			correctionArgs,
		);

		const second = await asAdmin(t).mutation(
			api.ledger.mutations.postCorrection,
			correctionArgs,
		);

		expect(first._id).toBe(second._id);

		// Balance should reflect only one correction
		const positionAfter = await getPositionAccount(
			t,
			"m-correction-idem",
			"lender-a",
		);
		expect(getPostedBalance(positionAfter!)).toBe(4500n);
	});

	it("enforces min-fraction on corrected POSITION: leaves balance at 500 → rejected", async () => {
		const t = createSharedTestHarness();
		const auth = asLedgerUser(t);
		await initCounter(auth);
		await mintAndIssue(auth, "m-correction-minfrac", "lender-a", 5000);

		const treasury = await getTreasuryAccount(t, "m-correction-minfrac");
		const position = await getPositionAccount(
			t,
			"m-correction-minfrac",
			"lender-a",
		);
		const originalEntry = await getOriginalEntry(
			t,
			"issue-m-correction-minfrac-lender-a",
		);

		// Correct 4500 units away from A, leaving 500 (between 1 and 999) → MIN_FRACTION_VIOLATED
		try {
			await asAdmin(t).mutation(api.ledger.mutations.postCorrection, {
				mortgageId: "m-correction-minfrac",
				debitAccountId: treasury!._id,
				creditAccountId: position!._id,
				amount: 4500,
				effectiveDate: "2026-01-15",
				idempotencyKey: "correction-minfrac-reject",
				source: ADMIN_SOURCE,
				causedBy: originalEntry!._id,
				reason: "test min fraction",
			});
			expect.fail("Should have thrown");
		} catch (error) {
			expect(getConvexErrorCode(error)).toBe("MIN_FRACTION_VIOLATED");
		}
	});

	it("enforces min-fraction sell-all exception: leaves balance at exactly 0 → accepted", async () => {
		const t = createSharedTestHarness();
		const auth = asLedgerUser(t);
		await initCounter(auth);
		await mintAndIssue(auth, "m-correction-sellall", "lender-a", 5000);

		const treasury = await getTreasuryAccount(t, "m-correction-sellall");
		const position = await getPositionAccount(
			t,
			"m-correction-sellall",
			"lender-a",
		);
		const originalEntry = await getOriginalEntry(
			t,
			"issue-m-correction-sellall-lender-a",
		);

		// Correct all 5000 units away from A, leaving 0 → sell-all exception → accepted
		const result = await asAdmin(t).mutation(
			api.ledger.mutations.postCorrection,
			{
				mortgageId: "m-correction-sellall",
				debitAccountId: treasury!._id,
				creditAccountId: position!._id,
				amount: 5000,
				effectiveDate: "2026-01-15",
				idempotencyKey: "correction-sellall",
				source: ADMIN_SOURCE,
				causedBy: originalEntry!._id,
				reason: "test sell-all exception",
			},
		);

		expect(result.entryType).toBe("CORRECTION");
		const positionAfter = await getPositionAccount(
			t,
			"m-correction-sellall",
			"lender-a",
		);
		expect(getPostedBalance(positionAfter!)).toBe(0n);
	});
});
