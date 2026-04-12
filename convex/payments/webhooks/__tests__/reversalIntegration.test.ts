import process from "node:process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerAuditLogComponent } from "../../../../src/test/convex/registerAuditLogComponent";
import { internal } from "../../../_generated/api";
import type { Id } from "../../../_generated/dataModel";
import type { MutationCtx } from "../../../_generated/server";
import {
	publishTransferConfirmed,
	publishTransferReversed,
} from "../../../engine/effects/transfer";
import { convexModules } from "../../../test/moduleMaps";
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
	postObligationAccrued,
	postSettlementAllocation,
} from "../../cashLedger/integrations";

const modules = convexModules;

const testGlobal = globalThis as typeof globalThis & {
	process?: {
		env: Record<string, string | undefined>;
	};
};

if (!testGlobal.process) {
	testGlobal.process = process as unknown as {
		env: Record<string, string | undefined>;
	};
}

const testEnv = testGlobal.process.env;
const envRestorers: Array<() => void> = [];

function setTestEnv(key: string, value: string) {
	const previous = testEnv[key];
	testEnv[key] = value;
	envRestorers.push(() => {
		if (previous === undefined) {
			delete testEnv[key];
			return;
		}
		testEnv[key] = previous;
	});
}

beforeEach(() => {
	envRestorers.length = 0;
	setTestEnv("DISABLE_GT_HASHCHAIN", "true");
	setTestEnv("DISABLE_CASH_LEDGER_HASHCHAIN", "true");
	vi.useFakeTimers();
});

afterEach(() => {
	while (envRestorers.length > 0) {
		envRestorers.pop()?.();
	}
	vi.clearAllTimers();
	vi.useRealTimers();
});

interface TransferEffectHandler {
	_handler: (
		ctx: MutationCtx,
		args: {
			entityId: Id<"transferRequests">;
			entityType: "transfer";
			eventType: string;
			journalEntryId: string;
			effectName: string;
			payload?: Record<string, unknown>;
			source: typeof SYSTEM_SOURCE;
		}
	) => Promise<void>;
}

const publishTransferConfirmedMutation =
	publishTransferConfirmed as unknown as TransferEffectHandler;
const publishTransferReversedMutation =
	publishTransferReversed as unknown as TransferEffectHandler;

async function applyTransferConfirmedEffect(
	t: TestHarness,
	args: {
		transferId: Id<"transferRequests">;
		settledAt?: number;
	}
) {
	await t.run(async (ctx) => {
		await publishTransferConfirmedMutation._handler(ctx, {
			entityId: args.transferId,
			entityType: "transfer",
			eventType: "FUNDS_SETTLED",
			journalEntryId: `test-transfer-confirmed:${args.transferId}`,
			effectName: "publishTransferConfirmed",
			payload:
				typeof args.settledAt === "number"
					? { settledAt: args.settledAt }
					: undefined,
			source: SYSTEM_SOURCE,
		});
	});
}

async function applyTransferReversalEffect(
	t: TestHarness,
	args: {
		reason: string;
		reversalRef: string;
		transferId: Id<"transferRequests">;
	}
) {
	await t.run(async (ctx) => {
		await publishTransferReversedMutation._handler(ctx, {
			entityId: args.transferId,
			entityType: "transfer",
			eventType: "TRANSFER_REVERSED",
			journalEntryId: `test-transfer-reversed:${args.transferId}`,
			effectName: "publishTransferReversed",
			payload: {
				reason: args.reason,
				reversalRef: args.reversalRef,
				effectiveDate: "2026-03-10",
			},
			source: SYSTEM_SOURCE,
		});
	});
}

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
	transferId: Id<"transferRequests">;
}

// ── Seed helper: full settlement pipeline through confirmed ─────────
// Seeds entities, creates a confirmed collectionAttempt backed by a confirmed
// transfer request, then posts accrual + cash receipt + allocation entries.

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

	// Create collectionPlanEntry + confirmed collectionAttempt backed by a
	// confirmed transfer request.
	const { attemptId, planEntryId, transferId } = await t.run(async (ctx) => {
		const planEntryId = await ctx.db.insert("collectionPlanEntries", {
			mortgageId,
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
			mortgageId,
			obligationIds: [obligationId],
			method: "manual",
			amount: TOTAL_AMOUNT,
			initiatedAt: Date.now() - 120_000,
			settledAt: Date.now() - 60_000,
		});

		const transferId = await ctx.db.insert("transferRequests", {
			status: "confirmed",
			direction: "inbound",
			transferType: "borrower_interest_collection",
			amount: TOTAL_AMOUNT,
			currency: "CAD",
			counterpartyType: "borrower",
			counterpartyId: `${borrowerId}`,
			providerCode: "pad_rotessa",
			providerRef: "txn_test_reversal_001",
			idempotencyKey: `reversal-seed:${attemptId}`,
			source: SYSTEM_SOURCE,
			createdAt: Date.now() - 120_000,
			lastTransitionAt: Date.now() - 60_000,
			confirmedAt: Date.now() - 60_000,
			planEntryId,
			collectionAttemptId: attemptId,
			obligationId,
			mortgageId,
			borrowerId,
		});

		await ctx.db.patch(attemptId, { transferRequestId: transferId });

		return { attemptId, planEntryId, transferId };
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
	await applyTransferConfirmedEffect(t, {
		transferId,
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
		transferId,
		dispersalEntryAId,
		dispersalEntryBId,
	};
}

// ═══════════════════════════════════════════════════════════════════
// Reversal webhook → GT transition integration tests
// ═══════════════════════════════════════════════════════════════════

describe("Reversal webhook integration: GT transition (confirmed → reversed)", () => {
	// ── T-101: Confirmed transfer reverses the linked attempt ─────
	it("T-101: processReversalCascade transitions the confirmed transfer and linked attempt to reversed", async () => {
		const t = createHarness(modules);
		registerAuditLogComponent(t, "auditLog");
		const state = await seedConfirmedAttemptPipeline(t);

		const beforeTransfer = await t.run(async (ctx) =>
			ctx.db.get(state.transferId)
		);
		const beforeAttempt = await t.run(async (ctx) =>
			ctx.db.get(state.attemptId)
		);
		expect(beforeTransfer?.status).toBe("confirmed");
		expect(beforeAttempt?.status).toBe("confirmed");

		const result = await t.mutation(
			internal.payments.webhooks.processReversal.processReversalCascade,
			{
				transferId: state.transferId,
				effectiveDate: "2026-03-10",
				reason: "NSF — integration test",
				provider: "rotessa" as const,
				providerEventId: "evt_nsf_001",
			}
		);
		await applyTransferReversalEffect(t, {
			transferId: state.transferId,
			reason: "NSF — integration test",
			reversalRef: "evt_nsf_001",
		});

		expect(result.success).toBe(true);
		expect(result.newState).toBe("reversed");

		const afterTransfer = await t.run(async (ctx) =>
			ctx.db.get(state.transferId)
		);
		const afterAttempt = await t.run(async (ctx) =>
			ctx.db.get(state.attemptId)
		);
		expect(afterTransfer?.status).toBe("reversed");
		expect(afterAttempt?.status).toBe("reversed");
	});

	// ── T-102: transfer lookup by canonical provider boundary ─────
	it("T-102: getTransferRequestByProviderRef returns the seeded transfer", async () => {
		const t = createHarness(modules);
		registerAuditLogComponent(t, "auditLog");
		const state = await seedConfirmedAttemptPipeline(t);

		const found = await t.query(
			internal.payments.webhooks.transferCore.getTransferRequestByProviderRef,
			{
				providerCode: "pad_rotessa",
				providerRef: "txn_test_reversal_001",
			}
		);

		expect(found).not.toBeNull();
		expect(found?._id).toBe(state.transferId);
		expect(found?.status).toBe("confirmed");
	});

	it("T-102b: getTransferRequestByProviderRef returns null for unknown ref", async () => {
		const t = createHarness(modules);
		registerAuditLogComponent(t, "auditLog");
		await seedConfirmedAttemptPipeline(t);

		const found = await t.query(
			internal.payments.webhooks.transferCore.getTransferRequestByProviderRef,
			{
				providerCode: "pad_rotessa",
				providerRef: "txn_unknown_ref",
			}
		);

		expect(found).toBeNull();
	});
});

// ═══════════════════════════════════════════════════════════════════
// Duplicate / idempotent webhook handling
// ═══════════════════════════════════════════════════════════════════

describe("Reversal webhook integration: duplicate/idempotent handling", () => {
	// ── T-103: Second reversal on already-reversed transfer ─────
	it("T-103: second processReversalCascade on a reversed transfer is rejected", async () => {
		const t = createHarness(modules);
		registerAuditLogComponent(t, "auditLog");
		const state = await seedConfirmedAttemptPipeline(t);

		// First reversal succeeds
		const first = await t.mutation(
			internal.payments.webhooks.processReversal.processReversalCascade,
			{
				transferId: state.transferId,
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
				transferId: state.transferId,
				effectiveDate: "2026-03-10",
				reason: "NSF — duplicate call",
				provider: "rotessa" as const,
				providerEventId: "evt_nsf_dup_002",
			}
		);
		expect(second.success).toBe(false);
	});

	// ── T-104: reversed transfer + attempt persist the idempotent state ──
	it("T-104: after reversal, both transfer and attempt persist the reversed state", async () => {
		const t = createHarness(modules);
		registerAuditLogComponent(t, "auditLog");
		const state = await seedConfirmedAttemptPipeline(t);

		await t.mutation(
			internal.payments.webhooks.processReversal.processReversalCascade,
			{
				transferId: state.transferId,
				effectiveDate: "2026-03-10",
				reason: "NSF — idempotency path",
				provider: "rotessa" as const,
				providerEventId: "evt_rotessa_idem_001",
			}
		);
		await applyTransferReversalEffect(t, {
			transferId: state.transferId,
			reason: "NSF — idempotency path",
			reversalRef: "evt_rotessa_idem_001",
		});

		const transfer = await t.run(async (ctx) => ctx.db.get(state.transferId));
		const attempt = await t.run(async (ctx) => ctx.db.get(state.attemptId));
		expect(transfer?.status).toBe("reversed");
		expect(attempt?.status).toBe("reversed");
	});
});

// ═══════════════════════════════════════════════════════════════════
// Out-of-order webhook handling
// ═══════════════════════════════════════════════════════════════════

describe("Reversal webhook integration: out-of-order rejection", () => {
	// ── T-105: Reversal on initiated (pre-confirmed) transfer ───
	it("T-105: TRANSFER_REVERSED is rejected on an initiated transfer", async () => {
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

		const { attemptId, transferId } = await t.run(async (ctx) => {
			const planEntryId = await ctx.db.insert("collectionPlanEntries", {
				mortgageId,
				obligationIds: [obligationId],
				amount: TOTAL_AMOUNT,
				method: "manual",
				scheduledDate: Date.now(),
				status: "planned",
				source: "default_schedule",
				createdAt: Date.now(),
			});

			const attemptId = await ctx.db.insert("collectionAttempts", {
				status: "initiated",
				machineContext: { attemptId: "", retryCount: 0, maxRetries: 3 },
				lastTransitionAt: Date.now(),
				planEntryId,
				mortgageId,
				obligationIds: [obligationId],
				method: "manual",
				amount: TOTAL_AMOUNT,
				initiatedAt: Date.now(),
			});

			const transferId = await ctx.db.insert("transferRequests", {
				status: "initiated",
				direction: "inbound",
				transferType: "borrower_interest_collection",
				amount: TOTAL_AMOUNT,
				currency: "CAD",
				counterpartyType: "borrower",
				counterpartyId: `${borrowerId}`,
				providerCode: "pad_rotessa",
				providerRef: "txn_initiated_001",
				idempotencyKey: `reversal-initiated:${attemptId}`,
				source: SYSTEM_SOURCE,
				createdAt: Date.now(),
				lastTransitionAt: Date.now(),
				planEntryId,
				collectionAttemptId: attemptId,
				obligationId,
				mortgageId,
				borrowerId,
			});

			await ctx.db.patch(attemptId, { transferRequestId: transferId });

			return { attemptId, transferId };
		});

		const result = await t.mutation(
			internal.payments.webhooks.processReversal.processReversalCascade,
			{
				transferId,
				effectiveDate: "2026-03-10",
				reason: "NSF — out-of-order test",
				provider: "rotessa" as const,
				providerEventId: "evt_nsf_ooo_001",
			}
		);

		expect(result.success).toBe(false);

		const transfer = await t.run(async (ctx) => ctx.db.get(transferId));
		const attempt = await t.run(async (ctx) => ctx.db.get(attemptId));
		expect(transfer?.status).toBe("initiated");
		expect(attempt?.status).toBe("initiated");
	});

	// ── T-106: Reversal on pending transfer ─────────────────────
	it("T-106: TRANSFER_REVERSED is rejected on a pending transfer", async () => {
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

		const { attemptId, transferId } = await t.run(async (ctx) => {
			const planEntryId = await ctx.db.insert("collectionPlanEntries", {
				mortgageId,
				obligationIds: [obligationId],
				amount: TOTAL_AMOUNT,
				method: "manual",
				scheduledDate: Date.now(),
				status: "executing",
				source: "default_schedule",
				createdAt: Date.now(),
			});

			const attemptId = await ctx.db.insert("collectionAttempts", {
				status: "pending",
				machineContext: { attemptId: "", retryCount: 0, maxRetries: 3 },
				lastTransitionAt: Date.now(),
				planEntryId,
				mortgageId,
				obligationIds: [obligationId],
				method: "manual",
				amount: TOTAL_AMOUNT,
				initiatedAt: Date.now(),
			});

			const transferId = await ctx.db.insert("transferRequests", {
				status: "pending",
				direction: "inbound",
				transferType: "borrower_interest_collection",
				amount: TOTAL_AMOUNT,
				currency: "CAD",
				counterpartyType: "borrower",
				counterpartyId: `${borrowerId}`,
				providerCode: "pad_rotessa",
				providerRef: "txn_pending_001",
				idempotencyKey: `reversal-pending:${attemptId}`,
				source: SYSTEM_SOURCE,
				createdAt: Date.now(),
				lastTransitionAt: Date.now(),
				planEntryId,
				collectionAttemptId: attemptId,
				obligationId,
				mortgageId,
				borrowerId,
			});

			await ctx.db.patch(attemptId, { transferRequestId: transferId });

			return { attemptId, transferId };
		});

		const result = await t.mutation(
			internal.payments.webhooks.processReversal.processReversalCascade,
			{
				transferId,
				effectiveDate: "2026-03-10",
				reason: "NSF — pending out-of-order",
				provider: "rotessa" as const,
				providerEventId: "evt_nsf_ooo_pending_001",
			}
		);

		expect(result.success).toBe(false);

		const transfer = await t.run(async (ctx) => ctx.db.get(transferId));
		const attempt = await t.run(async (ctx) => ctx.db.get(attemptId));
		expect(transfer?.status).toBe("pending");
		expect(attempt?.status).toBe("pending");
	});
});

// ═══════════════════════════════════════════════════════════════════
// emitPaymentReversed effect → journal entries
//
// These tests exercise the canonical transfer-owned reversal path end-to-end.
// For attempt-linked inbound transfers, processReversalCascade now fans out
// through the transfer effect and writes transfer-scoped reversal entries.
// ═══════════════════════════════════════════════════════════════════

describe("Reversal webhook integration: emitPaymentReversed journal entries", () => {
	it("T-107: processReversalCascade posts transfer-owned reversal journal entries for each obligation", async () => {
		const t = createHarness(modules);
		registerAuditLogComponent(t, "auditLog");
		const state = await seedConfirmedAttemptPipeline(t);

		// Transition to reversed first (so the attempt is in the correct state)
		await t.mutation(
			internal.payments.webhooks.processReversal.processReversalCascade,
			{
				transferId: state.transferId,
				effectiveDate: "2026-03-10",
				reason: "NSF — journal entry test",
				provider: "rotessa" as const,
				providerEventId: "evt_journal_001",
			}
		);
		await applyTransferReversalEffect(t, {
			transferId: state.transferId,
			reason: "NSF — journal entry test",
			reversalRef: "evt_journal_001",
		});

		const expectedPostingGroupId = `reversal-group:transfer:${state.transferId}`;
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

		// CASH_RECEIVED reversal should reference the canonical transfer
		const cashReceivedReversal = reversalEntries.find(
			(e) => e.transferRequestId === state.transferId
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
				transferId: state.transferId,
				effectiveDate: "2026-03-10",
				reason: "NSF — balance test",
				provider: "rotessa" as const,
				providerEventId: "evt_balance_001",
			}
		);
		await applyTransferReversalEffect(t, {
			transferId: state.transferId,
			reason: "NSF — balance test",
			reversalRef: "evt_balance_001",
		});

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

		// Transition through the canonical transfer-owned reversal path
		await t.mutation(
			internal.payments.webhooks.processReversal.processReversalCascade,
			{
				transferId: state.transferId,
				effectiveDate: "2026-03-10",
				reason: "NSF — posting group test",
				provider: "rotessa" as const,
				providerEventId: "evt_pg_001",
			}
		);
		await applyTransferReversalEffect(t, {
			transferId: state.transferId,
			reason: "NSF — posting group test",
			reversalRef: "evt_pg_001",
		});

		const expectedPostingGroupId = `reversal-group:transfer:${state.transferId}`;
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
