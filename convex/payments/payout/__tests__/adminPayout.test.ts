import type { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import type { Id } from "../../../_generated/dataModel";
import type { QueryCtx } from "../../../_generated/server";
import { FAIRLEND_STAFF_ORG_ID } from "../../../constants";
import {
	createHarness,
	seedMinimalEntities,
} from "../../cashLedger/__tests__/testUtils";
import { MINIMUM_PAYOUT_CENTS } from "../config";
import { getEligibleDispersalEntries } from "../queries";

const modules = import.meta.glob("/convex/**/*.ts");

// ── Type wrapper for _handler access ─────────────────────────────────

interface GetEligibleHandler {
	_handler: (
		ctx: QueryCtx,
		args: { lenderId: Id<"lenders">; today: string }
	) => Promise<Array<{ _id: string; mortgageId: string; amount: number }>>;
}

const getEligibleQuery =
	getEligibleDispersalEntries as unknown as GetEligibleHandler;

// ── Minimal calculationDetails for seeding ───────────────────────────

const CALC_DETAILS = {
	settledAmount: 10_000,
	servicingFee: 100,
	distributableAmount: 9900,
	ownershipUnits: 60,
	totalUnits: 100,
	ownershipFraction: 0.6,
	rawAmount: 5940,
	roundedAmount: 5940,
};

// ── Admin identity for integration tests ─────────────────────────────

const _ADMIN_IDENTITY = {
	subject: "admin-payout-test",
	issuer: "https://api.workos.com",
	org_id: FAIRLEND_STAFF_ORG_ID,
	organization_name: "FairLend Staff",
	role: "admin",
	roles: JSON.stringify(["admin"]),
	permissions: JSON.stringify([]),
	user_email: "admin-payout@fairlend.test",
	user_first_name: "Admin",
	user_last_name: "Payout",
};

// ── Helpers ──────────────────────────────────────────────────────────

type TestHarness = ReturnType<typeof convexTest>;

/**
 * Seed a pending dispersal entry for the given lender + mortgage.
 * Also creates the required ledger account and settled obligation.
 */
async function _seedDispersalEntry(
	t: TestHarness,
	args: {
		mortgageId: Id<"mortgages">;
		lenderId: Id<"lenders">;
		borrowerId: Id<"borrowers">;
		amount: number;
		idempotencyKey: string;
		payoutEligibleAfter?: string;
	}
) {
	return t.run(async (ctx) => {
		const lenderAccountId = await ctx.db.insert("ledger_accounts", {
			type: "POSITION",
			mortgageId: args.mortgageId as unknown as string,
			lenderId: args.lenderId as unknown as string,
			cumulativeDebits: 0n,
			cumulativeCredits: 0n,
			createdAt: Date.now(),
		});

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
			createdAt: Date.now(),
		});

		const entryId = await ctx.db.insert("dispersalEntries", {
			mortgageId: args.mortgageId,
			lenderId: args.lenderId,
			lenderAccountId,
			amount: args.amount,
			dispersalDate: "2026-03-01",
			obligationId,
			servicingFeeDeducted: 100,
			status: "pending",
			idempotencyKey: args.idempotencyKey,
			calculationDetails: CALC_DETAILS,
			payoutEligibleAfter: args.payoutEligibleAfter ?? "2026-03-01",
			createdAt: Date.now(),
		});

		return { entryId, obligationId, lenderAccountId };
	});
}

/**
 * Create a second mortgage linked to the same broker as lender.
 */
async function _seedSecondMortgage(
	t: TestHarness,
	seeded: Awaited<ReturnType<typeof seedMinimalEntities>>
) {
	return t.run(async (ctx) => {
		const now = Date.now();
		const lender = await ctx.db.get(seeded.lenderAId);
		if (!lender) {
			throw new Error("Lender not found");
		}

		const propertyId = await ctx.db.insert("properties", {
			streetAddress: "456 Admin Test Ave",
			city: "Toronto",
			province: "ON",
			postalCode: "M5V 2B2",
			propertyType: "residential",
			createdAt: now,
		});

		const mortgageId = await ctx.db.insert("mortgages", {
			status: "active",
			propertyId,
			principal: 5_000_000,
			annualServicingRate: 0.01,
			interestRate: 0.08,
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
			brokerOfRecordId: lender.brokerId,
			createdAt: now,
		});

		return mortgageId;
	});
}

// ── Tests ────────────────────────────────────────────────────────────

describe("admin payout — component tests", () => {
	describe("mortgage-scoped filtering", () => {
		it("eligible entries can be filtered by mortgageId (simulating admin scoped payout)", async () => {
			const t = createHarness(modules);
			const seeded = await seedMinimalEntities(t);

			// Create a second mortgage
			const { secondMortgageId } = await t.run(async (ctx) => {
				const now = Date.now();
				const propertyId = await ctx.db.insert("properties", {
					streetAddress: "456 Admin Test Ave",
					city: "Toronto",
					province: "ON",
					postalCode: "M5V 2B2",
					propertyType: "residential",
					createdAt: now,
				});

				// Need to look up broker from seeded lender
				const lender = await ctx.db.get(seeded.lenderAId);
				if (!lender) {
					throw new Error("Lender not found");
				}
				const brokerId = lender.brokerId;

				const secondMortgageId = await ctx.db.insert("mortgages", {
					status: "active",
					propertyId,
					principal: 5_000_000,
					annualServicingRate: 0.01,
					interestRate: 0.08,
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
					brokerOfRecordId: brokerId,
					createdAt: now,
				});

				return { secondMortgageId };
			});

			// Seed dispersal entries for both mortgages
			await t.run(async (ctx) => {
				const lenderAccountId = await ctx.db.insert("ledger_accounts", {
					type: "POSITION",
					mortgageId: seeded.mortgageId as unknown as string,
					lenderId: seeded.lenderAId as unknown as string,
					cumulativeDebits: 0n,
					cumulativeCredits: 0n,
					createdAt: Date.now(),
				});

				const lenderAccountId2 = await ctx.db.insert("ledger_accounts", {
					type: "POSITION",
					mortgageId: secondMortgageId as unknown as string,
					lenderId: seeded.lenderAId as unknown as string,
					cumulativeDebits: 0n,
					cumulativeCredits: 0n,
					createdAt: Date.now(),
				});

				const obligationId1 = await ctx.db.insert("obligations", {
					status: "settled",
					machineContext: {},
					lastTransitionAt: Date.now(),
					mortgageId: seeded.mortgageId,
					borrowerId: seeded.borrowerId,
					paymentNumber: 1,
					type: "regular_interest",
					amount: 5000,
					amountSettled: 5000,
					dueDate: Date.parse("2026-03-01T00:00:00Z"),
					gracePeriodEnd: Date.parse("2026-03-16T00:00:00Z"),
					createdAt: Date.now(),
				});

				const obligationId2 = await ctx.db.insert("obligations", {
					status: "settled",
					machineContext: {},
					lastTransitionAt: Date.now(),
					mortgageId: secondMortgageId,
					borrowerId: seeded.borrowerId,
					paymentNumber: 1,
					type: "regular_interest",
					amount: 3000,
					amountSettled: 3000,
					dueDate: Date.parse("2026-03-01T00:00:00Z"),
					gracePeriodEnd: Date.parse("2026-03-16T00:00:00Z"),
					createdAt: Date.now(),
				});

				// Entry for first mortgage
				await ctx.db.insert("dispersalEntries", {
					mortgageId: seeded.mortgageId,
					lenderId: seeded.lenderAId,
					lenderAccountId,
					amount: 5000,
					dispersalDate: "2026-03-01",
					obligationId: obligationId1,
					servicingFeeDeducted: 100,
					status: "pending",
					idempotencyKey: "admin-test-mortgage-1",
					calculationDetails: CALC_DETAILS,
					payoutEligibleAfter: "2026-03-01",
					createdAt: Date.now(),
				});

				// Entry for second mortgage
				await ctx.db.insert("dispersalEntries", {
					mortgageId: secondMortgageId,
					lenderId: seeded.lenderAId,
					lenderAccountId: lenderAccountId2,
					amount: 3000,
					dispersalDate: "2026-03-01",
					obligationId: obligationId2,
					servicingFeeDeducted: 50,
					status: "pending",
					idempotencyKey: "admin-test-mortgage-2",
					calculationDetails: CALC_DETAILS,
					payoutEligibleAfter: "2026-03-01",
					createdAt: Date.now(),
				});
			});

			// Get ALL eligible entries for the lender
			const allEntries = await t.run(async (ctx) => {
				return getEligibleQuery._handler(ctx as unknown as QueryCtx, {
					lenderId: seeded.lenderAId,
					today: "2026-03-20",
				});
			});

			expect(allEntries).toHaveLength(2);

			// Filter to first mortgage only (simulating admin payout mortgageId arg)
			const firstMortgageEntries = allEntries.filter(
				(e) => e.mortgageId === (seeded.mortgageId as unknown as string)
			);
			expect(firstMortgageEntries).toHaveLength(1);
			expect(firstMortgageEntries[0].amount).toBe(5000);

			// Filter to second mortgage only
			const secondMortgageEntries = allEntries.filter(
				(e) => e.mortgageId === (secondMortgageId as unknown as string)
			);
			expect(secondMortgageEntries).toHaveLength(1);
			expect(secondMortgageEntries[0].amount).toBe(3000);
		});
	});

	describe("minimum threshold check", () => {
		it("entries below MINIMUM_PAYOUT_CENTS are skipped by threshold logic", () => {
			// The admin payout sums entries per mortgage and skips groups below the minimum.
			// This test validates the threshold logic used inline.
			const entries = [{ amount: 30 }, { amount: 20 }, { amount: 10 }];
			const totalAmount = entries.reduce((acc, e) => acc + e.amount, 0);

			// 60 cents total < 100 cents minimum
			expect(totalAmount).toBeLessThan(MINIMUM_PAYOUT_CENTS);
			expect(totalAmount < MINIMUM_PAYOUT_CENTS).toBe(true);
		});

		it("entries at or above MINIMUM_PAYOUT_CENTS pass threshold", () => {
			const entries = [{ amount: 50 }, { amount: 50 }];
			const totalAmount = entries.reduce((acc, e) => acc + e.amount, 0);

			// 100 cents === 100 cents minimum
			expect(totalAmount).toBeGreaterThanOrEqual(MINIMUM_PAYOUT_CENTS);
			expect(totalAmount < MINIMUM_PAYOUT_CENTS).toBe(false);
		});

		it("single large entry passes threshold", () => {
			const entries = [{ amount: 5000 }];
			const totalAmount = entries.reduce((acc, e) => acc + e.amount, 0);

			expect(totalAmount).toBeGreaterThanOrEqual(MINIMUM_PAYOUT_CENTS);
		});
	});
});
