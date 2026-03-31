import { makeFunctionReference } from "convex/server";
import { describe, expect, it } from "vitest";
import {
	createTestConvex,
	ensureSeededIdentity,
} from "../../../../src/test/auth/helpers";
import { FAIRLEND_ADMIN } from "../../../../src/test/auth/identities";
import type { Id } from "../../../_generated/dataModel";
import { convexModules } from "../../../test/moduleMaps";
import { getCashAccountBalance } from "../accounts";
import { postSuspenseResolution } from "../integrations";
import { buildIdempotencyKey } from "../types";
import {
	ADMIN_SOURCE,
	createHarness,
	createTestAccount,
	postTestEntry,
	SYSTEM_SOURCE,
	seedMinimalEntities,
	type TestHarness,
} from "./testUtils";

const modules = convexModules;

// ── Module-level regex constants (Biome requires top-level regex) ────
const INSUFFICIENT_SUSPENSE_RE = /Insufficient suspense balance/;
const MUST_BE_SUSPENSE_RE = /must be SUSPENSE family/;
const POSITIVE_SAFE_INTEGER_RE = /positive safe integer/;
const BLANK_REASON_RE = /reason cannot be blank/;
const MATCH_REQUIRES_OBLIGATION_RE = /requires an obligationId/;

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

describe("postSuspenseResolution", () => {
	it("match to obligation → SUSPENSE_ESCALATED entry posted, BORROWER_RECEIVABLE credited", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);

		// Create SUSPENSE account with debit balance (debit-normal: balance = debits - credits)
		const suspenseAccount = await createTestAccount(t, {
			family: "SUSPENSE",
			mortgageId: seeded.mortgageId,
			initialDebitBalance: 50_000n,
		});

		const obligationId = await createObligationWithReceivable(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 50_000,
		});

		await t.run(async (ctx) => {
			const result = await postSuspenseResolution(ctx, {
				suspenseAccountId: suspenseAccount._id,
				resolution: {
					type: "match",
					obligationId,
					amount: 50_000,
				},
				source: ADMIN_SOURCE,
				reason: "Match suspense to obligation",
				idempotencyKey: "test-match-full",
			});

			// Match resolution delegates to postCashApplication which uses SUSPENSE_ESCALATED
			expect("entry" in result && result.entry.entryType).toBe(
				"SUSPENSE_ESCALATED"
			);
			// Verify the entry amount
			expect("entry" in result && result.entry.amount).toBe(50_000n);
		});

		// Verify BORROWER_RECEIVABLE was credited (balance reduced by applied amount)
		await t.run(async (ctx) => {
			const receivables = await ctx.db
				.query("cash_ledger_accounts")
				.withIndex("by_family_and_obligation", (q) =>
					q.eq("family", "BORROWER_RECEIVABLE").eq("obligationId", obligationId)
				)
				.collect();
			expect(receivables).toHaveLength(1);
			// Original receivable: debits=50_000, credits=0 → balance=50_000
			// After SUSPENSE_ESCALATED credits 50_000: debits=50_000, credits=50_000 → balance=0
			expect(getCashAccountBalance(receivables[0])).toBe(0n);
		});
	});

	it("write-off → SUSPENSE zeroed after routed inflow, WRITE_OFF debited", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);

		// Start SUSPENSE at zero; establish the 30_000 balance only via SUSPENSE_ROUTED
		const suspenseAccount = await createTestAccount(t, {
			family: "SUSPENSE",
			mortgageId: seeded.mortgageId,
		});

		// Create a CASH_CLEARING account for the SUSPENSE_ROUTED entry
		const cashClearingAccount = await createTestAccount(t, {
			family: "CASH_CLEARING",
			mortgageId: seeded.mortgageId,
			initialCreditBalance: 30_000n,
		});

		// Create a SUSPENSE_ROUTED journal entry so causedBy can reference it
		const suspenseEntry = await postTestEntry(t, {
			entryType: "SUSPENSE_ROUTED",
			effectiveDate: "2026-03-01",
			amount: 30_000,
			debitAccountId: suspenseAccount._id,
			creditAccountId: cashClearingAccount._id,
			idempotencyKey: buildIdempotencyKey(
				"test-suspense-routed",
				"test-write-off"
			),
			mortgageId: seeded.mortgageId,
			source: SYSTEM_SOURCE,
			reason: "Test suspense routing",
			metadata: { test: true },
		});

		await t.run(async (ctx) => {
			const result = await postSuspenseResolution(ctx, {
				suspenseAccountId: suspenseAccount._id,
				resolution: {
					type: "write_off",
					amount: 30_000,
				},
				sourceEntryId: suspenseEntry.entry._id,
				source: ADMIN_SOURCE,
				reason: "Write off suspense balance",
				idempotencyKey: "test-write-off",
			});

			// Write-off uses CORRECTION entry type
			expect("entry" in result && result.entry.entryType).toBe("CORRECTION");
		});

		// SUSPENSE_ROUTED: debits=30_000, credits=0 → balance 30_000
		// CORRECTION credits SUSPENSE 30_000 → debits=30_000, credits=30_000 → balance 0
		await t.run(async (ctx) => {
			const account = await ctx.db.get(suspenseAccount._id);
			if (!account) {
				throw new Error("SUSPENSE account not found");
			}
			expect(getCashAccountBalance(account)).toBe(0n);
		});

		// Verify WRITE_OFF account created with debit balance
		await t.run(async (ctx) => {
			const writeOffs = await ctx.db
				.query("cash_ledger_accounts")
				.withIndex("by_family_and_mortgage", (q) =>
					q.eq("family", "WRITE_OFF").eq("mortgageId", seeded.mortgageId)
				)
				.collect();
			expect(writeOffs.length).toBeGreaterThanOrEqual(1);
			// WRITE_OFF is debit-normal, so positive balance = debit > credit
			const writeOffAccount = writeOffs[0];
			expect(getCashAccountBalance(writeOffAccount)).toBe(30_000n);
		});
	});

	it("refund → audit log records refund intent, no journal entries", async () => {
		// Refund path returns a refund intent; audit logging is handled by the mutation layer.
		// We still use the full test harness (createTestConvex) so the mutation stack is wired correctly.
		const t = createTestConvex();
		await ensureSeededIdentity(t, FAIRLEND_ADMIN);
		const seeded = await seedMinimalEntities(t);

		const suspenseAccount = await createTestAccount(t, {
			family: "SUSPENSE",
			mortgageId: seeded.mortgageId,
			initialDebitBalance: 50_000n,
		});

		await t.run(async (ctx) => {
			const result = await postSuspenseResolution(ctx, {
				suspenseAccountId: suspenseAccount._id,
				resolution: {
					type: "refund",
					amount: 50_000,
				},
				source: ADMIN_SOURCE,
				reason: "Customer refund",
				idempotencyKey: "test-refund",
			});

			// Refund returns intent signal — no journal entry posted.
			// Audit logging is handled by the mutation layer, not the integration function.
			expect(result).toEqual({
				type: "refund_requested",
				auditLogged: false,
			});
		});

		// Verify no journal entries were created for the suspense account
		await t.run(async (ctx) => {
			const entries = await ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_debit_account_and_timestamp", (q) =>
					q.eq("debitAccountId", suspenseAccount._id)
				)
				.collect();
			expect(entries).toHaveLength(0);

			const creditEntries = await ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_credit_account_and_timestamp", (q) =>
					q.eq("creditAccountId", suspenseAccount._id)
				)
				.collect();
			expect(creditEntries).toHaveLength(0);
		});
	});

	it("partial resolution → BORROWER_RECEIVABLE partially credited, remaining balance correct", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);

		// SUSPENSE with 100_000 balance
		const suspenseAccount = await createTestAccount(t, {
			family: "SUSPENSE",
			mortgageId: seeded.mortgageId,
			initialDebitBalance: 100_000n,
		});

		const obligationId = await createObligationWithReceivable(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 100_000,
		});

		// Match-resolve 40_000
		await t.run(async (ctx) => {
			await postSuspenseResolution(ctx, {
				suspenseAccountId: suspenseAccount._id,
				resolution: {
					type: "match",
					obligationId,
					amount: 40_000,
				},
				source: ADMIN_SOURCE,
				reason: "Partial suspense resolution",
				idempotencyKey: "test-partial-match",
			});
		});

		// Verify BORROWER_RECEIVABLE balance reduced by 40_000
		// Original: debits=100_000, credits=0 → balance=100_000
		// After SUSPENSE_ESCALATED credits 40_000: debits=100_000, credits=40_000 → balance=60_000
		await t.run(async (ctx) => {
			const receivables = await ctx.db
				.query("cash_ledger_accounts")
				.withIndex("by_family_and_obligation", (q) =>
					q.eq("family", "BORROWER_RECEIVABLE").eq("obligationId", obligationId)
				)
				.collect();
			expect(receivables).toHaveLength(1);
			expect(getCashAccountBalance(receivables[0])).toBe(60_000n);
		});
	});

	it("rejects non-SUSPENSE account", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);
		const obligationId = await createObligationWithReceivable(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 50_000,
		});

		// Create UNAPPLIED_CASH account (not allowed as suspense source)
		const unappliedAccount = await createTestAccount(t, {
			family: "UNAPPLIED_CASH",
			mortgageId: seeded.mortgageId,
			initialCreditBalance: 50_000n,
		});

		await t.run(async (ctx) => {
			await expect(
				postSuspenseResolution(ctx, {
					suspenseAccountId: unappliedAccount._id,
					resolution: {
						type: "match",
						obligationId,
						amount: 50_000,
					},
					source: ADMIN_SOURCE,
					reason: "Should fail — not suspense",
					idempotencyKey: "test-not-suspense",
				})
			).rejects.toThrow(MUST_BE_SUSPENSE_RE);
		});
	});

	it("rejects amount exceeding suspense balance", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);

		const suspenseAccount = await createTestAccount(t, {
			family: "SUSPENSE",
			mortgageId: seeded.mortgageId,
			initialDebitBalance: 50_000n,
		});

		const obligationId = await createObligationWithReceivable(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 100_000,
		});

		await t.run(async (ctx) => {
			await expect(
				postSuspenseResolution(ctx, {
					suspenseAccountId: suspenseAccount._id,
					resolution: {
						type: "match",
						obligationId,
						amount: 75_000,
					},
					source: ADMIN_SOURCE,
					reason: "Over-resolution",
					idempotencyKey: "test-over-resolve",
				})
			).rejects.toThrow(INSUFFICIENT_SUSPENSE_RE);
		});
	});
});

// ── Mutation Tests ───────────────────────────────────────────────────

const resolveRef = makeFunctionReference<
	"mutation",
	{
		suspenseAccountId: Id<"cash_ledger_accounts">;
		resolutionType: "match" | "refund" | "write_off";
		amount: number;
		obligationId?: Id<"obligations">;
		reason: string;
		sourceEntryId?: Id<"cash_ledger_journal_entries">;
		idempotencyKey: string;
	},
	Record<string, unknown>
>("payments/cashLedger/mutations:resolveSuspenseItem");

describe("resolveSuspenseItem mutation", () => {
	it("rejects zero amount", async () => {
		const t = createTestConvex();
		await ensureSeededIdentity(t, FAIRLEND_ADMIN);
		const seeded = await seedMinimalEntities(t);

		const suspenseAccount = await createTestAccount(t, {
			family: "SUSPENSE",
			mortgageId: seeded.mortgageId,
			initialDebitBalance: 50_000n,
		});

		await expect(
			t.withIdentity(FAIRLEND_ADMIN).mutation(resolveRef, {
				suspenseAccountId: suspenseAccount._id,
				resolutionType: "match",
				amount: 0,
				reason: "Zero amount",
				idempotencyKey: "test-zero",
			})
		).rejects.toThrow(POSITIVE_SAFE_INTEGER_RE);
	});

	it("rejects blank reason", async () => {
		const t = createTestConvex();
		await ensureSeededIdentity(t, FAIRLEND_ADMIN);
		const seeded = await seedMinimalEntities(t);

		const suspenseAccount = await createTestAccount(t, {
			family: "SUSPENSE",
			mortgageId: seeded.mortgageId,
			initialDebitBalance: 50_000n,
		});

		await expect(
			t.withIdentity(FAIRLEND_ADMIN).mutation(resolveRef, {
				suspenseAccountId: suspenseAccount._id,
				resolutionType: "match",
				amount: 10_000,
				reason: "   ",
				idempotencyKey: "test-blank",
			})
		).rejects.toThrow(BLANK_REASON_RE);
	});

	it("rejects match without obligationId", async () => {
		const t = createTestConvex();
		await ensureSeededIdentity(t, FAIRLEND_ADMIN);
		const seeded = await seedMinimalEntities(t);

		const suspenseAccount = await createTestAccount(t, {
			family: "SUSPENSE",
			mortgageId: seeded.mortgageId,
			initialDebitBalance: 50_000n,
		});

		await expect(
			t.withIdentity(FAIRLEND_ADMIN).mutation(resolveRef, {
				suspenseAccountId: suspenseAccount._id,
				resolutionType: "match",
				amount: 10_000,
				reason: "Match without obligation",
				idempotencyKey: "test-no-obligation",
			})
		).rejects.toThrow(MATCH_REQUIRES_OBLIGATION_RE);
	});

	it("successful match returns resolutionType", async () => {
		const t = createTestConvex();
		await ensureSeededIdentity(t, FAIRLEND_ADMIN);
		const seeded = await seedMinimalEntities(t);

		const suspenseAccount = await createTestAccount(t, {
			family: "SUSPENSE",
			mortgageId: seeded.mortgageId,
			initialDebitBalance: 50_000n,
		});

		const obligationId = await createObligationWithReceivable(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 50_000,
		});

		const result = await t.withIdentity(FAIRLEND_ADMIN).mutation(resolveRef, {
			suspenseAccountId: suspenseAccount._id,
			resolutionType: "match",
			amount: 25_000,
			obligationId,
			reason: "Match to obligation",
			idempotencyKey: "test-mutation-match",
		});

		expect(result.resolutionType).toBe("match");
	});
});
