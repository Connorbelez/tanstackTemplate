import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import type { Id } from "../../../_generated/dataModel";
import type { MutationCtx } from "../../../_generated/server";
import {
	assertDisbursementAllowed,
	validateDisbursementAmount,
} from "../disbursementGate";
import { postLenderPayout } from "../mutations";
import { postCashEntryInternal } from "../postEntry";
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

const postLenderPayoutMutation =
	postLenderPayout as unknown as PostLenderPayoutHandler;

// ── Helper: seed a payable balance for lender A ─────────────────────
async function seedPayable(
	t: ReturnType<typeof createHarness>,
	seeded: Awaited<ReturnType<typeof seedMinimalEntities>>,
	amount: number
) {
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
			amount,
			debitAccountId: controlAccount._id,
			creditAccountId: payableAccount._id,
			idempotencyKey: `dg-seed-${amount}-${Date.now()}`,
			mortgageId: seeded.mortgageId,
			lenderId: seeded.lenderAId,
			postingGroupId: `allocation:dg-seed-${amount}`,
			source: SYSTEM_SOURCE,
		});
	});

	return { controlAccount, payableAccount };
}

describe("disbursementGate", () => {
	// ── Core validation ─────────────────────────────────────────────

	it("allows disbursement within payable balance", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);
		await seedPayable(t, seeded, 55_000);

		await t.run(async (ctx) => {
			const result = await validateDisbursementAmount(ctx, {
				lenderId: seeded.lenderAId,
				requestedAmount: 30_000,
			});

			expect(result.allowed).toBe(true);
			expect(result.availableBalance).toBe(55_000);
			expect(result.requestedAmount).toBe(30_000);
			// Discriminated union: no reason property on allowed branch
			if (result.allowed) {
				expect("reason" in result).toBe(false);
			}

			// Also verify assertDisbursementAllowed does NOT throw
			await assertDisbursementAllowed(ctx, {
				lenderId: seeded.lenderAId,
				requestedAmount: 30_000,
			});
		});
	});

	it("rejects disbursement exceeding payable balance", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);
		await seedPayable(t, seeded, 55_000);

		await t.run(async (ctx) => {
			const result = await validateDisbursementAmount(ctx, {
				lenderId: seeded.lenderAId,
				requestedAmount: 60_000,
			});

			expect(result.allowed).toBe(false);
			expect(result.availableBalance).toBe(55_000);
			expect(result.requestedAmount).toBe(60_000);
			if (!result.allowed) {
				expect(result.reason).toContain("60000");
				expect(result.reason).toContain("55000");
			}
		});
	});

	it("rejects disbursement when balance is zero", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);
		await seedPayable(t, seeded, 55_000);

		// Seed TRUST_CASH so payout has cash to draw from
		await createTestAccount(t, {
			family: "TRUST_CASH",
			mortgageId: seeded.mortgageId,
			initialDebitBalance: 100_000n,
		});

		await t.run(async (ctx) => {
			// Full payout zeroes balance
			await postLenderPayoutMutation._handler(ctx, {
				mortgageId: seeded.mortgageId,
				lenderId: seeded.lenderAId,
				amount: 55_000,
				effectiveDate: "2026-03-02",
				idempotencyKey: "dg-zero-payout",
				source: SYSTEM_SOURCE,
			});

			const result = await validateDisbursementAmount(ctx, {
				lenderId: seeded.lenderAId,
				requestedAmount: 1,
			});

			expect(result.allowed).toBe(false);
			expect(result.availableBalance).toBe(0);
		});
	});

	it("rejects disbursement when lender has no accounts", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);

		await t.run(async (ctx) => {
			const result = await validateDisbursementAmount(ctx, {
				lenderId: seeded.lenderAId,
				requestedAmount: 100,
			});

			expect(result.allowed).toBe(false);
			expect(result.availableBalance).toBe(0);
			expect(result.requestedAmount).toBe(100);
		});
	});

	it("allows disbursement when exact amount equals balance (boundary)", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);
		await seedPayable(t, seeded, 55_000);

		await t.run(async (ctx) => {
			const result = await validateDisbursementAmount(ctx, {
				lenderId: seeded.lenderAId,
				requestedAmount: 55_000,
			});

			expect(result.allowed).toBe(true);
			expect(result.availableBalance).toBe(55_000);
			expect(result.requestedAmount).toBe(55_000);
		});
	});

	it("sums multiple LENDER_PAYABLE accounts correctly", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);

		// Create a second mortgage for second payable account
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
				idempotencyKey: "dg-multi-1",
				mortgageId: seeded.mortgageId,
				lenderId: seeded.lenderAId,
				postingGroupId: "allocation:dg-multi-1",
				source: SYSTEM_SOURCE,
			});

			await postCashEntryInternal(ctx, {
				entryType: "LENDER_PAYABLE_CREATED",
				effectiveDate: "2026-03-01",
				amount: 20_000,
				debitAccountId: control2._id,
				creditAccountId: payable2._id,
				idempotencyKey: "dg-multi-2",
				mortgageId: mortgage2Id,
				lenderId: seeded.lenderAId,
				postingGroupId: "allocation:dg-multi-2",
				source: SYSTEM_SOURCE,
			});

			// Total = 30,000 + 20,000 = 50,000
			const allowed = await validateDisbursementAmount(ctx, {
				lenderId: seeded.lenderAId,
				requestedAmount: 45_000,
			});
			expect(allowed.allowed).toBe(true);
			expect(allowed.availableBalance).toBe(50_000);

			const rejected = await validateDisbursementAmount(ctx, {
				lenderId: seeded.lenderAId,
				requestedAmount: 55_000,
			});
			expect(rejected.allowed).toBe(false);
			expect(rejected.availableBalance).toBe(50_000);
		});
	});

	// ── assertDisbursementAllowed ────────────────────────────────────

	it("assertDisbursementAllowed throws ConvexError with structured data on exceed", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);
		await seedPayable(t, seeded, 55_000);

		await t.run(async (ctx) => {
			try {
				await assertDisbursementAllowed(ctx, {
					lenderId: seeded.lenderAId,
					requestedAmount: 60_000,
				});
				throw new Error("Should have thrown");
			} catch (e) {
				expect(e).toBeInstanceOf(ConvexError);
				const data = (
					e as ConvexError<{
						code: string;
						requestedAmount: number;
						availableBalance: number;
						lenderId: Id<"lenders">;
					}>
				).data;
				expect(data.code).toBe("DISBURSEMENT_EXCEEDS_PAYABLE");
				expect(data.requestedAmount).toBe(60_000);
				expect(data.availableBalance).toBe(55_000);
				expect(data.lenderId).toBe(seeded.lenderAId);
			}
		});
	});

	// ── Input validation (#1 critical fix) ──────────────────────────

	it("throws INVALID_DISBURSEMENT_AMOUNT for zero requestedAmount", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);

		await t.run(async (ctx) => {
			try {
				await validateDisbursementAmount(ctx, {
					lenderId: seeded.lenderAId,
					requestedAmount: 0,
				});
				throw new Error("Should have thrown");
			} catch (e) {
				expect(e).toBeInstanceOf(ConvexError);
				expect((e as ConvexError<{ code: string }>).data.code).toBe(
					"INVALID_DISBURSEMENT_AMOUNT"
				);
			}
		});
	});

	it("throws INVALID_DISBURSEMENT_AMOUNT for negative requestedAmount", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);

		await t.run(async (ctx) => {
			try {
				await validateDisbursementAmount(ctx, {
					lenderId: seeded.lenderAId,
					requestedAmount: -1000,
				});
				throw new Error("Should have thrown");
			} catch (e) {
				expect(e).toBeInstanceOf(ConvexError);
				expect((e as ConvexError<{ code: string }>).data.code).toBe(
					"INVALID_DISBURSEMENT_AMOUNT"
				);
			}
		});
	});

	it("throws INVALID_DISBURSEMENT_AMOUNT for NaN requestedAmount", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);

		await t.run(async (ctx) => {
			try {
				await validateDisbursementAmount(ctx, {
					lenderId: seeded.lenderAId,
					requestedAmount: Number.NaN,
				});
				throw new Error("Should have thrown");
			} catch (e) {
				expect(e).toBeInstanceOf(ConvexError);
				expect((e as ConvexError<{ code: string }>).data.code).toBe(
					"INVALID_DISBURSEMENT_AMOUNT"
				);
			}
		});
	});

	// ── In-flight transfer edge cases (#5, #6, #9, #10) ─────────────

	it("in-flight outbound transfers reduce available balance", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);
		await seedPayable(t, seeded, 55_000);

		await t.run(async (ctx) => {
			// Create in-flight outbound transfer of 20,000
			await ctx.db.insert("transferRequests", {
				status: "processing",
				direction: "outbound",
				amount: 20_000,
				currency: "CAD",
				lenderId: seeded.lenderAId,
				createdAt: Date.now(),
			});

			// Available = 55,000 - 20,000 = 35,000
			const rejected = await validateDisbursementAmount(ctx, {
				lenderId: seeded.lenderAId,
				requestedAmount: 40_000,
			});
			expect(rejected.allowed).toBe(false);
			expect(rejected.availableBalance).toBe(35_000);

			const allowed = await validateDisbursementAmount(ctx, {
				lenderId: seeded.lenderAId,
				requestedAmount: 30_000,
			});
			expect(allowed.allowed).toBe(true);
			expect(allowed.availableBalance).toBe(35_000);
		});
	});

	it("inbound in-flight transfers do NOT reduce available balance", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);
		await seedPayable(t, seeded, 55_000);

		await t.run(async (ctx) => {
			// Inbound transfer — should be ignored
			await ctx.db.insert("transferRequests", {
				status: "processing",
				direction: "inbound",
				amount: 20_000,
				currency: "CAD",
				lenderId: seeded.lenderAId,
				createdAt: Date.now(),
			});

			const result = await validateDisbursementAmount(ctx, {
				lenderId: seeded.lenderAId,
				requestedAmount: 55_000,
			});
			// Full balance still available — inbound was ignored
			expect(result.allowed).toBe(true);
			expect(result.availableBalance).toBe(55_000);
		});
	});

	it("transfer with undefined amount is safely skipped", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);
		await seedPayable(t, seeded, 55_000);

		await t.run(async (ctx) => {
			// Legacy transfer with no amount
			await ctx.db.insert("transferRequests", {
				status: "processing",
				direction: "outbound",
				lenderId: seeded.lenderAId,
				createdAt: Date.now(),
			});

			const result = await validateDisbursementAmount(ctx, {
				lenderId: seeded.lenderAId,
				requestedAmount: 55_000,
			});
			// Full balance — legacy record skipped
			expect(result.allowed).toBe(true);
			expect(result.availableBalance).toBe(55_000);
		});
	});

	it("all three in-flight statuses are counted", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);
		await seedPayable(t, seeded, 90_000);

		await t.run(async (ctx) => {
			// One transfer per in-flight status
			for (const status of ["pending", "approved", "processing"] as const) {
				await ctx.db.insert("transferRequests", {
					status,
					direction: "outbound",
					amount: 10_000,
					currency: "CAD",
					lenderId: seeded.lenderAId,
					createdAt: Date.now(),
				});
			}

			// Available = 90,000 - 30,000 = 60,000
			const result = await validateDisbursementAmount(ctx, {
				lenderId: seeded.lenderAId,
				requestedAmount: 65_000,
			});
			expect(result.allowed).toBe(false);
			expect(result.availableBalance).toBe(60_000);

			const allowed = await validateDisbursementAmount(ctx, {
				lenderId: seeded.lenderAId,
				requestedAmount: 55_000,
			});
			expect(allowed.allowed).toBe(true);
		});
	});

	it("completed and confirmed transfers are NOT deducted", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);
		await seedPayable(t, seeded, 55_000);

		await t.run(async (ctx) => {
			// These terminal-state transfers should NOT reduce balance
			for (const status of ["completed", "confirmed"] as const) {
				await ctx.db.insert("transferRequests", {
					status,
					direction: "outbound",
					amount: 20_000,
					currency: "CAD",
					lenderId: seeded.lenderAId,
					confirmedAt: Date.now(),
					createdAt: Date.now(),
				});
			}

			const result = await validateDisbursementAmount(ctx, {
				lenderId: seeded.lenderAId,
				requestedAmount: 55_000,
			});
			// Full balance — completed/confirmed are not in-flight
			expect(result.allowed).toBe(true);
			expect(result.availableBalance).toBe(55_000);
		});
	});
});
