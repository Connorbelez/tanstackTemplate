import auditLogTest from "convex-audit-log/test";
import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";
import { internal } from "../../../_generated/api";
import auditTrailSchema from "../../../components/auditTrail/schema";
import schema from "../../../schema";
import {
	checkOrphanedConfirmedTransfers,
	checkOrphanedReversedTransfers,
	checkStaleOutboundTransfers,
	checkTransferAmountMismatches,
} from "../transferReconciliation";
import { buildIdempotencyKey } from "../types";
import {
	createConfirmedTransfer,
	createHarness,
	createReversedTransfer,
	createTestAccount,
	postTestEntry,
	SYSTEM_SOURCE,
	seedMinimalEntities,
	type TestHarness,
} from "./testUtils";

const modules = import.meta.glob("/convex/**/*.ts");
const auditTrailModules = import.meta.glob(
	"/convex/components/auditTrail/**/*.ts"
);

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

describe("retriggerTransferConfirmation self-healing", () => {
	it("retries on first attempt", async () => {
		vi.useFakeTimers();
		const t = createComponentHarness();
		const seeded = await seedMinimalEntities(t);

		const transferId = await createConfirmedTransfer(t, {
			direction: "inbound",
			amount: 50_000,
			mortgageId: seeded.mortgageId,
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

		expect(result.action).toBe("retriggered");
		expect(result.attemptCount).toBe(1);

		// Verify transferHealingAttempts record was created
		const healingRecord = await t.run(async (ctx) => {
			const all = await ctx.db.query("transferHealingAttempts").collect();
			return all.find((a) => a.transferRequestId === transferId) ?? null;
		});
		expect(healingRecord).not.toBeNull();
		expect(healingRecord?.status).toBe("retrying");
		expect(healingRecord?.attemptCount).toBe(1);
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

		// Verify SUSPENSE_ESCALATED journal entry was created
		const suspenseEntry = await t.run(async (ctx) => {
			return ctx.db
				.query("cash_ledger_journal_entries")
				.filter((q) => q.eq(q.field("entryType"), "SUSPENSE_ESCALATED"))
				.first();
		});
		expect(suspenseEntry).not.toBeNull();
		expect(Number(suspenseEntry?.amount)).toBe(50_000);
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
});
