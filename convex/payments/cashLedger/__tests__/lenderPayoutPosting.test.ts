import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import type { Id } from "../../../_generated/dataModel";
import type { MutationCtx } from "../../../_generated/server";
import { getCashAccountBalance } from "../accounts";
import { postLenderPayout } from "../mutations";
import {
	createHarness,
	createTestAccount,
	SYSTEM_SOURCE,
	seedMinimalEntities,
} from "./testUtils";

const modules = import.meta.glob("/convex/**/*.ts");

const NEGATIVE_RE = /negative/i;
const TRUST_CASH_NEGATIVE_RE = /TRUST_CASH.*negative/i;

// Type for accessing the internal handler
interface PostLenderPayoutHandler {
	_handler: (
		ctx: MutationCtx,
		args: {
			mortgageId: Id<"mortgages">;
			lenderId: Id<"lenders">;
			amount: number;
			effectiveDate: string;
			idempotencyKey: string;
			source: typeof SYSTEM_SOURCE;
			reason?: string;
			postingGroupId?: string;
		}
	) => Promise<unknown>;
}

const postLenderPayoutMutation =
	postLenderPayout as unknown as PostLenderPayoutHandler;

describe("lender payout posting", () => {
	// AC-1: LENDER_PAYOUT_SENT reduces LENDER_PAYABLE and TRUST_CASH
	it("AC-1: LENDER_PAYOUT_SENT reduces LENDER_PAYABLE and TRUST_CASH", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);

		// LENDER_PAYABLE is credit-normal: balance = credits - debits
		await createTestAccount(t, {
			family: "LENDER_PAYABLE",
			mortgageId: seeded.mortgageId,
			lenderId: seeded.lenderAId,
			initialCreditBalance: 100_000n,
		});

		// TRUST_CASH is debit-normal: balance = debits - credits
		await createTestAccount(t, {
			family: "TRUST_CASH",
			mortgageId: seeded.mortgageId,
			initialDebitBalance: 100_000n,
		});

		// Post payout of 60,000
		await t.run(async (ctx) => {
			await postLenderPayoutMutation._handler(ctx, {
				mortgageId: seeded.mortgageId,
				lenderId: seeded.lenderAId,
				amount: 60_000,
				effectiveDate: "2026-03-15",
				idempotencyKey: "cash-ledger:lender-payout-sent:payout-ac1:lender-a",
				source: SYSTEM_SOURCE,
			});
		});

		// Assert balances
		await t.run(async (ctx) => {
			const payableAccounts = await ctx.db
				.query("cash_ledger_accounts")
				.withIndex("by_family_and_mortgage_and_lender", (q) =>
					q
						.eq("family", "LENDER_PAYABLE")
						.eq("mortgageId", seeded.mortgageId)
						.eq("lenderId", seeded.lenderAId)
				)
				.collect();
			expect(payableAccounts).toHaveLength(1);
			expect(getCashAccountBalance(payableAccounts[0])).toBe(40_000n);

			const trustAccounts = await ctx.db
				.query("cash_ledger_accounts")
				.withIndex("by_family_and_mortgage", (q) =>
					q.eq("family", "TRUST_CASH").eq("mortgageId", seeded.mortgageId)
				)
				.collect();
			expect(trustAccounts).toHaveLength(1);
			expect(getCashAccountBalance(trustAccounts[0])).toBe(40_000n);

			// Assert journal entry has correct entryType
			const entries = await ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_idempotency", (q) =>
					q.eq(
						"idempotencyKey",
						"cash-ledger:lender-payout-sent:payout-ac1:lender-a"
					)
				)
				.collect();
			expect(entries).toHaveLength(1);
			expect(entries[0].entryType).toBe("LENDER_PAYOUT_SENT");
		});
	});

	// AC-2: Payout exceeding payable is rejected with explicit error
	it("AC-2: payout exceeding payable is rejected with explicit error", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);

		await createTestAccount(t, {
			family: "LENDER_PAYABLE",
			mortgageId: seeded.mortgageId,
			lenderId: seeded.lenderAId,
			initialCreditBalance: 50_000n,
		});

		await createTestAccount(t, {
			family: "TRUST_CASH",
			mortgageId: seeded.mortgageId,
			initialDebitBalance: 100_000n,
		});

		const idempotencyKey =
			"cash-ledger:lender-payout-sent:payout-ac2-over:lender-a";

		await t.run(async (ctx) => {
			// Attempt payout of 75,000 which exceeds 50,000 payable
			try {
				await postLenderPayoutMutation._handler(ctx, {
					mortgageId: seeded.mortgageId,
					lenderId: seeded.lenderAId,
					amount: 75_000,
					effectiveDate: "2026-03-15",
					idempotencyKey,
					source: SYSTEM_SOURCE,
				});
				expect.fail("Should have thrown");
			} catch (e) {
				expect(e).toBeInstanceOf(ConvexError);
				const msg = (e as ConvexError<string>).data;
				expect(msg).toMatch(NEGATIVE_RE);
				expect(msg).toContain("attempted: 75000 cents");
				expect(msg).toContain("current balance: 50000 cents");
			}

			// Assert no journal entry was created
			const entries = await ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_idempotency", (q) =>
					q.eq("idempotencyKey", idempotencyKey)
				)
				.collect();
			expect(entries).toHaveLength(0);
		});
	});

	// AC-3: Partial payouts leave correct remaining balance
	it("AC-3: partial payouts leave correct remaining balance", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);

		await createTestAccount(t, {
			family: "LENDER_PAYABLE",
			mortgageId: seeded.mortgageId,
			lenderId: seeded.lenderAId,
			initialCreditBalance: 100_000n,
		});

		await createTestAccount(t, {
			family: "TRUST_CASH",
			mortgageId: seeded.mortgageId,
			initialDebitBalance: 100_000n,
		});

		const firstKey = "cash-ledger:lender-payout-sent:payout-ac3-first:lender-a";
		const secondKey =
			"cash-ledger:lender-payout-sent:payout-ac3-second:lender-a";

		// First payout of 30,000
		await t.run(async (ctx) => {
			await postLenderPayoutMutation._handler(ctx, {
				mortgageId: seeded.mortgageId,
				lenderId: seeded.lenderAId,
				amount: 30_000,
				effectiveDate: "2026-03-15",
				idempotencyKey: firstKey,
				source: SYSTEM_SOURCE,
			});
		});

		// Second payout of 25,000
		await t.run(async (ctx) => {
			await postLenderPayoutMutation._handler(ctx, {
				mortgageId: seeded.mortgageId,
				lenderId: seeded.lenderAId,
				amount: 25_000,
				effectiveDate: "2026-03-16",
				idempotencyKey: secondKey,
				source: SYSTEM_SOURCE,
			});
		});

		// Assert: LENDER_PAYABLE balance = 100,000 - 30,000 - 25,000 = 45,000
		await t.run(async (ctx) => {
			const payableAccounts = await ctx.db
				.query("cash_ledger_accounts")
				.withIndex("by_family_and_mortgage_and_lender", (q) =>
					q
						.eq("family", "LENDER_PAYABLE")
						.eq("mortgageId", seeded.mortgageId)
						.eq("lenderId", seeded.lenderAId)
				)
				.collect();
			expect(getCashAccountBalance(payableAccounts[0])).toBe(45_000n);

			// Assert two journal entries exist
			const firstEntry = await ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_idempotency", (q) => q.eq("idempotencyKey", firstKey))
				.collect();
			const secondEntry = await ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_idempotency", (q) => q.eq("idempotencyKey", secondKey))
				.collect();
			expect(firstEntry).toHaveLength(1);
			expect(secondEntry).toHaveLength(1);
		});
	});

	// AC-4: LENDER_PAYABLE balance never goes negative
	it("AC-4: LENDER_PAYABLE balance never goes negative", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);

		await createTestAccount(t, {
			family: "LENDER_PAYABLE",
			mortgageId: seeded.mortgageId,
			lenderId: seeded.lenderAId,
			initialCreditBalance: 10_000n,
		});

		await createTestAccount(t, {
			family: "TRUST_CASH",
			mortgageId: seeded.mortgageId,
			initialDebitBalance: 20_000n,
		});

		// Exact payout of 10,000 should succeed (balance becomes 0)
		await t.run(async (ctx) => {
			await postLenderPayoutMutation._handler(ctx, {
				mortgageId: seeded.mortgageId,
				lenderId: seeded.lenderAId,
				amount: 10_000,
				effectiveDate: "2026-03-15",
				idempotencyKey:
					"cash-ledger:lender-payout-sent:payout-ac4-exact:lender-a",
				source: SYSTEM_SOURCE,
			});
		});

		// Verify balance is 0
		await t.run(async (ctx) => {
			const payableAccounts = await ctx.db
				.query("cash_ledger_accounts")
				.withIndex("by_family_and_mortgage_and_lender", (q) =>
					q
						.eq("family", "LENDER_PAYABLE")
						.eq("mortgageId", seeded.mortgageId)
						.eq("lenderId", seeded.lenderAId)
				)
				.collect();
			expect(getCashAccountBalance(payableAccounts[0])).toBe(0n);
		});

		// Attempt another payout of 1 should be rejected (balance = 0)
		await t.run(async (ctx) => {
			await expect(
				postLenderPayoutMutation._handler(ctx, {
					mortgageId: seeded.mortgageId,
					lenderId: seeded.lenderAId,
					amount: 1,
					effectiveDate: "2026-03-16",
					idempotencyKey:
						"cash-ledger:lender-payout-sent:payout-ac4-over:lender-a",
					source: SYSTEM_SOURCE,
				})
			).rejects.toThrow(NEGATIVE_RE);
		});
	});

	// AC-5: Idempotent on payoutId + lenderId
	it("AC-5: idempotent on payoutId + lenderId", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);

		await createTestAccount(t, {
			family: "LENDER_PAYABLE",
			mortgageId: seeded.mortgageId,
			lenderId: seeded.lenderAId,
			initialCreditBalance: 100_000n,
		});

		await createTestAccount(t, {
			family: "TRUST_CASH",
			mortgageId: seeded.mortgageId,
			initialDebitBalance: 100_000n,
		});

		const idempotencyKey =
			"cash-ledger:lender-payout-sent:payout-ac5-idempotent:lender-a";

		// First post
		await t.run(async (ctx) => {
			await postLenderPayoutMutation._handler(ctx, {
				mortgageId: seeded.mortgageId,
				lenderId: seeded.lenderAId,
				amount: 25_000,
				effectiveDate: "2026-03-15",
				idempotencyKey,
				source: SYSTEM_SOURCE,
			});
		});

		// Second post with same key should NOT throw (returns existing as replay)
		await t.run(async (ctx) => {
			await postLenderPayoutMutation._handler(ctx, {
				mortgageId: seeded.mortgageId,
				lenderId: seeded.lenderAId,
				amount: 25_000,
				effectiveDate: "2026-03-15",
				idempotencyKey,
				source: SYSTEM_SOURCE,
			});
		});

		// Assert only one journal entry exists and balance was not double-applied
		await t.run(async (ctx) => {
			const entries = await ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_idempotency", (q) =>
					q.eq("idempotencyKey", idempotencyKey)
				)
				.collect();
			expect(entries).toHaveLength(1);

			// Balance should be 100,000 - 25,000 = 75,000 (not 50,000 from double-apply)
			const payableAccounts = await ctx.db
				.query("cash_ledger_accounts")
				.withIndex("by_family_and_mortgage_and_lender", (q) =>
					q
						.eq("family", "LENDER_PAYABLE")
						.eq("mortgageId", seeded.mortgageId)
						.eq("lenderId", seeded.lenderAId)
				)
				.collect();
			expect(getCashAccountBalance(payableAccounts[0])).toBe(75_000n);
		});
	});

	// DR-3: Batch payout with shared postingGroupId
	it("DR-3: batch payout with shared postingGroupId", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);

		// Create payable accounts for two lenders
		await createTestAccount(t, {
			family: "LENDER_PAYABLE",
			mortgageId: seeded.mortgageId,
			lenderId: seeded.lenderAId,
			initialCreditBalance: 50_000n,
		});

		await createTestAccount(t, {
			family: "LENDER_PAYABLE",
			mortgageId: seeded.mortgageId,
			lenderId: seeded.lenderBId,
			initialCreditBalance: 50_000n,
		});

		await createTestAccount(t, {
			family: "TRUST_CASH",
			mortgageId: seeded.mortgageId,
			initialDebitBalance: 100_000n,
		});

		const sharedPostingGroupId = "payout-batch:dr3-test";

		// Post payouts for both lenders with shared postingGroupId
		await t.run(async (ctx) => {
			await postLenderPayoutMutation._handler(ctx, {
				mortgageId: seeded.mortgageId,
				lenderId: seeded.lenderAId,
				amount: 20_000,
				effectiveDate: "2026-03-15",
				idempotencyKey: "cash-ledger:lender-payout-sent:payout-dr3:lender-a",
				source: SYSTEM_SOURCE,
				postingGroupId: sharedPostingGroupId,
			});

			await postLenderPayoutMutation._handler(ctx, {
				mortgageId: seeded.mortgageId,
				lenderId: seeded.lenderBId,
				amount: 15_000,
				effectiveDate: "2026-03-15",
				idempotencyKey: "cash-ledger:lender-payout-sent:payout-dr3:lender-b",
				source: SYSTEM_SOURCE,
				postingGroupId: sharedPostingGroupId,
			});
		});

		// Assert both journal entries share the same postingGroupId
		await t.run(async (ctx) => {
			const entries = await ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_posting_group", (q) =>
					q.eq("postingGroupId", sharedPostingGroupId)
				)
				.collect();

			expect(entries).toHaveLength(2);
			expect(entries[0].postingGroupId).toBe(sharedPostingGroupId);
			expect(entries[1].postingGroupId).toBe(sharedPostingGroupId);
		});
	});

	// DR-5: TRUST_CASH insufficient rejects payout even when LENDER_PAYABLE is sufficient
	it("DR-5: TRUST_CASH insufficient rejects payout", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);

		// LENDER_PAYABLE has plenty of balance
		await createTestAccount(t, {
			family: "LENDER_PAYABLE",
			mortgageId: seeded.mortgageId,
			lenderId: seeded.lenderAId,
			initialCreditBalance: 100_000n,
		});

		// TRUST_CASH only has 30,000 — insufficient for an 80,000 payout
		await createTestAccount(t, {
			family: "TRUST_CASH",
			mortgageId: seeded.mortgageId,
			initialDebitBalance: 30_000n,
		});

		await t.run(async (ctx) => {
			await expect(
				postLenderPayoutMutation._handler(ctx, {
					mortgageId: seeded.mortgageId,
					lenderId: seeded.lenderAId,
					amount: 80_000,
					effectiveDate: "2026-03-15",
					idempotencyKey: "cash-ledger:lender-payout-sent:payout-dr5:lender-a",
					source: SYSTEM_SOURCE,
				})
			).rejects.toThrow(TRUST_CASH_NEGATIVE_RE);
		});
	});

	// DR-4: Unknown lender rejection
	it("DR-4: unknown lender rejection", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);

		// Create TRUST_CASH for the mortgage but do NOT create LENDER_PAYABLE
		// for lenderBId — lenderBId exists as a seeded entity but has no payable account
		await createTestAccount(t, {
			family: "TRUST_CASH",
			mortgageId: seeded.mortgageId,
			initialDebitBalance: 50_000n,
		});

		await t.run(async (ctx) => {
			try {
				await postLenderPayoutMutation._handler(ctx, {
					mortgageId: seeded.mortgageId,
					lenderId: seeded.lenderBId,
					amount: 10_000,
					effectiveDate: "2026-03-15",
					idempotencyKey: "cash-ledger:lender-payout-sent:payout-dr4:lender-b",
					source: SYSTEM_SOURCE,
				});
				expect.fail("Should have thrown");
			} catch (e) {
				expect(e).toBeInstanceOf(ConvexError);
				const msg = (e as ConvexError<string>).data;
				expect(msg).toContain("cash account not found");
			}
		});
	});
});
