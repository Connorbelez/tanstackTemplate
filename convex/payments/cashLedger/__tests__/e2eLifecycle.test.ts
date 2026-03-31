import { describe, expect, it } from "vitest";
import type { Id } from "../../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../../_generated/server";
import { calculateProRataShares } from "../../../accrual/interestMath";
import { createDispersalEntries } from "../../../dispersal/createDispersalEntries";
import { convexModules } from "../../../test/moduleMaps";
import { findCashAccount, getCashAccountBalance } from "../accounts";
import {
	postCashCorrectionForEntry,
	postCashReceiptForObligation,
	postObligationAccrued,
	postObligationWaiver,
	postObligationWriteOff,
	postSettlementAllocation,
} from "../integrations";
import { postLenderPayout } from "../mutations";
import { getPostingGroupSummary } from "../postingGroups";
import {
	findNonZeroPostingGroups,
	getJournalSettledAmountForObligation,
	reconcileObligationSettlementProjectionInternal,
} from "../reconciliation";
import { buildIdempotencyKey } from "../types";
import {
	assertAccountIntegrity,
	assertObligationConservation,
	assertSettlementReconciles,
} from "./e2eHelpers.test-utils";
import {
	ADMIN_SOURCE,
	createDueObligation,
	createHarness,
	SYSTEM_SOURCE,
	seedMinimalEntities,
} from "./testUtils";

const modules = convexModules;

// ── Handler type casts ──────────────────────────────────────────────
// Internal mutations cannot be called directly in convex-test; we access
// their raw _handler instead.

interface DispersalEntry {
	amount: number;
	id: Id<"dispersalEntries">;
	lenderAccountId: Id<"ledger_accounts">;
	lenderId: Id<"lenders">;
	rawAmount: number;
	units: number;
}

interface DispersalResult {
	created: boolean;
	entries: DispersalEntry[];
	servicingFeeEntryId: Id<"servicingFeeEntries"> | null;
}

interface CreateDispersalEntriesHandler {
	_handler: (
		ctx: MutationCtx,
		args: {
			obligationId: Id<"obligations">;
			mortgageId: Id<"mortgages">;
			settledAmount: number;
			settledDate: string;
			idempotencyKey: string;
			source: typeof SYSTEM_SOURCE;
		}
	) => Promise<DispersalResult>;
}

interface PostLenderPayoutHandler {
	_handler: (
		ctx: MutationCtx,
		args: {
			mortgageId: Id<"mortgages">;
			lenderId: Id<"lenders">;
			amount: number;
			effectiveDate: string;
			idempotencyKey: string;
			source: typeof SYSTEM_SOURCE;
			reason?: string;
		}
	) => Promise<unknown>;
}

const createDispersalEntriesMutation =
	createDispersalEntries as unknown as CreateDispersalEntriesHandler;
const postLenderPayoutMutation =
	postLenderPayout as unknown as PostLenderPayoutHandler;

// ── Shared helpers ──────────────────────────────────────────────────

/** Runs dispersal + reads servicing fee in a single transaction. */
async function runDispersal(
	t: ReturnType<typeof createHarness>,
	ctx_args: {
		obligationId: Id<"obligations">;
		mortgageId: Id<"mortgages">;
		settledAmount: number;
		settledDate: string;
		idempotencyKey: string;
	}
): Promise<{ dispersal: DispersalResult; servicingFee: number }> {
	return t.run(async (ctx) => {
		const dispersal = await createDispersalEntriesMutation._handler(ctx, {
			...ctx_args,
			source: SYSTEM_SOURCE,
		});

		expect(dispersal.created).toBe(true);
		expect(dispersal.entries).toHaveLength(2);
		expect(dispersal.servicingFeeEntryId).not.toBeNull();

		const servicingFeeEntry = await ctx.db.get(
			dispersal.servicingFeeEntryId as Id<"servicingFeeEntries">
		);
		if (!servicingFeeEntry) {
			throw new Error(
				"servicingFeeEntry not found — dispersal did not create servicing fee record"
			);
		}

		return {
			dispersal,
			servicingFee: servicingFeeEntry.amount,
		};
	});
}

// ── E2E Lifecycle Tests ─────────────────────────────────────────────

describe("E2E lifecycle tests", () => {
	// ── Scenario 1: Happy Path ──────────────────────────────────────
	it("Scenario 1 — happy path: accrue -> receive -> allocate -> payout -> conservation", async () => {
		const t = createHarness(modules);
		const { borrowerId, mortgageId } = await seedMinimalEntities(t);

		// 1. Create a due obligation
		const obligationId = await createDueObligation(t, {
			mortgageId,
			borrowerId,
			amount: 100_000,
		});

		// 2. Accrue the obligation (posts OBLIGATION_ACCRUED)
		await t.run(async (ctx) => {
			await postObligationAccrued(ctx, {
				obligationId,
				source: SYSTEM_SOURCE,
			});
		});

		// 3. Receive full payment (posts CASH_RECEIVED)
		await t.run(async (ctx) => {
			await postCashReceiptForObligation(ctx, {
				obligationId,
				amount: 100_000,
				idempotencyKey: buildIdempotencyKey("cash-received", obligationId),
				source: SYSTEM_SOURCE,
			});
		});

		// 4. Settle the obligation
		await t.run(async (ctx) => {
			await ctx.db.patch(obligationId, {
				status: "settled",
				amountSettled: 100_000,
				settledAt: Date.now(),
			});
		});

		// 5. Create dispersal entries (computes 60/40 split + servicing fee)
		// Settlement allocation is posted internally by createDispersalEntries.
		const { dispersal } = await runDispersal(t, {
			obligationId,
			mortgageId,
			settledAmount: 100_000,
			settledDate: "2026-03-01",
			idempotencyKey: "e2e-happy-dispersal",
		});

		// 6. Post lender payouts
		await t.run(async (ctx) => {
			for (const entry of dispersal.entries) {
				await postLenderPayoutMutation._handler(ctx, {
					mortgageId,
					lenderId: entry.lenderId,
					amount: entry.amount,
					effectiveDate: "2026-03-02",
					idempotencyKey: buildIdempotencyKey(
						"e2e-happy-payout",
						entry.lenderId
					),
					source: SYSTEM_SOURCE,
				});
			}
		});

		// 8. Assert conservation: obligation amount = lender payables + servicing fee
		await assertObligationConservation(t, {
			obligationId,
			postingGroupId: `allocation:${obligationId}`,
		});

		// 9. Assert settlement reconciles: journal matches amountSettled
		await assertSettlementReconciles(t, { obligationId });

		// 10. Assert account integrity: no negative cumulative balances
		await assertAccountIntegrity(t, { mortgageId });

		// 11. Verify lender payable balances are zero after payouts
		await t.run(async (ctx) => {
			const payables = await ctx.db
				.query("cash_ledger_accounts")
				.withIndex("by_family", (q) => q.eq("family", "LENDER_PAYABLE"))
				.collect();

			for (const payable of payables) {
				const balance = getCashAccountBalance(payable);
				expect(
					balance,
					`Lender payable for lender=${payable.lenderId} should be zero after payout`
				).toBe(0n);
			}
		});
	});

	// ── Scenario 2: Partial Settlement ──────────────────────────────
	it("Scenario 2 — partial settlement: two cash receipts sum to full amount", async () => {
		const t = createHarness(modules);
		const { borrowerId, mortgageId } = await seedMinimalEntities(t);

		// 1. Create a due obligation for 100,000 cents
		const obligationId = await createDueObligation(t, {
			mortgageId,
			borrowerId,
			amount: 100_000,
		});

		// 2. Accrue the obligation
		await t.run(async (ctx) => {
			await postObligationAccrued(ctx, {
				obligationId,
				source: SYSTEM_SOURCE,
			});
		});

		// 3. First partial cash receipt: 60,000
		await t.run(async (ctx) => {
			await postCashReceiptForObligation(ctx, {
				obligationId,
				amount: 60_000,
				idempotencyKey: buildIdempotencyKey(
					"cash-received-partial-1",
					obligationId
				),
				source: SYSTEM_SOURCE,
			});
		});

		// 4. Second partial cash receipt: 40,000
		await t.run(async (ctx) => {
			await postCashReceiptForObligation(ctx, {
				obligationId,
				amount: 40_000,
				idempotencyKey: buildIdempotencyKey(
					"cash-received-partial-2",
					obligationId
				),
				source: SYSTEM_SOURCE,
			});
		});

		// 5. Mark obligation as settled
		await t.run(async (ctx) => {
			await ctx.db.patch(obligationId, {
				status: "settled",
				amountSettled: 100_000,
				settledAt: Date.now(),
			});
		});

		// 6. Verify journal-derived settled amount = 100,000
		await t.run(async (ctx) => {
			const journalSettled = await getJournalSettledAmountForObligation(
				ctx as unknown as QueryCtx,
				obligationId
			);
			expect(journalSettled).toBe(100_000n);
		});

		// 7. Assert settlement reconciles (journal matches amountSettled)
		await assertSettlementReconciles(t, { obligationId });

		// 8. Verify BORROWER_RECEIVABLE balance is zero (fully credited)
		await t.run(async (ctx) => {
			const receivable = await ctx.db
				.query("cash_ledger_accounts")
				.withIndex("by_family_and_obligation", (q) =>
					q.eq("family", "BORROWER_RECEIVABLE").eq("obligationId", obligationId)
				)
				.first();

			if (!receivable) {
				throw new Error("BORROWER_RECEIVABLE account not found");
			}

			// Debits from accrual = 100,000; Credits from two receipts = 60,000 + 40,000 = 100,000
			const balance = getCashAccountBalance(receivable);
			expect(
				balance,
				"BORROWER_RECEIVABLE should be zero after full payment"
			).toBe(0n);
		});

		// 9. Verify account integrity
		await assertAccountIntegrity(t, { mortgageId });
	});

	// ── Scenario 3: Multi-Lender Split ──────────────────────────────
	it("Scenario 3 — multi-lender split: 60/40 ownership produces correct payables and payouts", async () => {
		const t = createHarness(modules);
		const { borrowerId, lenderAId, lenderBId, mortgageId } =
			await seedMinimalEntities(t);

		// 1. Create a due obligation
		const obligationId = await createDueObligation(t, {
			mortgageId,
			borrowerId,
			amount: 100_000,
		});

		// 2. Accrue + receive full payment
		await t.run(async (ctx) => {
			await postObligationAccrued(ctx, {
				obligationId,
				source: SYSTEM_SOURCE,
			});
			await postCashReceiptForObligation(ctx, {
				obligationId,
				amount: 100_000,
				idempotencyKey: buildIdempotencyKey(
					"cash-received-split",
					obligationId
				),
				source: SYSTEM_SOURCE,
			});
		});

		// 3. Settle the obligation
		await t.run(async (ctx) => {
			await ctx.db.patch(obligationId, {
				status: "settled",
				amountSettled: 100_000,
				settledAt: Date.now(),
			});
		});

		// 4. Create dispersal entries — computes the 60/40 split
		const { dispersal, servicingFee } = await runDispersal(t, {
			obligationId,
			mortgageId,
			settledAmount: 100_000,
			settledDate: "2026-03-01",
			idempotencyKey: "e2e-split-dispersal",
		});

		// Extract lender-specific amounts
		const lenderAEntry = dispersal.entries.find(
			(e) => e.lenderId === lenderAId
		);
		const lenderBEntry = dispersal.entries.find(
			(e) => e.lenderId === lenderBId
		);
		if (!(lenderAEntry && lenderBEntry)) {
			throw new Error(
				"Dispersal did not produce expected lender entries — cannot continue test"
			);
		}

		const lenderAAmount = lenderAEntry.amount;
		const lenderBAmount = lenderBEntry.amount;

		// Verify exact 60/40 split using the same largest-remainder algorithm
		// as the production dispersal engine (calculateProRataShares).
		const netAmount = 100_000 - servicingFee;
		const expectedShares = calculateProRataShares(
			[
				{
					lenderId: lenderAId,
					lenderAccountId: lenderAEntry.lenderAccountId,
					units: 6000,
				},
				{
					lenderId: lenderBId,
					lenderAccountId: lenderBEntry.lenderAccountId,
					units: 4000,
				},
			],
			netAmount
		);
		const expectedLenderA =
			expectedShares.find((s) => s.lenderId === lenderAId)?.amount ?? 0;
		const expectedLenderB =
			expectedShares.find((s) => s.lenderId === lenderBId)?.amount ?? 0;
		expect(lenderAAmount).toBe(expectedLenderA);
		expect(lenderBAmount).toBe(expectedLenderB);

		// Conservation: lender amounts + fee = obligation amount
		expect(lenderAAmount + lenderBAmount + servicingFee).toBe(100_000);

		// 5. Settlement allocation already posted by createDispersalEntries (inside runDispersal)

		// 6. Verify each lender's LENDER_PAYABLE balance matches their amount
		await t.run(async (ctx) => {
			const lenderAPayable = await ctx.db
				.query("cash_ledger_accounts")
				.withIndex("by_family_and_mortgage_and_lender", (q) =>
					q
						.eq("family", "LENDER_PAYABLE")
						.eq("mortgageId", mortgageId)
						.eq("lenderId", lenderAId)
				)
				.first();

			const lenderBPayable = await ctx.db
				.query("cash_ledger_accounts")
				.withIndex("by_family_and_mortgage_and_lender", (q) =>
					q
						.eq("family", "LENDER_PAYABLE")
						.eq("mortgageId", mortgageId)
						.eq("lenderId", lenderBId)
				)
				.first();

			if (!(lenderAPayable && lenderBPayable)) {
				throw new Error("LENDER_PAYABLE accounts not found for both lenders");
			}

			const balanceA = getCashAccountBalance(lenderAPayable);
			const balanceB = getCashAccountBalance(lenderBPayable);

			expect(balanceA).toBe(BigInt(lenderAAmount));
			expect(balanceB).toBe(BigInt(lenderBAmount));
		});

		// 7. Post lender payouts for both lenders
		await t.run(async (ctx) => {
			await postLenderPayoutMutation._handler(ctx, {
				mortgageId,
				lenderId: lenderAId,
				amount: lenderAAmount,
				effectiveDate: "2026-03-02",
				idempotencyKey: buildIdempotencyKey("e2e-split-payout", lenderAId),
				source: SYSTEM_SOURCE,
			});
			await postLenderPayoutMutation._handler(ctx, {
				mortgageId,
				lenderId: lenderBId,
				amount: lenderBAmount,
				effectiveDate: "2026-03-02",
				idempotencyKey: buildIdempotencyKey("e2e-split-payout", lenderBId),
				source: SYSTEM_SOURCE,
			});
		});

		// 8. Verify both lender payable balances are zero after payouts
		await t.run(async (ctx) => {
			const payables = await ctx.db
				.query("cash_ledger_accounts")
				.withIndex("by_family", (q) => q.eq("family", "LENDER_PAYABLE"))
				.collect();

			expect(payables).toHaveLength(2);
			for (const payable of payables) {
				const balance = getCashAccountBalance(payable);
				expect(
					balance,
					`Lender payable for lender=${payable.lenderId} should be zero after payout`
				).toBe(0n);
			}
		});

		// 9. Assert obligation conservation: lender payables + fee = obligation amount
		await assertObligationConservation(t, {
			obligationId,
			postingGroupId: `allocation:${obligationId}`,
		});

		// 10. Assert settlement reconciles: journal matches amountSettled
		await assertSettlementReconciles(t, { obligationId });

		// 11. Assert account integrity: no negative cumulative balances
		await assertAccountIntegrity(t, { mortgageId });
	});

	// ── Scenario 4: Reversal (SKIP) ────────────────────────────────
	it.skip("Scenario 4 — reversal: settled cash receipt reversed, payables reversed", () => {
		// Depends on ENG-172: postPaymentReversalCascade not yet implemented
		// When implemented:
		// 1. Full lifecycle (accrue → receive → allocate)
		// 2. Call postPaymentReversalCascade(ctx, { originalAttemptId })
		// 3. Verify BORROWER_RECEIVABLE balance reverts to outstanding
		// 4. Verify getJournalSettledAmountForObligation reflects reversal
		// 5. Verify LENDER_PAYABLE balances reversed
	});

	// ── Scenario 5: Reversal after payout / clawback (SKIP) ────────
	it.skip("Scenario 5 — reversal after payout: clawback entry created", () => {
		// Depends on ENG-172: postPaymentReversalCascade not yet implemented
		// When implemented:
		// 1. Full lifecycle including payout
		// 2. Call postPaymentReversalCascade
		// 3. Verify LENDER_PAYABLE goes negative (clawback receivable)
	});

	// ── Scenario 6: Admin Correction ───────────────────────────────
	it("Scenario 6 — admin correction: wrong cash receipt reversed and replaced", async () => {
		const t = createHarness(modules);
		const { borrowerId, mortgageId } = await seedMinimalEntities(t);

		// 1. Create a due obligation for 100,000 cents
		const obligationId = await createDueObligation(t, {
			mortgageId,
			borrowerId,
			amount: 100_000,
		});

		// 2. Accrue the obligation
		await t.run(async (ctx) => {
			await postObligationAccrued(ctx, {
				obligationId,
				source: SYSTEM_SOURCE,
			});
		});

		// 3. Post cash receipt with WRONG amount (110,000 instead of 100,000 — overpayment)
		const wrongReceiptResult = await t.run(async (ctx) => {
			return postCashReceiptForObligation(ctx, {
				obligationId,
				amount: 110_000,
				idempotencyKey: buildIdempotencyKey(
					"cash-received-wrong",
					obligationId
				),
				source: SYSTEM_SOURCE,
			});
		});

		if (!wrongReceiptResult) {
			throw new Error(
				"postCashReceiptForObligation returned null unexpectedly"
			);
		}
		const wrongEntryId = wrongReceiptResult.entry._id;

		// 4. Verify the BORROWER_RECEIVABLE balance reflects the wrong amount
		// Accrual debited 100k, wrong receipt credited 110k → balance = 100k - 110k = -10k
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
			expect(balance, "BORROWER_RECEIVABLE before correction").toBe(-10_000n);
		});

		// 5. Load the wrong entry's accounts for the replacement
		const { trustCashAccountId, receivableAccountId } = await t.run(
			async (ctx) => {
				const wrongEntry = await ctx.db.get(wrongEntryId);
				expect(wrongEntry).not.toBeNull();
				if (!wrongEntry) {
					throw new Error("Wrong entry not found");
				}
				return {
					trustCashAccountId: wrongEntry.debitAccountId,
					receivableAccountId: wrongEntry.creditAccountId,
				};
			}
		);

		// 6. Call postCashCorrectionForEntry to reverse the wrong entry and post replacement
		const correctionResult = await t.run(async (ctx) => {
			return postCashCorrectionForEntry(ctx, {
				originalEntryId: wrongEntryId,
				reason: "Incorrect amount — should be 100,000 not 110,000",
				source: ADMIN_SOURCE,
				replacement: {
					amount: 100_000,
					debitAccountId: trustCashAccountId,
					creditAccountId: receivableAccountId,
					entryType: "CASH_RECEIVED",
				},
			});
		});

		// 7. Verify correction produced both reversal and replacement entries
		expect(correctionResult.reversalEntry).not.toBeNull();
		expect(correctionResult.replacementEntry).not.toBeNull();

		// 8. Verify BORROWER_RECEIVABLE net balance reflects the correction
		// Accrual debit 100k, wrong receipt credit 110k, reversal debit 110k, replacement credit 100k
		// net debits = 100k + 110k = 210k, net credits = 110k + 100k = 210k → balance = 0
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
				"BORROWER_RECEIVABLE should be zero after correction with correct amount"
			).toBe(0n);
		});

		// 9. Assert account integrity
		await assertAccountIntegrity(t, { mortgageId });
	});

	// ── Scenario 7: Partial Waiver ─────────────────────────────────
	it("Scenario 7 — partial waiver: 30k waived, remaining 70k collectible", async () => {
		const t = createHarness(modules);
		const { borrowerId, mortgageId } = await seedMinimalEntities(t);

		// 1. Create a due obligation for 100,000 cents
		const obligationId = await createDueObligation(t, {
			mortgageId,
			borrowerId,
			amount: 100_000,
		});

		// 2. Accrue the obligation (BORROWER_RECEIVABLE debit = 100,000)
		await t.run(async (ctx) => {
			await postObligationAccrued(ctx, {
				obligationId,
				source: SYSTEM_SOURCE,
			});
		});

		// 3. Waive 30,000 cents
		await t.run(async (ctx) => {
			await postObligationWaiver(ctx, {
				obligationId,
				amount: 30_000,
				reason: "Partial waiver — borrower hardship",
				idempotencyKey: buildIdempotencyKey("waiver", obligationId),
				source: ADMIN_SOURCE,
				outstandingBefore: 100_000,
				outstandingAfter: 70_000,
				isFullWaiver: false,
			});
		});

		// 4. Verify BORROWER_RECEIVABLE balance reduced by 30,000 (net = 70,000)
		// Accrual debit 100k, waiver credit 30k → debit-normal balance = 100k - 30k = 70k
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
				"BORROWER_RECEIVABLE should be 70,000 after 30k waiver"
			).toBe(70_000n);
		});

		// 5. Verify CONTROL:WAIVER balance = 30,000
		// postObligationWaiver debits CONTROL:WAIVER → debit-normal balance = 30k - 0 = 30k
		await t.run(async (ctx) => {
			const waiverControl = await findCashAccount(ctx.db, {
				family: "CONTROL",
				mortgageId,
				obligationId,
				subaccount: "WAIVER",
			});
			if (!waiverControl) {
				throw new Error("CONTROL:WAIVER account not found");
			}
			const balance = getCashAccountBalance(waiverControl);
			expect(balance, "CONTROL:WAIVER should be 30,000").toBe(30_000n);
		});

		// 6. Post cash receipt for remaining 70,000 to prove it's still collectible
		await t.run(async (ctx) => {
			await postCashReceiptForObligation(ctx, {
				obligationId,
				amount: 70_000,
				idempotencyKey: buildIdempotencyKey(
					"cash-received-after-waiver",
					obligationId
				),
				source: SYSTEM_SOURCE,
			});
		});

		// 7. Verify BORROWER_RECEIVABLE is zero after collecting remaining amount
		// Accrual debit 100k, waiver credit 30k, receipt credit 70k → 100k - 100k = 0
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
				"BORROWER_RECEIVABLE should be zero after waiver + receipt"
			).toBe(0n);
		});

		// 8. Assert account integrity
		await assertAccountIntegrity(t, { mortgageId });
	});

	// ── Scenario 8: Full Write-Off ─────────────────────────────────
	it("Scenario 8 — full write-off: entire obligation written off", async () => {
		const t = createHarness(modules);
		const { borrowerId, mortgageId } = await seedMinimalEntities(t);

		// 1. Create a due obligation for 100,000 cents
		const obligationId = await createDueObligation(t, {
			mortgageId,
			borrowerId,
			amount: 100_000,
		});

		// 2. Accrue the obligation
		await t.run(async (ctx) => {
			await postObligationAccrued(ctx, {
				obligationId,
				source: SYSTEM_SOURCE,
			});
		});

		// 3. Write off the full 100,000
		await t.run(async (ctx) => {
			await postObligationWriteOff(ctx, {
				obligationId,
				amount: 100_000,
				reason: "Full write-off",
				idempotencyKey: buildIdempotencyKey("write-off", obligationId),
				source: ADMIN_SOURCE,
			});
		});

		// 4. Verify WRITE_OFF account balance = 100,000
		// postObligationWriteOff debits WRITE_OFF → debit-normal balance = 100k - 0 = 100k
		await t.run(async (ctx) => {
			const writeOffAccount = await findCashAccount(ctx.db, {
				family: "WRITE_OFF",
				mortgageId,
				obligationId,
			});
			if (!writeOffAccount) {
				throw new Error("WRITE_OFF account not found");
			}
			const balance = getCashAccountBalance(writeOffAccount);
			expect(balance, "WRITE_OFF should be 100,000").toBe(100_000n);
		});

		// 5. Verify BORROWER_RECEIVABLE net balance = 0
		// Accrual debit 100k, write-off credit 100k → 100k - 100k = 0
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
				"BORROWER_RECEIVABLE should be zero after full write-off"
			).toBe(0n);
		});

		// 6. Assert account integrity
		await assertAccountIntegrity(t, { mortgageId });
	});

	// ── Financial Conservation Invariants ──────────────────────────
	describe("financial conservation invariants", () => {
		// ── Shared lifecycle runner ────────────────────────────────
		// Each conservation test needs a complete lifecycle. This helper
		// runs: seed → accrue → receive → settle → dispersal → allocation → payouts
		// and returns all the ids/amounts needed for assertions.
		async function runFullLifecycle() {
			const t = createHarness(modules);
			const { borrowerId, lenderAId, lenderBId, mortgageId } =
				await seedMinimalEntities(t);

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
						"cash-received-conservation",
						obligationId
					),
					source: SYSTEM_SOURCE,
				});
			});

			// Settle
			await t.run(async (ctx) => {
				await ctx.db.patch(obligationId, {
					status: "settled",
					amountSettled: 100_000,
					settledAt: Date.now(),
				});
			});

			// Dispersal
			const { dispersal, servicingFee } = await runDispersal(t, {
				obligationId,
				mortgageId,
				settledAmount: 100_000,
				settledDate: "2026-03-01",
				idempotencyKey: "conservation-dispersal",
			});

			// Settlement allocation already posted by createDispersalEntries (inside runDispersal)

			// Lender payouts
			await t.run(async (ctx) => {
				for (const entry of dispersal.entries) {
					await postLenderPayoutMutation._handler(ctx, {
						mortgageId,
						lenderId: entry.lenderId,
						amount: entry.amount,
						effectiveDate: "2026-03-02",
						idempotencyKey: buildIdempotencyKey(
							"conservation-payout",
							entry.lenderId
						),
						source: SYSTEM_SOURCE,
					});
				}
			});

			return {
				t,
				obligationId,
				mortgageId,
				borrowerId,
				lenderAId,
				lenderBId,
				dispersal,
				servicingFee,
			};
		}

		// ── T-016: settled = dispersals + servicing fee ────────────
		it("T-016 — per obligation: settled amount = dispersals + servicing fee", async () => {
			const { t, obligationId } = await runFullLifecycle();

			await t.run(async (ctx) => {
				const postingGroupId = `allocation:${obligationId}`;
				const summary = await getPostingGroupSummary(ctx, postingGroupId);

				let lenderPayableTotal = 0n;
				let servicingFeeTotal = 0n;

				for (const entry of summary.entries) {
					if (entry.entryType === "LENDER_PAYABLE_CREATED") {
						lenderPayableTotal += entry.amount;
					} else if (entry.entryType === "SERVICING_FEE_RECOGNIZED") {
						servicingFeeTotal += entry.amount;
					}
				}

				const obligation = await ctx.db.get(obligationId);
				if (!obligation) {
					throw new Error(`Obligation ${obligationId} not found`);
				}

				const obligationAmount = BigInt(obligation.amount);
				const dispersedTotal = lenderPayableTotal + servicingFeeTotal;

				expect(
					dispersedTotal,
					"SUM(LENDER_PAYABLE_CREATED) + SERVICING_FEE_RECOGNIZED must equal obligation.amount"
				).toBe(obligationAmount);
			});
		});

		// ── T-017: CONTROL:ALLOCATION behavior after allocation ───
		it("T-017 — CONTROL:ALLOCATION is non-zero after settlement allocation (tracks total allocated)", async () => {
			const { t, obligationId } = await runFullLifecycle();

			await t.run(async (ctx) => {
				const result = await findNonZeroPostingGroups(
					ctx as unknown as QueryCtx
				);

				// The settlement allocation implementation only debits CONTROL:ALLOCATION
				// (no credits), so the account balance is non-zero by design.
				// CONTROL:ALLOCATION tracks total allocated amount.
				const ourAlerts = result.alerts.filter(
					(a) => a.obligationId === obligationId
				);
				expect(
					ourAlerts.length,
					"Expected at least one CONTROL:ALLOCATION alert for our obligation"
				).toBeGreaterThan(0);
				for (const alert of ourAlerts) {
					// Non-zero is expected — the balance equals the obligation amount
					expect(alert.controlAllocationBalance).toBeGreaterThan(0n);
				}

				// No orphaned allocation accounts
				expect(
					result.orphaned,
					"No orphaned CONTROL:ALLOCATION accounts"
				).toHaveLength(0);
			});

			// The real conservation invariant: dispersed total === obligation amount
			await assertObligationConservation(t, {
				obligationId,
				postingGroupId: `allocation:${obligationId}`,
			});
		});

		// ── T-018: No negative LENDER_PAYABLE outside reversals ───
		it("T-018 — no negative LENDER_PAYABLE balances after full payouts", async () => {
			const { t } = await runFullLifecycle();

			await t.run(async (ctx) => {
				const accounts = await ctx.db
					.query("cash_ledger_accounts")
					.withIndex("by_family", (q) => q.eq("family", "LENDER_PAYABLE"))
					.collect();

				expect(accounts.length).toBeGreaterThan(0);

				for (const account of accounts) {
					const balance = getCashAccountBalance(account);
					expect(
						balance,
						`LENDER_PAYABLE for lender=${account.lenderId} must be >= 0`
					).toBeGreaterThanOrEqual(0n);
				}
			});
		});

		// ── T-019: Point-in-time reconstruction matches running balances ──
		it("T-019 — journal reconstruction matches obligation.amountSettled (no drift)", async () => {
			const { t, obligationId } = await runFullLifecycle();

			await t.run(async (ctx) => {
				const result = await reconcileObligationSettlementProjectionInternal(
					ctx as unknown as QueryCtx,
					obligationId
				);

				expect(
					result.hasDrift,
					"No drift between journal and obligation.amountSettled"
				).toBe(false);
				expect(result.driftAmount).toBe(0n);
				expect(result.projectedSettledAmount).toBe(100_000n);
				expect(result.journalSettledAmount).toBe(100_000n);
			});
		});

		// ── T-020: Idempotent replay produces same state ──────────
		it("T-020 — idempotent replay: re-posting with same keys does not change balances", async () => {
			const { t, obligationId, mortgageId, dispersal, servicingFee } =
				await runFullLifecycle();

			// Capture journal entry count BEFORE replay
			const journalCountBefore = await t.run(async (ctx) => {
				const entries = await ctx.db
					.query("cash_ledger_journal_entries")
					.withIndex("by_obligation_and_sequence", (q) =>
						q.eq("obligationId", obligationId)
					)
					.collect();
				return entries.length;
			});

			// Capture all account balances BEFORE replay
			const balancesBefore = await t.run(async (ctx) => {
				const accounts = await ctx.db
					.query("cash_ledger_accounts")
					.withIndex("by_mortgage", (q) => q.eq("mortgageId", mortgageId))
					.collect();

				return accounts.map((a) => ({
					id: a._id,
					family: a.family,
					subaccount: a.subaccount,
					cumulativeDebits: a.cumulativeDebits,
					cumulativeCredits: a.cumulativeCredits,
				}));
			});

			// Re-post accrual (same idempotency key)
			await t.run(async (ctx) => {
				await postObligationAccrued(ctx, {
					obligationId,
					source: SYSTEM_SOURCE,
				});
			});

			// Re-post cash receipt (same idempotency key)
			await t.run(async (ctx) => {
				await postCashReceiptForObligation(ctx, {
					obligationId,
					amount: 100_000,
					idempotencyKey: buildIdempotencyKey(
						"cash-received-conservation",
						obligationId
					),
					source: SYSTEM_SOURCE,
				});
			});

			// Re-post settlement allocation (same idempotency keys)
			await t.run(async (ctx) => {
				await postSettlementAllocation(ctx, {
					obligationId,
					mortgageId,
					settledDate: "2026-03-01",
					servicingFee,
					entries: dispersal.entries.map((e) => ({
						dispersalEntryId: e.id,
						lenderId: e.lenderId,
						amount: e.amount,
					})),
					source: SYSTEM_SOURCE,
				});
			});

			// Re-post lender payouts (same idempotency keys)
			await t.run(async (ctx) => {
				for (const entry of dispersal.entries) {
					await postLenderPayoutMutation._handler(ctx, {
						mortgageId,
						lenderId: entry.lenderId,
						amount: entry.amount,
						effectiveDate: "2026-03-02",
						idempotencyKey: buildIdempotencyKey(
							"conservation-payout",
							entry.lenderId
						),
						source: SYSTEM_SOURCE,
					});
				}
			});

			// Verify balances are unchanged after replay
			await t.run(async (ctx) => {
				const accountsAfter = await ctx.db
					.query("cash_ledger_accounts")
					.withIndex("by_mortgage", (q) => q.eq("mortgageId", mortgageId))
					.collect();

				expect(
					accountsAfter.length,
					"Account count should not change after replay"
				).toBe(balancesBefore.length);

				for (const before of balancesBefore) {
					const after = accountsAfter.find((a) => a._id === before.id);
					if (!after) {
						throw new Error(
							`Account ${before.id} (${before.family}:${before.subaccount ?? ""}) disappeared after replay`
						);
					}

					expect(
						after.cumulativeDebits,
						`Debits unchanged for ${before.family}:${before.subaccount ?? ""}`
					).toBe(before.cumulativeDebits);
					expect(
						after.cumulativeCredits,
						`Credits unchanged for ${before.family}:${before.subaccount ?? ""}`
					).toBe(before.cumulativeCredits);
				}
			});

			// Verify no duplicate journal entries were created
			await t.run(async (ctx) => {
				const entries = await ctx.db
					.query("cash_ledger_journal_entries")
					.withIndex("by_obligation_and_sequence", (q) =>
						q.eq("obligationId", obligationId)
					)
					.collect();
				expect(
					entries.length,
					"Journal entry count should not change after idempotent replay"
				).toBe(journalCountBefore);
			});
		});
	});
});
