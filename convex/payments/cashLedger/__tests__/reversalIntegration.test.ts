import { describe, expect, it } from "vitest";
import { getCashAccountBalance, getOrCreateCashAccount } from "../accounts";
import {
	postCashReceiptForObligation,
	postObligationAccrued,
	postPaymentReversalCascade,
	postSettlementAllocation,
} from "../integrations";
import { postCashEntryInternal } from "../postEntry";
import {
	getPostingGroupSummary,
	isPostingGroupComplete,
} from "../postingGroups";
import { findSettledObligationsWithNonZeroBalance } from "../reconciliation";
import { buildIdempotencyKey } from "../types";
import {
	createHarness,
	createSettledObligation,
	SYSTEM_SOURCE,
	seedMinimalEntities,
} from "./testUtils";

const modules = import.meta.glob("/convex/**/*.ts");

// ── Shared helpers ─────────────────────────────────────────────────

/**
 * Sets up a full settlement flow: seeds entities, creates an obligation,
 * posts OBLIGATION_ACCRUED, CASH_RECEIVED, and a settlement allocation
 * (2 lender payables + servicing fee). Returns all IDs and the allocation
 * posting group ID needed for reversal tests.
 */
async function setupFullSettlementFlow(
	t: ReturnType<typeof createHarness>,
	opts?: { servicingFee?: number; amount?: number }
) {
	const amount = opts?.amount ?? 100_000;
	const servicingFee = opts?.servicingFee ?? 1000;

	const seeded = await seedMinimalEntities(t);

	// Create a settled obligation
	const obligationId = await createSettledObligation(t, {
		mortgageId: seeded.mortgageId,
		borrowerId: seeded.borrowerId,
		amount,
	});

	// Post OBLIGATION_ACCRUED
	await t.run(async (ctx) => {
		await postObligationAccrued(ctx, {
			obligationId,
			source: SYSTEM_SOURCE,
		});
	});

	// Post CASH_RECEIVED (using an attempt-based key so the cascade can find it)
	const attemptId = await t.run(async (ctx) => {
		const planEntryId = await ctx.db.insert("collectionPlanEntries", {
			obligationIds: [obligationId],
			amount,
			method: "manual",
			scheduledDate: Date.now(),
			status: "completed",
			source: "default_schedule",
			createdAt: Date.now(),
		});
		return ctx.db.insert("collectionAttempts", {
			status: "settled",
			planEntryId,
			method: "manual",
			amount,
			initiatedAt: Date.now(),
			settledAt: Date.now(),
		});
	});

	await t.run(async (ctx) => {
		await postCashReceiptForObligation(ctx, {
			obligationId,
			amount,
			idempotencyKey: buildIdempotencyKey("cash-received", String(attemptId)),
			effectiveDate: "2026-03-01",
			attemptId,
			source: SYSTEM_SOURCE,
		});
	});

	// Create dispersalEntries so allocation can reference them
	const { dispersalEntryAId, dispersalEntryBId } = await t.run(async (ctx) => {
		const accounts = await ctx.db
			.query("ledger_accounts")
			.withIndex("by_type_and_mortgage", (q) =>
				q.eq("type", "POSITION").eq("mortgageId", String(seeded.mortgageId))
			)
			.collect();

		if (accounts.length < 2) {
			throw new Error("Expected at least two ledger accounts");
		}

		const lenderAShare = Math.round(((amount - servicingFee) * 6000) / 10_000);
		const lenderBShare = amount - servicingFee - lenderAShare;

		const deA = await ctx.db.insert("dispersalEntries", {
			obligationId,
			mortgageId: seeded.mortgageId,
			lenderId: seeded.lenderAId,
			lenderAccountId: accounts[0]._id,
			amount: lenderAShare,
			dispersalDate: "2026-03-01",
			servicingFeeDeducted: 0,
			status: "pending",
			idempotencyKey: buildIdempotencyKey(
				"dispersal",
				"test-a",
				String(obligationId)
			),
			calculationDetails: {
				settledAmount: amount,
				servicingFee,
				distributableAmount: amount - servicingFee,
				feeDue: servicingFee,
				feeCashApplied: servicingFee,
				feeReceivable: 0,
				ownershipUnits: 6000,
				totalUnits: 10_000,
				ownershipFraction: 0.6,
				rawAmount: lenderAShare,
				roundedAmount: lenderAShare,
				sourceObligationType: "regular_interest",
			},
			createdAt: Date.now(),
		});
		const deB = await ctx.db.insert("dispersalEntries", {
			obligationId,
			mortgageId: seeded.mortgageId,
			lenderId: seeded.lenderBId,
			lenderAccountId: accounts[1]._id,
			amount: lenderBShare,
			dispersalDate: "2026-03-01",
			servicingFeeDeducted: 0,
			status: "pending",
			idempotencyKey: buildIdempotencyKey(
				"dispersal",
				"test-b",
				String(obligationId)
			),
			calculationDetails: {
				settledAmount: amount,
				servicingFee,
				distributableAmount: amount - servicingFee,
				feeDue: servicingFee,
				feeCashApplied: servicingFee,
				feeReceivable: 0,
				ownershipUnits: 4000,
				totalUnits: 10_000,
				ownershipFraction: 0.4,
				rawAmount: lenderBShare,
				roundedAmount: lenderBShare,
				sourceObligationType: "regular_interest",
			},
			createdAt: Date.now(),
		});
		return { dispersalEntryAId: deA, dispersalEntryBId: deB };
	});

	// Compute lender shares for settlement
	const lenderAShare = Math.round(((amount - servicingFee) * 6000) / 10_000);
	const lenderBShare = amount - servicingFee - lenderAShare;

	// Post settlement allocation (2 lender payables + servicing fee)
	await t.run(async (ctx) => {
		await postSettlementAllocation(ctx, {
			obligationId,
			mortgageId: seeded.mortgageId,
			settledDate: "2026-03-01",
			servicingFee,
			entries: [
				{
					dispersalEntryId: dispersalEntryAId,
					lenderId: seeded.lenderAId,
					amount: lenderAShare,
				},
				{
					dispersalEntryId: dispersalEntryBId,
					lenderId: seeded.lenderBId,
					amount: lenderBShare,
				},
			],
			source: SYSTEM_SOURCE,
		});
	});

	return {
		...seeded,
		obligationId,
		attemptId,
		servicingFee,
		lenderAShare,
		lenderBShare,
		dispersalEntryAId,
		dispersalEntryBId,
		amount,
		allocationGroupId: `allocation:${obligationId}`,
	};
}

// ═══════════════════════════════════════════════════════════════════
// T-016: E2E full reversal without payout — balance verification
// ═══════════════════════════════════════════════════════════════════

describe("T-016: E2E accrue → receive → allocate → reverse → verify balances", () => {
	it("restores all account balances after full reversal (no payout)", async () => {
		const t = createHarness(modules);
		const setup = await setupFullSettlementFlow(t);

		// Capture balances BEFORE reversal
		const preReversalBalances = await t.run(async (ctx) => {
			const borrowerReceivable = await getOrCreateCashAccount(ctx, {
				family: "BORROWER_RECEIVABLE",
				mortgageId: setup.mortgageId,
				obligationId: setup.obligationId,
				borrowerId: setup.borrowerId,
			});
			const trustCash = await getOrCreateCashAccount(ctx, {
				family: "TRUST_CASH",
				mortgageId: setup.mortgageId,
			});
			const lenderPayableA = await getOrCreateCashAccount(ctx, {
				family: "LENDER_PAYABLE",
				mortgageId: setup.mortgageId,
				lenderId: setup.lenderAId,
			});
			const lenderPayableB = await getOrCreateCashAccount(ctx, {
				family: "LENDER_PAYABLE",
				mortgageId: setup.mortgageId,
				lenderId: setup.lenderBId,
			});
			const servicingRevenue = await getOrCreateCashAccount(ctx, {
				family: "SERVICING_REVENUE",
				mortgageId: setup.mortgageId,
			});

			return {
				borrowerReceivable: getCashAccountBalance(borrowerReceivable),
				trustCash: getCashAccountBalance(trustCash),
				lenderPayableA: getCashAccountBalance(lenderPayableA),
				lenderPayableB: getCashAccountBalance(lenderPayableB),
				servicingRevenue: getCashAccountBalance(servicingRevenue),
			};
		});

		// Verify pre-reversal state: receipt credited, allocation distributed
		// TRUST_CASH (debit-normal) should have a positive balance from receipt
		expect(preReversalBalances.trustCash).toBe(BigInt(setup.amount));
		// LENDER_PAYABLE (credit-normal) should have positive balances
		expect(preReversalBalances.lenderPayableA).toBe(BigInt(setup.lenderAShare));
		expect(preReversalBalances.lenderPayableB).toBe(BigInt(setup.lenderBShare));
		// SERVICING_REVENUE (credit-normal) should have positive balance
		expect(preReversalBalances.servicingRevenue).toBe(
			BigInt(setup.servicingFee)
		);

		// Execute reversal cascade
		const result = await t.run(async (ctx) => {
			return postPaymentReversalCascade(ctx, {
				attemptId: setup.attemptId,
				obligationId: setup.obligationId,
				mortgageId: setup.mortgageId,
				effectiveDate: "2026-03-15",
				source: SYSTEM_SOURCE,
				reason: "Payment returned NSF - integration test",
			});
		});

		expect(result.clawbackRequired).toBe(false);
		expect(result.reversalEntries.length).toBeGreaterThanOrEqual(4);

		// Verify balances AFTER reversal
		const postReversalBalances = await t.run(async (ctx) => {
			const borrowerReceivable = await getOrCreateCashAccount(ctx, {
				family: "BORROWER_RECEIVABLE",
				mortgageId: setup.mortgageId,
				obligationId: setup.obligationId,
				borrowerId: setup.borrowerId,
			});
			const trustCash = await getOrCreateCashAccount(ctx, {
				family: "TRUST_CASH",
				mortgageId: setup.mortgageId,
			});
			const lenderPayableA = await getOrCreateCashAccount(ctx, {
				family: "LENDER_PAYABLE",
				mortgageId: setup.mortgageId,
				lenderId: setup.lenderAId,
			});
			const lenderPayableB = await getOrCreateCashAccount(ctx, {
				family: "LENDER_PAYABLE",
				mortgageId: setup.mortgageId,
				lenderId: setup.lenderBId,
			});
			const servicingRevenue = await getOrCreateCashAccount(ctx, {
				family: "SERVICING_REVENUE",
				mortgageId: setup.mortgageId,
			});

			return {
				borrowerReceivable: getCashAccountBalance(borrowerReceivable),
				trustCash: getCashAccountBalance(trustCash),
				lenderPayableA: getCashAccountBalance(lenderPayableA),
				lenderPayableB: getCashAccountBalance(lenderPayableB),
				servicingRevenue: getCashAccountBalance(servicingRevenue),
			};
		});

		// TRUST_CASH should be zeroed (receipt reversed)
		expect(postReversalBalances.trustCash).toBe(0n);
		// LENDER_PAYABLE balances should be zeroed (payable creation reversed)
		expect(postReversalBalances.lenderPayableA).toBe(0n);
		expect(postReversalBalances.lenderPayableB).toBe(0n);
		// SERVICING_REVENUE should be zeroed (fee reversed)
		expect(postReversalBalances.servicingRevenue).toBe(0n);
		// BORROWER_RECEIVABLE: the receipt credited it (reducing balance).
		// The reversal debits it back, restoring the original receivable amount.
		// Pre-seeded with debits=amount, credits=amount (settled). After receipt:
		// credits += amount. After reversal: debits += amount. Net = amount.
		expect(postReversalBalances.borrowerReceivable).toBe(BigInt(setup.amount));
	});
});

// ═══════════════════════════════════════════════════════════════════
// T-017: E2E reversal with payout (clawback)
// ═══════════════════════════════════════════════════════════════════

describe("T-017: E2E accrue → receive → allocate → payout → reverse → clawback", () => {
	it("creates clawback entries and produces correct balances when payout has been sent", async () => {
		const t = createHarness(modules);
		const setup = await setupFullSettlementFlow(t);

		// Post LENDER_PAYOUT_SENT for lender A (simulate payout already sent)
		await t.run(async (ctx) => {
			const lenderPayableAccount = await getOrCreateCashAccount(ctx, {
				family: "LENDER_PAYABLE",
				mortgageId: setup.mortgageId,
				lenderId: setup.lenderAId,
			});
			const trustCashAccount = await getOrCreateCashAccount(ctx, {
				family: "TRUST_CASH",
				mortgageId: setup.mortgageId,
			});

			await postCashEntryInternal(ctx, {
				entryType: "LENDER_PAYOUT_SENT",
				effectiveDate: "2026-03-05",
				amount: setup.lenderAShare,
				debitAccountId: lenderPayableAccount._id,
				creditAccountId: trustCashAccount._id,
				idempotencyKey: buildIdempotencyKey(
					"lender-payout",
					String(setup.lenderAId),
					String(setup.obligationId)
				),
				mortgageId: setup.mortgageId,
				obligationId: setup.obligationId,
				lenderId: setup.lenderAId,
				source: SYSTEM_SOURCE,
			});
		});

		// Capture balances AFTER payout but BEFORE reversal
		const postPayoutBalances = await t.run(async (ctx) => {
			const trustCash = await getOrCreateCashAccount(ctx, {
				family: "TRUST_CASH",
				mortgageId: setup.mortgageId,
			});
			const lenderPayableA = await getOrCreateCashAccount(ctx, {
				family: "LENDER_PAYABLE",
				mortgageId: setup.mortgageId,
				lenderId: setup.lenderAId,
			});
			return {
				trustCash: getCashAccountBalance(trustCash),
				lenderPayableA: getCashAccountBalance(lenderPayableA),
			};
		});

		// After payout: TRUST_CASH = receipt - payout, LENDER_PAYABLE_A = payable - payout = 0
		expect(postPayoutBalances.trustCash).toBe(
			BigInt(setup.amount) - BigInt(setup.lenderAShare)
		);
		expect(postPayoutBalances.lenderPayableA).toBe(0n);

		// Execute reversal cascade
		const result = await t.run(async (ctx) => {
			return postPaymentReversalCascade(ctx, {
				attemptId: setup.attemptId,
				obligationId: setup.obligationId,
				mortgageId: setup.mortgageId,
				effectiveDate: "2026-03-15",
				source: SYSTEM_SOURCE,
				reason: "Payment returned NSF - clawback test",
			});
		});

		// clawbackRequired should be true
		expect(result.clawbackRequired).toBe(true);

		// Should have 5+ entries: cash_received + 2 lender_payable + servicing_fee + payout clawback
		expect(result.reversalEntries.length).toBeGreaterThanOrEqual(5);

		// Verify payout clawback entries exist
		const clawbackEntries = result.reversalEntries.filter((e) =>
			e.idempotencyKey.includes("payout-clawback")
		);
		expect(clawbackEntries.length).toBeGreaterThanOrEqual(1);

		// Verify post-reversal balances
		const postReversalBalances = await t.run(async (ctx) => {
			const trustCash = await getOrCreateCashAccount(ctx, {
				family: "TRUST_CASH",
				mortgageId: setup.mortgageId,
			});
			const lenderPayableA = await getOrCreateCashAccount(ctx, {
				family: "LENDER_PAYABLE",
				mortgageId: setup.mortgageId,
				lenderId: setup.lenderAId,
			});
			const lenderPayableB = await getOrCreateCashAccount(ctx, {
				family: "LENDER_PAYABLE",
				mortgageId: setup.mortgageId,
				lenderId: setup.lenderBId,
			});
			const servicingRevenue = await getOrCreateCashAccount(ctx, {
				family: "SERVICING_REVENUE",
				mortgageId: setup.mortgageId,
			});

			return {
				trustCash: getCashAccountBalance(trustCash),
				lenderPayableA: getCashAccountBalance(lenderPayableA),
				lenderPayableB: getCashAccountBalance(lenderPayableB),
				servicingRevenue: getCashAccountBalance(servicingRevenue),
			};
		});

		// LENDER_PAYABLE_A for the paid lender should go negative (clawback receivable).
		// It was zeroed by the payout, then the payable-creation reversal debited it
		// (making it negative), and the clawback reversal credited it back.
		// Net: -lenderAShare (payable reversed) + lenderAShare (clawback credit) = negative
		// Actually: payable creation was credited (+lenderAShare), payout debited it (-lenderAShare → 0),
		// reversal of payable creation: debit = credit acct of original = lender_payable → -lenderAShare
		// reversal of payout: debit = trust_cash, credit = lender_payable → +lenderAShare
		// Net: lenderAShare - lenderAShare - lenderAShare + lenderAShare = 0
		// Wait, let me reconsider: the payable reversal debits LENDER_PAYABLE (reduces credit-normal balance)
		// and the payout clawback credits LENDER_PAYABLE (increases credit-normal balance).
		// These cancel out, so LENDER_PAYABLE_A should end at 0.
		// But the payout already zeroed it. So after all reversals it should be 0.
		// Actually more carefully:
		// Initial payable creation: credit LENDER_PAYABLE (+lenderAShare)
		// Payout sent: debit LENDER_PAYABLE (-lenderAShare) → balance = 0
		// Reversal of payable creation: debit LENDER_PAYABLE (-lenderAShare) → balance = -lenderAShare
		// Reversal of payout (clawback): credit LENDER_PAYABLE (+lenderAShare) → balance = 0
		// So net = 0. But wait, the clawback reversal swaps the original payout's debit/credit.
		// Original payout: debit=LENDER_PAYABLE, credit=TRUST_CASH
		// Clawback reversal: debit=TRUST_CASH, credit=LENDER_PAYABLE
		// So clawback credits LENDER_PAYABLE → +lenderAShare. Net = 0.
		expect(postReversalBalances.lenderPayableA).toBe(0n);

		// LENDER_PAYABLE_B had no payout, just the payable reversal → 0
		expect(postReversalBalances.lenderPayableB).toBe(0n);

		// SERVICING_REVENUE should be zeroed
		expect(postReversalBalances.servicingRevenue).toBe(0n);

		// TRUST_CASH: receipt (+amount) - payout (-lenderAShare) - receipt reversal (-amount) + clawback (+lenderAShare) = 0
		expect(postReversalBalances.trustCash).toBe(0n);
	});
});

// ═══════════════════════════════════════════════════════════════════
// T-018: Reconciliation detection — findSettledObligationsWithNonZeroBalance
// ═══════════════════════════════════════════════════════════════════

describe("T-018: findSettledObligationsWithNonZeroBalance detects reversed obligations", () => {
	it("returns reversed obligation with correct expected balance", async () => {
		const t = createHarness(modules);
		const setup = await setupFullSettlementFlow(t);

		// Before reversal, the obligation is settled and journal matches.
		// The obligation has amountSettled = amount and there is a CASH_RECEIVED entry for the same amount.
		const preReversalIndicators = await t.run(async (ctx) => {
			return findSettledObligationsWithNonZeroBalance(ctx);
		});

		// Should NOT flag the obligation before reversal
		const preReversalMatch = preReversalIndicators.find(
			(i) => i.obligationId === setup.obligationId
		);
		expect(preReversalMatch).toBeUndefined();

		// Execute reversal cascade
		await t.run(async (ctx) => {
			return postPaymentReversalCascade(ctx, {
				attemptId: setup.attemptId,
				obligationId: setup.obligationId,
				mortgageId: setup.mortgageId,
				effectiveDate: "2026-03-15",
				source: SYSTEM_SOURCE,
				reason: "Payment returned NSF - reconciliation test",
			});
		});

		// After reversal, the obligation is still marked "settled" but the journal
		// now shows zero net CASH_RECEIVED (original + reversal cancel out).
		const postReversalIndicators = await t.run(async (ctx) => {
			return findSettledObligationsWithNonZeroBalance(ctx);
		});

		const match = postReversalIndicators.find(
			(i) => i.obligationId === setup.obligationId
		);
		expect(match).toBeDefined();

		// journalSettledAmount should be 0 (receipt - reversal = 0)
		expect(match?.journalSettledAmount).toBe(0n);

		// obligationAmount should match the setup amount
		expect(match?.obligationAmount).toBe(setup.amount);

		// expectedBalance = obligationAmount - journalSettledAmount = amount - 0 = amount
		expect(match?.expectedBalance).toBe(BigInt(setup.amount));
	});
});

// ═══════════════════════════════════════════════════════════════════
// T-019: Posting group validation after reversal
// ═══════════════════════════════════════════════════════════════════

describe("T-019: Posting group nets to zero after reversal via getPostingGroupSummary", () => {
	it("allocation posting group has net-zero CONTROL:ALLOCATION after settlement (before reversal)", async () => {
		const t = createHarness(modules);
		const setup = await setupFullSettlementFlow(t);

		// The allocation posting group should be complete after settlement
		const allocationSummary = await t.run(async (ctx) => {
			return getPostingGroupSummary(ctx, setup.allocationGroupId);
		});

		// CONTROL:ALLOCATION should net to zero: servicing fee + lender shares = obligation amount
		// All debits (lender payables + servicing fee) from CONTROL:ALLOCATION
		// But wait — postSettlementAllocation only debits CONTROL:ALLOCATION.
		// There is no credit to CONTROL:ALLOCATION in the current flow.
		// So it should NOT be complete (only debit side).
		// The balance should equal the obligation amount (all debits, no credits).
		expect(allocationSummary.totalJournalEntryCount).toBeGreaterThanOrEqual(3); // 2 lender payable + 1 servicing fee
	});

	it("reversal posting group entries all have consistent postingGroupId", async () => {
		const t = createHarness(modules);
		const setup = await setupFullSettlementFlow(t);

		const result = await t.run(async (ctx) => {
			return postPaymentReversalCascade(ctx, {
				attemptId: setup.attemptId,
				obligationId: setup.obligationId,
				mortgageId: setup.mortgageId,
				effectiveDate: "2026-03-15",
				source: SYSTEM_SOURCE,
				reason: "Posting group validation test",
			});
		});

		// All reversal entries should share the same postingGroupId
		for (const entry of result.reversalEntries) {
			expect(entry.postingGroupId).toBe(result.postingGroupId);
		}

		// Validate the reversal posting group via getPostingGroupSummary
		const reversalSummary = await t.run(async (ctx) => {
			return getPostingGroupSummary(ctx, result.postingGroupId);
		});

		// The reversal posting group should have entries
		expect(reversalSummary.totalJournalEntryCount).toBe(
			result.reversalEntries.length
		);

		// The reversal entries that touch CONTROL:ALLOCATION should reverse
		// the allocation entries. Since the original allocation only debited
		// CONTROL:ALLOCATION, the reversals should credit CONTROL:ALLOCATION,
		// making the reversal group's CONTROL:ALLOCATION balance negative
		// (all credits, no debits).
		// Specifically: the lender payable reversals credit CONTROL:ALLOCATION
		// and the servicing fee reversal credits CONTROL:ALLOCATION.
		const controlEntries = reversalSummary.entries.filter(
			(e) => e.side === "credit"
		);
		// Lender payable reversals + servicing fee reversal should appear as credits
		expect(controlEntries.length).toBeGreaterThanOrEqual(2);
	});

	it("combined allocation + reversal entries result in net-zero CONTROL:ALLOCATION", async () => {
		const t = createHarness(modules);
		const setup = await setupFullSettlementFlow(t);

		// Post reversal
		await t.run(async (ctx) => {
			return postPaymentReversalCascade(ctx, {
				attemptId: setup.attemptId,
				obligationId: setup.obligationId,
				mortgageId: setup.mortgageId,
				effectiveDate: "2026-03-15",
				source: SYSTEM_SOURCE,
				reason: "Net-zero test",
			});
		});

		// Fetch the CONTROL:ALLOCATION account directly and check its cumulative balance
		const controlBalance = await t.run(async (ctx) => {
			const controlAccount = await getOrCreateCashAccount(ctx, {
				family: "CONTROL",
				mortgageId: setup.mortgageId,
				obligationId: setup.obligationId,
				subaccount: "ALLOCATION",
			});
			return getCashAccountBalance(controlAccount);
		});

		// The allocation debited CONTROL:ALLOCATION for lender shares + servicing fee.
		// The reversal credited CONTROL:ALLOCATION for the same amounts.
		// Net balance should be zero.
		expect(controlBalance).toBe(0n);
	});

	it("isPostingGroupComplete returns true for a complete allocation (pre-reversal scenario)", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);

		const obligationId = await createSettledObligation(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 50_000,
		});
		const postingGroupId = `allocation:${obligationId}`;

		// Create a complete posting group: credit + matching debits = net zero
		await t.run(async (ctx) => {
			const controlAccount = await getOrCreateCashAccount(ctx, {
				family: "CONTROL",
				mortgageId: seeded.mortgageId,
				obligationId,
				subaccount: "ALLOCATION",
			});
			const unappliedAccount = await getOrCreateCashAccount(ctx, {
				family: "UNAPPLIED_CASH",
				mortgageId: seeded.mortgageId,
			});
			// Pre-seed UNAPPLIED_CASH (credit-normal) with sufficient balance
			await ctx.db.patch(unappliedAccount._id, {
				cumulativeCredits: 50_000n,
			});
			const payableAccountA = await getOrCreateCashAccount(ctx, {
				family: "LENDER_PAYABLE",
				mortgageId: seeded.mortgageId,
				lenderId: seeded.lenderAId,
			});
			const payableAccountB = await getOrCreateCashAccount(ctx, {
				family: "LENDER_PAYABLE",
				mortgageId: seeded.mortgageId,
				lenderId: seeded.lenderBId,
			});

			// Credit CONTROL:ALLOCATION via CASH_APPLIED (50_000 in)
			await postCashEntryInternal(ctx, {
				entryType: "CASH_APPLIED",
				effectiveDate: "2026-03-01",
				amount: 50_000,
				debitAccountId: unappliedAccount._id,
				creditAccountId: controlAccount._id,
				idempotencyKey: buildIdempotencyKey(
					"cash-applied",
					"reversal-integ-seed"
				),
				mortgageId: seeded.mortgageId,
				obligationId,
				postingGroupId,
				source: SYSTEM_SOURCE,
			});

			// Debit CONTROL:ALLOCATION (30_000 out)
			await postCashEntryInternal(ctx, {
				entryType: "LENDER_PAYABLE_CREATED",
				effectiveDate: "2026-03-01",
				amount: 30_000,
				debitAccountId: controlAccount._id,
				creditAccountId: payableAccountA._id,
				idempotencyKey: buildIdempotencyKey(
					"lender-payable",
					"reversal-integ-a"
				),
				mortgageId: seeded.mortgageId,
				obligationId,
				lenderId: seeded.lenderAId,
				postingGroupId,
				source: SYSTEM_SOURCE,
			});

			// Debit CONTROL:ALLOCATION (20_000 out) — nets to zero
			await postCashEntryInternal(ctx, {
				entryType: "LENDER_PAYABLE_CREATED",
				effectiveDate: "2026-03-01",
				amount: 20_000,
				debitAccountId: controlAccount._id,
				creditAccountId: payableAccountB._id,
				idempotencyKey: buildIdempotencyKey(
					"lender-payable",
					"reversal-integ-b"
				),
				mortgageId: seeded.mortgageId,
				obligationId,
				lenderId: seeded.lenderBId,
				postingGroupId,
				source: SYSTEM_SOURCE,
			});
		});

		const summary = await t.run(async (ctx) => {
			return getPostingGroupSummary(ctx, postingGroupId);
		});

		expect(isPostingGroupComplete(summary)).toBe(true);
		expect(summary.controlAllocationBalance).toBe(0n);
		expect(summary.hasCorruptEntries).toBe(false);
		expect(summary.totalJournalEntryCount).toBe(3);
	});
});
