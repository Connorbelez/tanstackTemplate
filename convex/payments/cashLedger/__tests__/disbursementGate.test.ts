import { describe, expect, it } from "vitest";
import type { Id } from "../../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../../_generated/server";
import {
	assertDisbursementAllowed,
	validateDisbursementAmount,
} from "../disbursementGate";
import { postLenderPayout } from "../mutations";
import { postCashEntryInternal } from "../postEntry";
import { getAvailableLenderPayableBalanceInternal } from "../queries";
import {
	createHarness,
	createTestAccount,
	SYSTEM_SOURCE,
	seedMinimalEntities,
} from "./testUtils";

const modules = import.meta.glob("/convex/**/*.ts");

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

interface GetAvailableLenderPayableBalanceInternalHandler {
	_handler: (
		ctx: QueryCtx,
		args: { lenderId: Id<"lenders"> }
	) => Promise<{
		grossBalance: number;
		inFlightAmount: number;
		availableBalance: number;
	}>;
}

const postLenderPayoutMutation =
	postLenderPayout as unknown as PostLenderPayoutHandler;

const getAvailableLenderPayableBalanceInternalQuery =
	getAvailableLenderPayableBalanceInternal as unknown as GetAvailableLenderPayableBalanceInternalHandler;

describe("getAvailableLenderPayableBalance", () => {
	it("returns zero balances for lender with no accounts", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);

		await t.run(async (ctx) => {
			const result =
				await getAvailableLenderPayableBalanceInternalQuery._handler(ctx, {
					lenderId: seeded.lenderAId,
				});
			expect(result.grossBalance).toBe(0);
			expect(result.inFlightAmount).toBe(0);
			expect(result.availableBalance).toBe(0);
		});
	});

	it("returns correct gross and available balance with single payable account", async () => {
		const t = createHarness(modules);
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
				amount: 100_000,
				debitAccountId: controlAccount._id,
				creditAccountId: payableAccount._id,
				idempotencyKey: "dg-single-payable",
				mortgageId: seeded.mortgageId,
				lenderId: seeded.lenderAId,
				postingGroupId: "allocation:dg-single",
				source: SYSTEM_SOURCE,
			});

			const result =
				await getAvailableLenderPayableBalanceInternalQuery._handler(ctx, {
					lenderId: seeded.lenderAId,
				});

			expect(result.grossBalance).toBe(100_000);
			expect(result.inFlightAmount).toBe(0);
			expect(result.availableBalance).toBe(100_000);
		});
	});

	it("aggregates across multiple LENDER_PAYABLE accounts for same lender", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);

		// Second mortgage
		const mortgage2Id = await t.run(async (ctx) => {
			const existing = await ctx.db.get(seeded.mortgageId);
			if (!existing) {
				throw new Error("Mortgage not found");
			}
			return ctx.db.insert("mortgages", {
				status: "active",
				propertyId: existing.propertyId,
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
				brokerOfRecordId: existing.brokerOfRecordId,
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
				amount: 60_000,
				debitAccountId: control1._id,
				creditAccountId: payable1._id,
				idempotencyKey: "dg-multi-payable-1",
				mortgageId: seeded.mortgageId,
				lenderId: seeded.lenderAId,
				postingGroupId: "allocation:dg-multi-1",
				source: SYSTEM_SOURCE,
			});

			await postCashEntryInternal(ctx, {
				entryType: "LENDER_PAYABLE_CREATED",
				effectiveDate: "2026-03-01",
				amount: 40_000,
				debitAccountId: control2._id,
				creditAccountId: payable2._id,
				idempotencyKey: "dg-multi-payable-2",
				mortgageId: mortgage2Id,
				lenderId: seeded.lenderAId,
				postingGroupId: "allocation:dg-multi-2",
				source: SYSTEM_SOURCE,
			});

			const result =
				await getAvailableLenderPayableBalanceInternalQuery._handler(ctx, {
					lenderId: seeded.lenderAId,
				});

			expect(result.grossBalance).toBe(100_000);
			expect(result.availableBalance).toBe(100_000);
		});
	});
});

describe("validateDisbursementAmount", () => {
	it("allows disbursement within available balance", async () => {
		const t = createHarness(modules);
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
				amount: 100_000,
				debitAccountId: controlAccount._id,
				creditAccountId: payableAccount._id,
				idempotencyKey: "dg-validate-within",
				mortgageId: seeded.mortgageId,
				lenderId: seeded.lenderAId,
				postingGroupId: "allocation:dg-within",
				source: SYSTEM_SOURCE,
			});

			const result = await validateDisbursementAmount(ctx, {
				lenderId: seeded.lenderAId,
				requestedAmount: 50_000,
			});

			expect(result.allowed).toBe(true);
			expect(result.availableBalance).toBe(100_000);
			expect(result.requestedAmount).toBe(50_000);
			expect(result.reason).toBeUndefined();
		});
	});

	it("rejects disbursement exceeding available balance", async () => {
		const t = createHarness(modules);
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
				amount: 100_000,
				debitAccountId: controlAccount._id,
				creditAccountId: payableAccount._id,
				idempotencyKey: "dg-validate-exceed",
				mortgageId: seeded.mortgageId,
				lenderId: seeded.lenderAId,
				postingGroupId: "allocation:dg-exceed",
				source: SYSTEM_SOURCE,
			});

			const result = await validateDisbursementAmount(ctx, {
				lenderId: seeded.lenderAId,
				requestedAmount: 150_000,
			});

			expect(result.allowed).toBe(false);
			expect(result.availableBalance).toBe(100_000);
			expect(result.requestedAmount).toBe(150_000);
			expect(result.reason).toContain("exceeds available balance");
		});
	});

	it("rejects any disbursement when balance is zero", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);

		await t.run(async (ctx) => {
			const result = await validateDisbursementAmount(ctx, {
				lenderId: seeded.lenderAId,
				requestedAmount: 1,
			});

			expect(result.allowed).toBe(false);
			expect(result.availableBalance).toBe(0);
			expect(result.requestedAmount).toBe(1);
		});
	});

	it("allows exact amount equal to available balance (boundary)", async () => {
		const t = createHarness(modules);
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
				amount: 100_000,
				debitAccountId: controlAccount._id,
				creditAccountId: payableAccount._id,
				idempotencyKey: "dg-validate-exact",
				mortgageId: seeded.mortgageId,
				lenderId: seeded.lenderAId,
				postingGroupId: "allocation:dg-exact",
				source: SYSTEM_SOURCE,
			});

			const result = await validateDisbursementAmount(ctx, {
				lenderId: seeded.lenderAId,
				requestedAmount: 100_000,
			});

			expect(result.allowed).toBe(true);
			expect(result.availableBalance).toBe(100_000);
		});
	});
});

describe("assertDisbursementAllowed", () => {
	it("does not throw when disbursement is allowed", async () => {
		const t = createHarness(modules);
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
				amount: 100_000,
				debitAccountId: controlAccount._id,
				creditAccountId: payableAccount._id,
				idempotencyKey: "dg-assert-ok",
				mortgageId: seeded.mortgageId,
				lenderId: seeded.lenderAId,
				postingGroupId: "allocation:dg-assert-ok",
				source: SYSTEM_SOURCE,
			});

			await expect(
				assertDisbursementAllowed(ctx, {
					lenderId: seeded.lenderAId,
					requestedAmount: 50_000,
				})
			).resolves.toBeUndefined();
		});
	});

	it("throws ConvexError with DISBURSEMENT_EXCEEDS_PAYABLE when rejected", async () => {
		const t = createHarness(modules);
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
				amount: 100_000,
				debitAccountId: controlAccount._id,
				creditAccountId: payableAccount._id,
				idempotencyKey: "dg-assert-throw",
				mortgageId: seeded.mortgageId,
				lenderId: seeded.lenderAId,
				postingGroupId: "allocation:dg-assert-throw",
				source: SYSTEM_SOURCE,
			});

			await expect(
				assertDisbursementAllowed(ctx, {
					lenderId: seeded.lenderAId,
					requestedAmount: 150_000,
				})
			).rejects.toMatchObject({
				data: {
					code: "DISBURSEMENT_EXCEEDS_PAYABLE",
					requestedAmount: 150_000,
					availableBalance: 100_000,
					lenderId: seeded.lenderAId,
				},
			});
		});
	});
});

describe("available balance after payout", () => {
	it("correctly reflects reduced balance after payout", async () => {
		const t = createHarness(modules);
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
			// Create payable of 100,000
			await postCashEntryInternal(ctx, {
				entryType: "LENDER_PAYABLE_CREATED",
				effectiveDate: "2026-03-01",
				amount: 100_000,
				debitAccountId: controlAccount._id,
				creditAccountId: payableAccount._id,
				idempotencyKey: "dg-after-payout-create",
				mortgageId: seeded.mortgageId,
				lenderId: seeded.lenderAId,
				postingGroupId: "allocation:dg-after-payout",
				source: SYSTEM_SOURCE,
			});

			// Payout 40,000 — leaving 60,000
			await postLenderPayoutMutation._handler(ctx, {
				mortgageId: seeded.mortgageId,
				lenderId: seeded.lenderAId,
				amount: 40_000,
				effectiveDate: "2026-03-02",
				idempotencyKey: "dg-after-payout-payout",
				source: SYSTEM_SOURCE,
			});

			// Before: 100,000 available — 50,000 request → allowed
			const beforeResult = await validateDisbursementAmount(ctx, {
				lenderId: seeded.lenderAId,
				requestedAmount: 50_000,
			});
			expect(beforeResult.allowed).toBe(true);
			expect(beforeResult.availableBalance).toBe(60_000);

			// After: 60,000 available — 70,000 request → rejected
			const afterResult = await validateDisbursementAmount(ctx, {
				lenderId: seeded.lenderAId,
				requestedAmount: 70_000,
			});
			expect(afterResult.allowed).toBe(false);
			expect(afterResult.availableBalance).toBe(60_000);
		});
	});
});
