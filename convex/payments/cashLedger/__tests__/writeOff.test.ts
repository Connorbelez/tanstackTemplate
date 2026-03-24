import { makeFunctionReference } from "convex/server";
import { describe, expect, it } from "vitest";
import {
	createTestConvex,
	ensureSeededIdentity,
} from "../../../../src/test/auth/helpers";
import { FAIRLEND_ADMIN } from "../../../../src/test/auth/identities";
import type { Id } from "../../../_generated/dataModel";
import { getCashAccountBalance } from "../accounts";
import { postObligationWriteOff } from "../integrations";
import {
	ADMIN_SOURCE,
	createHarness,
	seedMinimalEntities,
	type TestHarness,
} from "./testUtils";

const modules = import.meta.glob("/convex/**/*.ts");

// ── Module-level regex constants (Biome requires top-level regex) ────
const EXCEEDS_BALANCE_RE = /exceeds outstanding balance/;
const ACCOUNT_NOT_FOUND_RE = /cash account not found/;
const POSITIVE_SAFE_INTEGER_RE = /positive safe integer/;
const SETTLED_RE = /settled/;
const WAIVED_RE = /waived/;

// ── Helpers ──────────────────────────────────────────────────────────

async function createObligationWithReceivable(
	t: TestHarness,
	args: {
		mortgageId: Id<"mortgages">;
		borrowerId: Id<"borrowers">;
		amount: number;
		status?: string;
	}
) {
	return t.run(async (ctx) => {
		const obligationId = await ctx.db.insert("obligations", {
			status: args.status ?? "due",
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

// ── Integration Function Tests ───────────────────────────────────────

describe("postObligationWriteOff", () => {
	it("full write-off: entire balance written off, WRITE_OFF increases, BORROWER_RECEIVABLE goes to 0", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);
		const obligationId = await createObligationWithReceivable(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 50_000,
		});

		await t.run(async (ctx) => {
			const result = await postObligationWriteOff(ctx, {
				obligationId,
				amount: 50_000,
				reason: "Uncollectible debt",
				source: ADMIN_SOURCE,
			});

			expect(result.entry.entryType).toBe("OBLIGATION_WRITTEN_OFF");
			expect(result.entry.amount).toBe(50_000n);
			expect(result.entry.reason).toBe("Uncollectible debt");
		});

		// Verify account balances
		await t.run(async (ctx) => {
			// BORROWER_RECEIVABLE balance should be 0 (debits=50000, credits=50000)
			const receivables = await ctx.db
				.query("cash_ledger_accounts")
				.withIndex("by_family_and_obligation", (q) =>
					q.eq("family", "BORROWER_RECEIVABLE").eq("obligationId", obligationId)
				)
				.collect();
			expect(receivables).toHaveLength(1);
			expect(getCashAccountBalance(receivables[0])).toBe(0n);

			// WRITE_OFF account should have positive balance (debit-normal)
			const writeOffs = await ctx.db
				.query("cash_ledger_accounts")
				.withIndex("by_family_and_obligation", (q) =>
					q.eq("family", "WRITE_OFF").eq("obligationId", obligationId)
				)
				.collect();
			expect(writeOffs).toHaveLength(1);
			expect(getCashAccountBalance(writeOffs[0])).toBe(50_000n);
		});
	});

	it("partial write-off: remaining BORROWER_RECEIVABLE balance positive", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);
		const obligationId = await createObligationWithReceivable(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 100_000,
		});

		await t.run(async (ctx) => {
			await postObligationWriteOff(ctx, {
				obligationId,
				amount: 40_000,
				reason: "Partial write-off",
				source: ADMIN_SOURCE,
			});
		});

		await t.run(async (ctx) => {
			const receivables = await ctx.db
				.query("cash_ledger_accounts")
				.withIndex("by_family_and_obligation", (q) =>
					q.eq("family", "BORROWER_RECEIVABLE").eq("obligationId", obligationId)
				)
				.collect();
			// 100_000 - 40_000 = 60_000 remaining
			expect(getCashAccountBalance(receivables[0])).toBe(60_000n);

			const writeOffs = await ctx.db
				.query("cash_ledger_accounts")
				.withIndex("by_family_and_obligation", (q) =>
					q.eq("family", "WRITE_OFF").eq("obligationId", obligationId)
				)
				.collect();
			expect(getCashAccountBalance(writeOffs[0])).toBe(40_000n);
		});
	});

	it("multiple partial write-offs accumulate correctly", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);
		const obligationId = await createObligationWithReceivable(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 100_000,
		});

		// First write-off: 30,000
		await t.run(async (ctx) => {
			await postObligationWriteOff(ctx, {
				obligationId,
				amount: 30_000,
				reason: "Partial write-off 1",
				source: ADMIN_SOURCE,
			});
		});

		// Second write-off: 25,000
		await t.run(async (ctx) => {
			await postObligationWriteOff(ctx, {
				obligationId,
				amount: 25_000,
				reason: "Partial write-off 2",
				source: ADMIN_SOURCE,
			});
		});

		await t.run(async (ctx) => {
			const receivables = await ctx.db
				.query("cash_ledger_accounts")
				.withIndex("by_family_and_obligation", (q) =>
					q.eq("family", "BORROWER_RECEIVABLE").eq("obligationId", obligationId)
				)
				.collect();
			// 100_000 - 30_000 - 25_000 = 45_000
			expect(getCashAccountBalance(receivables[0])).toBe(45_000n);

			const writeOffs = await ctx.db
				.query("cash_ledger_accounts")
				.withIndex("by_family_and_obligation", (q) =>
					q.eq("family", "WRITE_OFF").eq("obligationId", obligationId)
				)
				.collect();
			// 30_000 + 25_000 = 55_000
			expect(getCashAccountBalance(writeOffs[0])).toBe(55_000n);
		});
	});

	it("rejects write-off exceeding outstanding balance", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);
		const obligationId = await createObligationWithReceivable(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 50_000,
		});

		await t.run(async (ctx) => {
			await expect(
				postObligationWriteOff(ctx, {
					obligationId,
					amount: 75_000,
					reason: "Over-write-off",
					source: ADMIN_SOURCE,
				})
			).rejects.toThrow(EXCEEDS_BALANCE_RE);
		});
	});

	it("rejects when no receivable account exists", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);

		// Create obligation WITHOUT a receivable account
		const obligationId = await t.run(async (ctx) => {
			return ctx.db.insert("obligations", {
				status: "due",
				machineContext: {},
				lastTransitionAt: Date.now(),
				mortgageId: seeded.mortgageId,
				borrowerId: seeded.borrowerId,
				paymentNumber: 1,
				type: "regular_interest",
				amount: 50_000,
				amountSettled: 0,
				dueDate: Date.parse("2026-03-01T00:00:00Z"),
				gracePeriodEnd: Date.parse("2026-03-16T00:00:00Z"),
				createdAt: Date.now(),
			});
		});

		await t.run(async (ctx) => {
			await expect(
				postObligationWriteOff(ctx, {
					obligationId,
					amount: 50_000,
					reason: "No receivable",
					source: ADMIN_SOURCE,
				})
			).rejects.toThrow(ACCOUNT_NOT_FOUND_RE);
		});
	});

	it("does not change obligation GT status after write-off", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);
		const obligationId = await createObligationWithReceivable(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 50_000,
		});

		await t.run(async (ctx) => {
			await postObligationWriteOff(ctx, {
				obligationId,
				amount: 50_000,
				reason: "Full write-off",
				source: ADMIN_SOURCE,
			});
		});

		await t.run(async (ctx) => {
			const obligation = await ctx.db.get(obligationId);
			expect(obligation).not.toBeNull();
			expect(obligation?.status).toBe("due");
		});
	});

	it("records source and reason on journal entry", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);
		const obligationId = await createObligationWithReceivable(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 50_000,
		});

		await t.run(async (ctx) => {
			const result = await postObligationWriteOff(ctx, {
				obligationId,
				amount: 10_000,
				reason: "Borrower declared bankruptcy",
				source: ADMIN_SOURCE,
			});

			expect(result.entry.reason).toBe("Borrower declared bankruptcy");
			expect(result.entry.source.actorId).toBe(ADMIN_SOURCE.actorId);
			expect(result.entry.source.actorType).toBe("admin");
			expect(result.entry.source.channel).toBe("admin_dashboard");
		});
	});

	it("WRITE_OFF account is debit-normal: balance = cumDebits - cumCredits", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);
		const obligationId = await createObligationWithReceivable(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 80_000,
		});

		await t.run(async (ctx) => {
			await postObligationWriteOff(ctx, {
				obligationId,
				amount: 30_000,
				reason: "Test debit-normal",
				source: ADMIN_SOURCE,
			});
		});

		await t.run(async (ctx) => {
			const writeOffs = await ctx.db
				.query("cash_ledger_accounts")
				.withIndex("by_family_and_obligation", (q) =>
					q.eq("family", "WRITE_OFF").eq("obligationId", obligationId)
				)
				.collect();
			expect(writeOffs).toHaveLength(1);

			const account = writeOffs[0];
			// WRITE_OFF is NOT in CREDIT_NORMAL_FAMILIES, so it is debit-normal
			// balance = cumulativeDebits - cumulativeCredits
			expect(account.cumulativeDebits).toBe(30_000n);
			expect(account.cumulativeCredits).toBe(0n);
			expect(getCashAccountBalance(account)).toBe(30_000n);
		});
	});
});

// ── Mutation Tests ───────────────────────────────────────────────────
// The writeOffObligationBalance mutation is auth-gated via adminMutation.
// We test mutation-level validation (settled/waived, amount, collection warnings)
// through the full convex-test harness with registered auth components.

const writeOffRef = makeFunctionReference<
	"mutation",
	{
		obligationId: Id<"obligations">;
		amount: number;
		reason: string;
	},
	{
		entry: { _id: Id<"cash_ledger_journal_entries"> };
		writtenOffAmount: number;
		hasActiveCollectionWarning: boolean;
	}
>("payments/cashLedger/mutations:writeOffObligationBalance");

describe("writeOffObligationBalance mutation", () => {
	it("rejects zero amount", async () => {
		const t = createTestConvex();
		await ensureSeededIdentity(t, FAIRLEND_ADMIN);
		const seeded = await seedMinimalEntities(t);
		const obligationId = await createObligationWithReceivable(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 50_000,
		});

		await expect(
			t.withIdentity(FAIRLEND_ADMIN).mutation(writeOffRef, {
				obligationId,
				amount: 0,
				reason: "Zero write-off",
			})
		).rejects.toThrow(POSITIVE_SAFE_INTEGER_RE);
	});

	it("rejects negative amount", async () => {
		const t = createTestConvex();
		await ensureSeededIdentity(t, FAIRLEND_ADMIN);
		const seeded = await seedMinimalEntities(t);
		const obligationId = await createObligationWithReceivable(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 50_000,
		});

		await expect(
			t.withIdentity(FAIRLEND_ADMIN).mutation(writeOffRef, {
				obligationId,
				amount: -100,
				reason: "Negative write-off",
			})
		).rejects.toThrow(POSITIVE_SAFE_INTEGER_RE);
	});

	it("rejects write-off on settled obligation", async () => {
		const t = createTestConvex();
		await ensureSeededIdentity(t, FAIRLEND_ADMIN);
		const seeded = await seedMinimalEntities(t);
		const obligationId = await createObligationWithReceivable(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 50_000,
			status: "settled",
		});

		await expect(
			t.withIdentity(FAIRLEND_ADMIN).mutation(writeOffRef, {
				obligationId,
				amount: 10_000,
				reason: "Already settled",
			})
		).rejects.toThrow(SETTLED_RE);
	});

	it("rejects write-off on waived obligation", async () => {
		const t = createTestConvex();
		await ensureSeededIdentity(t, FAIRLEND_ADMIN);
		const seeded = await seedMinimalEntities(t);
		const obligationId = await createObligationWithReceivable(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 50_000,
			status: "waived",
		});

		await expect(
			t.withIdentity(FAIRLEND_ADMIN).mutation(writeOffRef, {
				obligationId,
				amount: 10_000,
				reason: "Already waived",
			})
		).rejects.toThrow(WAIVED_RE);
	});

	it("returns hasActiveCollectionWarning when active attempts exist", async () => {
		const t = createTestConvex();
		await ensureSeededIdentity(t, FAIRLEND_ADMIN);
		const seeded = await seedMinimalEntities(t);
		const obligationId = await createObligationWithReceivable(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 50_000,
		});

		// Create an active collection plan entry referencing the obligation
		await t.run(async (ctx) => {
			const planEntryId = await ctx.db.insert("collectionPlanEntries", {
				obligationIds: [obligationId],
				amount: 50_000,
				method: "manual",
				scheduledDate: Date.now(),
				status: "executing",
				source: "admin",
				createdAt: Date.now(),
			});

			// Create a non-terminal collection attempt
			await ctx.db.insert("collectionAttempts", {
				status: "pending",
				planEntryId,
				method: "manual",
				amount: 50_000,
				initiatedAt: Date.now(),
			});
		});

		const result = await t.withIdentity(FAIRLEND_ADMIN).mutation(writeOffRef, {
			obligationId,
			amount: 50_000,
			reason: "Write-off with active collection",
		});

		expect(result.hasActiveCollectionWarning).toBe(true);
	});

	it("returns hasActiveCollectionWarning false when no active attempts", async () => {
		const t = createTestConvex();
		await ensureSeededIdentity(t, FAIRLEND_ADMIN);
		const seeded = await seedMinimalEntities(t);
		const obligationId = await createObligationWithReceivable(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 50_000,
		});

		const result = await t.withIdentity(FAIRLEND_ADMIN).mutation(writeOffRef, {
			obligationId,
			amount: 25_000,
			reason: "Clean write-off",
		});

		expect(result.hasActiveCollectionWarning).toBe(false);
		expect(result.writtenOffAmount).toBe(25_000);
	});

	it("persists journal entry to database and returns verifiable entryId", async () => {
		const t = createTestConvex();
		await ensureSeededIdentity(t, FAIRLEND_ADMIN);
		const seeded = await seedMinimalEntities(t);
		const obligationId = await createObligationWithReceivable(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 50_000,
		});

		const result = await t.withIdentity(FAIRLEND_ADMIN).mutation(writeOffRef, {
			obligationId,
			amount: 50_000,
			reason: "Full write-off for verification",
		});

		// Re-query the journal entry directly from DB to verify persistence
		await t.run(async (ctx) => {
			const entry = await ctx.db.get(result.entry._id);
			expect(entry).not.toBeNull();
			expect(entry?.entryType).toBe("OBLIGATION_WRITTEN_OFF");
			expect(entry?.amount).toBe(50_000n);
			expect(entry?.obligationId).toBe(obligationId);
			expect(entry?.reason).toBe("Full write-off for verification");
			expect(entry?.source.actorType).toBe("admin");
		});
	});

	// "obligation not found" path (ctx.db.get → null → ConvexError) is not directly
	// testable: Convex's v.id("obligations") validator accepts only valid-format IDs,
	// so a fake ID cannot be passed. The amount-exceeds-balance and no-receivable-
	// account tests cover different error paths (balance check and account lookup). If
	// postObligationWriteOff is called with a valid-format but missing obligationId,
	// it throws "Obligation not found" as expected — callers are gated by the v.id
	// validator so this path is only reachable via internal code bugs.

	it("write-off entry recorded correctly to serve as anchor for future CORRECTION reversal", async () => {
		// The spec says "If cash later collected on written-off obligation, CORRECTION
		// entry reverses part of write-off." We verify the OBLIGATION_WRITTEN_OFF entry
		// is correctly recorded (correct amount, causedBy unset) so a future CORRECTION entry
		// could legitimately reverse it. We do NOT post a CORRECTION here — that is a
		// separate workflow covered by the correction workflow tests.
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);
		const obligationId = await createObligationWithReceivable(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 100_000,
		});

		// Step 1: Write off 60,000 (partial write-off)
		await t.run(async (ctx) => {
			await postObligationWriteOff(ctx, {
				obligationId,
				amount: 60_000,
				reason: "Bad debt — bankruptcy",
				source: ADMIN_SOURCE,
			});
		});

		// Step 2: Verify write-off posted correctly
		await t.run(async (ctx) => {
			const writeOffs = await ctx.db
				.query("cash_ledger_accounts")
				.withIndex("by_family_and_obligation", (q) =>
					q.eq("family", "WRITE_OFF").eq("obligationId", obligationId)
				)
				.collect();
			expect(getCashAccountBalance(writeOffs[0])).toBe(60_000n);

			const receivables = await ctx.db
				.query("cash_ledger_accounts")
				.withIndex("by_family_and_obligation", (q) =>
					q.eq("family", "BORROWER_RECEIVABLE").eq("obligationId", obligationId)
				)
				.collect();
			// 100_000 original - 60_000 written off = 40_000 remaining
			expect(getCashAccountBalance(receivables[0])).toBe(40_000n);
		});

		// Step 3: Simulate recovery — a CORRECTION entry would reverse the write-off.
		// We verify the WRITE_OFF account has the written-off amount recorded so a future
		// CORRECTION can reverse it correctly.
		await t.run(async (ctx) => {
			const entries = await ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_obligation_and_sequence", (q) =>
					q.eq("obligationId", obligationId)
				)
				.collect();
			expect(entries).toHaveLength(1);
			expect(entries[0].entryType).toBe("OBLIGATION_WRITTEN_OFF");
			expect(entries[0].amount).toBe(60_000n);
			// The causedBy would be set by a future CORRECTION entry — for the original
			// write-off entry it should be unset.
			expect(entries[0].causedBy).toBeUndefined();
		});
	});
});
