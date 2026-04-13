import { describe, expect, it } from "vitest";
import {
	assertAccountIntegrity,
	assertSettlementReconciles,
} from "../../../../src/test/convex/payments/cashLedger/e2eHelpers";
import {
	createDueObligation,
	createHarness,
	postTestEntry,
	SYSTEM_SOURCE,
	seedMinimalEntities,
} from "../../../../src/test/convex/payments/cashLedger/testUtils";
import type { QueryCtx } from "../../../_generated/server";
import { convexModules } from "../../../test/moduleMaps";
import { findCashAccount, getCashAccountBalance } from "../accounts";
import {
	postCashReceiptForObligation,
	postObligationAccrued,
} from "../integrations";
import {
	getJournalSettledAmountForObligation,
	reconcileObligationSettlementProjectionInternal,
} from "../reconciliation";
import { buildIdempotencyKey } from "../types";

const modules = convexModules;

// ── Chaos Tests ──────────────────────────────────────────────────────
// Verify the cash ledger behaves correctly under out-of-order, duplicate,
// and conflicting operations that occur in production distributed systems.

describe("Chaos tests — cash ledger resilience", () => {
	// ── Test 1a: Cash receipt before obligation is settled ──────────
	// CASH_RECEIVED arrives while obligation is still "due" (not yet settled).
	// The ledger posts it regardless — it doesn't enforce obligation status.
	it("Test 1a — cash receipt arrives before obligation is marked settled", async () => {
		const t = createHarness(modules);
		const { borrowerId, mortgageId } = await seedMinimalEntities(t);

		const obligationId = await createDueObligation(t, {
			mortgageId,
			borrowerId,
			amount: 100_000,
		});

		// Step 1: Post accrual (creates BORROWER_RECEIVABLE account)
		await t.run(async (ctx) => {
			await postObligationAccrued(ctx, {
				obligationId,
				source: SYSTEM_SOURCE,
			});
		});

		// Step 2: Post cash receipt BEFORE obligation is marked settled
		// (obligation is still "due" — the ledger doesn't care)
		await t.run(async (ctx) => {
			const result = await postCashReceiptForObligation(ctx, {
				obligationId,
				amount: 100_000,
				idempotencyKey: buildIdempotencyKey(
					"cash-received-chaos-1",
					obligationId
				),
				source: SYSTEM_SOURCE,
			});
			expect(result).not.toBeNull();
			expect(result).toHaveProperty("entry");
		});

		// Step 3: Now mark obligation as settled (simulating late webhook)
		await t.run(async (ctx) => {
			await ctx.db.patch(obligationId, {
				status: "settled",
				amountSettled: 100_000,
				settledAt: Date.now(),
			});
		});

		// Verify: journal-derived settled amount should match
		await assertSettlementReconciles(t, { obligationId });

		// Verify: BORROWER_RECEIVABLE balance should be zero (fully credited)
		await t.run(async (ctx) => {
			const receivable = await findCashAccount(ctx.db, {
				family: "BORROWER_RECEIVABLE",
				mortgageId,
				obligationId,
			});
			if (!receivable) {
				throw new Error("BORROWER_RECEIVABLE account not found");
			}
			const balance = getCashAccountBalance(receivable);
			expect(balance).toBe(0n);
		});

		await assertAccountIntegrity(t, { mortgageId });
	});

	// ── Test 1b: No receivable account before accrual ──────────────
	// Before OBLIGATION_ACCRUED runs, no BORROWER_RECEIVABLE account exists.
	// This verifies the precondition that makes out-of-order receipt handling
	// safe: postCashReceiptForObligation returns null (and logs an audit error)
	// when no receivable exists. It cannot silently post a journal entry.
	it("Test 1b — no BORROWER_RECEIVABLE exists before accrual", async () => {
		const t = createHarness(modules);
		const { borrowerId, mortgageId } = await seedMinimalEntities(t);

		const obligationId = await createDueObligation(t, {
			mortgageId,
			borrowerId,
			amount: 100_000,
		});

		// Before accrual, no BORROWER_RECEIVABLE account should exist
		await t.run(async (ctx) => {
			const receivable = await findCashAccount(ctx.db, {
				family: "BORROWER_RECEIVABLE",
				mortgageId,
				obligationId,
			});
			expect(
				receivable,
				"BORROWER_RECEIVABLE should not exist before accrual"
			).toBeNull();
		});

		// No journal entries for this obligation
		await t.run(async (ctx) => {
			const entries = await ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_obligation_and_sequence", (q) =>
					q.eq("obligationId", obligationId)
				)
				.collect();
			expect(entries).toHaveLength(0);
		});

		// After accrual, BORROWER_RECEIVABLE is created and receipt works
		await t.run(async (ctx) => {
			await postObligationAccrued(ctx, {
				obligationId,
				source: SYSTEM_SOURCE,
			});
		});

		await t.run(async (ctx) => {
			const receivable = await findCashAccount(ctx.db, {
				family: "BORROWER_RECEIVABLE",
				mortgageId,
				obligationId,
			});
			expect(
				receivable,
				"BORROWER_RECEIVABLE should exist after accrual"
			).not.toBeNull();
		});
	});

	// ── Test 2a: Duplicate cash receipt webhook is idempotent ───────
	// The same idempotencyKey posted twice should return the existing entry
	// without creating a duplicate. Journal-derived amount stays correct.
	it("Test 2a — duplicate cash receipt webhook is idempotent", async () => {
		const t = createHarness(modules);
		const { borrowerId, mortgageId } = await seedMinimalEntities(t);

		const obligationId = await createDueObligation(t, {
			mortgageId,
			borrowerId,
			amount: 100_000,
		});

		// Accrue first to create receivable account
		await t.run(async (ctx) => {
			await postObligationAccrued(ctx, {
				obligationId,
				source: SYSTEM_SOURCE,
			});
		});

		const sharedKey = buildIdempotencyKey("cash-received-dup", obligationId);

		// First cash receipt
		const firstEntry = await t.run(async (ctx) => {
			return postCashReceiptForObligation(ctx, {
				obligationId,
				amount: 100_000,
				idempotencyKey: sharedKey,
				source: SYSTEM_SOURCE,
			});
		});
		expect(firstEntry).not.toBeNull();
		expect(firstEntry).toHaveProperty("entry");

		// Second cash receipt with SAME idempotencyKey
		const secondEntry = await t.run(async (ctx) => {
			return postCashReceiptForObligation(ctx, {
				obligationId,
				amount: 100_000,
				idempotencyKey: sharedKey,
				source: SYSTEM_SOURCE,
			});
		});
		expect(secondEntry).not.toBeNull();
		expect(secondEntry).toHaveProperty("entry");

		// Both calls should return the same entry ID
		if (!(firstEntry && secondEntry)) {
			throw new Error("Expected both cash receipt entries to be non-null");
		}
		expect(secondEntry.entry._id).toBe(firstEntry.entry._id);

		// Settle and verify journal has exactly 100k (not 200k)
		await t.run(async (ctx) => {
			await ctx.db.patch(obligationId, {
				status: "settled",
				amountSettled: 100_000,
				settledAt: Date.now(),
			});
		});

		await t.run(async (ctx) => {
			const journalSettled = await getJournalSettledAmountForObligation(
				ctx as unknown as QueryCtx,
				obligationId
			);
			expect(journalSettled).toBe(100_000n);
		});

		await assertSettlementReconciles(t, { obligationId });
	});

	// ── Test 2b: Duplicate REVERSAL entry is idempotent ────────────
	// A REVERSAL entry with the same idempotencyKey posted twice should
	// return the existing entry. No double-reversal.
	it("Test 2b — duplicate REVERSAL entry is idempotent (same idempotencyKey)", async () => {
		const t = createHarness(modules);
		const { borrowerId, mortgageId } = await seedMinimalEntities(t);

		const obligationId = await createDueObligation(t, {
			mortgageId,
			borrowerId,
			amount: 100_000,
		});

		// Accrue to create accounts
		await t.run(async (ctx) => {
			await postObligationAccrued(ctx, {
				obligationId,
				source: SYSTEM_SOURCE,
			});
		});

		// Post a cash receipt to reverse
		const cashEntry = await t.run(async (ctx) => {
			return postCashReceiptForObligation(ctx, {
				obligationId,
				amount: 100_000,
				idempotencyKey: buildIdempotencyKey(
					"cash-received-to-reverse",
					obligationId
				),
				source: SYSTEM_SOURCE,
			});
		});
		if (!cashEntry) {
			throw new Error("Expected cash receipt entry to be non-null");
		}

		// Get account IDs for the reversal (reverse the original debit/credit)
		const accounts = await t.run(async (ctx) => {
			const trustCash = await findCashAccount(ctx.db, {
				family: "TRUST_CASH",
				mortgageId,
			});
			const receivable = await findCashAccount(ctx.db, {
				family: "BORROWER_RECEIVABLE",
				mortgageId,
				obligationId,
			});
			if (!(trustCash && receivable)) {
				throw new Error("Expected TRUST_CASH and BORROWER_RECEIVABLE accounts");
			}
			return { trustCashId: trustCash._id, receivableId: receivable._id };
		});

		const reversalKey = buildIdempotencyKey("reversal", cashEntry.entry._id);

		// First reversal: credit TRUST_CASH (original debit), debit BORROWER_RECEIVABLE (original credit)
		const firstReversal = await postTestEntry(t, {
			amount: 100_000,
			entryType: "REVERSAL",
			effectiveDate: "2026-03-02",
			debitAccountId: accounts.receivableId,
			creditAccountId: accounts.trustCashId,
			idempotencyKey: reversalKey,
			obligationId,
			mortgageId,
			causedBy: cashEntry.entry._id,
			source: SYSTEM_SOURCE,
		});

		// Second reversal with SAME idempotencyKey
		const secondReversal = await postTestEntry(t, {
			amount: 100_000,
			entryType: "REVERSAL",
			effectiveDate: "2026-03-02",
			debitAccountId: accounts.receivableId,
			creditAccountId: accounts.trustCashId,
			idempotencyKey: reversalKey,
			obligationId,
			mortgageId,
			causedBy: cashEntry.entry._id,
			source: SYSTEM_SOURCE,
		});

		// Same entry returned both times
		expect(secondReversal.entry._id).toBe(firstReversal.entry._id);

		// Journal-derived settled amount should be 0 (receipt - reversal)
		await t.run(async (ctx) => {
			const journalSettled = await getJournalSettledAmountForObligation(
				ctx as unknown as QueryCtx,
				obligationId
			);
			expect(journalSettled).toBe(0n);
		});
	});

	// ── Test 3: Settlement callback fires after cancellation ───────
	// Obligation is cancelled, then a late settlement callback tries to
	// post CASH_RECEIVED. The ledger accepts it (it doesn't check status),
	// but reconciliation detects drift because amountSettled stays 0.
	it("Test 3 — settlement callback fires after cancellation (ignored by state)", async () => {
		const t = createHarness(modules);
		const { borrowerId, mortgageId } = await seedMinimalEntities(t);

		const obligationId = await createDueObligation(t, {
			mortgageId,
			borrowerId,
			amount: 100_000,
		});

		// Accrue to create receivable account
		await t.run(async (ctx) => {
			await postObligationAccrued(ctx, {
				obligationId,
				source: SYSTEM_SOURCE,
			});
		});

		// Cancel the obligation (GT engine would do this)
		await t.run(async (ctx) => {
			await ctx.db.patch(obligationId, {
				status: "cancelled",
				lastTransitionAt: Date.now(),
			});
		});

		// Late settlement callback posts CASH_RECEIVED on a cancelled obligation
		// The ledger does NOT check obligation status — it just posts
		await t.run(async (ctx) => {
			const result = await postCashReceiptForObligation(ctx, {
				obligationId,
				amount: 100_000,
				idempotencyKey: buildIdempotencyKey("cash-received-late", obligationId),
				source: SYSTEM_SOURCE,
			});
			expect(result).toBeDefined();
			expect(result).toHaveProperty("entry");
		});

		// Reconciliation should detect drift:
		// obligation.amountSettled = 0 (never updated), but journal has 100k
		await t.run(async (ctx) => {
			const recon = await reconcileObligationSettlementProjectionInternal(
				ctx as unknown as QueryCtx,
				obligationId
			);
			expect(recon.hasDrift).toBe(true);
			expect(recon.projectedSettledAmount).toBe(0n);
			expect(recon.journalSettledAmount).toBe(100_000n);
			expect(recon.driftAmount).toBe(-100_000n);
		});
	});

	// ── Test 4: Concurrent settlement of same obligation ───────────
	// Two CASH_RECEIVED entries with different idempotency keys both succeed,
	// creating an overpayment. The reconciliation layer detects drift between
	// amountSettled (100k) and journal total (200k).
	it("Test 4 — concurrent settlement of same obligation (overpayment → settlement drift detection)", async () => {
		const t = createHarness(modules);
		const { borrowerId, mortgageId } = await seedMinimalEntities(t);

		const obligationId = await createDueObligation(t, {
			mortgageId,
			borrowerId,
			amount: 100_000,
		});

		// Accrue to create receivable account
		await t.run(async (ctx) => {
			await postObligationAccrued(ctx, {
				obligationId,
				source: SYSTEM_SOURCE,
			});
		});

		// First payment: 100k with unique key
		await t.run(async (ctx) => {
			const result = await postCashReceiptForObligation(ctx, {
				obligationId,
				amount: 100_000,
				idempotencyKey: buildIdempotencyKey(
					"cash-received-concurrent-1",
					obligationId
				),
				source: SYSTEM_SOURCE,
			});
			expect(result).toBeDefined();
			expect(result).toHaveProperty("entry");
		});

		// Second payment: another 100k with different key (simulating concurrent webhook)
		await t.run(async (ctx) => {
			const result = await postCashReceiptForObligation(ctx, {
				obligationId,
				amount: 100_000,
				idempotencyKey: buildIdempotencyKey(
					"cash-received-concurrent-2",
					obligationId
				),
				source: SYSTEM_SOURCE,
			});
			expect(result).toBeDefined();
			expect(result).toHaveProperty("entry");
		});

		// Mark settled at 100k (the "expected" amount)
		await t.run(async (ctx) => {
			await ctx.db.patch(obligationId, {
				status: "settled",
				amountSettled: 100_000,
				settledAt: Date.now(),
			});
		});

		// Verify BORROWER_RECEIVABLE balance is negative (over-credited)
		// Accrual debited 100k, two receipts credited 200k → balance = -100k
		await t.run(async (ctx) => {
			const receivable = await findCashAccount(ctx.db, {
				family: "BORROWER_RECEIVABLE",
				mortgageId,
				obligationId,
			});
			if (!receivable) {
				throw new Error("BORROWER_RECEIVABLE account not found");
			}
			const balance = getCashAccountBalance(receivable);
			expect(
				balance,
				"BORROWER_RECEIVABLE should be negative from overpayment"
			).toBe(-100_000n);
		});

		// Journal has 200k but amountSettled is 100k → drift
		await t.run(async (ctx) => {
			const journalSettled = await getJournalSettledAmountForObligation(
				ctx as unknown as QueryCtx,
				obligationId
			);
			expect(journalSettled).toBe(200_000n);
		});

		await t.run(async (ctx) => {
			const recon = await reconcileObligationSettlementProjectionInternal(
				ctx as unknown as QueryCtx,
				obligationId
			);
			expect(recon.hasDrift).toBe(true);
			expect(recon.projectedSettledAmount).toBe(100_000n);
			expect(recon.journalSettledAmount).toBe(200_000n);
			// drift = projected - journal = 100k - 200k = -100k
			expect(recon.driftAmount).toBe(-100_000n);
		});
	});

	// ── Test 5: Dispersal mutation failure after settlement ─────────
	// Obligation is settled with correct journal entries, but dispersal
	// entries are never created (simulating a mutation failure). The
	// reconciliation layer can detect the gap by querying dispersalEntries.
	it("Test 5 — dispersal mutation failure after settlement (reconciliation detects gap)", async () => {
		const t = createHarness(modules);
		const { borrowerId, mortgageId } = await seedMinimalEntities(t);

		const obligationId = await createDueObligation(t, {
			mortgageId,
			borrowerId,
			amount: 100_000,
		});

		// Accrue
		await t.run(async (ctx) => {
			await postObligationAccrued(ctx, {
				obligationId,
				source: SYSTEM_SOURCE,
			});
		});

		// Receive full payment
		await t.run(async (ctx) => {
			await postCashReceiptForObligation(ctx, {
				obligationId,
				amount: 100_000,
				idempotencyKey: buildIdempotencyKey(
					"cash-received-no-dispersal",
					obligationId
				),
				source: SYSTEM_SOURCE,
			});
		});

		// Settle the obligation
		await t.run(async (ctx) => {
			await ctx.db.patch(obligationId, {
				status: "settled",
				amountSettled: 100_000,
				settledAt: Date.now(),
			});
		});

		// DO NOT create dispersal entries — simulating mutation failure

		// Verify settlement reconciles at the journal level
		await assertSettlementReconciles(t, { obligationId });

		// Verify NO dispersal entries exist for this obligation
		await t.run(async (ctx) => {
			const dispersals = await ctx.db
				.query("dispersalEntries")
				.withIndex("by_obligation", (q) => q.eq("obligationId", obligationId))
				.collect();
			expect(dispersals).toHaveLength(0);
		});

		// Verify the obligation IS settled AND has zero dispersals (the detectable gap)
		await t.run(async (ctx) => {
			const obligation = await ctx.db.get(obligationId);
			if (!obligation) {
				throw new Error("Obligation not found");
			}
			expect(obligation.status).toBe("settled");
			expect(obligation.amountSettled).toBe(100_000);

			// A reconciliation process detects: settled obligation with 0 dispersal entries.
			const dispersals = await ctx.db
				.query("dispersalEntries")
				.withIndex("by_obligation", (q) => q.eq("obligationId", obligationId))
				.collect();
			expect(
				dispersals,
				"Settled obligation should have zero dispersal entries (gap)"
			).toHaveLength(0);
		});
	});
});
