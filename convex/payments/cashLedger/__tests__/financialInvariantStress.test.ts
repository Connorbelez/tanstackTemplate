import { describe, expect, it } from "vitest";
import type { Doc } from "../../../_generated/dataModel";
import type { QueryCtx } from "../../../_generated/server";
import { getCashAccountBalance } from "../accounts";
import {
	postCashReceiptForObligation,
	postObligationAccrued,
} from "../integrations";
import { getJournalSettledAmountForObligation } from "../reconciliation";
import { buildIdempotencyKey } from "../types";
import {
	createDueObligation,
	createHarness,
	createTestAccount,
	postTestEntry,
	SYSTEM_SOURCE,
	seedMinimalEntities,
	type TestHarness,
} from "./testUtils";

const modules = import.meta.glob("/convex/**/*.ts");

type CashLedgerAccountDoc = Doc<"cash_ledger_accounts">;

const NEGATIVE_BALANCE_PATTERN = /negative.*balance|would result in negative/i;

// ══════════════════════════════════════════════════════════════════════
// Financial invariant stress tests
// ══════════════════════════════════════════════════════════════════════

describe("Financial invariant stress tests", () => {
	// ── Helper: seed allocation accounts ──────────────────────────
	async function seedAllocationAccounts(t: TestHarness) {
		const seeded = await seedMinimalEntities(t);
		const controlAccount = await createTestAccount(t, {
			family: "CONTROL",
			subaccount: "ALLOCATION",
		});
		const lenderPayableA = await createTestAccount(t, {
			family: "LENDER_PAYABLE",
			lenderId: seeded.lenderAId,
		});
		const lenderPayableB = await createTestAccount(t, {
			family: "LENDER_PAYABLE",
			lenderId: seeded.lenderBId,
		});
		const servicingRevenue = await createTestAccount(t, {
			family: "SERVICING_REVENUE",
		});

		return {
			...seeded,
			controlAccount,
			lenderPayableA,
			lenderPayableB,
			servicingRevenue,
		};
	}

	// ── T-010: Conservation holds after reversal + re-collection ──
	it("conservation holds after reversal and re-collection", async () => {
		const t = createHarness(modules);
		const { borrowerId, mortgageId } = await seedMinimalEntities(t);

		// 1. Create a due obligation
		const obligationId = await createDueObligation(t, {
			mortgageId,
			borrowerId,
			amount: 100_000,
		});

		// 2. Accrue the obligation (debits BORROWER_RECEIVABLE, credits CONTROL:ACCRUAL)
		await t.run(async (ctx) => {
			await postObligationAccrued(ctx, {
				obligationId,
				source: SYSTEM_SOURCE,
			});
		});

		// 3. Verify BORROWER_RECEIVABLE balance after accrual
		await t.run(async (ctx) => {
			const receivable = await ctx.db
				.query("cash_ledger_accounts")
				.withIndex("by_family_and_obligation", (q) =>
					q.eq("family", "BORROWER_RECEIVABLE").eq("obligationId", obligationId)
				)
				.first();
			if (!receivable) {
				throw new Error("BORROWER_RECEIVABLE account not found after accrual");
			}
			const balance = getCashAccountBalance(receivable);
			expect(balance, "BORROWER_RECEIVABLE after accrual").toBe(100_000n);
		});

		// 4. Receive full payment (debits TRUST_CASH, credits BORROWER_RECEIVABLE)
		await t.run(async (ctx) => {
			await postCashReceiptForObligation(ctx, {
				obligationId,
				amount: 100_000,
				idempotencyKey: buildIdempotencyKey(
					"cash-received",
					obligationId,
					"first"
				),
				source: SYSTEM_SOURCE,
			});
		});

		// 5. Verify BORROWER_RECEIVABLE is zero after full receipt
		await t.run(async (ctx) => {
			const receivable = await ctx.db
				.query("cash_ledger_accounts")
				.withIndex("by_family_and_obligation", (q) =>
					q.eq("family", "BORROWER_RECEIVABLE").eq("obligationId", obligationId)
				)
				.first();
			if (!receivable) {
				throw new Error("BORROWER_RECEIVABLE account not found after receipt");
			}
			const balance = getCashAccountBalance(receivable);
			expect(balance, "BORROWER_RECEIVABLE after full receipt").toBe(0n);
		});

		// 6. Post REVERSAL of the receipt (reverses the credit to BORROWER_RECEIVABLE)
		// Find the CASH_RECEIVED entry to reference as causedBy
		const receiptEntryId = await t.run(async (ctx) => {
			const entry = await ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_idempotency", (q) =>
					q.eq(
						"idempotencyKey",
						buildIdempotencyKey("cash-received", obligationId, "first")
					)
				)
				.first();
			if (!entry) {
				throw new Error("CASH_RECEIVED entry not found for reversal");
			}
			return entry._id;
		});

		// Get the accounts from the original receipt entry for the reversal
		const { debitAccountId: receiptDebitId, creditAccountId: receiptCreditId } =
			await t.run(async (ctx) => {
				const entry = await ctx.db.get(receiptEntryId);
				if (!entry) {
					throw new Error(
						"Receipt entry not found for reversal account lookup"
					);
				}
				return {
					debitAccountId: entry.debitAccountId,
					creditAccountId: entry.creditAccountId,
				};
			});

		// REVERSAL: swap debit/credit to undo the receipt
		await postTestEntry(t, {
			entryType: "REVERSAL",
			effectiveDate: "2026-03-01",
			amount: 100_000,
			debitAccountId: receiptCreditId,
			creditAccountId: receiptDebitId,
			idempotencyKey: buildIdempotencyKey(
				"reversal",
				obligationId,
				"receipt-reversal"
			),
			obligationId,
			causedBy: receiptEntryId,
			source: SYSTEM_SOURCE,
		});

		// 7. Verify BORROWER_RECEIVABLE is back to 100,000 after reversal
		await t.run(async (ctx) => {
			const receivable = await ctx.db
				.query("cash_ledger_accounts")
				.withIndex("by_family_and_obligation", (q) =>
					q.eq("family", "BORROWER_RECEIVABLE").eq("obligationId", obligationId)
				)
				.first();
			if (!receivable) {
				throw new Error("BORROWER_RECEIVABLE account not found after reversal");
			}
			const balance = getCashAccountBalance(receivable);
			expect(balance, "BORROWER_RECEIVABLE after reversal").toBe(100_000n);
		});

		// 8. Re-receive full payment
		await t.run(async (ctx) => {
			await postCashReceiptForObligation(ctx, {
				obligationId,
				amount: 100_000,
				idempotencyKey: buildIdempotencyKey(
					"cash-received",
					obligationId,
					"second"
				),
				source: SYSTEM_SOURCE,
			});
		});

		// 9. Verify BORROWER_RECEIVABLE is zero after re-collection
		await t.run(async (ctx) => {
			const receivable = await ctx.db
				.query("cash_ledger_accounts")
				.withIndex("by_family_and_obligation", (q) =>
					q.eq("family", "BORROWER_RECEIVABLE").eq("obligationId", obligationId)
				)
				.first();
			if (!receivable) {
				throw new Error(
					"BORROWER_RECEIVABLE account not found after re-collection"
				);
			}
			const balance = getCashAccountBalance(receivable);
			expect(balance, "BORROWER_RECEIVABLE after re-collection").toBe(0n);
		});

		// 10. Verify journal-derived settled amount matches net receipts
		// Net = 100k (first) - 100k (reversal) + 100k (second) = 100k
		await t.run(async (ctx) => {
			const journalSettled = await getJournalSettledAmountForObligation(
				ctx as unknown as QueryCtx,
				obligationId
			);
			expect(
				journalSettled,
				"Journal settled amount should match net receipts"
			).toBe(100_000n);
		});
	});

	// ── T-011: CONTROL:ALLOCATION nets to zero even with partial reversals ──
	it("CONTROL:ALLOCATION nets to zero even with partial reversals", async () => {
		const t = createHarness(modules);
		const accounts = await seedAllocationAccounts(t);

		const groupId = "allocation:stress-partial-reversal";

		// Post allocation group: 2 LENDER_PAYABLE_CREATED + 1 SERVICING_FEE_RECOGNIZED
		const entryA = await postTestEntry(t, {
			entryType: "LENDER_PAYABLE_CREATED",
			effectiveDate: "2026-03-01",
			amount: 30_000,
			debitAccountId: accounts.controlAccount._id,
			creditAccountId: accounts.lenderPayableA._id,
			idempotencyKey: buildIdempotencyKey("stress-alloc", "lenderA", "partial"),
			postingGroupId: groupId,
			source: SYSTEM_SOURCE,
		});

		const entryB = await postTestEntry(t, {
			entryType: "LENDER_PAYABLE_CREATED",
			effectiveDate: "2026-03-01",
			amount: 20_000,
			debitAccountId: accounts.controlAccount._id,
			creditAccountId: accounts.lenderPayableB._id,
			idempotencyKey: buildIdempotencyKey("stress-alloc", "lenderB", "partial"),
			postingGroupId: groupId,
			source: SYSTEM_SOURCE,
		});

		const entryFee = await postTestEntry(t, {
			entryType: "SERVICING_FEE_RECOGNIZED",
			effectiveDate: "2026-03-01",
			amount: 5000,
			debitAccountId: accounts.controlAccount._id,
			creditAccountId: accounts.servicingRevenue._id,
			idempotencyKey: buildIdempotencyKey("stress-alloc", "fee", "partial"),
			postingGroupId: groupId,
			source: SYSTEM_SOURCE,
		});

		// Verify all allocation entries are distinct
		const allocationIds = new Set([
			entryA.entry._id,
			entryB.entry._id,
			entryFee.entry._id,
		]);
		expect(
			allocationIds.size,
			"All allocation entries should be distinct"
		).toBe(3);

		// Post REVERSAL of ONE LENDER_PAYABLE_CREATED entry (partial reversal)
		// Reversal swaps debit/credit: credits CONTROL, debits LENDER_PAYABLE
		await postTestEntry(t, {
			entryType: "REVERSAL",
			effectiveDate: "2026-03-01",
			amount: 30_000,
			debitAccountId: accounts.lenderPayableA._id,
			creditAccountId: accounts.controlAccount._id,
			idempotencyKey: buildIdempotencyKey(
				"stress-reversal",
				"lenderA",
				"partial"
			),
			causedBy: entryA.entry._id,
			source: SYSTEM_SOURCE,
		});

		// Verify CONTROL has non-zero net (partial reversal)
		await t.run(async (ctx) => {
			const controlAccount = await ctx.db.get(accounts.controlAccount._id);
			if (!controlAccount) {
				throw new Error(
					"CONTROL:ALLOCATION account not found after partial reversal"
				);
			}
			const balance = getCashAccountBalance(
				controlAccount as CashLedgerAccountDoc
			);
			// Total debits to CONTROL: 30k + 20k + 5k = 55k
			// Total credits to CONTROL: 30k (reversal of lenderA)
			// CONTROL balance should be non-zero
			expect(
				balance,
				"CONTROL should have non-zero net after partial reversal"
			).not.toBe(0n);
		});

		// Post remaining REVERSALs to complete full reversal
		await postTestEntry(t, {
			entryType: "REVERSAL",
			effectiveDate: "2026-03-01",
			amount: 20_000,
			debitAccountId: accounts.lenderPayableB._id,
			creditAccountId: accounts.controlAccount._id,
			idempotencyKey: buildIdempotencyKey(
				"stress-reversal",
				"lenderB",
				"partial"
			),
			causedBy: entryB.entry._id,
			source: SYSTEM_SOURCE,
		});

		await postTestEntry(t, {
			entryType: "REVERSAL",
			effectiveDate: "2026-03-01",
			amount: 5000,
			debitAccountId: accounts.servicingRevenue._id,
			creditAccountId: accounts.controlAccount._id,
			idempotencyKey: buildIdempotencyKey("stress-reversal", "fee", "partial"),
			causedBy: entryFee.entry._id,
			source: SYSTEM_SOURCE,
		});

		// Verify CONTROL is back to zero after full reversal
		await t.run(async (ctx) => {
			const controlAccount = await ctx.db.get(accounts.controlAccount._id);
			if (!controlAccount) {
				throw new Error(
					"CONTROL:ALLOCATION account not found after full reversal"
				);
			}
			const balance = getCashAccountBalance(
				controlAccount as CashLedgerAccountDoc
			);
			expect(balance, "CONTROL should be zero after full reversal").toBe(0n);
		});
	});

	// ── T-012: No negative LENDER_PAYABLE outside active reversals ──
	it("no negative LENDER_PAYABLE outside active reversals", async () => {
		const t = createHarness(modules);
		await seedMinimalEntities(t);

		// Create LENDER_PAYABLE with initial balance
		const lenderPayable = await createTestAccount(t, {
			family: "LENDER_PAYABLE",
			initialCreditBalance: 50_000n,
		});

		// Create TRUST_CASH with initial balance
		const trustCash = await createTestAccount(t, {
			family: "TRUST_CASH",
			initialDebitBalance: 100_000n,
		});

		// Attempt LENDER_PAYOUT_SENT exceeding balance -> expect rejection
		await t.run(async (ctx) => {
			const { postCashEntryInternal } = await import("../postEntry");
			await expect(
				postCashEntryInternal(ctx, {
					entryType: "LENDER_PAYOUT_SENT",
					effectiveDate: "2026-03-01",
					amount: 60_000,
					debitAccountId: lenderPayable._id,
					creditAccountId: trustCash._id,
					idempotencyKey: buildIdempotencyKey(
						"stress-payout",
						"exceeding-balance"
					),
					source: SYSTEM_SOURCE,
				})
			).rejects.toThrow(NEGATIVE_BALANCE_PATTERN);
		});

		// Create a seed entry for REVERSAL reference
		const seedEntry = await postTestEntry(t, {
			entryType: "LENDER_PAYOUT_SENT",
			effectiveDate: "2026-03-01",
			amount: 10_000,
			debitAccountId: lenderPayable._id,
			creditAccountId: trustCash._id,
			idempotencyKey: buildIdempotencyKey("stress-payout", "seed-for-reversal"),
			source: SYSTEM_SOURCE,
		});

		// Post REVERSAL entry -> verify it succeeds even making LENDER_PAYABLE negative
		// After seed: LENDER_PAYABLE balance = 50k - 10k = 40k credits
		// REVERSAL of 60k debiting LENDER_PAYABLE: 40k - 60k = -20k
		// REVERSAL skips balance check, so this should succeed
		const reversalResult = await postTestEntry(t, {
			entryType: "REVERSAL",
			effectiveDate: "2026-03-01",
			amount: 60_000,
			debitAccountId: lenderPayable._id,
			creditAccountId: trustCash._id,
			idempotencyKey: buildIdempotencyKey("stress-reversal", "negative-ok"),
			causedBy: seedEntry.entry._id,
			source: SYSTEM_SOURCE,
		});

		expect(reversalResult.entry.entryType).toBe("REVERSAL");

		// Verify LENDER_PAYABLE balance is now negative
		await t.run(async (ctx) => {
			const account = await ctx.db.get(lenderPayable._id);
			if (!account) {
				throw new Error("LENDER_PAYABLE account not found after REVERSAL");
			}
			const balance = getCashAccountBalance(account as CashLedgerAccountDoc);
			expect(
				balance,
				"LENDER_PAYABLE should be negative after REVERSAL"
			).toBeLessThan(0n);
		});
	});

	// ── T-013: Point-in-time reconstruction matches running balances (50+ entries) ──
	it("point-in-time reconstruction matches running balances with 50+ entries", async () => {
		const t = createHarness(modules);
		await seedMinimalEntities(t);

		const controlAccount = await createTestAccount(t, {
			family: "CONTROL",
			subaccount: "ALLOCATION",
		});
		const lenderPayable = await createTestAccount(t, {
			family: "LENDER_PAYABLE",
		});
		const servicingRevenue = await createTestAccount(t, {
			family: "SERVICING_REVENUE",
		});

		// Post 50+ entries in a loop (alternating LENDER_PAYABLE_CREATED and SERVICING_FEE_RECOGNIZED)
		const ENTRY_COUNT = 52;
		for (let i = 0; i < ENTRY_COUNT; i++) {
			const isLenderEntry = i % 2 === 0;
			await postTestEntry(t, {
				entryType: isLenderEntry
					? "LENDER_PAYABLE_CREATED"
					: "SERVICING_FEE_RECOGNIZED",
				effectiveDate: "2026-03-01",
				amount: 1000 + i, // Vary amounts slightly for realism
				debitAccountId: controlAccount._id,
				creditAccountId: isLenderEntry
					? lenderPayable._id
					: servicingRevenue._id,
				idempotencyKey: buildIdempotencyKey("stress-pit", String(i)),
				source: SYSTEM_SOURCE,
			});
		}

		// After all entries posted, compare running cumulative balance with replayed balance
		await t.run(async (ctx) => {
			// Read running balance from the account
			const account = await ctx.db.get(controlAccount._id);
			if (!account) {
				throw new Error(
					"CONTROL account not found for point-in-time reconstruction"
				);
			}

			const runningCumulativeDebits = account.cumulativeDebits;
			const runningCumulativeCredits = account.cumulativeCredits;

			// Replay: query all journal entries touching CONTROL account
			const debits = await ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_debit_account_and_timestamp", (q) =>
					q.eq("debitAccountId", controlAccount._id)
				)
				.collect();
			const credits = await ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_credit_account_and_timestamp", (q) =>
					q.eq("creditAccountId", controlAccount._id)
				)
				.collect();

			// Sum debits and credits for CONTROL account from journal entries
			let replayedDebits = 0n;
			for (const entry of debits) {
				replayedDebits += entry.amount;
			}

			let replayedCredits = 0n;
			for (const entry of credits) {
				replayedCredits += entry.amount;
			}

			// Verify replayed totals match running cumulatives
			expect(
				replayedDebits,
				"Replayed debit total should match running cumulativeDebits"
			).toBe(runningCumulativeDebits);
			expect(
				replayedCredits,
				"Replayed credit total should match running cumulativeCredits"
			).toBe(runningCumulativeCredits);

			// Also verify the number of debit entries matches expected count
			expect(debits).toHaveLength(ENTRY_COUNT);
			expect(credits).toHaveLength(0); // CONTROL is only debited in this test
		});
	});

	// ── T-014: Idempotent replay produces identical state ──
	it("idempotent replay produces identical state", async () => {
		const t = createHarness(modules);
		await seedMinimalEntities(t);

		const controlAccount = await createTestAccount(t, {
			family: "CONTROL",
			subaccount: "ALLOCATION",
		});
		const lenderPayable = await createTestAccount(t, {
			family: "LENDER_PAYABLE",
		});
		// SERVICING_REVENUE not needed — T-014 only posts LENDER_PAYABLE_CREATED entries

		const ENTRY_COUNT = 10;
		const idempotencyKeys: string[] = [];
		const firstRunEntryIds: string[] = [];

		// First run: post 10 LENDER_PAYABLE_CREATED entries with known idempotencyKeys
		for (let i = 0; i < ENTRY_COUNT; i++) {
			const key = buildIdempotencyKey("stress-idempotent", String(i));
			idempotencyKeys.push(key);

			const result = await postTestEntry(t, {
				entryType: "LENDER_PAYABLE_CREATED",
				effectiveDate: "2026-03-01",
				amount: 5000,
				debitAccountId: controlAccount._id,
				creditAccountId: lenderPayable._id,
				idempotencyKey: key,
				source: SYSTEM_SOURCE,
			});

			firstRunEntryIds.push(result.entry._id);
		}

		// Snapshot the CONTROL account balance after first run
		const snapshotBalance = await t.run(async (ctx) => {
			const account = await ctx.db.get(controlAccount._id);
			expect(account).not.toBeNull();
			if (!account) {
				throw new Error("CONTROL account not found");
			}
			return {
				cumulativeDebits: account.cumulativeDebits,
				cumulativeCredits: account.cumulativeCredits,
			};
		});

		// Replay: post the SAME 10 entries (same idempotencyKeys)
		for (let i = 0; i < ENTRY_COUNT; i++) {
			const result = await postTestEntry(t, {
				entryType: "LENDER_PAYABLE_CREATED",
				effectiveDate: "2026-03-01",
				amount: 5000,
				debitAccountId: controlAccount._id,
				creditAccountId: lenderPayable._id,
				idempotencyKey: idempotencyKeys[i],
				source: SYSTEM_SOURCE,
			});

			// Verify replay returns the existing entry (same _id as first run)
			expect(
				result.entry._id,
				`Replay entry ${i} should return existing entry from first run`
			).toBe(firstRunEntryIds[i]);
		}

		// Verify CONTROL account balance unchanged after replay
		await t.run(async (ctx) => {
			const account = await ctx.db.get(controlAccount._id);
			if (!account) {
				throw new Error(
					"CONTROL account not found for idempotent replay verification"
				);
			}

			expect(
				account.cumulativeDebits,
				"cumulativeDebits should be unchanged after idempotent replay"
			).toBe(snapshotBalance.cumulativeDebits);
			expect(
				account.cumulativeCredits,
				"cumulativeCredits should be unchanged after idempotent replay"
			).toBe(snapshotBalance.cumulativeCredits);
		});
	});
});
