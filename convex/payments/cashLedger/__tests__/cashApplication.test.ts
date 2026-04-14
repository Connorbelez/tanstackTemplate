import { makeFunctionReference } from "convex/server";
import { describe, expect, it } from "vitest";
import {
	createTestConvex,
	ensureSeededIdentity,
} from "../../../../src/test/auth/helpers";
import { FAIRLEND_ADMIN } from "../../../../src/test/auth/identities";
import {
	ADMIN_SOURCE,
	createHarness,
	createTestAccount,
	postTestEntry,
	seedMinimalEntities,
	type TestHarness,
} from "../../../../src/test/convex/payments/cashLedger/testUtils";
import type { Id } from "../../../_generated/dataModel";
import { convexModules } from "../../../test/moduleMaps";
import { getCashAccountBalance } from "../accounts";
import { postCashApplication } from "../integrations";
import { buildIdempotencyKey } from "../types";

const modules = convexModules;

// ── Module-level regex constants (Biome requires top-level regex) ────
const INSUFFICIENT_BALANCE_RE = /Insufficient balance/;
const MUST_BE_UNAPPLIED_OR_SUSPENSE_RE =
	/must be UNAPPLIED_CASH or SUSPENSE family/;
const POSITIVE_SAFE_INTEGER_RE = /positive safe integer/;
const BLANK_REASON_RE = /reason cannot be blank/;

// ── Helpers ──────────────────────────────────────────────────────────

async function createObligationWithReceivable(
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
			amountSettled: 0,
			dueDate: Date.parse("2026-03-01T00:00:00Z"),
			gracePeriodEnd: Date.parse("2026-03-16T00:00:00Z"),
			createdAt: Date.now(),
		});

		// Create BORROWER_RECEIVABLE with outstanding balance
		// BORROWER_RECEIVABLE is debit-normal: balance = debits - credits
		await ctx.db.insert("cash_ledger_accounts", {
			family: "BORROWER_RECEIVABLE",
			mortgageId: args.mortgageId,
			obligationId,
			borrowerId: args.borrowerId,
			cumulativeDebits: BigInt(args.amount),
			cumulativeCredits: 0n,
			createdAt: Date.now(),
		});

		return obligationId;
	});
}

async function createObligationWithoutReceivable(
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
			dueDate: Date.parse("2026-03-01T00:00:00Z"),
			gracePeriodEnd: Date.parse("2026-03-16T00:00:00Z"),
			createdAt: Date.now(),
		});
	});
}

// ── Integration Function Tests ───────────────────────────────────────

describe("postCashApplication", () => {
	it("applies full UNAPPLIED_CASH balance to obligation → UNAPPLIED_CASH zeroed, BORROWER_RECEIVABLE credited", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);
		const obligationId = await createObligationWithReceivable(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 50_000,
		});

		// UNAPPLIED_CASH is credit-normal: balance = credits - debits
		const unappliedAccount = await createTestAccount(t, {
			family: "UNAPPLIED_CASH",
			mortgageId: seeded.mortgageId,
			initialCreditBalance: 50_000n,
		});

		await t.run(async (ctx) => {
			const result = await postCashApplication(ctx, {
				sourceAccountId: unappliedAccount._id,
				targetObligationId: obligationId,
				amount: 50_000,
				reason: "Apply full balance to obligation",
				source: ADMIN_SOURCE,
				idempotencyKey: "test-full-apply",
			});

			expect(result.entry.entryType).toBe("CASH_APPLIED");
			expect(result.entry.amount).toBe(50_000n);
		});

		// Verify UNAPPLIED_CASH balance is 0
		await t.run(async (ctx) => {
			const account = await ctx.db.get(unappliedAccount._id);
			if (!account) {
				throw new Error("Account not found");
			}
			expect(getCashAccountBalance(account)).toBe(0n);
		});
	});

	it("partial application → remaining UNAPPLIED_CASH balance correct", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);
		const obligationId = await createObligationWithReceivable(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 100_000,
		});

		// UNAPPLIED_CASH with 100_000 balance
		const unappliedAccount = await createTestAccount(t, {
			family: "UNAPPLIED_CASH",
			mortgageId: seeded.mortgageId,
			initialCreditBalance: 100_000n,
		});

		await t.run(async (ctx) => {
			await postCashApplication(ctx, {
				sourceAccountId: unappliedAccount._id,
				targetObligationId: obligationId,
				amount: 40_000,
				reason: "Partial application",
				source: ADMIN_SOURCE,
				idempotencyKey: "test-partial-apply",
			});
		});

		// Verify remaining balance is 60_000
		await t.run(async (ctx) => {
			const account = await ctx.db.get(unappliedAccount._id);
			if (!account) {
				throw new Error("Account not found");
			}
			expect(getCashAccountBalance(account)).toBe(60_000n);
		});
	});

	it("split application (2 obligations) → sum of applications equals original", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);

		const obligationA = await createObligationWithReceivable(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 60_000,
		});
		const obligationB = await createObligationWithReceivable(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 40_000,
		});

		// UNAPPLIED_CASH with 100_000
		const unappliedAccount = await createTestAccount(t, {
			family: "UNAPPLIED_CASH",
			mortgageId: seeded.mortgageId,
			initialCreditBalance: 100_000n,
		});

		// Apply 60_000 to obligation A
		await t.run(async (ctx) => {
			await postCashApplication(ctx, {
				sourceAccountId: unappliedAccount._id,
				targetObligationId: obligationA,
				amount: 60_000,
				reason: "Apply to obligation A",
				source: ADMIN_SOURCE,
				idempotencyKey: "test-split-A",
			});
		});

		// Apply 40_000 to obligation B
		await t.run(async (ctx) => {
			await postCashApplication(ctx, {
				sourceAccountId: unappliedAccount._id,
				targetObligationId: obligationB,
				amount: 40_000,
				reason: "Apply to obligation B",
				source: ADMIN_SOURCE,
				idempotencyKey: "test-split-B",
			});
		});

		// UNAPPLIED_CASH should be 0
		await t.run(async (ctx) => {
			const account = await ctx.db.get(unappliedAccount._id);
			if (!account) {
				throw new Error("Account not found");
			}
			expect(getCashAccountBalance(account)).toBe(0n);
		});
	});

	it("rejects amount exceeding source balance", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);
		const obligationId = await createObligationWithReceivable(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 100_000,
		});

		// UNAPPLIED_CASH with only 50_000
		const unappliedAccount = await createTestAccount(t, {
			family: "UNAPPLIED_CASH",
			mortgageId: seeded.mortgageId,
			initialCreditBalance: 50_000n,
		});

		await t.run(async (ctx) => {
			await expect(
				postCashApplication(ctx, {
					sourceAccountId: unappliedAccount._id,
					targetObligationId: obligationId,
					amount: 75_000,
					reason: "Over-application",
					source: ADMIN_SOURCE,
					idempotencyKey: "test-over-apply",
				})
			).rejects.toThrow(INSUFFICIENT_BALANCE_RE);
		});
	});

	it("rejects non-UNAPPLIED_CASH/SUSPENSE source account", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);
		const obligationId = await createObligationWithReceivable(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 50_000,
		});

		// Create a TRUST_CASH account (not allowed as source)
		const trustCashAccount = await createTestAccount(t, {
			family: "TRUST_CASH",
			mortgageId: seeded.mortgageId,
			initialDebitBalance: 50_000n,
		});

		await t.run(async (ctx) => {
			await expect(
				postCashApplication(ctx, {
					sourceAccountId: trustCashAccount._id,
					targetObligationId: obligationId,
					amount: 50_000,
					reason: "Invalid source family",
					source: ADMIN_SOURCE,
					idempotencyKey: "test-invalid-family",
				})
			).rejects.toThrow(MUST_BE_UNAPPLIED_OR_SUSPENSE_RE);
		});
	});

	it("causedBy linkage correct when sourceEntryId provided", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);
		const obligationId = await createObligationWithReceivable(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 50_000,
		});

		const unappliedAccount = await createTestAccount(t, {
			family: "UNAPPLIED_CASH",
			mortgageId: seeded.mortgageId,
			initialCreditBalance: 50_000n,
		});

		const trustCashAccount = await createTestAccount(t, {
			family: "TRUST_CASH",
			mortgageId: seeded.mortgageId,
			initialDebitBalance: 50_000n,
		});

		const priorReceipt = await postTestEntry(t, {
			entryType: "CASH_RECEIVED",
			effectiveDate: "2026-03-01",
			amount: 50_000,
			debitAccountId: trustCashAccount._id,
			creditAccountId: unappliedAccount._id,
			idempotencyKey: buildIdempotencyKey("test", "seed-caused-by"),
			mortgageId: seeded.mortgageId,
			source: ADMIN_SOURCE,
			reason: "Seed receipt for causedBy linkage",
		});

		await t.run(async (ctx) => {
			const result = await postCashApplication(ctx, {
				sourceAccountId: unappliedAccount._id,
				targetObligationId: obligationId,
				amount: 50_000,
				reason: "Apply with causedBy",
				sourceEntryId: priorReceipt.entry._id,
				source: ADMIN_SOURCE,
				idempotencyKey: "test-caused-by",
			});

			expect(result.entry.causedBy).toBe(priorReceipt.entry._id);
		});
	});

	it("creates BORROWER_RECEIVABLE if not exists", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);

		// Create obligation WITHOUT a pre-existing receivable
		const obligationId = await createObligationWithoutReceivable(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 50_000,
		});

		const unappliedAccount = await createTestAccount(t, {
			family: "UNAPPLIED_CASH",
			mortgageId: seeded.mortgageId,
			initialCreditBalance: 50_000n,
		});

		await t.run(async (ctx) => {
			const result = await postCashApplication(ctx, {
				sourceAccountId: unappliedAccount._id,
				targetObligationId: obligationId,
				amount: 50_000,
				reason: "Auto-creates receivable",
				source: ADMIN_SOURCE,
				idempotencyKey: "test-auto-receivable",
			});

			expect(result.entry.entryType).toBe("CASH_APPLIED");
		});

		// Verify BORROWER_RECEIVABLE was created
		await t.run(async (ctx) => {
			const receivables = await ctx.db
				.query("cash_ledger_accounts")
				.withIndex("by_family_and_obligation", (q) =>
					q.eq("family", "BORROWER_RECEIVABLE").eq("obligationId", obligationId)
				)
				.collect();
			expect(receivables).toHaveLength(1);
		});
	});
});

// ── Mutation Tests ───────────────────────────────────────────────────

const applyCashRef = makeFunctionReference<
	"mutation",
	{
		sourceAccountId: Id<"cash_ledger_accounts">;
		targetObligationId: Id<"obligations">;
		amount: number;
		reason: string;
		sourceEntryId?: Id<"cash_ledger_journal_entries">;
		idempotencyKey: string;
	},
	{ entry: { _id: Id<"cash_ledger_journal_entries"> }; appliedAmount: number }
>("payments/cashLedger/mutations:applyCashToObligation");

describe("applyCashToObligation mutation", () => {
	it("rejects zero amount", async () => {
		const t = createTestConvex();
		await ensureSeededIdentity(t, FAIRLEND_ADMIN);
		const seeded = await seedMinimalEntities(t);
		const obligationId = await createObligationWithReceivable(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 50_000,
		});

		const unappliedAccount = await createTestAccount(t, {
			family: "UNAPPLIED_CASH",
			mortgageId: seeded.mortgageId,
			initialCreditBalance: 50_000n,
		});

		await expect(
			t.withIdentity(FAIRLEND_ADMIN).mutation(applyCashRef, {
				sourceAccountId: unappliedAccount._id,
				targetObligationId: obligationId,
				amount: 0,
				reason: "Zero amount",
				idempotencyKey: "test-zero-amount",
			})
		).rejects.toThrow(POSITIVE_SAFE_INTEGER_RE);
	});

	it("rejects blank reason", async () => {
		const t = createTestConvex();
		await ensureSeededIdentity(t, FAIRLEND_ADMIN);
		const seeded = await seedMinimalEntities(t);
		const obligationId = await createObligationWithReceivable(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 50_000,
		});

		const unappliedAccount = await createTestAccount(t, {
			family: "UNAPPLIED_CASH",
			mortgageId: seeded.mortgageId,
			initialCreditBalance: 50_000n,
		});

		await expect(
			t.withIdentity(FAIRLEND_ADMIN).mutation(applyCashRef, {
				sourceAccountId: unappliedAccount._id,
				targetObligationId: obligationId,
				amount: 10_000,
				reason: "   ",
				idempotencyKey: "test-blank-reason",
			})
		).rejects.toThrow(BLANK_REASON_RE);
	});

	it("successful application returns entry and appliedAmount", async () => {
		const t = createTestConvex();
		await ensureSeededIdentity(t, FAIRLEND_ADMIN);
		const seeded = await seedMinimalEntities(t);
		const obligationId = await createObligationWithReceivable(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 50_000,
		});

		const unappliedAccount = await createTestAccount(t, {
			family: "UNAPPLIED_CASH",
			mortgageId: seeded.mortgageId,
			initialCreditBalance: 50_000n,
		});

		const result = await t.withIdentity(FAIRLEND_ADMIN).mutation(applyCashRef, {
			sourceAccountId: unappliedAccount._id,
			targetObligationId: obligationId,
			amount: 25_000,
			reason: "Partial cash application",
			idempotencyKey: "test-mutation-apply",
		});

		expect(result.entry._id).toBeDefined();
		expect(result.appliedAmount).toBe(25_000);
	});
});
