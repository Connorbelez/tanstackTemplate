import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";
import workflowSchema from "../../../../node_modules/@convex-dev/workflow/dist/component/schema.js";
import workpoolSchema from "../../../../node_modules/@convex-dev/workpool/dist/component/schema.js";
import type { Id } from "../../../_generated/dataModel";
import type { MutationCtx } from "../../../_generated/server";
import auditTrailSchema from "../../../components/auditTrail/schema";
import { emitPaymentReversed } from "../../../engine/effects/collectionAttempt";
import type { CommandSource } from "../../../engine/types";
import schema from "../../../schema";
import {
	convexModules,
	auditTrailModules as sharedAuditTrailModules,
	workflowModules as sharedWorkflowModules,
	workpoolModules as sharedWorkpoolModules,
} from "../../../test/moduleMaps";
import { registerAuditLogComponent } from "../../../test/registerAuditLogComponent";
import {
	postCashReceiptForObligation,
	postObligationAccrued,
} from "../integrations";
import { SYSTEM_SOURCE, seedMinimalEntities } from "./testUtils";

// ── Module globs ────────────────────────────────────────────────────

const modules = convexModules;
const auditTrailModules = sharedAuditTrailModules;
const workflowModules = sharedWorkflowModules;
const workpoolModules = sharedWorkpoolModules;

// ── Test harness with components ────────────────────────────────────

type TestHarness = ReturnType<typeof createFullHarness>;

function createFullHarness() {
	// Disable hash chain workflow — not under test here. The workflow component
	// doesn't fully work in convex-test's synchronous environment.
	process.env.DISABLE_CASH_LEDGER_HASHCHAIN = "true";
	const t = convexTest(schema, modules);
	registerAuditLogComponent(t, "auditLog");
	t.registerComponent("auditTrail", auditTrailSchema, auditTrailModules);
	t.registerComponent("workflow", workflowSchema, workflowModules);
	t.registerComponent("workflow/workpool", workpoolSchema, workpoolModules);
	return t;
}

// ── Handler type cast ───────────────────────────────────────────────

interface EmitPaymentReversedHandler {
	_handler: (
		ctx: MutationCtx,
		args: {
			entityId: Id<"collectionAttempts">;
			entityType: "collectionAttempt";
			eventType: string;
			journalEntryId: string;
			effectName: string;
			payload?: Record<string, unknown>;
			source: CommandSource;
		}
	) => Promise<void>;
}

const emitPaymentReversedMutation =
	emitPaymentReversed as unknown as EmitPaymentReversedHandler;

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Creates a settled obligation with an accrual entry and a CASH_RECEIVED
 * journal entry tied to a specific attempt. This simulates the state after
 * a successful collection: obligation is settled, cash is on the ledger.
 */
async function createSettledObligationWithCashReceipt(
	t: TestHarness,
	args: {
		mortgageId: Id<"mortgages">;
		borrowerId: Id<"borrowers">;
		amount: number;
		attemptId: Id<"collectionAttempts">;
		postingGroupId: string;
		paymentNumber?: number;
	}
) {
	return t.run(async (ctx) => {
		const obligationId = await ctx.db.insert("obligations", {
			status: "settled",
			machineContext: {},
			lastTransitionAt: Date.now(),
			mortgageId: args.mortgageId,
			borrowerId: args.borrowerId,
			paymentNumber: args.paymentNumber ?? 1,
			type: "regular_interest",
			amount: args.amount,
			amountSettled: args.amount,
			dueDate: Date.parse("2026-02-01T00:00:00Z"),
			gracePeriodEnd: Date.parse("2026-02-16T00:00:00Z"),
			settledAt: Date.parse("2026-02-15T00:00:00Z"),
			createdAt: Date.now(),
		});

		// Post accrual (creates BORROWER_RECEIVABLE + CONTROL:ACCRUAL accounts)
		await postObligationAccrued(ctx, {
			obligationId,
			source: SYSTEM_SOURCE,
		});

		// Post CASH_RECEIVED entry tied to the attempt
		await postCashReceiptForObligation(ctx, {
			obligationId,
			amount: args.amount,
			idempotencyKey: `cash-ledger:cash-received:audit-journal-${obligationId as string}`,
			attemptId: args.attemptId,
			postingGroupId: args.postingGroupId,
			source: SYSTEM_SOURCE,
		});

		return obligationId;
	});
}

async function createPlanEntryAndReversedAttempt(
	t: TestHarness,
	args: {
		obligationIds: Id<"obligations">[];
		amount: number;
		mortgageId: Id<"mortgages">;
	}
) {
	return t.run(async (ctx) => {
		const planEntryId = await ctx.db.insert("collectionPlanEntries", {
			mortgageId: args.mortgageId,
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
			mortgageId: args.mortgageId,
			obligationIds: args.obligationIds,
			amount: args.amount,
			method: "manual",
			status: "reversed",
			machineContext: {},
			initiatedAt: Date.now(),
		});

		return { planEntryId, attemptId };
	});
}

// ── Tests ───────────────────────────────────────────────────────────

describe("emitPaymentReversed integration", () => {
	it("creates corrective obligation with amount from CASH_RECEIVED reversal (not obligation.amount)", async () => {
		vi.useFakeTimers();
		const t = createFullHarness();
		const seeded = await seedMinimalEntities(t);

		// Obligation is 100k but we'll only record a partial cash receipt of 60k
		// to verify that the corrective uses the cash-received amount, not obligation.amount.
		const partialPayAmount = 60_000;
		const obligationAmount = 100_000;

		// Create plan entry and attempt first (need attemptId for cash receipt)
		const { attemptId } = await createPlanEntryAndReversedAttempt(t, {
			obligationIds: [], // placeholder — will be updated
			amount: partialPayAmount,
			mortgageId: seeded.mortgageId,
		});

		const postingGroupId = `cash-receipt:${attemptId as string}`;

		// Create settled obligation with partial cash receipt
		const obligationId = await t.run(async (ctx) => {
			const oblId = await ctx.db.insert("obligations", {
				status: "settled",
				machineContext: {},
				lastTransitionAt: Date.now(),
				mortgageId: seeded.mortgageId,
				borrowerId: seeded.borrowerId,
				paymentNumber: 1,
				type: "regular_interest",
				amount: obligationAmount,
				amountSettled: obligationAmount,
				dueDate: Date.parse("2026-02-01T00:00:00Z"),
				gracePeriodEnd: Date.parse("2026-02-16T00:00:00Z"),
				settledAt: Date.parse("2026-02-15T00:00:00Z"),
				createdAt: Date.now(),
			});

			// Post accrual
			await postObligationAccrued(ctx, {
				obligationId: oblId,
				source: SYSTEM_SOURCE,
			});

			// Post CASH_RECEIVED for partial amount only
			await postCashReceiptForObligation(ctx, {
				obligationId: oblId,
				amount: partialPayAmount,
				idempotencyKey: `cash-ledger:cash-received:audit-journal-${oblId as string}`,
				attemptId,
				postingGroupId,
				source: SYSTEM_SOURCE,
			});

			return oblId;
		});

		// Update the plan entry to reference the obligation
		await t.run(async (ctx) => {
			const attempt = await ctx.db.get(attemptId);
			if (!attempt) {
				throw new Error("attempt not found");
			}
			await ctx.db.patch(attempt.planEntryId, {
				obligationIds: [obligationId],
			});
		});

		// Run emitPaymentReversed
		await t.run(async (ctx) => {
			await emitPaymentReversedMutation._handler(ctx, {
				entityId: attemptId,
				entityType: "collectionAttempt",
				eventType: "PAYMENT_REVERSED",
				journalEntryId: "audit-reversal-1",
				effectName: "emitPaymentReversed",
				payload: {
					reason: "nsf_return",
					effectiveDate: "2026-03-20",
				},
				source: SYSTEM_SOURCE,
			});
		});

		// Drain scheduled functions (corrective obligation creation)
		await t.finishAllScheduledFunctions(vi.runAllTimers);

		// Assert: corrective obligation was created with the partial amount (60k),
		// NOT the full obligation amount (100k)
		await t.run(async (ctx) => {
			const correctives = await ctx.db
				.query("obligations")
				.withIndex("by_type_and_source", (q) =>
					q
						.eq("type", "regular_interest")
						.eq("sourceObligationId", obligationId)
				)
				.collect();

			// Filter out the original
			const corrective = correctives.find((o) => o._id !== obligationId);

			expect(corrective).toBeDefined();
			expect(corrective?.amount).toBe(partialPayAmount);
			expect(corrective?.status).toBe("upcoming");
			expect(corrective?.sourceObligationId).toBe(obligationId);
			expect(corrective?.borrowerId).toBe(seeded.borrowerId);
			expect(corrective?.mortgageId).toBe(seeded.mortgageId);
		});
	});

	it("creates corrective with full amount when obligation was fully paid by single attempt", async () => {
		vi.useFakeTimers();
		const t = createFullHarness();
		const seeded = await seedMinimalEntities(t);

		const amount = 100_000;

		const { attemptId } = await createPlanEntryAndReversedAttempt(t, {
			obligationIds: [],
			amount,
			mortgageId: seeded.mortgageId,
		});

		const postingGroupId = `cash-receipt:${attemptId as string}`;

		const obligationId = await createSettledObligationWithCashReceipt(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount,
			attemptId,
			postingGroupId,
		});

		// Update plan entry
		await t.run(async (ctx) => {
			const attempt = await ctx.db.get(attemptId);
			if (!attempt) {
				throw new Error("attempt not found");
			}
			await ctx.db.patch(attempt.planEntryId, {
				obligationIds: [obligationId],
			});
		});

		// Run reversal
		await t.run(async (ctx) => {
			await emitPaymentReversedMutation._handler(ctx, {
				entityId: attemptId,
				entityType: "collectionAttempt",
				eventType: "PAYMENT_REVERSED",
				journalEntryId: "audit-reversal-full-1",
				effectName: "emitPaymentReversed",
				payload: {
					reason: "chargeback",
					effectiveDate: "2026-03-20",
				},
				source: SYSTEM_SOURCE,
			});
		});

		await t.finishAllScheduledFunctions(vi.runAllTimers);

		// Assert corrective has full amount
		await t.run(async (ctx) => {
			const correctives = await ctx.db
				.query("obligations")
				.withIndex("by_type_and_source", (q) =>
					q
						.eq("type", "regular_interest")
						.eq("sourceObligationId", obligationId)
				)
				.collect();

			const corrective = correctives.find((o) => o._id !== obligationId);

			expect(corrective).toBeDefined();
			expect(corrective?.amount).toBe(amount);
			expect(corrective?.status).toBe("upcoming");
		});
	});

	it("skips corrective for non-settled obligations", async () => {
		vi.useFakeTimers();
		const t = createFullHarness();
		const seeded = await seedMinimalEntities(t);

		const amount = 50_000;

		const { attemptId } = await createPlanEntryAndReversedAttempt(t, {
			obligationIds: [],
			amount,
			mortgageId: seeded.mortgageId,
		});

		const postingGroupId = `cash-receipt:${attemptId as string}`;

		// Create a "due" (non-settled) obligation with a CASH_RECEIVED entry
		const obligationId = await t.run(async (ctx) => {
			const oblId = await ctx.db.insert("obligations", {
				status: "due",
				machineContext: {},
				lastTransitionAt: Date.now(),
				mortgageId: seeded.mortgageId,
				borrowerId: seeded.borrowerId,
				paymentNumber: 1,
				type: "regular_interest",
				amount,
				amountSettled: 0,
				dueDate: Date.parse("2026-02-01T00:00:00Z"),
				gracePeriodEnd: Date.parse("2026-02-16T00:00:00Z"),
				createdAt: Date.now(),
			});

			await postObligationAccrued(ctx, {
				obligationId: oblId,
				source: SYSTEM_SOURCE,
			});

			await postCashReceiptForObligation(ctx, {
				obligationId: oblId,
				amount,
				idempotencyKey: `cash-ledger:cash-received:audit-journal-${oblId as string}`,
				attemptId,
				postingGroupId,
				source: SYSTEM_SOURCE,
			});

			return oblId;
		});

		// Update plan entry
		await t.run(async (ctx) => {
			const attempt = await ctx.db.get(attemptId);
			if (!attempt) {
				throw new Error("attempt not found");
			}
			await ctx.db.patch(attempt.planEntryId, {
				obligationIds: [obligationId],
			});
		});

		// Run reversal
		await t.run(async (ctx) => {
			await emitPaymentReversedMutation._handler(ctx, {
				entityId: attemptId,
				entityType: "collectionAttempt",
				eventType: "PAYMENT_REVERSED",
				journalEntryId: "audit-reversal-due-1",
				effectName: "emitPaymentReversed",
				payload: {
					reason: "nsf_return",
					effectiveDate: "2026-03-20",
				},
				source: SYSTEM_SOURCE,
			});
		});

		await t.finishAllScheduledFunctions(vi.runAllTimers);

		// No corrective should be created for non-settled obligations
		await t.run(async (ctx) => {
			const correctives = await ctx.db
				.query("obligations")
				.withIndex("by_type_and_source", (q) =>
					q
						.eq("type", "regular_interest")
						.eq("sourceObligationId", obligationId)
				)
				.collect();

			const corrective = correctives.find((o) => o._id !== obligationId);

			expect(corrective).toBeUndefined();
		});
	});

	it("reversal ledger entries are created with correct postingGroupId", async () => {
		vi.useFakeTimers();
		const t = createFullHarness();
		const seeded = await seedMinimalEntities(t);

		const amount = 80_000;

		const { attemptId } = await createPlanEntryAndReversedAttempt(t, {
			obligationIds: [],
			amount,
			mortgageId: seeded.mortgageId,
		});

		const postingGroupId = `cash-receipt:${attemptId as string}`;

		const obligationId = await createSettledObligationWithCashReceipt(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount,
			attemptId,
			postingGroupId,
		});

		// Update plan entry
		await t.run(async (ctx) => {
			const attempt = await ctx.db.get(attemptId);
			if (!attempt) {
				throw new Error("attempt not found");
			}
			await ctx.db.patch(attempt.planEntryId, {
				obligationIds: [obligationId],
			});
		});

		// Run reversal
		await t.run(async (ctx) => {
			await emitPaymentReversedMutation._handler(ctx, {
				entityId: attemptId,
				entityType: "collectionAttempt",
				eventType: "PAYMENT_REVERSED",
				journalEntryId: "audit-reversal-ledger-1",
				effectName: "emitPaymentReversed",
				payload: {
					reason: "nsf_return",
					effectiveDate: "2026-03-20",
				},
				source: SYSTEM_SOURCE,
			});
		});

		await t.finishAllScheduledFunctions(vi.runAllTimers);

		// Verify reversal entries share the expected postingGroupId
		const expectedReversalGroupId = `reversal-group:${attemptId as string}`;

		await t.run(async (ctx) => {
			const reversalEntries = await ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_posting_group", (q) =>
					q.eq("postingGroupId", expectedReversalGroupId)
				)
				.collect();

			// Should have at least the CASH_RECEIVED reversal
			expect(reversalEntries.length).toBeGreaterThanOrEqual(1);

			const cashReceivedReversal = reversalEntries.find((e) =>
				e.idempotencyKey.includes("reversal:cash-received:")
			);
			expect(cashReceivedReversal).toBeDefined();
			expect(cashReceivedReversal?.entryType).toBe("REVERSAL");
			expect(cashReceivedReversal?.amount).toBe(BigInt(amount));
		});
	});
});
