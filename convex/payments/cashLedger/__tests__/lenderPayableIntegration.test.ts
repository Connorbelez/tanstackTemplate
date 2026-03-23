import { describe, expect, it } from "vitest";
import type { Id } from "../../../_generated/dataModel";
import type { MutationCtx } from "../../../_generated/server";
import { createDispersalEntries } from "../../../dispersal/createDispersalEntries";
import { getCashAccountBalance } from "../accounts";
import {
	createHarness,
	SYSTEM_SOURCE,
	seedMinimalEntities,
	type TestHarness,
} from "./testUtils";

interface CreateDispersalEntriesHandler {
	_handler: (
		ctx: MutationCtx,
		args: {
			obligationId: Id<"obligations">;
			mortgageId: Id<"mortgages">;
			settledAmount: number;
			settledDate: string;
			idempotencyKey: string;
			source: typeof SYSTEM_SOURCE;
		}
	) => Promise<{
		created: boolean;
		entries: Array<{
			id: Id<"dispersalEntries">;
			lenderId: Id<"lenders">;
			lenderAccountId: Id<"ledger_accounts">;
			amount: number;
			rawAmount: number;
			units: number;
		}>;
		servicingFeeEntryId: Id<"servicingFeeEntries"> | null;
	}>;
}

const createDispersalEntriesMutation =
	createDispersalEntries as unknown as CreateDispersalEntriesHandler;

const IDEMPOTENCY_KEY_PREFIX = /^cash-ledger:/;

async function createSettledObligation(
	t: TestHarness,
	args: {
		mortgageId: Id<"mortgages">;
		borrowerId: Id<"borrowers">;
		amount: number;
	}
) {
	return t.run(async (ctx) => {
		const obligationId = await ctx.db.insert("obligations", {
			status: "settled",
			machineContext: {},
			lastTransitionAt: Date.now(),
			mortgageId: args.mortgageId,
			borrowerId: args.borrowerId,
			paymentNumber: 1,
			type: "regular_interest",
			amount: args.amount,
			amountSettled: args.amount,
			dueDate: Date.parse("2026-03-01T00:00:00Z"),
			gracePeriodEnd: Date.parse("2026-03-16T00:00:00Z"),
			settledAt: Date.parse("2026-03-01T00:00:00Z"),
			createdAt: Date.now(),
		});

		// Pre-create BORROWER_RECEIVABLE with balanced debits/credits (fully settled)
		await ctx.db.insert("cash_ledger_accounts", {
			family: "BORROWER_RECEIVABLE",
			mortgageId: args.mortgageId,
			obligationId,
			borrowerId: args.borrowerId,
			cumulativeDebits: BigInt(args.amount),
			cumulativeCredits: BigInt(args.amount),
			createdAt: Date.now(),
		});

		// Pre-create CONTROL:ALLOCATION for the dispersal
		await ctx.db.insert("cash_ledger_accounts", {
			family: "CONTROL",
			mortgageId: args.mortgageId,
			obligationId,
			subaccount: "ALLOCATION",
			cumulativeDebits: 0n,
			cumulativeCredits: 0n,
			createdAt: Date.now(),
		});

		return obligationId;
	});
}

describe("lender payable integration — postSettlementAllocation E2E", () => {
	it("creates LENDER_PAYABLE_CREATED entries for multiple lenders via dispersal engine", async () => {
		const t = createHarness();
		const seeded = await seedMinimalEntities(t);
		const obligationId = await createSettledObligation(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 100_000,
		});

		await t.run(async (ctx) => {
			const result = await createDispersalEntriesMutation._handler(ctx, {
				obligationId,
				mortgageId: seeded.mortgageId,
				settledAmount: 100_000,
				settledDate: "2026-03-01",
				idempotencyKey: "lpi-dispersal",
				source: SYSTEM_SOURCE,
			});

			expect(result.created).toBe(true);
			expect(result.entries).toHaveLength(2);

			// Verify lender payable accounts exist per lender
			const payableAccounts = await ctx.db
				.query("cash_ledger_accounts")
				.withIndex("by_family_and_mortgage", (q) =>
					q.eq("family", "LENDER_PAYABLE").eq("mortgageId", seeded.mortgageId)
				)
				.collect();
			expect(payableAccounts).toHaveLength(2);

			// Verify per-lender balances match 60/40 ownership split
			const lenderAPayable = payableAccounts.find(
				(a) => a.lenderId === seeded.lenderAId
			);
			const lenderBPayable = payableAccounts.find(
				(a) => a.lenderId === seeded.lenderBId
			);
			if (!(lenderAPayable && lenderBPayable)) {
				throw new Error("Expected payable accounts for both lenders");
			}

			const balanceA = getCashAccountBalance(lenderAPayable);
			const balanceB = getCashAccountBalance(lenderBPayable);

			// Verify the 60/40 proportional split of the total payable balance.
			// The pro-rata engine uses largest-remainder rounding, so the split
			// may differ from the exact fraction by at most 1 cent per lender.
			const total = balanceA + balanceB;
			expect(total).toBeGreaterThan(0n);

			const diffA =
				balanceA * 10n - total * 6n < 0n
					? -(balanceA * 10n - total * 6n)
					: balanceA * 10n - total * 6n;
			const diffB =
				balanceB * 10n - total * 4n < 0n
					? -(balanceB * 10n - total * 4n)
					: balanceB * 10n - total * 4n;
			// Each diff is scaled by 10, so a 1-cent rounding error becomes <= 10
			expect(diffA).toBeLessThanOrEqual(10n);
			expect(diffB).toBeLessThanOrEqual(10n);
		});
	});

	it("all entries share the same postingGroupId", async () => {
		const t = createHarness();
		const seeded = await seedMinimalEntities(t);
		const obligationId = await createSettledObligation(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 100_000,
		});

		await t.run(async (ctx) => {
			await createDispersalEntriesMutation._handler(ctx, {
				obligationId,
				mortgageId: seeded.mortgageId,
				settledAmount: 100_000,
				settledDate: "2026-03-01",
				idempotencyKey: "lpi-posting-group",
				source: SYSTEM_SOURCE,
			});

			const expectedGroupId = `allocation:${obligationId}`;
			const entries = await ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_posting_group", (q) =>
					q.eq("postingGroupId", expectedGroupId)
				)
				.collect();

			// Should have 2 LENDER_PAYABLE_CREATED + 1 SERVICING_FEE_RECOGNIZED = 3
			expect(entries).toHaveLength(3);
			expect(entries.every((e) => e.postingGroupId === expectedGroupId)).toBe(
				true
			);

			const entryTypes = entries.map((e) => e.entryType);
			expect(
				entryTypes.filter((t) => t === "LENDER_PAYABLE_CREATED")
			).toHaveLength(2);
			expect(entryTypes).toContain("SERVICING_FEE_RECOGNIZED");
		});
	});

	it("each entry has a unique idempotencyKey", async () => {
		const t = createHarness();
		const seeded = await seedMinimalEntities(t);
		const obligationId = await createSettledObligation(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 100_000,
		});

		await t.run(async (ctx) => {
			await createDispersalEntriesMutation._handler(ctx, {
				obligationId,
				mortgageId: seeded.mortgageId,
				settledAmount: 100_000,
				settledDate: "2026-03-01",
				idempotencyKey: "lpi-idempotency",
				source: SYSTEM_SOURCE,
			});

			const entries = await ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_posting_group", (q) =>
					q.eq("postingGroupId", `allocation:${obligationId}`)
				)
				.collect();

			const keys = entries.map((e) => e.idempotencyKey);
			const uniqueKeys = new Set(keys);
			expect(uniqueKeys.size).toBe(keys.length);

			// Verify key format follows convention
			for (const key of keys) {
				expect(key).toMatch(IDEMPOTENCY_KEY_PREFIX);
			}
		});
	});

	it("sum of lender payables + servicing fee = settlement amount", async () => {
		const t = createHarness();
		const seeded = await seedMinimalEntities(t);
		const settledAmount = 100_000;
		const obligationId = await createSettledObligation(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: settledAmount,
		});

		await t.run(async (ctx) => {
			await createDispersalEntriesMutation._handler(ctx, {
				obligationId,
				mortgageId: seeded.mortgageId,
				settledAmount,
				settledDate: "2026-03-01",
				idempotencyKey: "lpi-sum-trace",
				source: SYSTEM_SOURCE,
			});

			const entries = await ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_posting_group", (q) =>
					q.eq("postingGroupId", `allocation:${obligationId}`)
				)
				.collect();

			const lenderPayableSum = entries
				.filter((e) => e.entryType === "LENDER_PAYABLE_CREATED")
				.reduce((sum, e) => sum + e.amount, 0n);

			const feeSum = entries
				.filter((e) => e.entryType === "SERVICING_FEE_RECOGNIZED")
				.reduce((sum, e) => sum + e.amount, 0n);

			// Lender payables + servicing fee = settlement amount
			expect(lenderPayableSum + feeSum).toBe(BigInt(settledAmount));
		});
	});

	it("each entry carries full traceability fields (REQ-241)", async () => {
		const t = createHarness();
		const seeded = await seedMinimalEntities(t);
		const obligationId = await createSettledObligation(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 100_000,
		});

		await t.run(async (ctx) => {
			await createDispersalEntriesMutation._handler(ctx, {
				obligationId,
				mortgageId: seeded.mortgageId,
				settledAmount: 100_000,
				settledDate: "2026-03-01",
				idempotencyKey: "lpi-traceability",
				source: SYSTEM_SOURCE,
			});

			const entries = await ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_posting_group", (q) =>
					q.eq("postingGroupId", `allocation:${obligationId}`)
				)
				.collect();

			const payableEntries = entries.filter(
				(e) => e.entryType === "LENDER_PAYABLE_CREATED"
			);

			for (const entry of payableEntries) {
				expect(entry.mortgageId).toBe(seeded.mortgageId);
				expect(entry.obligationId).toBe(obligationId);
				expect(entry.dispersalEntryId).toBeDefined();
				expect(entry.lenderId).toBeDefined();
				expect(entry.borrowerId).toBeDefined();
				expect(entry.postingGroupId).toBe(`allocation:${obligationId}`);
			}

			// Servicing fee entry also carries traceability
			const feeEntries = entries.filter(
				(e) => e.entryType === "SERVICING_FEE_RECOGNIZED"
			);
			for (const entry of feeEntries) {
				expect(entry.mortgageId).toBe(seeded.mortgageId);
				expect(entry.obligationId).toBe(obligationId);
				expect(entry.borrowerId).toBeDefined();
			}
		});
	});

	it("idempotent replay produces no duplicate entries", async () => {
		const t = createHarness();
		const seeded = await seedMinimalEntities(t);
		const obligationId = await createSettledObligation(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 100_000,
		});

		await t.run(async (ctx) => {
			const firstResult = await createDispersalEntriesMutation._handler(ctx, {
				obligationId,
				mortgageId: seeded.mortgageId,
				settledAmount: 100_000,
				settledDate: "2026-03-01",
				idempotencyKey: "lpi-idempotent-replay",
				source: SYSTEM_SOURCE,
			});

			expect(firstResult.created).toBe(true);
			const firstEntries = await ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_posting_group", (q) =>
					q.eq("postingGroupId", `allocation:${obligationId}`)
				)
				.collect();
			const firstCount = firstEntries.length;

			// Replay the same dispersal
			const replayResult = await createDispersalEntriesMutation._handler(ctx, {
				obligationId,
				mortgageId: seeded.mortgageId,
				settledAmount: 100_000,
				settledDate: "2026-03-01",
				idempotencyKey: "lpi-idempotent-replay",
				source: SYSTEM_SOURCE,
			});

			expect(replayResult.created).toBe(false);

			// No new journal entries created
			const replayEntries = await ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_posting_group", (q) =>
					q.eq("postingGroupId", `allocation:${obligationId}`)
				)
				.collect();

			expect(replayEntries.length).toBe(firstCount);
		});
	});

	it("handles zero-fee allocation (non-interest obligation)", async () => {
		const t = createHarness();
		const seeded = await seedMinimalEntities(t);

		// Create a principal_repayment obligation (no servicing fee)
		const obligationId = await t.run(async (ctx) => {
			const id = await ctx.db.insert("obligations", {
				status: "settled",
				machineContext: {},
				lastTransitionAt: Date.now(),
				mortgageId: seeded.mortgageId,
				borrowerId: seeded.borrowerId,
				paymentNumber: 1,
				type: "principal_repayment",
				amount: 50_000,
				amountSettled: 50_000,
				dueDate: Date.parse("2026-03-01T00:00:00Z"),
				gracePeriodEnd: Date.parse("2026-03-16T00:00:00Z"),
				settledAt: Date.parse("2026-03-01T00:00:00Z"),
				createdAt: Date.now(),
			});

			await ctx.db.insert("cash_ledger_accounts", {
				family: "BORROWER_RECEIVABLE",
				mortgageId: seeded.mortgageId,
				obligationId: id,
				borrowerId: seeded.borrowerId,
				cumulativeDebits: 50_000n,
				cumulativeCredits: 50_000n,
				createdAt: Date.now(),
			});

			await ctx.db.insert("cash_ledger_accounts", {
				family: "CONTROL",
				mortgageId: seeded.mortgageId,
				obligationId: id,
				subaccount: "ALLOCATION",
				cumulativeDebits: 0n,
				cumulativeCredits: 0n,
				createdAt: Date.now(),
			});

			return id;
		});

		await t.run(async (ctx) => {
			const result = await createDispersalEntriesMutation._handler(ctx, {
				obligationId,
				mortgageId: seeded.mortgageId,
				settledAmount: 50_000,
				settledDate: "2026-03-01",
				idempotencyKey: "lpi-zero-fee",
				source: SYSTEM_SOURCE,
			});

			expect(result.created).toBe(true);

			const entries = await ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_posting_group", (q) =>
					q.eq("postingGroupId", `allocation:${obligationId}`)
				)
				.collect();

			// Only LENDER_PAYABLE_CREATED entries, no SERVICING_FEE_RECOGNIZED
			const feeEntries = entries.filter(
				(e) => e.entryType === "SERVICING_FEE_RECOGNIZED"
			);
			expect(feeEntries).toHaveLength(0);

			const payableEntries = entries.filter(
				(e) => e.entryType === "LENDER_PAYABLE_CREATED"
			);
			expect(payableEntries).toHaveLength(2);

			// Full settled amount goes to lender payables
			const payableSum = payableEntries.reduce((sum, e) => sum + e.amount, 0n);
			expect(payableSum).toBe(50_000n);
		});
	});
});
