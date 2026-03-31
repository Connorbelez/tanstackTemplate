import { describe, expect, it } from "vitest";
import { internal } from "../../../_generated/api";
import type { Id } from "../../../_generated/dataModel";
import { convexModules } from "../../../test/moduleMaps";
import { registerAuditLogComponent } from "../../../test/registerAuditLogComponent";
import {
	createHarness,
	SYSTEM_SOURCE,
	seedMinimalEntities,
	type TestHarness,
} from "../../cashLedger/__tests__/testUtils";
import {
	findCashAccount,
	getCashAccountBalance,
} from "../../cashLedger/accounts";
import {
	postCashReceiptForObligation,
	postObligationAccrued,
	postSettlementAllocation,
} from "../../cashLedger/integrations";

const modules = convexModules;

// ── Amount constants ────────────────────────────────────────────────
const TOTAL_AMOUNT = 100_000;
const LENDER_A_AMOUNT = 54_000;
const LENDER_B_AMOUNT = 36_000;
const SERVICING_FEE_AMOUNT = 10_000;

// ── Pipeline state ──────────────────────────────────────────────────

interface PipelineState {
	attemptId: Id<"collectionAttempts">;
	borrowerId: Id<"borrowers">;
	dispersalEntryAId: Id<"dispersalEntries">;
	dispersalEntryBId: Id<"dispersalEntries">;
	lenderAId: Id<"lenders">;
	lenderBId: Id<"lenders">;
	mortgageId: Id<"mortgages">;
	obligationId: Id<"obligations">;
	planEntryId: Id<"collectionPlanEntries">;
}

// ── Seed helper: full settlement pipeline through confirmed ─────────
// Seeds entities, creates a confirmed collectionAttempt with providerRef,
// posts accrual + cash receipt + allocation entries.

async function seedConfirmedAttemptPipeline(
	t: TestHarness
): Promise<PipelineState> {
	const { borrowerId, lenderAId, lenderBId, mortgageId } =
		await seedMinimalEntities(t);

	// Create obligation (settled)
	const obligationId = await t.run(async (ctx) => {
		return ctx.db.insert("obligations", {
			status: "settled",
			machineContext: {},
			lastTransitionAt: Date.now(),
			mortgageId,
			borrowerId,
			paymentNumber: 1,
			type: "regular_interest",
			amount: TOTAL_AMOUNT,
			amountSettled: TOTAL_AMOUNT,
			dueDate: Date.parse("2026-03-01T00:00:00Z"),
			gracePeriodEnd: Date.parse("2026-03-16T00:00:00Z"),
			settledAt: Date.parse("2026-03-01T00:00:00Z"),
			createdAt: Date.now(),
		});
	});

	// Create collectionPlanEntry + confirmed collectionAttempt with providerRef
	const { attemptId, planEntryId } = await t.run(async (ctx) => {
		const planEntryId = await ctx.db.insert("collectionPlanEntries", {
			obligationIds: [obligationId],
			amount: TOTAL_AMOUNT,
			method: "manual",
			scheduledDate: Date.now(),
			status: "completed",
			source: "default_schedule",
			createdAt: Date.now(),
		});

		const attemptId = await ctx.db.insert("collectionAttempts", {
			status: "confirmed",
			machineContext: { attemptId: "", retryCount: 0, maxRetries: 3 },
			lastTransitionAt: Date.now(),
			planEntryId,
			method: "manual",
			amount: TOTAL_AMOUNT,
			providerRef: "txn_test_reversal_001",
			initiatedAt: Date.now() - 120_000,
			settledAt: Date.now() - 60_000,
		});

		return { attemptId, planEntryId };
	});

	// Create dispersalEntry records (one per lender)
	const { dispersalEntryAId, dispersalEntryBId } = await t.run(async (ctx) => {
		const ledgerAccounts = await ctx.db
			.query("ledger_accounts")
			.filter((q) => q.eq(q.field("mortgageId"), mortgageId))
			.collect();
		const lenderAccountA = ledgerAccounts[0];
		const lenderAccountB = ledgerAccounts[1];

		const dispersalEntryAId = await ctx.db.insert("dispersalEntries", {
			mortgageId,
			lenderId: lenderAId,
			lenderAccountId: lenderAccountA._id,
			amount: LENDER_A_AMOUNT,
			dispersalDate: "2026-03-01",
			obligationId,
			servicingFeeDeducted: 0,
			status: "pending",
			idempotencyKey: `dispersal-a-${obligationId}`,
			calculationDetails: {
				settledAmount: TOTAL_AMOUNT,
				servicingFee: SERVICING_FEE_AMOUNT,
				distributableAmount: TOTAL_AMOUNT - SERVICING_FEE_AMOUNT,
				ownershipUnits: 6000,
				totalUnits: 10_000,
				ownershipFraction: 0.6,
				rawAmount: LENDER_A_AMOUNT,
				roundedAmount: LENDER_A_AMOUNT,
			},
			createdAt: Date.now(),
		});

		const dispersalEntryBId = await ctx.db.insert("dispersalEntries", {
			mortgageId,
			lenderId: lenderBId,
			lenderAccountId: lenderAccountB._id,
			amount: LENDER_B_AMOUNT,
			dispersalDate: "2026-03-01",
			obligationId,
			servicingFeeDeducted: 0,
			status: "pending",
			idempotencyKey: `dispersal-b-${obligationId}`,
			calculationDetails: {
				settledAmount: TOTAL_AMOUNT,
				servicingFee: SERVICING_FEE_AMOUNT,
				distributableAmount: TOTAL_AMOUNT - SERVICING_FEE_AMOUNT,
				ownershipUnits: 4000,
				totalUnits: 10_000,
				ownershipFraction: 0.4,
				rawAmount: LENDER_B_AMOUNT,
				roundedAmount: LENDER_B_AMOUNT,
			},
			createdAt: Date.now(),
		});

		return { dispersalEntryAId, dispersalEntryBId };
	});

	// Post accrual entries
	await t.run(async (ctx) => {
		return postObligationAccrued(ctx, {
			obligationId,
			source: SYSTEM_SOURCE,
		});
	});

	// Post cash receipt
	await t.run(async (ctx) => {
		return postCashReceiptForObligation(ctx, {
			obligationId,
			amount: TOTAL_AMOUNT,
			idempotencyKey: `cash-ledger:cash-receipt-reversal-int-${attemptId}`,
			attemptId,
			source: SYSTEM_SOURCE,
		});
	});

	// Post settlement allocation
	await t.run(async (ctx) => {
		return postSettlementAllocation(ctx, {
			obligationId,
			mortgageId,
			settledDate: "2026-03-01",
			servicingFee: SERVICING_FEE_AMOUNT,
			entries: [
				{
					dispersalEntryId: dispersalEntryAId,
					lenderId: lenderAId,
					amount: LENDER_A_AMOUNT,
				},
				{
					dispersalEntryId: dispersalEntryBId,
					lenderId: lenderBId,
					amount: LENDER_B_AMOUNT,
				},
			],
			source: SYSTEM_SOURCE,
		});
	});

	return {
		borrowerId,
		lenderAId,
		lenderBId,
		mortgageId,
		obligationId,
		attemptId,
		planEntryId,
		dispersalEntryAId,
		dispersalEntryBId,
	};
}

// ═══════════════════════════════════════════════════════════════════
// Reversal webhook → GT transition integration tests
// ═══════════════════════════════════════════════════════════════════

describe("Reversal webhook integration: GT transition (confirmed → reversed)", () => {
	// ── T-101: Confirmed attempt transitions to reversed ─────────
	it("T-101: processReversalCascade transitions confirmed attempt to reversed", async () => {
		const t = createHarness(modules);
		registerAuditLogComponent(t, "auditLog");
		const state = await seedConfirmedAttemptPipeline(t);

		// Verify attempt is in confirmed state before reversal
		const beforeAttempt = await t.run(async (ctx) => {
			return ctx.db.get(state.attemptId);
		});
		expect(beforeAttempt?.status).toBe("confirmed");

		// Fire the GT transition via processReversalCascade (same as handlePaymentReversal calls)
		const result = await t.mutation(
			internal.payments.webhooks.processReversal.processReversalCascade,
			{
				attemptId: state.attemptId,
				effectiveDate: "2026-03-10",
				reason: "NSF — integration test",
				provider: "rotessa" as const,
				providerEventId: "evt_nsf_001",
			}
		);

		expect(result.success).toBe(true);
		expect(result.newState).toBe("reversed");

		// Verify the entity was persisted with reversed status
		const afterAttempt = await t.run(async (ctx) => {
			return ctx.db.get(state.attemptId);
		});
		expect(afterAttempt?.status).toBe("reversed");
	});

	// ── T-102: getAttemptByProviderRef look-up ───────────────────
	it("T-102: getAttemptByProviderRef returns the seeded attempt", async () => {
		const t = createHarness(modules);
		registerAuditLogComponent(t, "auditLog");
		const state = await seedConfirmedAttemptPipeline(t);

		const found = await t.query(
			internal.payments.webhooks.handleReversal.getAttemptByProviderRef,
			{ providerRef: "txn_test_reversal_001" }
		);

		expect(found).not.toBeNull();
		expect(found?._id).toBe(state.attemptId);
		expect(found?.status).toBe("confirmed");
	});

	it("T-102b: getAttemptByProviderRef returns null for unknown ref", async () => {
		const t = createHarness(modules);
		registerAuditLogComponent(t, "auditLog");
		await seedConfirmedAttemptPipeline(t);

		const found = await t.query(
			internal.payments.webhooks.handleReversal.getAttemptByProviderRef,
			{ providerRef: "txn_unknown_ref" }
		);

		expect(found).toBeNull();
	});
});

// ═══════════════════════════════════════════════════════════════════
// Duplicate / idempotent webhook handling
// ═══════════════════════════════════════════════════════════════════

describe("Reversal webhook integration: duplicate/idempotent handling", () => {
	// ── T-103: Second reversal on already-reversed attempt ──────
	it("T-103: second processReversalCascade on reversed attempt is rejected (GT rejects PAYMENT_REVERSED in reversed state)", async () => {
		const t = createHarness(modules);
		registerAuditLogComponent(t, "auditLog");
		const state = await seedConfirmedAttemptPipeline(t);

		// First reversal succeeds
		const first = await t.mutation(
			internal.payments.webhooks.processReversal.processReversalCascade,
			{
				attemptId: state.attemptId,
				effectiveDate: "2026-03-10",
				reason: "NSF — first call",
				provider: "rotessa" as const,
				providerEventId: "evt_nsf_dup_001",
			}
		);
		expect(first.success).toBe(true);
		expect(first.newState).toBe("reversed");

		// Second reversal — the GT engine rejects PAYMENT_REVERSED in "reversed" (final state)
		const second = await t.mutation(
			internal.payments.webhooks.processReversal.processReversalCascade,
			{
				attemptId: state.attemptId,
				effectiveDate: "2026-03-10",
				reason: "NSF — duplicate call",
				provider: "rotessa" as const,
				providerEventId: "evt_nsf_dup_002",
			}
		);
		expect(second.success).toBe(false);
	});

	// ── T-104: handlePaymentReversal logic — already_reversed shortcut ──
	// Tests the state-check logic that handlePaymentReversal performs:
	// if attempt.status === "reversed", it returns { success: true, reason: "already_reversed" }
	// We simulate this by checking the attempt status after first reversal.
	it("T-104: after reversal, attempt status is 'reversed' enabling idempotent return path", async () => {
		const t = createHarness(modules);
		registerAuditLogComponent(t, "auditLog");
		const state = await seedConfirmedAttemptPipeline(t);

		await t.mutation(
			internal.payments.webhooks.processReversal.processReversalCascade,
			{
				attemptId: state.attemptId,
				effectiveDate: "2026-03-10",
				reason: "NSF — idempotency path",
				provider: "stripe" as const,
				providerEventId: "evt_stripe_idem_001",
			}
		);

		// The handler checks attempt.status === "reversed" and returns early
		const attempt = await t.run(async (ctx) => {
			return ctx.db.get(state.attemptId);
		});
		expect(attempt?.status).toBe("reversed");
		// handlePaymentReversal would return { success: true, reason: "already_reversed" }
		// for this attempt on a subsequent call — verified via the status check.
	});
});

// ═══════════════════════════════════════════════════════════════════
// Out-of-order webhook handling
// ═══════════════════════════════════════════════════════════════════

describe("Reversal webhook integration: out-of-order rejection", () => {
	// ── T-105: Reversal on initiated (pre-confirmed) attempt ────
	it("T-105: PAYMENT_REVERSED rejected on 'initiated' attempt (not yet confirmed)", async () => {
		const t = createHarness(modules);
		registerAuditLogComponent(t, "auditLog");

		// Seed minimal entities but create an attempt in "initiated" state (no providerRef)
		const { borrowerId, mortgageId } = await seedMinimalEntities(t);

		const obligationId = await t.run(async (ctx) => {
			return ctx.db.insert("obligations", {
				status: "due",
				machineContext: {},
				lastTransitionAt: Date.now(),
				mortgageId,
				borrowerId,
				paymentNumber: 1,
				type: "regular_interest",
				amount: TOTAL_AMOUNT,
				amountSettled: 0,
				dueDate: Date.parse("2026-04-01T00:00:00Z"),
				gracePeriodEnd: Date.parse("2026-04-16T00:00:00Z"),
				createdAt: Date.now(),
			});
		});

		const attemptId = await t.run(async (ctx) => {
			const planEntryId = await ctx.db.insert("collectionPlanEntries", {
				obligationIds: [obligationId],
				amount: TOTAL_AMOUNT,
				method: "manual",
				scheduledDate: Date.now(),
				status: "planned",
				source: "default_schedule",
				createdAt: Date.now(),
			});

			return ctx.db.insert("collectionAttempts", {
				status: "initiated",
				machineContext: { attemptId: "", retryCount: 0, maxRetries: 3 },
				lastTransitionAt: Date.now(),
				planEntryId,
				method: "manual",
				amount: TOTAL_AMOUNT,
				initiatedAt: Date.now(),
			});
		});

		// PAYMENT_REVERSED should be rejected — the machine only accepts it in "confirmed"
		const result = await t.mutation(
			internal.payments.webhooks.processReversal.processReversalCascade,
			{
				attemptId,
				effectiveDate: "2026-03-10",
				reason: "NSF — out-of-order test",
				provider: "rotessa" as const,
				providerEventId: "evt_nsf_ooo_001",
			}
		);

		expect(result.success).toBe(false);

		// Attempt status should remain "initiated"
		const attempt = await t.run(async (ctx) => {
			return ctx.db.get(attemptId);
		});
		expect(attempt?.status).toBe("initiated");
	});

	// ── T-106: Reversal on pending attempt ──────────────────────
	it("T-106: PAYMENT_REVERSED rejected on 'pending' attempt", async () => {
		const t = createHarness(modules);
		registerAuditLogComponent(t, "auditLog");

		const { borrowerId, mortgageId } = await seedMinimalEntities(t);

		const obligationId = await t.run(async (ctx) => {
			return ctx.db.insert("obligations", {
				status: "due",
				machineContext: {},
				lastTransitionAt: Date.now(),
				mortgageId,
				borrowerId,
				paymentNumber: 1,
				type: "regular_interest",
				amount: TOTAL_AMOUNT,
				amountSettled: 0,
				dueDate: Date.parse("2026-04-01T00:00:00Z"),
				gracePeriodEnd: Date.parse("2026-04-16T00:00:00Z"),
				createdAt: Date.now(),
			});
		});

		const attemptId = await t.run(async (ctx) => {
			const planEntryId = await ctx.db.insert("collectionPlanEntries", {
				obligationIds: [obligationId],
				amount: TOTAL_AMOUNT,
				method: "manual",
				scheduledDate: Date.now(),
				status: "executing",
				source: "default_schedule",
				createdAt: Date.now(),
			});

			return ctx.db.insert("collectionAttempts", {
				status: "pending",
				machineContext: { attemptId: "", retryCount: 0, maxRetries: 3 },
				lastTransitionAt: Date.now(),
				planEntryId,
				method: "manual",
				amount: TOTAL_AMOUNT,
				providerRef: "txn_pending_001",
				initiatedAt: Date.now(),
			});
		});

		// PAYMENT_REVERSED should be rejected — machine only accepts it in "confirmed"
		const result = await t.mutation(
			internal.payments.webhooks.processReversal.processReversalCascade,
			{
				attemptId,
				effectiveDate: "2026-03-10",
				reason: "NSF — pending out-of-order",
				provider: "stripe" as const,
				providerEventId: "evt_nsf_ooo_pending_001",
			}
		);

		expect(result.success).toBe(false);

		// Attempt status should remain "pending"
		const attempt = await t.run(async (ctx) => {
			return ctx.db.get(attemptId);
		});
		expect(attempt?.status).toBe("pending");
	});
});

// ═══════════════════════════════════════════════════════════════════
// emitPaymentReversed effect → journal entries
//
// These tests call executeReversalCascadeStep directly (the mutation
// that postPaymentReversalCascade calls per-obligation) to verify
// journal entry creation without requiring the durable workflow
// component. This is the actual business logic that processes
// reversal entries in the cash ledger.
// ═══════════════════════════════════════════════════════════════════

describe("Reversal webhook integration: emitPaymentReversed journal entries", () => {
	// ── T-107: executeReversalCascadeStep creates REVERSAL journal entries ──
	it("T-107: executeReversalCascadeStep posts reversal journal entries for each obligation", async () => {
		const t = createHarness(modules);
		registerAuditLogComponent(t, "auditLog");
		const state = await seedConfirmedAttemptPipeline(t);

		// Transition to reversed first (so the attempt is in the correct state)
		await t.mutation(
			internal.payments.webhooks.processReversal.processReversalCascade,
			{
				attemptId: state.attemptId,
				effectiveDate: "2026-03-10",
				reason: "NSF — journal entry test",
				provider: "rotessa" as const,
				providerEventId: "evt_journal_001",
			}
		);

		// Call executeReversalCascadeStep directly — this is the mutation that
		// the durable workflow invokes to process the reversal cascade.
		await t.mutation(
			internal.engine.effects.collectionAttempt.executeReversalCascadeStep,
			{
				entityId: state.attemptId,
				source: SYSTEM_SOURCE,
				reason: "NSF — journal entry test",
				effectiveDate: "2026-03-10",
			}
		);

		// Verify REVERSAL entries were created in the journal.
		// All reversal entries share a postingGroupId of `reversal-group:${attemptId}`.
		const expectedPostingGroupId = `reversal-group:${state.attemptId}`;
		const reversalEntries = await t.run(async (ctx) => {
			return ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_posting_group", (q) =>
					q.eq("postingGroupId", expectedPostingGroupId)
				)
				.collect();
		});

		// Should have at least 4 reversal entries:
		// 1x CASH_RECEIVED reversal, 2x LENDER_PAYABLE_CREATED reversals, 1x SERVICING_FEE_RECOGNIZED reversal
		expect(reversalEntries.length).toBeGreaterThanOrEqual(4);

		// All entries should be REVERSAL type
		for (const entry of reversalEntries) {
			expect(entry.entryType).toBe("REVERSAL");
		}

		// CASH_RECEIVED reversal should reference our attempt
		const cashReceivedReversal = reversalEntries.find(
			(e) => e.attemptId === state.attemptId
		);
		expect(cashReceivedReversal).toBeDefined();

		// Verify each has causedBy linking to original entry
		for (const entry of reversalEntries) {
			expect(entry.causedBy).toBeDefined();
		}
	});

	// ── T-108: Cash balances return to pre-receipt state after reversal ──
	it("T-108: TRUST_CASH balance returns to zero after reversal cascade", async () => {
		const t = createHarness(modules);
		registerAuditLogComponent(t, "auditLog");
		const state = await seedConfirmedAttemptPipeline(t);

		// Verify TRUST_CASH has a non-zero balance before reversal
		const trustCashBefore = await t.run(async (ctx) => {
			const account = await findCashAccount(ctx.db, {
				family: "TRUST_CASH",
				mortgageId: state.mortgageId,
			});
			return account ? getCashAccountBalance(account) : 0n;
		});
		expect(trustCashBefore).not.toBe(0n);

		// Transition to reversed
		await t.mutation(
			internal.payments.webhooks.processReversal.processReversalCascade,
			{
				attemptId: state.attemptId,
				effectiveDate: "2026-03-10",
				reason: "NSF — balance test",
				provider: "rotessa" as const,
				providerEventId: "evt_balance_001",
			}
		);

		// Execute the reversal cascade step directly
		await t.mutation(
			internal.engine.effects.collectionAttempt.executeReversalCascadeStep,
			{
				entityId: state.attemptId,
				source: SYSTEM_SOURCE,
				reason: "NSF — balance test",
				effectiveDate: "2026-03-10",
			}
		);

		// TRUST_CASH should be back to zero (received then reversed)
		const trustCashAfter = await t.run(async (ctx) => {
			const account = await findCashAccount(ctx.db, {
				family: "TRUST_CASH",
				mortgageId: state.mortgageId,
			});
			return account ? getCashAccountBalance(account) : 0n;
		});
		expect(trustCashAfter).toBe(0n);

		// BORROWER_RECEIVABLE should be back to full amount (accrual debited, receipt credited, reversal debited again)
		const brBalance = await t.run(async (ctx) => {
			const account = await findCashAccount(ctx.db, {
				family: "BORROWER_RECEIVABLE",
				mortgageId: state.mortgageId,
				obligationId: state.obligationId,
			});
			return account ? getCashAccountBalance(account) : 0n;
		});
		expect(brBalance).toBe(BigInt(TOTAL_AMOUNT));

		// LENDER_PAYABLE balances should be zero (created then reversed)
		for (const lenderId of [state.lenderAId, state.lenderBId]) {
			const lpBalance = await t.run(async (ctx) => {
				const account = await findCashAccount(ctx.db, {
					family: "LENDER_PAYABLE",
					mortgageId: state.mortgageId,
					lenderId,
				});
				return account ? getCashAccountBalance(account) : 0n;
			});
			expect(lpBalance).toBe(0n);
		}

		// SERVICING_REVENUE should be zero (recognized then reversed)
		const srBalance = await t.run(async (ctx) => {
			const account = await findCashAccount(ctx.db, {
				family: "SERVICING_REVENUE",
				mortgageId: state.mortgageId,
			});
			return account ? getCashAccountBalance(account) : 0n;
		});
		expect(srBalance).toBe(0n);
	});

	// ── T-109: Reversal posting group contains all expected entries ──
	it("T-109: reversal entries share a single postingGroupId", async () => {
		const t = createHarness(modules);
		registerAuditLogComponent(t, "auditLog");
		const state = await seedConfirmedAttemptPipeline(t);

		// Transition + execute cascade step
		await t.mutation(
			internal.payments.webhooks.processReversal.processReversalCascade,
			{
				attemptId: state.attemptId,
				effectiveDate: "2026-03-10",
				reason: "NSF — posting group test",
				provider: "rotessa" as const,
				providerEventId: "evt_pg_001",
			}
		);

		await t.mutation(
			internal.engine.effects.collectionAttempt.executeReversalCascadeStep,
			{
				entityId: state.attemptId,
				source: SYSTEM_SOURCE,
				reason: "NSF — posting group test",
				effectiveDate: "2026-03-10",
			}
		);

		// All reversal entries share postingGroupId = `reversal-group:${attemptId}`
		const expectedPostingGroupId = `reversal-group:${state.attemptId}`;
		const reversalEntries = await t.run(async (ctx) => {
			return ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_posting_group", (q) =>
					q.eq("postingGroupId", expectedPostingGroupId)
				)
				.collect();
		});

		expect(reversalEntries.length).toBeGreaterThanOrEqual(4);

		// All entries should be REVERSAL type and belong to the same group
		for (const entry of reversalEntries) {
			expect(entry.entryType).toBe("REVERSAL");
			expect(entry.postingGroupId).toBe(expectedPostingGroupId);
		}
	});
});
