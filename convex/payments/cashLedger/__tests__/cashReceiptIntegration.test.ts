import auditLogTest from "convex-audit-log/test";
import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";
import workflowSchema from "../../../../node_modules/@convex-dev/workflow/dist/component/schema.js";
import workpoolSchema from "../../../../node_modules/@convex-dev/workpool/dist/component/schema.js";
import type { Id } from "../../../_generated/dataModel";
import type { MutationCtx } from "../../../_generated/server";
import auditTrailSchema from "../../../components/auditTrail/schema";
import { emitPaymentReceived } from "../../../engine/effects/collectionAttempt";
import { applyPayment } from "../../../engine/effects/obligationPayment";
import schema from "../../../schema";
import { getOrCreateCashAccount } from "../accounts";
import { postObligationAccrued } from "../integrations";
import { SYSTEM_SOURCE, seedMinimalEntities } from "./testUtils";

const CASH_RECEIPT_PREFIX_PATTERN = /^cash-receipt:/;

// ── Module globs ────────────────────────────────────────────────────

const modules = import.meta.glob("/convex/**/*.ts");
const auditTrailModules = import.meta.glob(
	"/convex/components/auditTrail/**/*.ts"
);
const workflowModules = import.meta.glob(
	"/node_modules/@convex-dev/workflow/dist/component/**/*.js"
);
const workpoolModules = import.meta.glob(
	"/node_modules/@convex-dev/workpool/dist/component/**/*.js"
);

// ── Test harness with components ────────────────────────────────────

type TestHarness = ReturnType<typeof createFullHarness>;

function createFullHarness() {
	const t = convexTest(schema, modules);
	auditLogTest.register(t, "auditLog");
	t.registerComponent("auditTrail", auditTrailSchema, auditTrailModules);
	t.registerComponent("workflow", workflowSchema, workflowModules);
	t.registerComponent("workflow/workpool", workpoolSchema, workpoolModules);
	return t;
}

// ── Handler type casts ──────────────────────────────────────────────

interface ApplyPaymentHandler {
	_handler: (
		ctx: MutationCtx,
		args: {
			entityId: Id<"obligations">;
			entityType: "obligation";
			eventType: string;
			journalEntryId: string;
			effectName: string;
			payload?: Record<string, unknown>;
			source: typeof SYSTEM_SOURCE;
		}
	) => Promise<void>;
}

interface EmitPaymentReceivedHandler {
	_handler: (
		ctx: MutationCtx,
		args: {
			entityId: Id<"collectionAttempts">;
			entityType: "collectionAttempt";
			eventType: string;
			journalEntryId: string;
			effectName: string;
			payload?: Record<string, unknown>;
			source: typeof SYSTEM_SOURCE;
		}
	) => Promise<void>;
}

const applyPaymentMutation = applyPayment as unknown as ApplyPaymentHandler;
const emitPaymentReceivedMutation =
	emitPaymentReceived as unknown as EmitPaymentReceivedHandler;

// ── Helpers ─────────────────────────────────────────────────────────

async function createDueObligationWithAccrual(
	t: TestHarness,
	args: {
		mortgageId: Id<"mortgages">;
		borrowerId: Id<"borrowers">;
		amount: number;
		paymentNumber?: number;
	}
) {
	return t.run(async (ctx) => {
		const obligationId = await ctx.db.insert("obligations", {
			status: "due",
			machineContext: {},
			lastTransitionAt: Date.now(),
			mortgageId: args.mortgageId,
			borrowerId: args.borrowerId,
			paymentNumber: args.paymentNumber ?? 1,
			type: "regular_interest",
			amount: args.amount,
			amountSettled: 0,
			dueDate: Date.parse("2026-02-01T00:00:00Z"),
			gracePeriodEnd: Date.parse("2026-02-16T00:00:00Z"),
			createdAt: Date.now(),
		});

		await postObligationAccrued(ctx, {
			obligationId,
			source: SYSTEM_SOURCE,
		});

		return obligationId;
	});
}

async function createSettledObligationWithAccrual(
	t: TestHarness,
	args: {
		mortgageId: Id<"mortgages">;
		borrowerId: Id<"borrowers">;
		amount: number;
	}
) {
	return t.run(async (ctx) => {
		const obligationId = await ctx.db.insert("obligations", {
			status: "due",
			machineContext: {},
			lastTransitionAt: Date.now(),
			mortgageId: args.mortgageId,
			borrowerId: args.borrowerId,
			paymentNumber: 1,
			type: "regular_interest",
			amount: args.amount,
			amountSettled: args.amount,
			dueDate: Date.parse("2026-02-01T00:00:00Z"),
			gracePeriodEnd: Date.parse("2026-02-16T00:00:00Z"),
			createdAt: Date.now(),
		});

		await postObligationAccrued(ctx, {
			obligationId,
			source: SYSTEM_SOURCE,
		});

		return obligationId;
	});
}

async function createPlanEntryAndAttempt(
	t: TestHarness,
	args: {
		obligationIds: Id<"obligations">[];
		amount: number;
	}
) {
	return t.run(async (ctx) => {
		const planEntryId = await ctx.db.insert("collectionPlanEntries", {
			obligationIds: args.obligationIds,
			amount: args.amount,
			method: "manual",
			scheduledDate: Date.parse("2026-03-15T00:00:00Z"),
			status: "executing",
			source: "default_schedule",
			createdAt: Date.now(),
		});

		const attemptId = await ctx.db.insert("collectionAttempts", {
			planEntryId,
			amount: args.amount,
			method: "manual",
			status: "confirmed",
			machineContext: {},
			initiatedAt: Date.now(),
		});

		return { planEntryId, attemptId };
	});
}

/**
 * UNAPPLIED_CASH is credit-normal (balance = credits − debits), so crediting
 * it from zero balance is fine, but debiting it requires a prior credit balance.
 * Pre-seed with cumulative credits to represent prior cash receipts.
 */
async function seedUnappliedCashAccount(
	t: TestHarness,
	mortgageId: Id<"mortgages">,
	initialBalance: bigint
) {
	return t.run(async (ctx) => {
		const account = await getOrCreateCashAccount(ctx, {
			family: "UNAPPLIED_CASH",
			mortgageId,
		});
		await ctx.db.patch(account._id, { cumulativeCredits: initialBalance });
		return account._id;
	});
}

// ── Tests ───────────────────────────────────────────────────────────

describe("applyPayment effect with postingGroupId", () => {
	it("passes postingGroupId from payload to CASH_RECEIVED entry", async () => {
		const t = createFullHarness();
		const seeded = await seedMinimalEntities(t);
		const obligationId = await createDueObligationWithAccrual(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 100_000,
		});

		await t.run(async (ctx) => {
			await applyPaymentMutation._handler(ctx, {
				entityId: obligationId,
				entityType: "obligation",
				eventType: "PAYMENT_APPLIED",
				journalEntryId: "audit-journal-group-1",
				effectName: "applyPayment",
				payload: {
					amount: 60_000,
					postingGroupId: "cash-receipt:my-attempt",
				},
				source: SYSTEM_SOURCE,
			});

			const entry = await ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_idempotency", (q) =>
					q.eq(
						"idempotencyKey",
						"cash-ledger:cash-received:audit-journal-group-1"
					)
				)
				.first();

			if (!entry) {
				throw new Error("Expected non-null entry");
			}
			expect(entry.postingGroupId).toBe("cash-receipt:my-attempt");
			expect(entry.entryType).toBe("CASH_RECEIVED");
			expect(entry.amount).toBe(60_000n);
		});
	});

	it("two obligations share the same postingGroupId", async () => {
		const t = createFullHarness();
		const seeded = await seedMinimalEntities(t);

		const obligationA = await createDueObligationWithAccrual(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 50_000,
			paymentNumber: 1,
		});
		const obligationB = await createDueObligationWithAccrual(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 50_000,
			paymentNumber: 2,
		});

		const sharedGroupId = "cash-receipt:shared-attempt";

		await t.run(async (ctx) => {
			await applyPaymentMutation._handler(ctx, {
				entityId: obligationA,
				entityType: "obligation",
				eventType: "PAYMENT_APPLIED",
				journalEntryId: "audit-multi-1",
				effectName: "applyPayment",
				payload: {
					amount: 50_000,
					postingGroupId: sharedGroupId,
				},
				source: SYSTEM_SOURCE,
			});

			await applyPaymentMutation._handler(ctx, {
				entityId: obligationB,
				entityType: "obligation",
				eventType: "PAYMENT_APPLIED",
				journalEntryId: "audit-multi-2",
				effectName: "applyPayment",
				payload: {
					amount: 50_000,
					postingGroupId: sharedGroupId,
				},
				source: SYSTEM_SOURCE,
			});

			const groupEntries = await ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_posting_group", (q) =>
					q.eq("postingGroupId", sharedGroupId)
				)
				.collect();

			expect(groupEntries).toHaveLength(2);
			expect(groupEntries.every((e) => e.entryType === "CASH_RECEIVED")).toBe(
				true
			);
			expect(groupEntries.map((e) => e.obligationId).sort()).toEqual(
				[obligationA, obligationB].sort()
			);
		});
	});
});

describe("emitPaymentReceived full flow", () => {
	it("overpayment: routes excess to UNAPPLIED_CASH", async () => {
		vi.useFakeTimers();
		const t = createFullHarness();
		const seeded = await seedMinimalEntities(t);
		await seedUnappliedCashAccount(t, seeded.mortgageId, 500_000n);

		const obligationId = await createDueObligationWithAccrual(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 50_000,
		});

		const { attemptId } = await createPlanEntryAndAttempt(t, {
			obligationIds: [obligationId],
			amount: 75_000,
		});

		await t.run(async (ctx) => {
			await emitPaymentReceivedMutation._handler(ctx, {
				entityId: attemptId,
				entityType: "collectionAttempt",
				eventType: "FUNDS_SETTLED",
				journalEntryId: "audit-overpayment-1",
				effectName: "emitPaymentReceived",
				source: SYSTEM_SOURCE,
			});
		});

		// Drain scheduled effects (applyPayment is scheduled by executeTransition)
		await t.finishAllScheduledFunctions(vi.runAllTimers);

		await t.run(async (ctx) => {
			// Check for obligation receipt (50k to BORROWER_RECEIVABLE)
			const obligationReceipt = await ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_obligation_and_sequence", (q) =>
					q.eq("obligationId", obligationId)
				)
				.collect();
			const cashReceipts = obligationReceipt.filter(
				(e) => e.entryType === "CASH_RECEIVED"
			);
			expect(cashReceipts.length).toBeGreaterThanOrEqual(1);

			const receiptEntry = cashReceipts[0];
			expect(receiptEntry.amount).toBe(50_000n);
			const receiptCreditAccount = await ctx.db.get(
				receiptEntry.creditAccountId
			);
			expect(receiptCreditAccount?.family).toBe("BORROWER_RECEIVABLE");

			// Check for overpayment (25k to UNAPPLIED_CASH)
			const overpaymentEntry = await ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_idempotency", (q) =>
					q.eq("idempotencyKey", `cash-ledger:overpayment:${attemptId}`)
				)
				.first();
			if (!overpaymentEntry) {
				throw new Error("Expected overpayment entry");
			}
			expect(overpaymentEntry.amount).toBe(25_000n);

			const overpaymentCreditAccount = await ctx.db.get(
				overpaymentEntry.creditAccountId
			);
			expect(overpaymentCreditAccount?.family).toBe("UNAPPLIED_CASH");

			// Both entries share the same postingGroupId
			expect(receiptEntry.postingGroupId).toMatch(CASH_RECEIPT_PREFIX_PATTERN);
			expect(overpaymentEntry.postingGroupId).toBe(receiptEntry.postingGroupId);
		});
	});

	it("already-settled obligation: entire amount routed to UNAPPLIED_CASH", async () => {
		vi.useFakeTimers();
		const t = createFullHarness();
		const seeded = await seedMinimalEntities(t);
		await seedUnappliedCashAccount(t, seeded.mortgageId, 500_000n);

		// Obligation is fully settled (amountSettled === amount)
		const obligationId = await createSettledObligationWithAccrual(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 50_000,
		});

		const { attemptId } = await createPlanEntryAndAttempt(t, {
			obligationIds: [obligationId],
			amount: 50_000,
		});

		await t.run(async (ctx) => {
			await emitPaymentReceivedMutation._handler(ctx, {
				entityId: attemptId,
				entityType: "collectionAttempt",
				eventType: "FUNDS_SETTLED",
				journalEntryId: "audit-settled-1",
				effectName: "emitPaymentReceived",
				source: SYSTEM_SOURCE,
			});
		});

		await t.finishAllScheduledFunctions(vi.runAllTimers);

		await t.run(async (ctx) => {
			// No CASH_RECEIVED for the obligation itself (since outstandingAmount = 0)
			// Instead, entire amount goes to UNAPPLIED_CASH
			const overpaymentEntry = await ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_idempotency", (q) =>
					q.eq("idempotencyKey", `cash-ledger:overpayment:${attemptId}`)
				)
				.first();

			if (!overpaymentEntry) {
				throw new Error("Expected overpayment entry");
			}
			expect(overpaymentEntry.amount).toBe(50_000n);
			expect(overpaymentEntry.entryType).toBe("CASH_RECEIVED");

			const creditAccount = await ctx.db.get(overpaymentEntry.creditAccountId);
			expect(creditAccount?.family).toBe("UNAPPLIED_CASH");
		});
	});
});
