import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import type { Id } from "../../../_generated/dataModel";
import { getOrCreateCashAccount } from "../accounts";
import {
	assertReversalAmountValid,
	postCashReceiptForObligation,
	postObligationAccrued,
	postPaymentReversalCascade,
	postSettlementAllocation,
	postTransferReversal,
} from "../integrations";
import { postCashEntryInternal } from "../postEntry";
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
	// First we need a collectionPlanEntry and collectionAttempt
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
// T-008: Full Reversal Cascade
// ═══════════════════════════════════════════════════════════════════

describe("T-008: Full reversal cascade", () => {
	it("reverses CASH_RECEIVED + 2×LENDER_PAYABLE_CREATED + SERVICING_FEE with correct accounts", async () => {
		const t = createHarness(modules);
		const setup = await setupFullSettlementFlow(t);

		const result = await t.run(async (ctx) => {
			return postPaymentReversalCascade(ctx, {
				attemptId: setup.attemptId,
				obligationId: setup.obligationId,
				mortgageId: setup.mortgageId,
				effectiveDate: "2026-03-15",
				source: SYSTEM_SOURCE,
				reason: "Payment returned NSF",
			});
		});

		// Should have at least 4 entries: 1 cash_received + 2 lender_payable + 1 servicing_fee
		expect(result.reversalEntries.length).toBeGreaterThanOrEqual(4);

		// All entries are REVERSAL type
		for (const entry of result.reversalEntries) {
			expect(entry.entryType).toBe("REVERSAL");
		}

		// Verify CASH_RECEIVED reversal exists
		const cashReceivedReversal = result.reversalEntries.find(
			(e) =>
				e.idempotencyKey.includes("cash-received") &&
				e.idempotencyKey.includes("reversal")
		);
		expect(cashReceivedReversal).toBeDefined();
		expect(cashReceivedReversal?.amount).toBe(BigInt(setup.amount));

		// Verify LENDER_PAYABLE_CREATED reversals exist (one per lender)
		const lenderPayableReversals = result.reversalEntries.filter((e) =>
			e.idempotencyKey.includes("lender-payable")
		);
		expect(lenderPayableReversals).toHaveLength(2);

		// Verify SERVICING_FEE reversal exists
		const servicingFeeReversal = result.reversalEntries.find((e) =>
			e.idempotencyKey.includes("servicing-fee")
		);
		expect(servicingFeeReversal).toBeDefined();
		expect(servicingFeeReversal?.amount).toBe(BigInt(setup.servicingFee));

		// clawbackRequired should be false (no payouts sent)
		expect(result.clawbackRequired).toBe(false);
	});
});

// ═══════════════════════════════════════════════════════════════════
// T-009: Cascade with Clawback
// ═══════════════════════════════════════════════════════════════════

describe("T-009: Cascade with clawback", () => {
	it("fires Step 4 clawback when LENDER_PAYOUT_SENT entries exist", async () => {
		const t = createHarness(modules);
		const setup = await setupFullSettlementFlow(t);

		// Post LENDER_PAYOUT_SENT for lender A
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

		const result = await t.run(async (ctx) => {
			return postPaymentReversalCascade(ctx, {
				attemptId: setup.attemptId,
				obligationId: setup.obligationId,
				mortgageId: setup.mortgageId,
				effectiveDate: "2026-03-15",
				source: SYSTEM_SOURCE,
				reason: "Payment returned NSF - clawback needed",
			});
		});

		// clawbackRequired should be true
		expect(result.clawbackRequired).toBe(true);

		// Should have 5+ entries: 1 cash_received + 2 lender_payable + 1 servicing_fee + 1 payout clawback
		expect(result.reversalEntries.length).toBeGreaterThanOrEqual(5);

		// Verify payout clawback entry exists
		const clawbackEntries = result.reversalEntries.filter((e) =>
			e.idempotencyKey.includes("payout-clawback")
		);
		expect(clawbackEntries.length).toBeGreaterThanOrEqual(1);

		// Verify the clawback entry reverses the payout (swap debit/credit)
		const clawback = clawbackEntries[0];
		expect(clawback.entryType).toBe("REVERSAL");
		expect(clawback.amount).toBe(BigInt(setup.lenderAShare));
	});
});

// ═══════════════════════════════════════════════════════════════════
// T-010: Cascade without Clawback
// ═══════════════════════════════════════════════════════════════════

describe("T-010: Cascade without clawback", () => {
	it("skips Step 4 when no LENDER_PAYOUT_SENT entries exist", async () => {
		const t = createHarness(modules);
		const setup = await setupFullSettlementFlow(t);

		const result = await t.run(async (ctx) => {
			return postPaymentReversalCascade(ctx, {
				attemptId: setup.attemptId,
				obligationId: setup.obligationId,
				mortgageId: setup.mortgageId,
				effectiveDate: "2026-03-15",
				source: SYSTEM_SOURCE,
				reason: "Payment returned - no payout yet",
			});
		});

		expect(result.clawbackRequired).toBe(false);

		// No payout-clawback entries should exist
		const clawbackEntries = result.reversalEntries.filter((e) =>
			e.idempotencyKey.includes("payout-clawback")
		);
		expect(clawbackEntries).toHaveLength(0);

		// Should have exactly 4 entries: 1 cash_received + 2 lender_payable + 1 servicing_fee
		expect(result.reversalEntries).toHaveLength(4);
	});
});

// ═══════════════════════════════════════════════════════════════════
// T-011: Idempotency
// ═══════════════════════════════════════════════════════════════════

describe("T-011: Idempotency", () => {
	it("calling cascade twice returns the same entries", async () => {
		const t = createHarness(modules);
		const setup = await setupFullSettlementFlow(t);

		const first = await t.run(async (ctx) => {
			return postPaymentReversalCascade(ctx, {
				attemptId: setup.attemptId,
				obligationId: setup.obligationId,
				mortgageId: setup.mortgageId,
				effectiveDate: "2026-03-15",
				source: SYSTEM_SOURCE,
				reason: "Idempotency test",
			});
		});

		const second = await t.run(async (ctx) => {
			return postPaymentReversalCascade(ctx, {
				attemptId: setup.attemptId,
				obligationId: setup.obligationId,
				mortgageId: setup.mortgageId,
				effectiveDate: "2026-03-15",
				source: SYSTEM_SOURCE,
				reason: "Idempotency test",
			});
		});

		// Same posting group ID
		expect(second.postingGroupId).toBe(first.postingGroupId);

		// Same number of entries
		expect(second.reversalEntries.length).toBe(first.reversalEntries.length);

		// Same entry IDs (idempotent return)
		const firstIds = first.reversalEntries.map((e) => e._id).sort();
		const secondIds = second.reversalEntries.map((e) => e._id).sort();
		expect(secondIds).toEqual(firstIds);

		// Verify no duplicate entries were created in the DB
		const entryCount = await t.run(async (ctx) => {
			const entries = await ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_posting_group", (q) =>
					q.eq("postingGroupId", first.postingGroupId)
				)
				.collect();
			return entries.length;
		});
		expect(entryCount).toBe(first.reversalEntries.length);
	});
});

// ═══════════════════════════════════════════════════════════════════
// T-012: Amount Validation
// ═══════════════════════════════════════════════════════════════════

describe("T-012: Amount validation", () => {
	it("assertReversalAmountValid throws ConvexError when reversal exceeds original", () => {
		expect(() => {
			assertReversalAmountValid(200_000, 100_000n, "test-context");
		}).toThrow(ConvexError);

		try {
			assertReversalAmountValid(200_000, 100_000n, "test-context");
		} catch (error) {
			expect(error).toBeInstanceOf(ConvexError);
			const convexErr = error as ConvexError<{ code: string }>;
			expect(convexErr.data.code).toBe("REVERSAL_EXCEEDS_ORIGINAL");
		}
	});

	it("assertReversalAmountValid does NOT throw when reversal equals original", () => {
		expect(() => {
			assertReversalAmountValid(100_000, 100_000n, "test-context");
		}).not.toThrow();
	});

	it("assertReversalAmountValid does NOT throw when reversal is less than original", () => {
		expect(() => {
			assertReversalAmountValid(50_000, 100_000n, "test-context");
		}).not.toThrow();
	});
});

// ═══════════════════════════════════════════════════════════════════
// T-013: causedBy Linkage
// ═══════════════════════════════════════════════════════════════════

describe("T-013: causedBy linkage", () => {
	it("every REVERSAL entry references its original entry via causedBy", async () => {
		const t = createHarness(modules);
		const setup = await setupFullSettlementFlow(t);

		const result = await t.run(async (ctx) => {
			return postPaymentReversalCascade(ctx, {
				attemptId: setup.attemptId,
				obligationId: setup.obligationId,
				mortgageId: setup.mortgageId,
				effectiveDate: "2026-03-15",
				source: SYSTEM_SOURCE,
				reason: "causedBy linkage test",
			});
		});

		// Every reversal entry must have a causedBy reference
		for (const entry of result.reversalEntries) {
			expect(entry.causedBy).toBeDefined();
		}

		// Verify each causedBy references an actual original entry in the DB
		await t.run(async (ctx) => {
			for (const entry of result.reversalEntries) {
				const original = await ctx.db.get(
					entry.causedBy as Id<"cash_ledger_journal_entries">
				);
				expect(original).not.toBeNull();
				// Original should NOT be a REVERSAL type
				expect(original?.entryType).not.toBe("REVERSAL");
			}
		});

		// Verify the debit/credit are swapped relative to original
		await t.run(async (ctx) => {
			for (const entry of result.reversalEntries) {
				const original = await ctx.db.get(
					entry.causedBy as Id<"cash_ledger_journal_entries">
				);
				expect(original).not.toBeNull();
				// Reversal swaps debit/credit from original
				expect(entry.debitAccountId).toBe(original?.creditAccountId);
				expect(entry.creditAccountId).toBe(original?.debitAccountId);
			}
		});
	});
});

// ═══════════════════════════════════════════════════════════════════
// T-014: Posting Group Integrity
// ═══════════════════════════════════════════════════════════════════

describe("T-014: Posting group integrity", () => {
	it("all reversal entries share the same postingGroupId", async () => {
		const t = createHarness(modules);
		const setup = await setupFullSettlementFlow(t);

		const result = await t.run(async (ctx) => {
			return postPaymentReversalCascade(ctx, {
				attemptId: setup.attemptId,
				obligationId: setup.obligationId,
				mortgageId: setup.mortgageId,
				effectiveDate: "2026-03-15",
				source: SYSTEM_SOURCE,
				reason: "Posting group integrity test",
			});
		});

		// postingGroupId should follow the convention
		expect(result.postingGroupId).toBe(`reversal-group:${setup.attemptId}`);

		// All entries share the same postingGroupId
		for (const entry of result.reversalEntries) {
			expect(entry.postingGroupId).toBe(result.postingGroupId);
		}

		// Verify via DB query that entries by posting group match
		const dbEntries = await t.run(async (ctx) => {
			return ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_posting_group", (q) =>
					q.eq("postingGroupId", result.postingGroupId)
				)
				.collect();
		});
		expect(dbEntries.length).toBe(result.reversalEntries.length);
	});
});

// ═══════════════════════════════════════════════════════════════════
// T-015: postTransferReversal
// ═══════════════════════════════════════════════════════════════════

describe("T-015: postTransferReversal", () => {
	it("creates a single-entry reversal with correct idempotency", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);

		// Create a transferRequest record
		const transferRequestId = await t.run(async (ctx) => {
			return ctx.db.insert("transferRequests", {
				status: "completed",
				createdAt: Date.now(),
			});
		});

		// Create an original journal entry to reverse
		// Pre-seed accounts with sufficient balances for the payout
		const originalEntry = await t.run(async (ctx) => {
			const trustCash = await getOrCreateCashAccount(ctx, {
				family: "TRUST_CASH",
				mortgageId: seeded.mortgageId,
			});
			const lenderPayable = await getOrCreateCashAccount(ctx, {
				family: "LENDER_PAYABLE",
				mortgageId: seeded.mortgageId,
				lenderId: seeded.lenderAId,
			});
			// LENDER_PAYABLE is credit-normal; pre-seed credits so payout debit is valid
			await ctx.db.patch(lenderPayable._id, {
				cumulativeCredits: 100_000n,
			});
			// TRUST_CASH is debit-normal; pre-seed debits so payout credit is valid
			await ctx.db.patch(trustCash._id, {
				cumulativeDebits: 100_000n,
			});

			const result = await postCashEntryInternal(ctx, {
				entryType: "LENDER_PAYOUT_SENT",
				effectiveDate: "2026-03-01",
				amount: 50_000,
				debitAccountId: lenderPayable._id,
				creditAccountId: trustCash._id,
				idempotencyKey: buildIdempotencyKey(
					"transfer-payout",
					String(transferRequestId)
				),
				mortgageId: seeded.mortgageId,
				lenderId: seeded.lenderAId,
				transferRequestId,
				source: SYSTEM_SOURCE,
			});
			return result.entry;
		});

		// Now reverse it
		const reversal = await t.run(async (ctx) => {
			return postTransferReversal(ctx, {
				transferRequestId,
				originalEntryId: originalEntry._id,
				amount: 50_000,
				effectiveDate: "2026-03-15",
				source: SYSTEM_SOURCE,
				reason: "Transfer reversal test",
			});
		});

		// Verify reversal entry
		expect(reversal.entry.entryType).toBe("REVERSAL");
		expect(reversal.entry.amount).toBe(50_000n);
		expect(reversal.entry.causedBy).toBe(originalEntry._id);
		// Debit/credit swapped
		expect(reversal.entry.debitAccountId).toBe(originalEntry.creditAccountId);
		expect(reversal.entry.creditAccountId).toBe(originalEntry.debitAccountId);
		// Transfer request linked
		expect(reversal.entry.transferRequestId).toBe(transferRequestId);
		// Reason preserved
		expect(reversal.entry.reason).toBe("Transfer reversal test");
	});

	it("is idempotent — calling twice returns the same entry", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);

		const transferRequestId = await t.run(async (ctx) => {
			return ctx.db.insert("transferRequests", {
				status: "completed",
				createdAt: Date.now(),
			});
		});

		const originalEntry = await t.run(async (ctx) => {
			const trustCash = await getOrCreateCashAccount(ctx, {
				family: "TRUST_CASH",
				mortgageId: seeded.mortgageId,
			});
			const lenderPayable = await getOrCreateCashAccount(ctx, {
				family: "LENDER_PAYABLE",
				mortgageId: seeded.mortgageId,
				lenderId: seeded.lenderAId,
			});
			// Pre-seed balances for the payout
			await ctx.db.patch(lenderPayable._id, {
				cumulativeCredits: 100_000n,
			});
			await ctx.db.patch(trustCash._id, {
				cumulativeDebits: 100_000n,
			});

			const result = await postCashEntryInternal(ctx, {
				entryType: "LENDER_PAYOUT_SENT",
				effectiveDate: "2026-03-01",
				amount: 30_000,
				debitAccountId: lenderPayable._id,
				creditAccountId: trustCash._id,
				idempotencyKey: buildIdempotencyKey(
					"transfer-payout-idemp",
					String(transferRequestId)
				),
				mortgageId: seeded.mortgageId,
				lenderId: seeded.lenderAId,
				transferRequestId,
				source: SYSTEM_SOURCE,
			});
			return result.entry;
		});

		const first = await t.run(async (ctx) => {
			return postTransferReversal(ctx, {
				transferRequestId,
				originalEntryId: originalEntry._id,
				amount: 30_000,
				effectiveDate: "2026-03-15",
				source: SYSTEM_SOURCE,
				reason: "Idempotency test",
			});
		});

		const second = await t.run(async (ctx) => {
			return postTransferReversal(ctx, {
				transferRequestId,
				originalEntryId: originalEntry._id,
				amount: 30_000,
				effectiveDate: "2026-03-15",
				source: SYSTEM_SOURCE,
				reason: "Idempotency test",
			});
		});

		// Same entry ID
		expect(second.entry._id).toBe(first.entry._id);
	});

	it("throws ConvexError when reversal amount exceeds original", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);

		const transferRequestId = await t.run(async (ctx) => {
			return ctx.db.insert("transferRequests", {
				status: "completed",
				createdAt: Date.now(),
			});
		});

		const originalEntry = await t.run(async (ctx) => {
			const trustCash = await getOrCreateCashAccount(ctx, {
				family: "TRUST_CASH",
				mortgageId: seeded.mortgageId,
			});
			const lenderPayable = await getOrCreateCashAccount(ctx, {
				family: "LENDER_PAYABLE",
				mortgageId: seeded.mortgageId,
				lenderId: seeded.lenderAId,
			});
			// Pre-seed balances for the payout
			await ctx.db.patch(lenderPayable._id, {
				cumulativeCredits: 100_000n,
			});
			await ctx.db.patch(trustCash._id, {
				cumulativeDebits: 100_000n,
			});

			const result = await postCashEntryInternal(ctx, {
				entryType: "LENDER_PAYOUT_SENT",
				effectiveDate: "2026-03-01",
				amount: 25_000,
				debitAccountId: lenderPayable._id,
				creditAccountId: trustCash._id,
				idempotencyKey: buildIdempotencyKey(
					"transfer-payout-exceeds",
					String(transferRequestId)
				),
				mortgageId: seeded.mortgageId,
				lenderId: seeded.lenderAId,
				transferRequestId,
				source: SYSTEM_SOURCE,
			});
			return result.entry;
		});

		await expect(
			t.run(async (ctx) => {
				return postTransferReversal(ctx, {
					transferRequestId,
					originalEntryId: originalEntry._id,
					amount: 50_000, // exceeds original 25_000
					effectiveDate: "2026-03-15",
					source: SYSTEM_SOURCE,
					reason: "Should fail",
				});
			})
		).rejects.toThrow(ConvexError);
	});
});

// ═══════════════════════════════════════════════════════════════════
// T-020: Double-reversal guard — cascade throws on re-reversal
// ═══════════════════════════════════════════════════════════════════

describe("T-020: Double-reversal guard", () => {
	it("postPaymentReversalCascade is idempotent — second call returns same entries", async () => {
		const t = createHarness(modules);
		const setup = await setupFullSettlementFlow(t);

		// First reversal
		const first = await t.run(async (ctx) => {
			return postPaymentReversalCascade(ctx, {
				attemptId: setup.attemptId,
				obligationId: setup.obligationId,
				mortgageId: setup.mortgageId,
				effectiveDate: "2026-03-15",
				source: SYSTEM_SOURCE,
				reason: "First reversal",
			});
		});

		// Second reversal — should return the same entries (idempotent)
		const second = await t.run(async (ctx) => {
			return postPaymentReversalCascade(ctx, {
				attemptId: setup.attemptId,
				obligationId: setup.obligationId,
				mortgageId: setup.mortgageId,
				effectiveDate: "2026-03-16",
				source: SYSTEM_SOURCE,
				reason: "Second reversal — idempotent",
			});
		});

		// Same postingGroupId
		expect(second.postingGroupId).toBe(first.postingGroupId);
		// Same number of entries
		expect(second.reversalEntries.length).toBe(first.reversalEntries.length);
		// Same entry IDs
		const firstIds = first.reversalEntries.map((e) => e._id).sort();
		const secondIds = second.reversalEntries.map((e) => e._id).sort();
		expect(secondIds).toEqual(firstIds);
		// No new entries created
		const entryCount = await t.run(async (ctx) => {
			const entries = await ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_posting_group", (q) =>
					q.eq("postingGroupId", first.postingGroupId)
				)
				.collect();
			return entries.length;
		});
		expect(entryCount).toBe(first.reversalEntries.length);
	});

	it("postTransferReversal throws DOUBLE_REVERSAL when called with different transferRequestId but same originalEntryId", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);

		// Create two different transfer requests
		const [transferRequestId1, transferRequestIdId] = await t.run(
			async (ctx) => {
				const tr1 = await ctx.db.insert("transferRequests", {
					status: "completed",
					createdAt: Date.now(),
				});
				const tr2 = await ctx.db.insert("transferRequests", {
					status: "completed",
					createdAt: Date.now(),
				});
				return [tr1, tr2];
			}
		);

		// Create an original journal entry (no obligationId, has transferRequestId)
		const originalEntry = await t.run(async (ctx) => {
			const trustCash = await getOrCreateCashAccount(ctx, {
				family: "TRUST_CASH",
				mortgageId: seeded.mortgageId,
			});
			const lenderPayable = await getOrCreateCashAccount(ctx, {
				family: "LENDER_PAYABLE",
				mortgageId: seeded.mortgageId,
				lenderId: seeded.lenderAId,
			});
			await ctx.db.patch(lenderPayable._id, { cumulativeCredits: 100_000n });
			await ctx.db.patch(trustCash._id, { cumulativeDebits: 100_000n });

			const result = await postCashEntryInternal(ctx, {
				entryType: "LENDER_PAYOUT_SENT",
				effectiveDate: "2026-03-01",
				amount: 50_000,
				debitAccountId: lenderPayable._id,
				creditAccountId: trustCash._id,
				idempotencyKey: buildIdempotencyKey(
					"double-rev-original",
					String(transferRequestId1)
				),
				mortgageId: seeded.mortgageId,
				lenderId: seeded.lenderAId,
				transferRequestId: transferRequestId1,
				source: SYSTEM_SOURCE,
			});
			return result.entry;
		});

		// First reversal — succeeds (with transferRequestId1)
		await t.run(async (ctx) => {
			return postTransferReversal(ctx, {
				transferRequestId: transferRequestId1,
				originalEntryId: originalEntry._id,
				amount: 50_000,
				effectiveDate: "2026-03-15",
				source: SYSTEM_SOURCE,
				reason: "First reversal",
			});
		});

		// Second reversal — DIFFERENT transferRequestId but same originalEntryId
		// → bypasses idempotency check but triggers findExistingReversal → throws DOUBLE_REVERSAL
		await expect(
			t.run(async (ctx) => {
				return postTransferReversal(ctx, {
					transferRequestId: transferRequestIdId, // different!
					originalEntryId: originalEntry._id,
					amount: 50_000,
					effectiveDate: "2026-03-16",
					source: SYSTEM_SOURCE,
					reason: "Second reversal — should fail",
				});
			})
		).rejects.toThrow(ConvexError);
	});

	it("postTransferReversal includes postingGroupId in return", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);

		const transferRequestId = await t.run(async (ctx) => {
			return ctx.db.insert("transferRequests", {
				status: "completed",
				createdAt: Date.now(),
			});
		});

		const originalEntry = await t.run(async (ctx) => {
			const trustCash = await getOrCreateCashAccount(ctx, {
				family: "TRUST_CASH",
				mortgageId: seeded.mortgageId,
			});
			const lenderPayable = await getOrCreateCashAccount(ctx, {
				family: "LENDER_PAYABLE",
				mortgageId: seeded.mortgageId,
				lenderId: seeded.lenderAId,
			});
			await ctx.db.patch(lenderPayable._id, { cumulativeCredits: 100_000n });
			await ctx.db.patch(trustCash._id, { cumulativeDebits: 100_000n });

			const result = await postCashEntryInternal(ctx, {
				entryType: "LENDER_PAYOUT_SENT",
				effectiveDate: "2026-03-01",
				amount: 25_000,
				debitAccountId: lenderPayable._id,
				creditAccountId: trustCash._id,
				idempotencyKey: buildIdempotencyKey(
					"posting-group-test",
					String(transferRequestId)
				),
				mortgageId: seeded.mortgageId,
				lenderId: seeded.lenderAId,
				transferRequestId,
				source: SYSTEM_SOURCE,
			});
			return result.entry;
		});

		const result = await t.run(async (ctx) => {
			return postTransferReversal(ctx, {
				transferRequestId,
				originalEntryId: originalEntry._id,
				amount: 25_000,
				effectiveDate: "2026-03-15",
				source: SYSTEM_SOURCE,
				reason: "Test",
			});
		});

		expect(result.postingGroupId).toBe(
			`reversal:transfer:${transferRequestId}`
		);
	});
});

// ═══════════════════════════════════════════════════════════════════
// T-021: Clawback scope — only reverses payouts for the specific obligation
// ═══════════════════════════════════════════════════════════════════

describe("T-021: Clawback scope is obligation-scoped", () => {
	it("does NOT claw back payouts from other obligations", async () => {
		const t = createHarness(modules);
		const setup = await setupFullSettlementFlow(t);

		// Create a second obligation and post a payout for it
		const otherObligationId = await createSettledObligation(t, {
			mortgageId: setup.mortgageId,
			borrowerId: setup.borrowerId,
			amount: 50_000,
		});

		// Post a payout for the OTHER obligation
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
			await ctx.db.patch(lenderPayableAccount._id, {
				cumulativeCredits:
					(await ctx.db.get(lenderPayableAccount._id))?.cumulativeCredits +
					50_000n,
			});

			await postCashEntryInternal(ctx, {
				entryType: "LENDER_PAYOUT_SENT",
				effectiveDate: "2026-03-05",
				amount: 50_000,
				debitAccountId: lenderPayableAccount._id,
				creditAccountId: trustCashAccount._id,
				idempotencyKey: buildIdempotencyKey(
					"other-obligation-payout",
					String(otherObligationId)
				),
				mortgageId: setup.mortgageId,
				obligationId: otherObligationId,
				lenderId: setup.lenderAId,
				source: SYSTEM_SOURCE,
			});
		});

		// Reverse the FIRST obligation's cascade
		const result = await t.run(async (ctx) => {
			return postPaymentReversalCascade(ctx, {
				attemptId: setup.attemptId,
				obligationId: setup.obligationId,
				mortgageId: setup.mortgageId,
				effectiveDate: "2026-03-15",
				source: SYSTEM_SOURCE,
				reason: "Reverse setup obligation",
			});
		});

		// The other obligation's payout should NOT be reversed — no payout-clawback entries
		// unless they match obligationId=setup.obligationId
		const clawbackEntries = result.reversalEntries.filter((e) =>
			e.idempotencyKey.includes("payout-clawback")
		);
		// The only payout-clawback (if any) should be for setup.obligationId, not otherObligationId
		for (const entry of clawbackEntries) {
			expect(entry.obligationId).toBe(setup.obligationId);
		}
	});
});

// ═══════════════════════════════════════════════════════════════════
// T-022: assertReversalAmountValid rejects zero and negative amounts
// ═══════════════════════════════════════════════════════════════════

describe("T-022: assertReversalAmountValid edge cases", () => {
	it("throws on zero reversal amount", () => {
		expect(() => {
			assertReversalAmountValid(0, 100_000n, "test-context");
		}).toThrow(ConvexError);
	});

	it("throws on negative reversal amount", () => {
		expect(() => {
			assertReversalAmountValid(-1, 100_000n, "test-context");
		}).toThrow(ConvexError);
	});
});
