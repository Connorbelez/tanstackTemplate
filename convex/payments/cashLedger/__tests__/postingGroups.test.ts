import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import {
	createHarness,
	createSettledObligation,
	SYSTEM_SOURCE,
	seedMinimalEntities,
} from "../../../../src/test/convex/payments/cashLedger/testUtils";
import { convexModules } from "../../../test/moduleMaps";
import { getOrCreateCashAccount } from "../accounts";
import { postCashEntryInternal } from "../postEntry";
import {
	getPostingGroupSummary,
	isPostingGroupComplete,
	validatePostingGroupAmounts,
} from "../postingGroups";
import { buildIdempotencyKey } from "../types";

const modules = convexModules;

// ── T-007: Unit tests for postingGroups.ts ──────────────────────────

describe("validatePostingGroupAmounts", () => {
	it("valid sum passes silently", () => {
		expect(() =>
			validatePostingGroupAmounts(100_000, [60_000, 39_167], 833)
		).not.toThrow();
	});

	it("mismatched sum throws POSTING_GROUP_SUM_MISMATCH", () => {
		try {
			validatePostingGroupAmounts(100_000, [60_000, 30_000], 833);
			throw new Error("Expected ConvexError");
		} catch (error) {
			expect(error).toBeInstanceOf(ConvexError);
			const convexErr = error as ConvexError<{ code: string }>;
			expect(convexErr.data.code).toBe("POSTING_GROUP_SUM_MISMATCH");
		}
	});

	it("zero servicing fee is valid", () => {
		expect(() =>
			validatePostingGroupAmounts(50_000, [30_000, 20_000], 0)
		).not.toThrow();
	});
});

describe("getPostingGroupSummary", () => {
	it("returns correct structure with entry count and CONTROL balance", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);
		const obligationId = await createSettledObligation(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 100_000,
		});

		const postingGroupId = `allocation:${obligationId}`;

		// Post a single LENDER_PAYABLE_CREATED entry
		await t.run(async (ctx) => {
			const controlAccount = await getOrCreateCashAccount(ctx, {
				family: "CONTROL",
				mortgageId: seeded.mortgageId,
				obligationId,
				subaccount: "ALLOCATION",
			});
			const payableAccount = await getOrCreateCashAccount(ctx, {
				family: "LENDER_PAYABLE",
				mortgageId: seeded.mortgageId,
				lenderId: seeded.lenderAId,
			});

			await postCashEntryInternal(ctx, {
				entryType: "LENDER_PAYABLE_CREATED",
				effectiveDate: "2026-03-01",
				amount: 60_000,
				debitAccountId: controlAccount._id,
				creditAccountId: payableAccount._id,
				idempotencyKey: buildIdempotencyKey("lender-payable", "test-summary"),
				mortgageId: seeded.mortgageId,
				obligationId,
				lenderId: seeded.lenderAId,
				postingGroupId,
				source: SYSTEM_SOURCE,
			});
		});

		await t.run(async (ctx) => {
			const summary = await getPostingGroupSummary(ctx, postingGroupId);

			expect(summary.postingGroupId).toBe(postingGroupId);
			expect(summary.totalJournalEntryCount).toBe(1);
			expect(summary.controlAllocationBalance).toBe(60_000n);
			expect(summary.entries).toHaveLength(1);
			expect(summary.entries[0].entryType).toBe("LENDER_PAYABLE_CREATED");
			expect(summary.entries[0].amount).toBe(60_000n);
			expect(summary.entries[0].side).toBe("debit");
		});
	});

	it("complete group has zero CONTROL:ALLOCATION balance", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);
		const obligationId = await createSettledObligation(t, {
			mortgageId: seeded.mortgageId,
			borrowerId: seeded.borrowerId,
			amount: 100_000,
		});

		const postingGroupId = `allocation:${obligationId}`;

		// A complete posting group has net-zero CONTROL:ALLOCATION balance.
		// This requires both credit-side and debit-side entries touching
		// CONTROL:ALLOCATION within the same posting group. We simulate:
		//   1. CASH_APPLIED crediting CONTROL:ALLOCATION (money in: 100_000)
		//   2. LENDER_PAYABLE_CREATED debiting CONTROL:ALLOCATION (money out: 60_000 + 40_000)
		await t.run(async (ctx) => {
			const controlAccount = await getOrCreateCashAccount(ctx, {
				family: "CONTROL",
				mortgageId: seeded.mortgageId,
				obligationId,
				subaccount: "ALLOCATION",
			});
			// UNAPPLIED_CASH is credit-normal; seed with credits so it has a positive balance
			const unappliedAccountRaw = await getOrCreateCashAccount(ctx, {
				family: "UNAPPLIED_CASH",
				mortgageId: seeded.mortgageId,
			});
			await ctx.db.patch(unappliedAccountRaw._id, {
				cumulativeCredits: 100_000n,
			});
			const unappliedAccount = await ctx.db.get(unappliedAccountRaw._id);
			if (!unappliedAccount) {
				throw new Error("unreachable");
			}
			const payableAccountA = await getOrCreateCashAccount(ctx, {
				family: "LENDER_PAYABLE",
				mortgageId: seeded.mortgageId,
				lenderId: seeded.lenderAId,
			});
			const payableAccountB = await getOrCreateCashAccount(ctx, {
				family: "LENDER_PAYABLE",
				mortgageId: seeded.mortgageId,
				lenderId: seeded.lenderBId,
			});

			// Credit CONTROL:ALLOCATION via CASH_APPLIED (seeding 100_000 into allocation)
			await postCashEntryInternal(ctx, {
				entryType: "CASH_APPLIED",
				effectiveDate: "2026-03-01",
				amount: 100_000,
				debitAccountId: unappliedAccount._id,
				creditAccountId: controlAccount._id,
				idempotencyKey: buildIdempotencyKey(
					"cash-applied",
					"test-complete-seed"
				),
				mortgageId: seeded.mortgageId,
				obligationId,
				postingGroupId,
				source: SYSTEM_SOURCE,
			});

			// Debit CONTROL:ALLOCATION via LENDER_PAYABLE_CREATED (60_000 out)
			await postCashEntryInternal(ctx, {
				entryType: "LENDER_PAYABLE_CREATED",
				effectiveDate: "2026-03-01",
				amount: 60_000,
				debitAccountId: controlAccount._id,
				creditAccountId: payableAccountA._id,
				idempotencyKey: buildIdempotencyKey(
					"lender-payable",
					"test-complete-a"
				),
				mortgageId: seeded.mortgageId,
				obligationId,
				lenderId: seeded.lenderAId,
				postingGroupId,
				source: SYSTEM_SOURCE,
			});

			// Debit CONTROL:ALLOCATION via LENDER_PAYABLE_CREATED (40_000 out)
			await postCashEntryInternal(ctx, {
				entryType: "LENDER_PAYABLE_CREATED",
				effectiveDate: "2026-03-01",
				amount: 40_000,
				debitAccountId: controlAccount._id,
				creditAccountId: payableAccountB._id,
				idempotencyKey: buildIdempotencyKey(
					"lender-payable",
					"test-complete-b"
				),
				mortgageId: seeded.mortgageId,
				obligationId,
				lenderId: seeded.lenderBId,
				postingGroupId,
				source: SYSTEM_SOURCE,
			});
		});

		await t.run(async (ctx) => {
			const summary = await getPostingGroupSummary(ctx, postingGroupId);
			// credit 100_000 - debit 60_000 - debit 40_000 = net 0
			expect(isPostingGroupComplete(summary)).toBe(true);
			expect(summary.controlAllocationBalance).toBe(0n);
			expect(summary.totalJournalEntryCount).toBe(3);
		});
	});
});

describe("isPostingGroupComplete", () => {
	it("true when net-zero and entries > 0", () => {
		const result = isPostingGroupComplete({
			postingGroupId: "test:123",
			controlAllocationBalance: 0n,
			totalJournalEntryCount: 3,
			hasCorruptEntries: false,
			entries: [],
		});
		expect(result).toBe(true);
	});

	it("false when non-zero balance", () => {
		const result = isPostingGroupComplete({
			postingGroupId: "test:123",
			controlAllocationBalance: 500n,
			totalJournalEntryCount: 2,
			hasCorruptEntries: false,
			entries: [],
		});
		expect(result).toBe(false);
	});

	it("false when zero entries", () => {
		const result = isPostingGroupComplete({
			postingGroupId: "test:123",
			controlAllocationBalance: 0n,
			totalJournalEntryCount: 0,
			hasCorruptEntries: false,
			entries: [],
		});
		expect(result).toBe(false);
	});
});
