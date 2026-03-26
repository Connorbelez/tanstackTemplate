import { ConvexError } from "convex/values";
import type { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../../../_generated/api";
import type { Id } from "../../../_generated/dataModel";
import type { QueryCtx } from "../../../_generated/server";
import { FAIRLEND_STAFF_ORG_ID } from "../../../constants";
import {
	createHarness,
	createTestAccount,
	seedMinimalEntities,
} from "../../cashLedger/__tests__/testUtils";
import { MINIMUM_PAYOUT_CENTS } from "../config";
import { getEligibleDispersalEntries } from "../queries";

const modules = import.meta.glob("/convex/**/*.ts");

const YYYY_MM_DD_RE = /^\d{4}-\d{2}-\d{2}$/;
const NOT_FOUND_OR_INACTIVE_RE = /not found or not active/;

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

const ADMIN_IDENTITY = {
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
async function seedDispersalEntry(
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
async function seedSecondMortgage(
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

// ── Integration Tests ───────────────────────────────────────────────
// These tests invoke triggerImmediatePayout end-to-end via the action API
// with an admin identity, validating the full flow: posting LENDER_PAYOUT_SENT
// journal entries, marking dispersal entries disbursed, and updating lastPayoutDate.

describe("admin payout — integration tests (triggerImmediatePayout)", () => {
	it("posts LENDER_PAYOUT_SENT journal entry and marks entries disbursed", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);

		// Pre-create cash ledger accounts required by postLenderPayout
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

		// Seed a pending dispersal entry above minimum threshold
		const { entryId } = await seedDispersalEntry(t, {
			mortgageId: seeded.mortgageId,
			lenderId: seeded.lenderAId,
			borrowerId: seeded.borrowerId,
			amount: 5000,
			idempotencyKey: "integ-admin-payout-1",
		});

		// Call the action with admin identity
		const result = await t
			.withIdentity(ADMIN_IDENTITY)
			.action(api.payments.payout.adminPayout.triggerImmediatePayout, {
				lenderId: seeded.lenderAId,
			});

		expect(result.payoutCount).toBe(1);
		expect(result.totalAmountCents).toBe(5000);

		// Assert: LENDER_PAYOUT_SENT journal entry was created
		await t.run(async (ctx) => {
			const entries = await ctx.db
				.query("cash_ledger_journal_entries")
				.collect();
			const payoutEntries = entries.filter(
				(e) => e.entryType === "LENDER_PAYOUT_SENT"
			);
			expect(payoutEntries).toHaveLength(1);
			expect(payoutEntries[0].amount).toBe(5000n);
			// buildIdempotencyKey("lender-payout-sent", "admin", ...) produces
			// "cash-ledger:lender-payout-sent:admin:<today>:<lenderId>:<mortgageId>"
			expect(payoutEntries[0].idempotencyKey).toContain(
				"cash-ledger:lender-payout-sent:admin:"
			);
		});

		// Assert: dispersal entry marked as disbursed with payoutDate
		await t.run(async (ctx) => {
			const entry = await ctx.db.get(entryId);
			expect(entry).not.toBeNull();
			expect(entry?.status).toBe("disbursed");
			expect(entry?.payoutDate).toBeDefined();
		});
	});

	it("updates lender lastPayoutDate after successful payout", async () => {
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

		await seedDispersalEntry(t, {
			mortgageId: seeded.mortgageId,
			lenderId: seeded.lenderAId,
			borrowerId: seeded.borrowerId,
			amount: 5000,
			idempotencyKey: "integ-admin-payout-date-1",
		});

		// Verify lastPayoutDate is initially undefined
		const lenderBefore = await t.run(async (ctx) => {
			return ctx.db.get(seeded.lenderAId);
		});
		expect(lenderBefore?.lastPayoutDate).toBeUndefined();

		await t
			.withIdentity(ADMIN_IDENTITY)
			.action(api.payments.payout.adminPayout.triggerImmediatePayout, {
				lenderId: seeded.lenderAId,
			});

		// Assert: lender's lastPayoutDate is now set
		const lenderAfter = await t.run(async (ctx) => {
			return ctx.db.get(seeded.lenderAId);
		});
		expect(lenderAfter?.lastPayoutDate).toBeDefined();
		// Should be today's date in YYYY-MM-DD format
		expect(lenderAfter?.lastPayoutDate).toMatch(YYYY_MM_DD_RE);
	});

	it("scopes payout to a specific mortgageId when provided", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);
		const secondMortgageId = await seedSecondMortgage(t, seeded);

		// Cash accounts for first mortgage
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

		// Cash accounts for second mortgage
		await createTestAccount(t, {
			family: "LENDER_PAYABLE",
			mortgageId: secondMortgageId,
			lenderId: seeded.lenderAId,
			initialCreditBalance: 100_000n,
		});
		await createTestAccount(t, {
			family: "TRUST_CASH",
			mortgageId: secondMortgageId,
			initialDebitBalance: 100_000n,
		});

		// Seed entries for both mortgages
		const { entryId: entry1Id } = await seedDispersalEntry(t, {
			mortgageId: seeded.mortgageId,
			lenderId: seeded.lenderAId,
			borrowerId: seeded.borrowerId,
			amount: 5000,
			idempotencyKey: "integ-scope-mortgage-1",
		});
		const { entryId: entry2Id } = await seedDispersalEntry(t, {
			mortgageId: secondMortgageId,
			lenderId: seeded.lenderAId,
			borrowerId: seeded.borrowerId,
			amount: 3000,
			idempotencyKey: "integ-scope-mortgage-2",
		});

		// Call with mortgageId filter — only first mortgage should be paid out
		const result = await t
			.withIdentity(ADMIN_IDENTITY)
			.action(api.payments.payout.adminPayout.triggerImmediatePayout, {
				lenderId: seeded.lenderAId,
				mortgageId: seeded.mortgageId,
			});

		expect(result.payoutCount).toBe(1);
		expect(result.totalAmountCents).toBe(5000);

		// First mortgage entry should be disbursed
		const entry1 = await t.run(async (ctx) => ctx.db.get(entry1Id));
		expect(entry1?.status).toBe("disbursed");

		// Second mortgage entry should still be pending
		const entry2 = await t.run(async (ctx) => ctx.db.get(entry2Id));
		expect(entry2?.status).toBe("pending");
	});

	it("skips mortgage groups below minimum threshold", async () => {
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

		// Seed a dispersal entry below MINIMUM_PAYOUT_CENTS (100 cents)
		const { entryId } = await seedDispersalEntry(t, {
			mortgageId: seeded.mortgageId,
			lenderId: seeded.lenderAId,
			borrowerId: seeded.borrowerId,
			amount: 50, // 50 cents < 100 cents minimum
			idempotencyKey: "integ-below-threshold",
		});

		const result = await t
			.withIdentity(ADMIN_IDENTITY)
			.action(api.payments.payout.adminPayout.triggerImmediatePayout, {
				lenderId: seeded.lenderAId,
			});

		// No payouts should have been made
		expect(result.payoutCount).toBe(0);
		expect(result.totalAmountCents).toBe(0);

		// Entry should remain pending
		const entry = await t.run(async (ctx) => ctx.db.get(entryId));
		expect(entry?.status).toBe("pending");

		// No journal entries should be created
		await t.run(async (ctx) => {
			const journalEntries = await ctx.db
				.query("cash_ledger_journal_entries")
				.collect();
			const payoutEntries = journalEntries.filter(
				(e) => e.entryType === "LENDER_PAYOUT_SENT"
			);
			expect(payoutEntries).toHaveLength(0);
		});

		// lastPayoutDate should not be updated
		const lender = await t.run(async (ctx) => ctx.db.get(seeded.lenderAId));
		expect(lender?.lastPayoutDate).toBeUndefined();
	});

	it("returns zero payouts when lender has no eligible entries", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);

		// No dispersal entries seeded — lender is active but has nothing to pay out
		const result = await t
			.withIdentity(ADMIN_IDENTITY)
			.action(api.payments.payout.adminPayout.triggerImmediatePayout, {
				lenderId: seeded.lenderAId,
			});

		expect(result.payoutCount).toBe(0);
		expect(result.totalAmountCents).toBe(0);
	});

	it("rejects payout for inactive lender", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);

		// Suspend the lender
		await t.run(async (ctx) => {
			await ctx.db.patch(seeded.lenderAId, { status: "suspended" });
		});

		await expect(
			t
				.withIdentity(ADMIN_IDENTITY)
				.action(api.payments.payout.adminPayout.triggerImmediatePayout, {
					lenderId: seeded.lenderAId,
				})
		).rejects.toThrow(NOT_FOUND_OR_INACTIVE_RE);
	});

	it("reports partial failures with ConvexError containing details", async () => {
		const t = createHarness(modules);
		const seeded = await seedMinimalEntities(t);
		const secondMortgageId = await seedSecondMortgage(t, seeded);

		// Set up cash accounts for first mortgage (so it succeeds)
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

		// Do NOT create cash accounts for the second mortgage — this will cause
		// the postLenderPayout call to fail for that mortgage group

		// Seed entries for both mortgages
		await seedDispersalEntry(t, {
			mortgageId: seeded.mortgageId,
			lenderId: seeded.lenderAId,
			borrowerId: seeded.borrowerId,
			amount: 5000,
			idempotencyKey: "integ-partial-success",
		});
		await seedDispersalEntry(t, {
			mortgageId: secondMortgageId,
			lenderId: seeded.lenderAId,
			borrowerId: seeded.borrowerId,
			amount: 3000,
			idempotencyKey: "integ-partial-failure",
		});

		// The action should throw because of the partial failure
		try {
			await t
				.withIdentity(ADMIN_IDENTITY)
				.action(api.payments.payout.adminPayout.triggerImmediatePayout, {
					lenderId: seeded.lenderAId,
				});
			expect.fail("Should have thrown ConvexError for partial failure");
		} catch (e) {
			expect(e).toBeInstanceOf(ConvexError);
			const rawData = (e as ConvexError<Record<string, string | number>>).data;
			// In convex-test, ConvexError.data may be a JSON string
			const data = (
				typeof rawData === "string" ? JSON.parse(rawData) : rawData
			) as {
				message: string;
				payoutCount: number;
				totalAmountCents: number;
				failures: Array<{ mortgageId: string; error: string }>;
			};
			// One mortgage group succeeded, one failed
			expect(data.payoutCount).toBe(1);
			expect(data.totalAmountCents).toBe(5000);
			expect(data.failures).toHaveLength(1);
			expect(data.failures[0].mortgageId).toBe(
				secondMortgageId as unknown as string
			);
		}
	});

	it("handles multiple entries per mortgage — sums them for payout", async () => {
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

		// Seed two entries for the same mortgage
		const { entryId: entry1Id } = await seedDispersalEntry(t, {
			mortgageId: seeded.mortgageId,
			lenderId: seeded.lenderAId,
			borrowerId: seeded.borrowerId,
			amount: 3000,
			idempotencyKey: "integ-multi-entry-1",
		});
		const { entryId: entry2Id } = await seedDispersalEntry(t, {
			mortgageId: seeded.mortgageId,
			lenderId: seeded.lenderAId,
			borrowerId: seeded.borrowerId,
			amount: 2000,
			idempotencyKey: "integ-multi-entry-2",
		});

		const result = await t
			.withIdentity(ADMIN_IDENTITY)
			.action(api.payments.payout.adminPayout.triggerImmediatePayout, {
				lenderId: seeded.lenderAId,
			});

		// Should post a single payout for the combined amount
		expect(result.payoutCount).toBe(1);
		expect(result.totalAmountCents).toBe(5000);

		// Both entries should be disbursed
		const entry1 = await t.run(async (ctx) => ctx.db.get(entry1Id));
		const entry2 = await t.run(async (ctx) => ctx.db.get(entry2Id));
		expect(entry1?.status).toBe("disbursed");
		expect(entry2?.status).toBe("disbursed");

		// Single journal entry for the summed amount
		await t.run(async (ctx) => {
			const entries = await ctx.db
				.query("cash_ledger_journal_entries")
				.collect();
			const payoutEntries = entries.filter(
				(e) => e.entryType === "LENDER_PAYOUT_SENT"
			);
			expect(payoutEntries).toHaveLength(1);
			expect(payoutEntries[0].amount).toBe(5000n);
		});
	});
});
