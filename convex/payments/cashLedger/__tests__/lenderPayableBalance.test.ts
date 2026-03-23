import { describe, expect, it } from "vitest";
import type { Id } from "../../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../../_generated/server";
import { getCashAccountBalance } from "../accounts";
import { postLenderPayout } from "../mutations";
import { postCashEntryInternal } from "../postEntry";
import { internalGetLenderPayableBalance } from "../queries";
import {
	createHarness,
	createTestAccount,
	SYSTEM_SOURCE,
	seedMinimalEntities,
} from "./testUtils";

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
		}
	) => Promise<unknown>;
}

interface InternalGetLenderPayableBalanceHandler {
	_handler: (
		ctx: QueryCtx,
		args: { lenderId: Id<"lenders"> }
	) => Promise<number>;
}

const postLenderPayoutMutation =
	postLenderPayout as unknown as PostLenderPayoutHandler;

const internalGetLenderPayableBalanceQuery =
	internalGetLenderPayableBalance as unknown as InternalGetLenderPayableBalanceHandler;

describe("getLenderPayableBalance query", () => {
	it("returns 0n for a lender with no payable accounts", async () => {
		const t = createHarness();
		const seeded = await seedMinimalEntities(t);

		await t.run(async (ctx) => {
			// Call the actual query implementation
			const queryResult = await internalGetLenderPayableBalanceQuery._handler(
				ctx,
				{
					lenderId: seeded.lenderAId,
				}
			);
			expect(queryResult).toBe(0);

			// Direct account-level assertion as secondary check
			const accounts = await ctx.db
				.query("cash_ledger_accounts")
				.withIndex("by_lender", (q) => q.eq("lenderId", seeded.lenderAId))
				.collect();

			const total = accounts
				.filter((a) => a.family === "LENDER_PAYABLE")
				.reduce((sum, a) => sum + getCashAccountBalance(a), 0n);

			expect(total).toBe(0n);
		});
	});

	it("returns correct balance for a single mortgage payable", async () => {
		const t = createHarness();
		const seeded = await seedMinimalEntities(t);

		const controlAccount = await createTestAccount(t, {
			family: "CONTROL",
			mortgageId: seeded.mortgageId,
			subaccount: "ALLOCATION",
		});

		const payableAccount = await createTestAccount(t, {
			family: "LENDER_PAYABLE",
			mortgageId: seeded.mortgageId,
			lenderId: seeded.lenderAId,
		});

		await t.run(async (ctx) => {
			await postCashEntryInternal(ctx, {
				entryType: "LENDER_PAYABLE_CREATED",
				effectiveDate: "2026-03-01",
				amount: 55_000,
				debitAccountId: controlAccount._id,
				creditAccountId: payableAccount._id,
				idempotencyKey: "lpb-test-single-1",
				mortgageId: seeded.mortgageId,
				lenderId: seeded.lenderAId,
				postingGroupId: "allocation:test-1",
				source: SYSTEM_SOURCE,
			});

			// Call the actual query implementation
			const queryResult = await internalGetLenderPayableBalanceQuery._handler(
				ctx,
				{
					lenderId: seeded.lenderAId,
				}
			);
			expect(queryResult).toBe(55_000);

			// Direct account-level assertion as secondary check
			const accounts = await ctx.db
				.query("cash_ledger_accounts")
				.withIndex("by_lender", (q) => q.eq("lenderId", seeded.lenderAId))
				.collect();

			const total = accounts
				.filter((a) => a.family === "LENDER_PAYABLE")
				.reduce((sum, a) => sum + getCashAccountBalance(a), 0n);

			expect(total).toBe(55_000n);
		});
	});

	it("aggregates balances across multiple mortgages", async () => {
		const t = createHarness();
		const seeded = await seedMinimalEntities(t);

		// Create a second mortgage
		const mortgage2Id = await t.run(async (ctx) => {
			const existingMortgage = await ctx.db.get(seeded.mortgageId);
			if (!existingMortgage) {
				throw new Error("Seeded mortgage not found");
			}
			return ctx.db.insert("mortgages", {
				status: "active",
				propertyId: existingMortgage.propertyId,
				principal: 5_000_000,
				annualServicingRate: 0.01,
				interestRate: 0.06,
				rateType: "fixed",
				termMonths: 12,
				amortizationMonths: 12,
				paymentAmount: 50_000,
				paymentFrequency: "monthly",
				loanType: "conventional",
				lienPosition: 1,
				interestAdjustmentDate: "2026-01-01",
				termStartDate: "2026-01-01",
				maturityDate: "2026-12-01",
				firstPaymentDate: "2026-02-01",
				brokerOfRecordId: existingMortgage.brokerOfRecordId,
				createdAt: Date.now(),
			});
		});

		const control1 = await createTestAccount(t, {
			family: "CONTROL",
			mortgageId: seeded.mortgageId,
			subaccount: "ALLOCATION",
		});
		const payable1 = await createTestAccount(t, {
			family: "LENDER_PAYABLE",
			mortgageId: seeded.mortgageId,
			lenderId: seeded.lenderAId,
		});

		const control2 = await createTestAccount(t, {
			family: "CONTROL",
			mortgageId: mortgage2Id,
			subaccount: "ALLOCATION",
		});
		const payable2 = await createTestAccount(t, {
			family: "LENDER_PAYABLE",
			mortgageId: mortgage2Id,
			lenderId: seeded.lenderAId,
		});

		await t.run(async (ctx) => {
			await postCashEntryInternal(ctx, {
				entryType: "LENDER_PAYABLE_CREATED",
				effectiveDate: "2026-03-01",
				amount: 30_000,
				debitAccountId: control1._id,
				creditAccountId: payable1._id,
				idempotencyKey: "lpb-multi-mortgage-1",
				mortgageId: seeded.mortgageId,
				lenderId: seeded.lenderAId,
				postingGroupId: "allocation:multi-1",
				source: SYSTEM_SOURCE,
			});

			await postCashEntryInternal(ctx, {
				entryType: "LENDER_PAYABLE_CREATED",
				effectiveDate: "2026-03-01",
				amount: 20_000,
				debitAccountId: control2._id,
				creditAccountId: payable2._id,
				idempotencyKey: "lpb-multi-mortgage-2",
				mortgageId: mortgage2Id,
				lenderId: seeded.lenderAId,
				postingGroupId: "allocation:multi-2",
				source: SYSTEM_SOURCE,
			});

			// Call the actual query implementation
			const queryResult = await internalGetLenderPayableBalanceQuery._handler(
				ctx,
				{
					lenderId: seeded.lenderAId,
				}
			);
			expect(queryResult).toBe(50_000);

			// Direct account-level assertion as secondary check
			const accounts = await ctx.db
				.query("cash_ledger_accounts")
				.withIndex("by_lender", (q) => q.eq("lenderId", seeded.lenderAId))
				.collect();

			const total = accounts
				.filter((a) => a.family === "LENDER_PAYABLE")
				.reduce((sum, a) => sum + getCashAccountBalance(a), 0n);

			expect(total).toBe(50_000n);
		});
	});

	it("returns net balance after partial payout", async () => {
		const t = createHarness();
		const seeded = await seedMinimalEntities(t);

		const controlAccount = await createTestAccount(t, {
			family: "CONTROL",
			mortgageId: seeded.mortgageId,
			subaccount: "ALLOCATION",
		});
		const payableAccount = await createTestAccount(t, {
			family: "LENDER_PAYABLE",
			mortgageId: seeded.mortgageId,
			lenderId: seeded.lenderAId,
		});

		// Seed TRUST_CASH so payout has cash to draw from
		await createTestAccount(t, {
			family: "TRUST_CASH",
			mortgageId: seeded.mortgageId,
			initialDebitBalance: 100_000n,
		});

		await t.run(async (ctx) => {
			// Create payable
			await postCashEntryInternal(ctx, {
				entryType: "LENDER_PAYABLE_CREATED",
				effectiveDate: "2026-03-01",
				amount: 55_000,
				debitAccountId: controlAccount._id,
				creditAccountId: payableAccount._id,
				idempotencyKey: "lpb-payout-payable",
				mortgageId: seeded.mortgageId,
				lenderId: seeded.lenderAId,
				postingGroupId: "allocation:payout-test",
				source: SYSTEM_SOURCE,
			});

			// Partial payout
			await postLenderPayoutMutation._handler(ctx, {
				mortgageId: seeded.mortgageId,
				lenderId: seeded.lenderAId,
				amount: 20_000,
				effectiveDate: "2026-03-02",
				idempotencyKey: "lpb-payout-partial",
				source: SYSTEM_SOURCE,
			});

			// Call the actual query implementation
			// 55,000 created - 20,000 paid out = 35,000 outstanding
			const queryResult = await internalGetLenderPayableBalanceQuery._handler(
				ctx,
				{
					lenderId: seeded.lenderAId,
				}
			);
			expect(queryResult).toBe(35_000);

			// Direct account-level assertion as secondary check
			const accounts = await ctx.db
				.query("cash_ledger_accounts")
				.withIndex("by_lender", (q) => q.eq("lenderId", seeded.lenderAId))
				.collect();

			const total = accounts
				.filter((a) => a.family === "LENDER_PAYABLE")
				.reduce((sum, a) => sum + getCashAccountBalance(a), 0n);

			expect(total).toBe(35_000n);
		});
	});

	it("returns per-lender balances independently", async () => {
		const t = createHarness();
		const seeded = await seedMinimalEntities(t);

		const controlAccount = await createTestAccount(t, {
			family: "CONTROL",
			mortgageId: seeded.mortgageId,
			subaccount: "ALLOCATION",
		});
		const payableA = await createTestAccount(t, {
			family: "LENDER_PAYABLE",
			mortgageId: seeded.mortgageId,
			lenderId: seeded.lenderAId,
		});
		const payableB = await createTestAccount(t, {
			family: "LENDER_PAYABLE",
			mortgageId: seeded.mortgageId,
			lenderId: seeded.lenderBId,
		});

		await t.run(async (ctx) => {
			await postCashEntryInternal(ctx, {
				entryType: "LENDER_PAYABLE_CREATED",
				effectiveDate: "2026-03-01",
				amount: 60_000,
				debitAccountId: controlAccount._id,
				creditAccountId: payableA._id,
				idempotencyKey: "lpb-per-lender-a",
				mortgageId: seeded.mortgageId,
				lenderId: seeded.lenderAId,
				postingGroupId: "allocation:per-lender",
				source: SYSTEM_SOURCE,
			});

			await postCashEntryInternal(ctx, {
				entryType: "LENDER_PAYABLE_CREATED",
				effectiveDate: "2026-03-01",
				amount: 40_000,
				debitAccountId: controlAccount._id,
				creditAccountId: payableB._id,
				idempotencyKey: "lpb-per-lender-b",
				mortgageId: seeded.mortgageId,
				lenderId: seeded.lenderBId,
				postingGroupId: "allocation:per-lender",
				source: SYSTEM_SOURCE,
			});

			// Call the actual query implementation for both lenders
			const queryResultA = await internalGetLenderPayableBalanceQuery._handler(
				ctx,
				{
					lenderId: seeded.lenderAId,
				}
			);
			const queryResultB = await internalGetLenderPayableBalanceQuery._handler(
				ctx,
				{
					lenderId: seeded.lenderBId,
				}
			);
			expect(queryResultA).toBe(60_000);
			expect(queryResultB).toBe(40_000);

			// Direct account-level assertions as secondary check
			// Lender A
			const accountsA = await ctx.db
				.query("cash_ledger_accounts")
				.withIndex("by_lender", (q) => q.eq("lenderId", seeded.lenderAId))
				.collect();
			const totalA = accountsA
				.filter((a) => a.family === "LENDER_PAYABLE")
				.reduce((sum, a) => sum + getCashAccountBalance(a), 0n);

			// Lender B
			const accountsB = await ctx.db
				.query("cash_ledger_accounts")
				.withIndex("by_lender", (q) => q.eq("lenderId", seeded.lenderBId))
				.collect();
			const totalB = accountsB
				.filter((a) => a.family === "LENDER_PAYABLE")
				.reduce((sum, a) => sum + getCashAccountBalance(a), 0n);

			expect(totalA).toBe(60_000n);
			expect(totalB).toBe(40_000n);
		});
	});
});
