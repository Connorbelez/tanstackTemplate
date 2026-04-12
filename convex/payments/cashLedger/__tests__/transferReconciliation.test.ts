import auditLogTest from "convex-audit-log/test";
import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";
import { internal } from "../../../_generated/api";
import type { Id } from "../../../_generated/dataModel";
import auditTrailSchema from "../../../components/auditTrail/schema";
import schema from "../../../schema";
import {
	convexModules,
	auditTrailModules as sharedAuditTrailModules,
} from "../../../test/moduleMaps";
import {
	checkOrphanedConfirmedTransfers,
	checkOrphanedReversedTransfers,
	checkStaleOutboundTransfers,
	checkTransferAmountMismatches,
	findOrphanedConfirmedTransferCandidates,
} from "../transferReconciliation";
import { buildIdempotencyKey } from "../types";
import {
	createConfirmedTransfer,
	createDueObligation,
	createHarness,
	createReversedTransfer,
	createTestAccount,
	postTestEntry,
	SYSTEM_SOURCE,
	seedMinimalEntities,
	type TestHarness,
} from "./testUtils";

const modules = convexModules;
const auditTrailModules = sharedAuditTrailModules;

/**
 * Creates a harness with auditLog + auditTrail components registered,
 * required for mutations that call auditLog.log() or postCashEntryInternal().
 */
function createComponentHarness(): TestHarness {
	process.env.DISABLE_CASH_LEDGER_HASHCHAIN = "true";
	const t = convexTest(schema, modules);
	auditLogTest.register(t, "auditLog");
	t.registerComponent("auditTrail", auditTrailSchema, auditTrailModules);
	return t;
}

async function createConfirmedAttempt(
	t: TestHarness,
	args: {
		obligationId: Id<"obligations">;
		amount: number;
	}
) {
	return t.run(async (ctx) => {
		const obligation = await ctx.db.get(args.obligationId);
		if (!obligation) {
			throw new Error("Expected obligation for confirmed attempt setup");
		}

		const planEntryId = await ctx.db.insert("collectionPlanEntries", {
			mortgageId: obligation.mortgageId,
			obligationIds: [args.obligationId],
			amount: args.amount,
			method: "manual",
			scheduledDate: Date.parse("2026-03-15T00:00:00Z"),
			status: "completed",
			source: "default_schedule",
			createdAt: Date.now(),
		});

		return ctx.db.insert("collectionAttempts", {
			planEntryId,
			mortgageId: obligation.mortgageId,
			obligationIds: [args.obligationId],
			amount: args.amount,
			method: "manual",
			status: "confirmed",
			machineContext: { retryCount: 0, maxRetries: 3 },
			initiatedAt: Date.now(),
		});
	});
}

// ── T-017: checkOrphanedConfirmedTransfers ─────────────────────

describe("checkOrphanedConfirmedTransfers", () => {
	it("returns healthy when confirmed transfer has matching journal entry", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);

		const transferId = await createConfirmedTransfer(t, {
			direction: "inbound",
			amount: 50_000,
			mortgageId: seeded.mortgageId,
		});

		// Create matching CASH_RECEIVED journal entry with transferRequestId
		const trustCash = await createTestAccount(t, {
			family: "TRUST_CASH",
		});
		const borrowerReceivable = await createTestAccount(t, {
			family: "BORROWER_RECEIVABLE",
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			initialDebitBalance: 100_000n,
		});

		await postTestEntry(t, {
			entryType: "CASH_RECEIVED",
			effectiveDate: "2026-03-01",
			amount: 50_000,
			debitAccountId: trustCash._id,
			creditAccountId: borrowerReceivable._id,
			idempotencyKey: buildIdempotencyKey(
				"cash-received",
				"transfer",
				transferId
			),
			transferRequestId: transferId,
			mortgageId: seeded.mortgageId,
			source: SYSTEM_SOURCE,
		});

		const result = await t.run(async (ctx) =>
			checkOrphanedConfirmedTransfers(ctx)
		);
		expect(result.isHealthy).toBe(true);
		expect(result.count).toBe(0);
	});

	it("detects orphaned confirmed transfer (no journal entry)", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);

		await createConfirmedTransfer(t, {
			direction: "inbound",
			amount: 50_000,
			mortgageId: seeded.mortgageId,
		});

		const result = await t.run(async (ctx) =>
			checkOrphanedConfirmedTransfers(ctx)
		);
		expect(result.isHealthy).toBe(false);
		expect(result.count).toBe(1);
		expect(result.items[0]?.amount).toBe(50_000);
	});

	it("treats attempt-linked inbound transfers as healthy when attempt-owned cash receipt exists", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);
		const obligationId = await createDueObligation(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 50_000,
		});
		const attemptId = await createConfirmedAttempt(t, {
			obligationId,
			amount: 50_000,
		});

		const transferId = await createConfirmedTransfer(t, {
			direction: "inbound",
			amount: 50_000,
			mortgageId: seeded.mortgageId,
			obligationId,
			borrowerId: seeded.borrowerId,
		});

		await t.run(async (ctx) => {
			await ctx.db.patch(transferId, {
				collectionAttemptId: attemptId,
			});
		});

		const trustCash = await createTestAccount(t, {
			family: "TRUST_CASH",
		});
		const borrowerReceivable = await createTestAccount(t, {
			family: "BORROWER_RECEIVABLE",
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			obligationId,
			initialDebitBalance: 100_000n,
		});

		await postTestEntry(t, {
			entryType: "CASH_RECEIVED",
			effectiveDate: "2026-03-01",
			amount: 50_000,
			debitAccountId: trustCash._id,
			creditAccountId: borrowerReceivable._id,
			idempotencyKey: `cash-ledger:cash-received:attempt-health:${attemptId}`,
			mortgageId: seeded.mortgageId,
			obligationId,
			attemptId,
			transferRequestId: transferId,
			postingGroupId: `cash-receipt:${attemptId}`,
			source: SYSTEM_SOURCE,
		});

		const result = await t.run(async (ctx) =>
			checkOrphanedConfirmedTransfers(ctx)
		);
		expect(result.isHealthy).toBe(true);
		expect(result.count).toBe(0);
	});

	it("skips recently confirmed transfers (within 5-minute threshold)", async () => {
		const t = createHarness(modules);
		await seedMinimalEntities(t);

		await createConfirmedTransfer(t, {
			direction: "inbound",
			amount: 50_000,
			confirmedAt: Date.now(), // just now — within threshold
		});

		const result = await t.run(async (ctx) =>
			checkOrphanedConfirmedTransfers(ctx)
		);
		expect(result.isHealthy).toBe(true);
	});
});

// ── T-018: checkOrphanedReversedTransfers ──────────────────────

describe("checkOrphanedReversedTransfers", () => {
	it("returns healthy when reversed transfer has matching REVERSAL entry", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);

		const transferId = await createReversedTransfer(t, {
			direction: "inbound",
			amount: 30_000,
			mortgageId: seeded.mortgageId,
		});

		// Create the original entry that the reversal references
		const trustCash = await createTestAccount(t, {
			family: "TRUST_CASH",
			initialDebitBalance: 100_000n,
		});
		const borrowerReceivable = await createTestAccount(t, {
			family: "BORROWER_RECEIVABLE",
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			initialDebitBalance: 100_000n,
		});

		const original = await postTestEntry(t, {
			entryType: "CASH_RECEIVED",
			effectiveDate: "2026-03-01",
			amount: 30_000,
			debitAccountId: trustCash._id,
			creditAccountId: borrowerReceivable._id,
			idempotencyKey: buildIdempotencyKey(
				"cash-received",
				"reversal-seed",
				transferId
			),
			mortgageId: seeded.mortgageId,
			source: SYSTEM_SOURCE,
		});

		// Now post the REVERSAL entry linked to the transfer
		await postTestEntry(t, {
			entryType: "REVERSAL",
			effectiveDate: "2026-03-01",
			amount: 30_000,
			debitAccountId: borrowerReceivable._id,
			creditAccountId: trustCash._id,
			idempotencyKey: buildIdempotencyKey("reversal", "transfer", transferId),
			transferRequestId: transferId,
			causedBy: original.entry._id,
			mortgageId: seeded.mortgageId,
			source: SYSTEM_SOURCE,
		});

		const result = await t.run(async (ctx) =>
			checkOrphanedReversedTransfers(ctx)
		);
		expect(result.isHealthy).toBe(true);
		expect(result.count).toBe(0);
	});

	it("detects orphaned reversed transfer (no REVERSAL entry)", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);

		await createReversedTransfer(t, {
			direction: "inbound",
			amount: 30_000,
			mortgageId: seeded.mortgageId,
		});

		const result = await t.run(async (ctx) =>
			checkOrphanedReversedTransfers(ctx)
		);
		expect(result.isHealthy).toBe(false);
		expect(result.count).toBe(1);
		expect(result.items[0]?.amount).toBe(30_000);
	});

	it("treats attempt-linked inbound reversals as healthy when transfer-owned reversal entries exist", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);
		const obligationId = await createDueObligation(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 30_000,
		});
		const attemptId = await createConfirmedAttempt(t, {
			obligationId,
			amount: 30_000,
		});

		await t.run(async (ctx) => {
			await ctx.db.patch(attemptId, {
				status: "reversed",
			});
		});

		const transferId = await createReversedTransfer(t, {
			direction: "inbound",
			amount: 30_000,
			mortgageId: seeded.mortgageId,
		});

		await t.run(async (ctx) => {
			await ctx.db.patch(transferId, {
				collectionAttemptId: attemptId,
				obligationId,
				borrowerId: seeded.borrowerId,
			});
		});

		const trustCash = await createTestAccount(t, {
			family: "TRUST_CASH",
			initialDebitBalance: 100_000n,
		});
		const borrowerReceivable = await createTestAccount(t, {
			family: "BORROWER_RECEIVABLE",
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			obligationId,
			initialDebitBalance: 100_000n,
		});

		const original = await postTestEntry(t, {
			entryType: "CASH_RECEIVED",
			effectiveDate: "2026-02-15",
			amount: 30_000,
			debitAccountId: trustCash._id,
			creditAccountId: borrowerReceivable._id,
			idempotencyKey: `cash-ledger:cash-received:attempt-reversal-original:${attemptId}`,
			mortgageId: seeded.mortgageId,
			obligationId,
			attemptId,
			postingGroupId: `cash-receipt:${attemptId}`,
			source: SYSTEM_SOURCE,
		});

		await postTestEntry(t, {
			entryType: "REVERSAL",
			effectiveDate: "2026-03-01",
			amount: 30_000,
			debitAccountId: borrowerReceivable._id,
			creditAccountId: trustCash._id,
			idempotencyKey: `cash-ledger:reversal:attempt-health:${attemptId}`,
			causedBy: original.entry._id,
			mortgageId: seeded.mortgageId,
			obligationId,
			transferRequestId: transferId,
			postingGroupId: `reversal-group:transfer:${transferId}`,
			source: SYSTEM_SOURCE,
		});

		const result = await t.run(async (ctx) =>
			checkOrphanedReversedTransfers(ctx)
		);
		expect(result.isHealthy).toBe(true);
		expect(result.count).toBe(0);
	});
});

// ── T-019: checkStaleOutboundTransfers ─────────────────────────

describe("checkStaleOutboundTransfers", () => {
	it("detects confirmed outbound transfer with pending dispersalEntry", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);

		// Create obligation + dispersalEntry with pending status
		const obligationId = await t.run(async (ctx) => {
			return ctx.db.insert("obligations", {
				status: "settled",
				machineContext: {},
				lastTransitionAt: Date.now(),
				mortgageId: seeded.mortgageId,
				borrowerId: seeded.borrowerId,
				paymentNumber: 1,
				type: "regular_interest",
				amount: 50_000,
				amountSettled: 50_000,
				dueDate: Date.parse("2026-03-01T00:00:00Z"),
				gracePeriodEnd: Date.parse("2026-03-16T00:00:00Z"),
				settledAt: Date.parse("2026-03-01T00:00:00Z"),
				createdAt: Date.now(),
			});
		});

		const dispersalEntryId = await t.run(async (ctx) => {
			const ledgerAccount = await ctx.db
				.query("ledger_accounts")
				.withIndex("by_type_and_mortgage", (q) =>
					q.eq("type", "POSITION").eq("mortgageId", String(seeded.mortgageId))
				)
				.first();
			if (!ledgerAccount) {
				throw new Error("ledger account expected");
			}
			return ctx.db.insert("dispersalEntries", {
				obligationId,
				mortgageId: seeded.mortgageId,
				lenderId: seeded.lenderAId,
				lenderAccountId: ledgerAccount._id,
				amount: 50_000,
				dispersalDate: "2026-03-01",
				servicingFeeDeducted: 0,
				status: "pending",
				idempotencyKey: "stale-outbound-test",
				calculationDetails: {
					settledAmount: 50_000,
					servicingFee: 0,
					distributableAmount: 50_000,
					feeDue: 0,
					feeCashApplied: 0,
					feeReceivable: 0,
					ownershipUnits: 6000,
					totalUnits: 10_000,
					ownershipFraction: 0.6,
					rawAmount: 50_000,
					roundedAmount: 50_000,
					sourceObligationType: "regular_interest",
				},
				createdAt: Date.now(),
			});
		});

		await createConfirmedTransfer(t, {
			direction: "outbound",
			amount: 50_000,
			mortgageId: seeded.mortgageId,
			dispersalEntryId,
		});

		const result = await t.run(async (ctx) => checkStaleOutboundTransfers(ctx));
		expect(result.isHealthy).toBe(false);
		expect(result.count).toBe(1);
		expect(result.items[0]?.dispersalStatus).toBe("pending");
	});

	it("returns healthy when no stale outbound transfers", async () => {
		const t = createHarness(modules);
		await seedMinimalEntities(t);

		// Confirmed outbound transfer WITHOUT dispersalEntryId — should be skipped
		await createConfirmedTransfer(t, {
			direction: "outbound",
			amount: 50_000,
		});

		const result = await t.run(async (ctx) => checkStaleOutboundTransfers(ctx));
		expect(result.isHealthy).toBe(true);
		expect(result.count).toBe(0);
	});
});

// ── T-020: checkTransferAmountMismatches ───────────────────────

describe("checkTransferAmountMismatches", () => {
	it("returns healthy when amounts match", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);

		const transferId = await createConfirmedTransfer(t, {
			direction: "inbound",
			amount: 50_000,
			mortgageId: seeded.mortgageId,
		});

		const trustCash = await createTestAccount(t, {
			family: "TRUST_CASH",
		});
		const borrowerReceivable = await createTestAccount(t, {
			family: "BORROWER_RECEIVABLE",
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			initialDebitBalance: 100_000n,
		});

		await postTestEntry(t, {
			entryType: "CASH_RECEIVED",
			effectiveDate: "2026-03-01",
			amount: 50_000,
			debitAccountId: trustCash._id,
			creditAccountId: borrowerReceivable._id,
			idempotencyKey: buildIdempotencyKey(
				"cash-received",
				"transfer-match",
				transferId
			),
			transferRequestId: transferId,
			mortgageId: seeded.mortgageId,
			source: SYSTEM_SOURCE,
		});

		const result = await t.run(async (ctx) =>
			checkTransferAmountMismatches(ctx)
		);
		expect(result.isHealthy).toBe(true);
		expect(result.count).toBe(0);
	});

	it("detects amount mismatch", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);

		const transferId = await createConfirmedTransfer(t, {
			direction: "inbound",
			amount: 50_000,
			mortgageId: seeded.mortgageId,
		});

		const trustCash = await createTestAccount(t, {
			family: "TRUST_CASH",
		});
		const borrowerReceivable = await createTestAccount(t, {
			family: "BORROWER_RECEIVABLE",
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			initialDebitBalance: 100_000n,
		});

		// Post journal entry with a DIFFERENT amount (49_500 vs 50_000)
		await postTestEntry(t, {
			entryType: "CASH_RECEIVED",
			effectiveDate: "2026-03-01",
			amount: 49_500,
			debitAccountId: trustCash._id,
			creditAccountId: borrowerReceivable._id,
			idempotencyKey: buildIdempotencyKey(
				"cash-received",
				"transfer-mismatch",
				transferId
			),
			transferRequestId: transferId,
			mortgageId: seeded.mortgageId,
			source: SYSTEM_SOURCE,
		});

		const result = await t.run(async (ctx) =>
			checkTransferAmountMismatches(ctx)
		);
		expect(result.isHealthy).toBe(false);
		expect(result.count).toBe(1);
		expect(result.items[0]?.differenceCents).toBe(500);
	});
});

// ── T-021: Self-healing retry logic ────────────────────────────

describe("retriggerTransferConfirmation escalation", () => {
	it("escalates on first attempt", async () => {
		vi.useFakeTimers();
		const t = createComponentHarness();
		const seeded = await seedMinimalEntities(t);
		const obligationId = await createDueObligation(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 50_000,
		});

		const transferId = await createConfirmedTransfer(t, {
			direction: "inbound",
			amount: 50_000,
			mortgageId: seeded.mortgageId,
			obligationId,
			borrowerId: seeded.borrowerId,
		});

		const result = await t.mutation(
			internal.payments.cashLedger.transferReconciliationCron
				.retriggerTransferConfirmation,
			{
				transferRequestId: transferId,
				direction: "inbound",
				amount: 50_000,
				mortgageId: seeded.mortgageId,
			}
		);
		await t.finishAllScheduledFunctions(vi.runAllTimers);

		expect(result.action).toBe("escalated");
		expect(result.attemptCount).toBe(1);

		// Verify transferHealingAttempts record was created and escalated
		const healingRecord = await t.run(async (ctx) => {
			const all = await ctx.db.query("transferHealingAttempts").collect();
			return all.find((a) => a.transferRequestId === transferId) ?? null;
		});
		expect(healingRecord).not.toBeNull();
		expect(healingRecord?.status).toBe("escalated");
		expect(healingRecord?.attemptCount).toBe(1);

		const suspenseEntry = await t.run(async (ctx) =>
			ctx.db
				.query("cash_ledger_journal_entries")
				.filter((q) => q.eq(q.field("entryType"), "SUSPENSE_ESCALATED"))
				.first()
		);
		expect(suspenseEntry).toBeNull();
		vi.useRealTimers();
	});

	it("escalates to SUSPENSE after max retries", async () => {
		const t = createComponentHarness();
		const seeded = await seedMinimalEntities(t);

		const transferId = await createConfirmedTransfer(t, {
			direction: "inbound",
			amount: 50_000,
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
		});

		// Pre-create BORROWER_RECEIVABLE account (required by requireCashAccount in escalation path)
		await createTestAccount(t, {
			family: "BORROWER_RECEIVABLE",
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
		});

		// Pre-insert healing attempt at max retries (attemptCount: 3, status: "retrying")
		await t.run(async (ctx) => {
			await ctx.db.insert("transferHealingAttempts", {
				transferRequestId: transferId,
				attemptCount: 3,
				lastAttemptAt: Date.now() - 60_000,
				status: "retrying",
				createdAt: Date.now() - 120_000,
			});
		});

		const result = await t.mutation(
			internal.payments.cashLedger.transferReconciliationCron
				.retriggerTransferConfirmation,
			{
				transferRequestId: transferId,
				direction: "inbound",
				amount: 50_000,
				mortgageId: seeded.mortgageId,
			}
		);

		expect(result.action).toBe("escalated");
		expect(result.attemptCount).toBe(4);

		// Verify healing record was updated to escalated
		const healingRecord = await t.run(async (ctx) => {
			const all = await ctx.db.query("transferHealingAttempts").collect();
			return all.find((a) => a.transferRequestId === transferId) ?? null;
		});
		expect(healingRecord?.status).toBe("escalated");

		// Escalation is recorded in transferHealingAttempts, not as a suspense journal entry.
		const suspenseEntry = await t.run(async (ctx) => {
			return ctx.db
				.query("cash_ledger_journal_entries")
				.filter((q) => q.eq(q.field("entryType"), "SUSPENSE_ESCALATED"))
				.first();
		});
		expect(suspenseEntry).toBeNull();
	});

	it("skips already-escalated transfers", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);

		const transferId = await createConfirmedTransfer(t, {
			direction: "inbound",
			amount: 50_000,
			mortgageId: seeded.mortgageId,
		});

		// Pre-insert healing attempt with status: "escalated"
		await t.run(async (ctx) => {
			await ctx.db.insert("transferHealingAttempts", {
				transferRequestId: transferId,
				attemptCount: 4,
				lastAttemptAt: Date.now() - 60_000,
				escalatedAt: Date.now() - 60_000,
				status: "escalated",
				createdAt: Date.now() - 120_000,
			});
		});

		const result = await t.mutation(
			internal.payments.cashLedger.transferReconciliationCron
				.retriggerTransferConfirmation,
			{
				transferRequestId: transferId,
				direction: "inbound",
				amount: 50_000,
				mortgageId: seeded.mortgageId,
			}
		);

		expect(result.action).toBe("skipped");
		expect(result.attemptCount).toBe(4);
	});

	it("escalates without journal entry when mortgageId is missing", async () => {
		const t = createComponentHarness();
		await seedMinimalEntities(t);

		const transferId = await createConfirmedTransfer(t, {
			direction: "inbound",
			amount: 50_000,
		});

		// Pre-insert healing attempt at max retries
		await t.run(async (ctx) => {
			await ctx.db.insert("transferHealingAttempts", {
				transferRequestId: transferId,
				attemptCount: 3,
				lastAttemptAt: Date.now() - 60_000,
				status: "retrying",
				createdAt: Date.now() - 120_000,
			});
		});

		const result = await t.mutation(
			internal.payments.cashLedger.transferReconciliationCron
				.retriggerTransferConfirmation,
			{
				transferRequestId: transferId,
				direction: "inbound",
				amount: 50_000,
				// No mortgageId — should escalate without journal entry
			}
		);

		expect(result.action).toBe("escalated");
		expect(result.attemptCount).toBe(4);

		// Verify NO SUSPENSE_ESCALATED journal entry was created
		const suspenseEntry = await t.run(async (ctx) => {
			return ctx.db
				.query("cash_ledger_journal_entries")
				.filter((q) => q.eq(q.field("entryType"), "SUSPENSE_ESCALATED"))
				.first();
		});
		expect(suspenseEntry).toBeNull();

		// Verify healing record was still updated to escalated
		const healingRecord = await t.run(async (ctx) => {
			const all = await ctx.db.query("transferHealingAttempts").collect();
			return all.find((a) => a.transferRequestId === transferId) ?? null;
		});
		expect(healingRecord?.status).toBe("escalated");
	});

	it("escalates outbound transfer to SUSPENSE with LENDER_PAYABLE credit", async () => {
		const t = createComponentHarness();
		const seeded = await seedMinimalEntities(t);

		const transferId = await createConfirmedTransfer(t, {
			direction: "outbound",
			amount: 50_000,
			mortgageId: seeded.mortgageId,
			lenderId: seeded.lenderAId,
		});

		// Pre-create LENDER_PAYABLE account required for outbound escalation
		await createTestAccount(t, {
			family: "LENDER_PAYABLE",
			mortgageId: seeded.mortgageId,
			lenderId: seeded.lenderAId,
		});

		// Pre-insert healing attempt at max retries
		await t.run(async (ctx) => {
			await ctx.db.insert("transferHealingAttempts", {
				transferRequestId: transferId,
				attemptCount: 3,
				lastAttemptAt: Date.now() - 60_000,
				status: "retrying",
				createdAt: Date.now() - 120_000,
			});
		});

		const result = await t.mutation(
			internal.payments.cashLedger.transferReconciliationCron
				.retriggerTransferConfirmation,
			{
				transferRequestId: transferId,
				direction: "outbound",
				amount: 50_000,
				mortgageId: seeded.mortgageId,
				lenderId: seeded.lenderAId,
			}
		);

		expect(result.action).toBe("escalated");

		// Escalation is recorded in transferHealingAttempts, not as a suspense journal entry.
		const suspenseEntry = await t.run(async (ctx) => {
			return ctx.db
				.query("cash_ledger_journal_entries")
				.filter((q) => q.eq(q.field("entryType"), "SUSPENSE_ESCALATED"))
				.first();
		});
		expect(suspenseEntry).toBeNull();
	});
});

// ── Outbound orphan detection ───────────────────────────────

describe("checkOrphanedConfirmedTransfers — outbound", () => {
	it("detects orphaned outbound transfer (no LENDER_PAYOUT_SENT entry)", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);

		await createConfirmedTransfer(t, {
			direction: "outbound",
			amount: 50_000,
			mortgageId: seeded.mortgageId,
		});

		const result = await t.run(async (ctx) =>
			checkOrphanedConfirmedTransfers(ctx)
		);
		expect(result.isHealthy).toBe(false);
		expect(result.count).toBe(1);
		expect(result.items[0]?.direction).toBe("outbound");
	});

	it("flags outbound transfer when only CASH_RECEIVED exists (wrong type)", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);

		const transferId = await createConfirmedTransfer(t, {
			direction: "outbound",
			amount: 50_000,
			mortgageId: seeded.mortgageId,
		});

		// Create CASH_RECEIVED entry — wrong type for outbound (needs LENDER_PAYOUT_SENT)
		const trustCash = await createTestAccount(t, {
			family: "TRUST_CASH",
		});
		const borrowerReceivable = await createTestAccount(t, {
			family: "BORROWER_RECEIVABLE",
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			initialDebitBalance: 100_000n,
		});

		await postTestEntry(t, {
			entryType: "CASH_RECEIVED",
			effectiveDate: "2026-03-01",
			amount: 50_000,
			debitAccountId: trustCash._id,
			creditAccountId: borrowerReceivable._id,
			idempotencyKey: buildIdempotencyKey(
				"cash-received",
				"wrong-type-test",
				transferId
			),
			transferRequestId: transferId,
			mortgageId: seeded.mortgageId,
			source: SYSTEM_SOURCE,
		});

		const result = await t.run(async (ctx) =>
			checkOrphanedConfirmedTransfers(ctx)
		);
		// Should still be flagged — CASH_RECEIVED is wrong type for outbound
		expect(result.isHealthy).toBe(false);
		expect(result.count).toBe(1);
	});
});

// ── Shared filter specificity ───────────────────────────────

describe("findOrphanedConfirmedTransferCandidates", () => {
	it("returns candidates including lenderId", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);

		await createConfirmedTransfer(t, {
			direction: "outbound",
			amount: 50_000,
			mortgageId: seeded.mortgageId,
			lenderId: seeded.lenderAId,
		});

		const candidates = await t.run(async (ctx) =>
			findOrphanedConfirmedTransferCandidates(ctx)
		);
		expect(candidates).toHaveLength(1);
		expect(candidates[0]?.lenderId).toBe(seeded.lenderAId);
		expect(candidates[0]?.direction).toBe("outbound");
	});

	it("only matches correct entry type (inbound needs CASH_RECEIVED, not LENDER_PAYOUT_SENT)", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);

		const transferId = await createConfirmedTransfer(t, {
			direction: "inbound",
			amount: 50_000,
			mortgageId: seeded.mortgageId,
		});

		// Create LENDER_PAYOUT_SENT entry — wrong type for inbound
		// LENDER_PAYABLE is credit-normal: needs credit balance for debit posting
		const lenderPayable = await createTestAccount(t, {
			family: "LENDER_PAYABLE",
			mortgageId: seeded.mortgageId,
			lenderId: seeded.lenderAId,
			initialCreditBalance: 100_000n,
		});
		const trustCash = await createTestAccount(t, {
			family: "TRUST_CASH",
			initialDebitBalance: 100_000n,
		});

		await postTestEntry(t, {
			entryType: "LENDER_PAYOUT_SENT",
			effectiveDate: "2026-03-01",
			amount: 50_000,
			debitAccountId: lenderPayable._id,
			creditAccountId: trustCash._id,
			idempotencyKey: buildIdempotencyKey(
				"lender-payout-sent",
				"wrong-type-filter",
				transferId
			),
			transferRequestId: transferId,
			mortgageId: seeded.mortgageId,
			source: SYSTEM_SOURCE,
		});

		// Should still be flagged — LENDER_PAYOUT_SENT is wrong type for inbound
		const candidates = await t.run(async (ctx) =>
			findOrphanedConfirmedTransferCandidates(ctx)
		);
		expect(candidates).toHaveLength(1);
		expect(candidates[0]?.transferRequestId).toBe(transferId);
	});
});
