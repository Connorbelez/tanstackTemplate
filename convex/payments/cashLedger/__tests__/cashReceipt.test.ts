import { describe, expect, it } from "vitest";
import type { Id } from "../../../_generated/dataModel";
import { getOrCreateCashAccount } from "../accounts";
import {
	postCashReceiptForObligation,
	postObligationAccrued,
	postOverpaymentToUnappliedCash,
} from "../integrations";
import {
	createHarness,
	SYSTEM_SOURCE,
	seedMinimalEntities,
	type TestHarness,
} from "./testUtils";

const OVERPAYMENT_REASON_PATTERN = /Overpayment/;

// ── Helpers ─────────────────────────────────────────────────────────

async function createDueObligation(
	t: TestHarness,
	args: {
		mortgageId: Id<"mortgages">;
		borrowerId: Id<"borrowers">;
		amount: number;
	}
) {
	return t.run(async (ctx) => {
		return ctx.db.insert("obligations", {
			status: "due",
			machineContext: {},
			lastTransitionAt: Date.now(),
			mortgageId: args.mortgageId,
			borrowerId: args.borrowerId,
			paymentNumber: 1,
			type: "regular_interest",
			amount: args.amount,
			amountSettled: 0,
			dueDate: Date.parse("2026-02-01T00:00:00Z"),
			gracePeriodEnd: Date.parse("2026-02-16T00:00:00Z"),
			createdAt: Date.now(),
		});
	});
}

async function accrueObligation(
	t: TestHarness,
	obligationId: Id<"obligations">
) {
	return t.run(async (ctx) => {
		await postObligationAccrued(ctx, {
			obligationId,
			source: SYSTEM_SOURCE,
		});
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

describe("postCashReceiptForObligation", () => {
	it("happy path: single obligation, full payment posts CASH_RECEIVED entry", async () => {
		const t = createHarness();
		const seeded = await seedMinimalEntities(t);
		const obligationId = await createDueObligation(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 100_000,
		});
		await accrueObligation(t, obligationId);

		await t.run(async (ctx) => {
			const result = await postCashReceiptForObligation(ctx, {
				obligationId,
				amount: 100_000,
				idempotencyKey: "cash-receipt-full-1",
				source: SYSTEM_SOURCE,
			});

			if (!result) {
				throw new Error("Expected non-null result");
			}
			expect(result.entry.entryType).toBe("CASH_RECEIVED");
			expect(result.entry.amount).toBe(100_000n);
			expect(result.entry.obligationId).toBe(obligationId);

			// Verify debit goes to TRUST_CASH, credit goes to BORROWER_RECEIVABLE
			const debitAccount = await ctx.db.get(result.entry.debitAccountId);
			const creditAccount = await ctx.db.get(result.entry.creditAccountId);
			expect(debitAccount?.family).toBe("TRUST_CASH");
			expect(creditAccount?.family).toBe("BORROWER_RECEIVABLE");
		});
	});

	it("partial payment posts correct amount without fully clearing receivable", async () => {
		const t = createHarness();
		const seeded = await seedMinimalEntities(t);
		const obligationId = await createDueObligation(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 100_000,
		});
		await accrueObligation(t, obligationId);

		await t.run(async (ctx) => {
			const result = await postCashReceiptForObligation(ctx, {
				obligationId,
				amount: 40_000,
				idempotencyKey: "cash-receipt-partial-1",
				source: SYSTEM_SOURCE,
			});

			if (!result) {
				throw new Error("Expected non-null result");
			}
			expect(result.entry.amount).toBe(40_000n);

			// BORROWER_RECEIVABLE: accrued 100k debit, now 40k credit => net 60k
			const receivable = await ctx.db.get(result.entry.creditAccountId);
			expect(receivable?.family).toBe("BORROWER_RECEIVABLE");
			expect(receivable?.cumulativeDebits).toBe(100_000n);
			expect(receivable?.cumulativeCredits).toBe(40_000n);
		});
	});

	it("passes postingGroupId through to the journal entry", async () => {
		const t = createHarness();
		const seeded = await seedMinimalEntities(t);
		const obligationId = await createDueObligation(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 50_000,
		});
		await accrueObligation(t, obligationId);

		await t.run(async (ctx) => {
			const result = await postCashReceiptForObligation(ctx, {
				obligationId,
				amount: 50_000,
				idempotencyKey: "cash-receipt-group-1",
				postingGroupId: "test-group-123",
				source: SYSTEM_SOURCE,
			});

			if (!result) {
				throw new Error("Expected non-null result");
			}
			expect(result.entry.postingGroupId).toBe("test-group-123");
		});
	});

	it("idempotency: duplicate call with same key returns existing entry without creating a second", async () => {
		const t = createHarness();
		const seeded = await seedMinimalEntities(t);
		const obligationId = await createDueObligation(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 100_000,
		});
		await accrueObligation(t, obligationId);

		const firstResult = await t.run(async (ctx) => {
			return postCashReceiptForObligation(ctx, {
				obligationId,
				amount: 100_000,
				idempotencyKey: "cash-receipt-idempotent-1",
				source: SYSTEM_SOURCE,
			});
		});

		const secondResult = await t.run(async (ctx) => {
			return postCashReceiptForObligation(ctx, {
				obligationId,
				amount: 100_000,
				idempotencyKey: "cash-receipt-idempotent-1",
				source: SYSTEM_SOURCE,
			});
		});

		if (!firstResult) {
			throw new Error("Expected non-null firstResult");
		}
		if (!secondResult) {
			throw new Error("Expected non-null secondResult");
		}
		expect(firstResult.entry._id).toBe(secondResult.entry._id);

		// Verify only one entry exists with this key
		await t.run(async (ctx) => {
			const entries = await ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_idempotency", (q) =>
					q.eq("idempotencyKey", "cash-receipt-idempotent-1")
				)
				.collect();
			expect(entries).toHaveLength(1);
		});
	});

	it("returns null when no BORROWER_RECEIVABLE account exists (no accrual)", async () => {
		const t = createHarness();
		const seeded = await seedMinimalEntities(t);
		const obligationId = await createDueObligation(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 100_000,
		});
		// Deliberately NOT accruing — no BORROWER_RECEIVABLE account

		await t.run(async (ctx) => {
			const result = await postCashReceiptForObligation(ctx, {
				obligationId,
				amount: 100_000,
				idempotencyKey: "cash-receipt-no-receivable-1",
				source: SYSTEM_SOURCE,
			});

			expect(result).toBeNull();
		});

		// Verify no journal entries were created
		await t.run(async (ctx) => {
			const entries = await ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_idempotency", (q) =>
					q.eq("idempotencyKey", "cash-receipt-no-receivable-1")
				)
				.collect();
			expect(entries).toHaveLength(0);
		});
	});
});

describe("postOverpaymentToUnappliedCash", () => {
	it("posts CASH_RECEIVED with debit=TRUST_CASH and credit=UNAPPLIED_CASH", async () => {
		const t = createHarness();
		const seeded = await seedMinimalEntities(t);
		await seedUnappliedCashAccount(t, seeded.mortgageId, 500_000n);

		// Need a collectionAttempt for the attemptId
		const attemptId = await t.run(async (ctx) => {
			const planEntryId = await ctx.db.insert("collectionPlanEntries", {
				obligationIds: [],
				amount: 75_000,
				method: "manual",
				scheduledDate: Date.parse("2026-03-15T00:00:00Z"),
				status: "completed",
				source: "default_schedule",
				createdAt: Date.now(),
			});
			return ctx.db.insert("collectionAttempts", {
				planEntryId,
				amount: 75_000,
				method: "manual",
				status: "confirmed",
				machineContext: {},
				initiatedAt: Date.now(),
			});
		});

		await t.run(async (ctx) => {
			const result = await postOverpaymentToUnappliedCash(ctx, {
				attemptId,
				amount: 25_000,
				mortgageId: seeded.mortgageId,
				borrowerId: seeded.borrowerId,
				postingGroupId: "cash-receipt:test",
				source: SYSTEM_SOURCE,
			});

			expect(result.entry.entryType).toBe("CASH_RECEIVED");
			expect(result.entry.amount).toBe(25_000n);

			const debitAccount = await ctx.db.get(result.entry.debitAccountId);
			const creditAccount = await ctx.db.get(result.entry.creditAccountId);
			expect(debitAccount?.family).toBe("TRUST_CASH");
			expect(creditAccount?.family).toBe("UNAPPLIED_CASH");
		});
	});

	it("uses correct idempotency key format", async () => {
		const t = createHarness();
		const seeded = await seedMinimalEntities(t);
		await seedUnappliedCashAccount(t, seeded.mortgageId, 500_000n);

		const attemptId = await t.run(async (ctx) => {
			const planEntryId = await ctx.db.insert("collectionPlanEntries", {
				obligationIds: [],
				amount: 50_000,
				method: "manual",
				scheduledDate: Date.parse("2026-03-15T00:00:00Z"),
				status: "completed",
				source: "default_schedule",
				createdAt: Date.now(),
			});
			return ctx.db.insert("collectionAttempts", {
				planEntryId,
				amount: 50_000,
				method: "manual",
				status: "confirmed",
				machineContext: {},
				initiatedAt: Date.now(),
			});
		});

		await t.run(async (ctx) => {
			const result = await postOverpaymentToUnappliedCash(ctx, {
				attemptId,
				amount: 10_000,
				mortgageId: seeded.mortgageId,
				postingGroupId: "cash-receipt:test",
				source: SYSTEM_SOURCE,
			});

			expect(result.entry.idempotencyKey).toBe(
				`cash-ledger:overpayment:${attemptId}`
			);
		});
	});

	it("includes 'Overpayment' in reason", async () => {
		const t = createHarness();
		const seeded = await seedMinimalEntities(t);
		await seedUnappliedCashAccount(t, seeded.mortgageId, 500_000n);

		const attemptId = await t.run(async (ctx) => {
			const planEntryId = await ctx.db.insert("collectionPlanEntries", {
				obligationIds: [],
				amount: 50_000,
				method: "manual",
				scheduledDate: Date.parse("2026-03-15T00:00:00Z"),
				status: "completed",
				source: "default_schedule",
				createdAt: Date.now(),
			});
			return ctx.db.insert("collectionAttempts", {
				planEntryId,
				amount: 50_000,
				method: "manual",
				status: "confirmed",
				machineContext: {},
				initiatedAt: Date.now(),
			});
		});

		await t.run(async (ctx) => {
			const result = await postOverpaymentToUnappliedCash(ctx, {
				attemptId,
				amount: 10_000,
				mortgageId: seeded.mortgageId,
				postingGroupId: "cash-receipt:test-reason",
				source: SYSTEM_SOURCE,
			});

			expect(result.entry.reason).toMatch(OVERPAYMENT_REASON_PATTERN);
		});
	});

	it("idempotency: duplicate call with same attemptId returns existing entry", async () => {
		const t = createHarness();
		const seeded = await seedMinimalEntities(t);
		await seedUnappliedCashAccount(t, seeded.mortgageId, 500_000n);

		const attemptId = await t.run(async (ctx) => {
			const planEntryId = await ctx.db.insert("collectionPlanEntries", {
				obligationIds: [],
				amount: 50_000,
				method: "manual",
				scheduledDate: Date.parse("2026-03-15T00:00:00Z"),
				status: "completed",
				source: "default_schedule",
				createdAt: Date.now(),
			});
			return ctx.db.insert("collectionAttempts", {
				planEntryId,
				amount: 50_000,
				method: "manual",
				status: "confirmed",
				machineContext: {},
				initiatedAt: Date.now(),
			});
		});

		const firstResult = await t.run(async (ctx) => {
			return postOverpaymentToUnappliedCash(ctx, {
				attemptId,
				amount: 15_000,
				mortgageId: seeded.mortgageId,
				postingGroupId: "cash-receipt:idem-test",
				source: SYSTEM_SOURCE,
			});
		});

		const secondResult = await t.run(async (ctx) => {
			return postOverpaymentToUnappliedCash(ctx, {
				attemptId,
				amount: 15_000,
				mortgageId: seeded.mortgageId,
				postingGroupId: "cash-receipt:idem-test",
				source: SYSTEM_SOURCE,
			});
		});

		expect(firstResult.entry._id).toBe(secondResult.entry._id);

		// Verify only one entry
		await t.run(async (ctx) => {
			const entries = await ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_idempotency", (q) =>
					q.eq("idempotencyKey", `cash-ledger:overpayment:${attemptId}`)
				)
				.collect();
			expect(entries).toHaveLength(1);
		});
	});
});
