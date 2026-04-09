import auditLogTest from "convex-audit-log/test";
import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";
import { internal } from "../../../_generated/api";
import type { Id } from "../../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../../_generated/server";
import auditTrailSchema from "../../../components/auditTrail/schema";
import schema from "../../../schema";
import {
	convexModules,
	auditTrailModules as sharedAuditTrailModules,
} from "../../../test/moduleMaps";
import {
	createHarness,
	seedMinimalEntities,
} from "../../cashLedger/__tests__/testUtils";
import { markEntriesDisbursed } from "../mutations";
import { getActiveLenders, getEligibleDispersalEntries } from "../queries";

const modules = convexModules;
const auditTrailModules = sharedAuditTrailModules;
const EXPECTED_PENDING_ERROR = /expected "pending"/;

// ── Type wrappers for _handler access ────────────────────────────────

interface GetEligibleHandler {
	_handler: (
		ctx: QueryCtx,
		args: { lenderId: Id<"lenders">; today: string }
	) => Promise<unknown[]>;
}

interface GetLendersHandler {
	_handler: (ctx: QueryCtx, args: Record<string, never>) => Promise<unknown[]>;
}

interface MarkDisbursedHandler {
	_handler: (
		ctx: MutationCtx,
		args: { entryIds: Id<"dispersalEntries">[]; payoutDate: string }
	) => Promise<void>;
}

const getEligibleQuery =
	getEligibleDispersalEntries as unknown as GetEligibleHandler;
const getLendersQuery = getActiveLenders as unknown as GetLendersHandler;
const markDisbursedMutation =
	markEntriesDisbursed as unknown as MarkDisbursedHandler;

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

// ── Tests ────────────────────────────────────────────────────────────

describe("batch payout — query & mutation integration", () => {
	// ── getEligibleDispersalEntries ──────────────────────────────

	describe("getEligibleDispersalEntries", () => {
		it("returns entries past hold period", async () => {
			const t = createHarness(modules);
			const seeded = await seedMinimalEntities(t);

			await t.run(async (ctx) => {
				const lenderAccountId = await ctx.db.insert("ledger_accounts", {
					type: "POSITION",
					mortgageId: seeded.mortgageId as unknown as string,
					lenderId: seeded.lenderAId as unknown as string,
					cumulativeDebits: 0n,
					cumulativeCredits: 0n,
					createdAt: Date.now(),
				});

				const obligationId = await ctx.db.insert("obligations", {
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

				return ctx.db.insert("dispersalEntries", {
					mortgageId: seeded.mortgageId,
					lenderId: seeded.lenderAId,
					lenderAccountId,
					amount: 5000,
					dispersalDate: "2026-03-01",
					obligationId,
					servicingFeeDeducted: 100,
					status: "pending",
					idempotencyKey: "test-dispersal-past-hold",
					calculationDetails: CALC_DETAILS,
					payoutEligibleAfter: "2026-03-01",
					createdAt: Date.now(),
				});
			});

			const results = await t.run(async (ctx) => {
				return getEligibleQuery._handler(ctx as unknown as QueryCtx, {
					lenderId: seeded.lenderAId,
					today: "2026-03-20",
				});
			});

			expect(results).toHaveLength(1);
		});

		it("skips entries within hold period", async () => {
			const t = createHarness(modules);
			const seeded = await seedMinimalEntities(t);

			await t.run(async (ctx) => {
				const lenderAccountId = await ctx.db.insert("ledger_accounts", {
					type: "POSITION",
					mortgageId: seeded.mortgageId as unknown as string,
					lenderId: seeded.lenderAId as unknown as string,
					cumulativeDebits: 0n,
					cumulativeCredits: 0n,
					createdAt: Date.now(),
				});

				const obligationId = await ctx.db.insert("obligations", {
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

				return ctx.db.insert("dispersalEntries", {
					mortgageId: seeded.mortgageId,
					lenderId: seeded.lenderAId,
					lenderAccountId,
					amount: 5000,
					dispersalDate: "2026-03-01",
					obligationId,
					servicingFeeDeducted: 100,
					status: "pending",
					idempotencyKey: "test-dispersal-within-hold",
					calculationDetails: CALC_DETAILS,
					payoutEligibleAfter: "2026-04-01",
					createdAt: Date.now(),
				});
			});

			const results = await t.run(async (ctx) => {
				return getEligibleQuery._handler(ctx as unknown as QueryCtx, {
					lenderId: seeded.lenderAId,
					today: "2026-03-20",
				});
			});

			expect(results).toHaveLength(0);
		});

		it("includes entries without payoutEligibleAfter (legacy)", async () => {
			const t = createHarness(modules);
			const seeded = await seedMinimalEntities(t);

			await t.run(async (ctx) => {
				const lenderAccountId = await ctx.db.insert("ledger_accounts", {
					type: "POSITION",
					mortgageId: seeded.mortgageId as unknown as string,
					lenderId: seeded.lenderAId as unknown as string,
					cumulativeDebits: 0n,
					cumulativeCredits: 0n,
					createdAt: Date.now(),
				});

				const obligationId = await ctx.db.insert("obligations", {
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

				return ctx.db.insert("dispersalEntries", {
					mortgageId: seeded.mortgageId,
					lenderId: seeded.lenderAId,
					lenderAccountId,
					amount: 5000,
					dispersalDate: "2026-03-01",
					obligationId,
					servicingFeeDeducted: 100,
					status: "pending",
					idempotencyKey: "test-dispersal-no-hold",
					calculationDetails: CALC_DETAILS,
					createdAt: Date.now(),
				});
			});

			const results = await t.run(async (ctx) => {
				return getEligibleQuery._handler(ctx as unknown as QueryCtx, {
					lenderId: seeded.lenderAId,
					today: "2026-03-20",
				});
			});

			expect(results).toHaveLength(1);
		});

		it("skips non-pending entries", async () => {
			const t = createHarness(modules);
			const seeded = await seedMinimalEntities(t);

			await t.run(async (ctx) => {
				const lenderAccountId = await ctx.db.insert("ledger_accounts", {
					type: "POSITION",
					mortgageId: seeded.mortgageId as unknown as string,
					lenderId: seeded.lenderAId as unknown as string,
					cumulativeDebits: 0n,
					cumulativeCredits: 0n,
					createdAt: Date.now(),
				});

				const obligationId = await ctx.db.insert("obligations", {
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

				return ctx.db.insert("dispersalEntries", {
					mortgageId: seeded.mortgageId,
					lenderId: seeded.lenderAId,
					lenderAccountId,
					amount: 5000,
					dispersalDate: "2026-03-01",
					obligationId,
					servicingFeeDeducted: 100,
					status: "disbursed",
					idempotencyKey: "test-dispersal-already-disbursed",
					calculationDetails: CALC_DETAILS,
					payoutEligibleAfter: "2026-03-01",
					createdAt: Date.now(),
				});
			});

			const results = await t.run(async (ctx) => {
				return getEligibleQuery._handler(ctx as unknown as QueryCtx, {
					lenderId: seeded.lenderAId,
					today: "2026-03-20",
				});
			});

			expect(results).toHaveLength(0);
		});
	});

	// ── getActiveLenders ─────────────────────────────

	describe("getActiveLenders", () => {
		it("returns only active lenders", async () => {
			const t = createHarness(modules);

			const { activeLenderId, inactiveLenderId } = await t.run(async (ctx) => {
				const now = Date.now();

				const brokerUserId = await ctx.db.insert("users", {
					authId: "broker-lender-test",
					email: "broker-lender-test@fairlend.test",
					firstName: "Broker",
					lastName: "Test",
				});
				const brokerId = await ctx.db.insert("brokers", {
					status: "active",
					userId: brokerUserId,
					createdAt: now,
				});

				const activeUserId = await ctx.db.insert("users", {
					authId: "active-lender",
					email: "active-lender@fairlend.test",
					firstName: "Active",
					lastName: "Lender",
				});
				const activeLenderId = await ctx.db.insert("lenders", {
					userId: activeUserId,
					brokerId,
					accreditationStatus: "accredited",
					onboardingEntryPath: "/test/active",
					status: "active",
					createdAt: now,
				});

				const inactiveUserId = await ctx.db.insert("users", {
					authId: "inactive-lender",
					email: "inactive-lender@fairlend.test",
					firstName: "Inactive",
					lastName: "Lender",
				});
				const inactiveLenderId = await ctx.db.insert("lenders", {
					userId: inactiveUserId,
					brokerId,
					accreditationStatus: "accredited",
					onboardingEntryPath: "/test/inactive",
					status: "suspended",
					createdAt: now,
				});

				return { activeLenderId, inactiveLenderId };
			});

			const results = await t.run(async (ctx) => {
				return getLendersQuery._handler(
					ctx as unknown as QueryCtx,
					{} as Record<string, never>
				);
			});

			const resultIds = (results as Array<{ _id: string }>).map((l) => l._id);
			expect(resultIds).toContain(activeLenderId);
			expect(resultIds).not.toContain(inactiveLenderId);
		});
	});

	// ── markEntriesDisbursed ─────────────────────────────────────

	describe("markEntriesDisbursed", () => {
		it("updates status to disbursed", async () => {
			const t = createHarness(modules);
			const seeded = await seedMinimalEntities(t);

			const entryIds = await t.run(async (ctx) => {
				const lenderAccountId = await ctx.db.insert("ledger_accounts", {
					type: "POSITION",
					mortgageId: seeded.mortgageId as unknown as string,
					lenderId: seeded.lenderAId as unknown as string,
					cumulativeDebits: 0n,
					cumulativeCredits: 0n,
					createdAt: Date.now(),
				});

				const obligationId = await ctx.db.insert("obligations", {
					status: "settled",
					machineContext: {},
					lastTransitionAt: Date.now(),
					mortgageId: seeded.mortgageId,
					borrowerId: seeded.borrowerId,
					paymentNumber: 1,
					type: "regular_interest",
					amount: 10_000,
					amountSettled: 10_000,
					dueDate: Date.parse("2026-03-01T00:00:00Z"),
					gracePeriodEnd: Date.parse("2026-03-16T00:00:00Z"),
					createdAt: Date.now(),
				});

				const id1 = await ctx.db.insert("dispersalEntries", {
					mortgageId: seeded.mortgageId,
					lenderId: seeded.lenderAId,
					lenderAccountId,
					amount: 5000,
					dispersalDate: "2026-03-01",
					obligationId,
					servicingFeeDeducted: 100,
					status: "pending",
					idempotencyKey: "test-mark-disbursed-1",
					calculationDetails: CALC_DETAILS,
					payoutEligibleAfter: "2026-03-01",
					createdAt: Date.now(),
				});

				const id2 = await ctx.db.insert("dispersalEntries", {
					mortgageId: seeded.mortgageId,
					lenderId: seeded.lenderAId,
					lenderAccountId,
					amount: 3000,
					dispersalDate: "2026-03-01",
					obligationId,
					servicingFeeDeducted: 50,
					status: "pending",
					idempotencyKey: "test-mark-disbursed-2",
					calculationDetails: CALC_DETAILS,
					payoutEligibleAfter: "2026-03-01",
					createdAt: Date.now(),
				});

				return [id1, id2] as Id<"dispersalEntries">[];
			});

			// Mark them as disbursed
			await t.run(async (ctx) => {
				return markDisbursedMutation._handler(ctx as unknown as MutationCtx, {
					entryIds,
					payoutDate: "2026-03-20",
				});
			});

			// Verify both entries now have status "disbursed" and payoutDate persisted
			await t.run(async (ctx) => {
				for (const id of entryIds) {
					const entry = await ctx.db.get(id);
					expect(entry).not.toBeNull();
					expect(entry?.status).toBe("disbursed");
					expect(entry?.payoutDate).toBe("2026-03-20");
				}
			});
		});

		it("rejects entries that are not in pending status (concurrency guard)", async () => {
			const t = createHarness(modules);
			const seeded = await seedMinimalEntities(t);

			const entryId = await t.run(async (ctx) => {
				const lenderAccountId = await ctx.db.insert("ledger_accounts", {
					type: "POSITION",
					mortgageId: seeded.mortgageId as unknown as string,
					lenderId: seeded.lenderAId as unknown as string,
					cumulativeDebits: 0n,
					cumulativeCredits: 0n,
					createdAt: Date.now(),
				});

				const obligationId = await ctx.db.insert("obligations", {
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

				return ctx.db.insert("dispersalEntries", {
					mortgageId: seeded.mortgageId,
					lenderId: seeded.lenderAId,
					lenderAccountId,
					amount: 5000,
					dispersalDate: "2026-03-01",
					obligationId,
					servicingFeeDeducted: 100,
					status: "disbursed", // already disbursed
					idempotencyKey: "test-already-disbursed",
					calculationDetails: CALC_DETAILS,
					payoutEligibleAfter: "2026-03-01",
					createdAt: Date.now(),
				});
			});

			// Attempting to mark already-disbursed entry should throw
			await expect(
				t.run(async (ctx) => {
					return markDisbursedMutation._handler(ctx as unknown as MutationCtx, {
						entryIds: [entryId],
						payoutDate: "2026-03-20",
					});
				})
			).rejects.toThrow(EXPECTED_PENDING_ERROR);
		});
	});
});

// ── processPayoutBatch — E2E integration tests ──────────────────────

/**
 * Creates a test harness with the auditTrail component registered,
 * which is required for full action execution (postCashEntryInternal
 * uses the AuditTrail component for rejection auditing).
 */
function createActionHarness() {
	process.env.DISABLE_GT_HASHCHAIN = "true";
	process.env.DISABLE_CASH_LEDGER_HASHCHAIN = "true";
	const t = convexTest(schema, modules);
	auditLogTest.register(t, "auditLog");
	t.registerComponent("auditTrail", auditTrailSchema, auditTrailModules);
	return t;
}

type ActionHarness = ReturnType<typeof createActionHarness>;

/**
 * Seed all entities required for a processPayoutBatch E2E run:
 * - broker, borrower, lender(s), property, mortgage
 * - LENDER_PAYABLE and TRUST_CASH cash ledger accounts (pre-funded)
 * - pending dispersalEntries eligible for payout
 *
 * Returns IDs for assertions.
 */
async function seedPayoutScenario(
	t: ActionHarness,
	opts?: {
		/** Create a second mortgage with separate entries to test grouping. */
		twoMortgages?: boolean;
	}
) {
	return t.run(async (ctx) => {
		const now = Date.now();

		// Broker
		const brokerUserId = await ctx.db.insert("users", {
			authId: "e2e-payout-broker",
			email: "e2e-payout-broker@fairlend.test",
			firstName: "Broker",
			lastName: "E2E",
		});
		const brokerId = await ctx.db.insert("brokers", {
			status: "active",
			userId: brokerUserId,
			createdAt: now,
		});

		// Borrower
		const borrowerUserId = await ctx.db.insert("users", {
			authId: "e2e-payout-borrower",
			email: "e2e-payout-borrower@fairlend.test",
			firstName: "Borrower",
			lastName: "E2E",
		});
		const borrowerId = await ctx.db.insert("borrowers", {
			status: "active",
			userId: borrowerUserId,
			createdAt: now,
		});

		// Lender (active, no lastPayoutDate so payout is immediately due)
		const lenderUserId = await ctx.db.insert("users", {
			authId: "e2e-payout-lender",
			email: "e2e-payout-lender@fairlend.test",
			firstName: "Lender",
			lastName: "E2E",
		});
		const lenderId = await ctx.db.insert("lenders", {
			userId: lenderUserId,
			brokerId,
			accreditationStatus: "accredited",
			onboardingEntryPath: "/tests/e2e-payout",
			status: "active",
			createdAt: now,
		});

		// Property
		const propertyId = await ctx.db.insert("properties", {
			streetAddress: "99 Payout Test Rd",
			city: "Toronto",
			province: "ON",
			postalCode: "M5V 3A3",
			propertyType: "residential",
			createdAt: now,
		});

		// Mortgage A
		const mortgageAId = await ctx.db.insert("mortgages", {
			status: "active",
			propertyId,
			principal: 10_000_000,
			annualServicingRate: 0.01,
			interestRate: 0.08,
			rateType: "fixed",
			termMonths: 12,
			amortizationMonths: 12,
			paymentAmount: 100_000,
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

		// Cash ledger accounts for mortgage A
		// LENDER_PAYABLE (credit-normal): credits > debits = positive payable balance
		await ctx.db.insert("cash_ledger_accounts", {
			family: "LENDER_PAYABLE",
			mortgageId: mortgageAId,
			lenderId,
			cumulativeDebits: 0n,
			cumulativeCredits: 500_000n, // $5,000 payable balance
			createdAt: now,
		});
		// TRUST_CASH (debit-normal): debits > credits = positive trust balance
		await ctx.db.insert("cash_ledger_accounts", {
			family: "TRUST_CASH",
			mortgageId: mortgageAId,
			cumulativeDebits: 1_000_000n, // $10,000 trust balance
			cumulativeCredits: 0n,
			createdAt: now,
		});

		// Obligation for dispersal entries
		const obligationAId = await ctx.db.insert("obligations", {
			status: "settled",
			machineContext: {},
			lastTransitionAt: now,
			mortgageId: mortgageAId,
			borrowerId,
			paymentNumber: 1,
			type: "regular_interest",
			amount: 10_000,
			amountSettled: 10_000,
			dueDate: Date.parse("2026-02-01T00:00:00Z"),
			gracePeriodEnd: Date.parse("2026-02-16T00:00:00Z"),
			createdAt: now,
		});

		// Ledger account for ownership position
		const lenderAccountAId = await ctx.db.insert("ledger_accounts", {
			type: "POSITION",
			mortgageId: mortgageAId as unknown as string,
			lenderId: lenderId as unknown as string,
			cumulativeDebits: 0n,
			cumulativeCredits: 0n,
			createdAt: now,
		});

		// Dispersal entry A1 — eligible for payout
		const entryA1Id = await ctx.db.insert("dispersalEntries", {
			mortgageId: mortgageAId,
			lenderId,
			lenderAccountId: lenderAccountAId,
			amount: 3000,
			dispersalDate: "2026-02-01",
			obligationId: obligationAId,
			servicingFeeDeducted: 50,
			status: "pending",
			idempotencyKey: "e2e-dispersal-a1",
			calculationDetails: CALC_DETAILS,
			payoutEligibleAfter: "2026-02-15",
			createdAt: now,
		});

		// Dispersal entry A2 — eligible for payout (same mortgage)
		const entryA2Id = await ctx.db.insert("dispersalEntries", {
			mortgageId: mortgageAId,
			lenderId,
			lenderAccountId: lenderAccountAId,
			amount: 2000,
			dispersalDate: "2026-02-15",
			obligationId: obligationAId,
			servicingFeeDeducted: 30,
			status: "pending",
			idempotencyKey: "e2e-dispersal-a2",
			calculationDetails: CALC_DETAILS,
			payoutEligibleAfter: "2026-02-28",
			createdAt: now,
		});

		const result: {
			lenderId: Id<"lenders">;
			mortgageAId: Id<"mortgages">;
			entryA1Id: Id<"dispersalEntries">;
			entryA2Id: Id<"dispersalEntries">;
			borrowerId: Id<"borrowers">;
			brokerId: Id<"brokers">;
			mortgageBId?: Id<"mortgages">;
			entryB1Id?: Id<"dispersalEntries">;
		} = {
			lenderId,
			mortgageAId,
			entryA1Id,
			entryA2Id,
			borrowerId,
			brokerId,
		};

		// Optionally create a second mortgage with its own entries
		if (opts?.twoMortgages) {
			const propertyBId = await ctx.db.insert("properties", {
				streetAddress: "101 Payout Test Rd",
				city: "Toronto",
				province: "ON",
				postalCode: "M5V 3A4",
				propertyType: "residential",
				createdAt: now,
			});

			const mortgageBId = await ctx.db.insert("mortgages", {
				status: "active",
				propertyId: propertyBId,
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
				brokerOfRecordId: brokerId,
				createdAt: now,
			});

			// Cash ledger accounts for mortgage B
			await ctx.db.insert("cash_ledger_accounts", {
				family: "LENDER_PAYABLE",
				mortgageId: mortgageBId,
				lenderId,
				cumulativeDebits: 0n,
				cumulativeCredits: 300_000n,
				createdAt: now,
			});
			await ctx.db.insert("cash_ledger_accounts", {
				family: "TRUST_CASH",
				mortgageId: mortgageBId,
				cumulativeDebits: 500_000n,
				cumulativeCredits: 0n,
				createdAt: now,
			});

			const obligationBId = await ctx.db.insert("obligations", {
				status: "settled",
				machineContext: {},
				lastTransitionAt: now,
				mortgageId: mortgageBId,
				borrowerId,
				paymentNumber: 1,
				type: "regular_interest",
				amount: 5000,
				amountSettled: 5000,
				dueDate: Date.parse("2026-02-01T00:00:00Z"),
				gracePeriodEnd: Date.parse("2026-02-16T00:00:00Z"),
				createdAt: now,
			});

			const lenderAccountBId = await ctx.db.insert("ledger_accounts", {
				type: "POSITION",
				mortgageId: mortgageBId as unknown as string,
				lenderId: lenderId as unknown as string,
				cumulativeDebits: 0n,
				cumulativeCredits: 0n,
				createdAt: now,
			});

			const entryB1Id = await ctx.db.insert("dispersalEntries", {
				mortgageId: mortgageBId,
				lenderId,
				lenderAccountId: lenderAccountBId,
				amount: 4000,
				dispersalDate: "2026-02-01",
				obligationId: obligationBId,
				servicingFeeDeducted: 40,
				status: "pending",
				idempotencyKey: "e2e-dispersal-b1",
				calculationDetails: CALC_DETAILS,
				payoutEligibleAfter: "2026-02-15",
				createdAt: now,
			});

			result.mortgageBId = mortgageBId;
			result.entryB1Id = entryB1Id;
		}

		return result;
	});
}

describe("processPayoutBatch — E2E integration", () => {
	it("creates one transfer-owned payout per eligible entry, disburses them, and updates lastPayoutDate", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-03-20T08:00:00.000Z"));

		try {
			const t = createActionHarness();
			const seeded = await seedPayoutScenario(t);

			// Run the batch payout action
			await t.action(
				internal.payments.payout.batchPayout.processPayoutBatch,
				{}
			);

			// (1) Assert one journal entry per transfer / dispersal entry
			await t.run(async (ctx) => {
				const journalEntries = await ctx.db
					.query("cash_ledger_journal_entries")
					.collect();

				const payoutEntries = journalEntries.filter(
					(e) => e.entryType === "LENDER_PAYOUT_SENT"
				);
				expect(payoutEntries).toHaveLength(2);
				expect(
					payoutEntries
						.map((entry) => Number(entry.amount))
						.sort((a, b) => a - b)
				).toEqual([2000, 3000]);
				for (const entry of payoutEntries) {
					expect(entry.mortgageId).toBe(seeded.mortgageAId);
					expect(entry.lenderId).toBe(seeded.lenderId);
					expect(entry.transferRequestId).toBeDefined();
					expect(entry.idempotencyKey).toContain("cash-ledger:");
					expect(entry.idempotencyKey).toContain("lender-payout-sent");
				}
			});

			// (2) Assert dispersalEntries are marked disbursed with payoutDate and linked transfer
			await t.run(async (ctx) => {
				const entryA1 = await ctx.db.get(seeded.entryA1Id);
				const entryA2 = await ctx.db.get(seeded.entryA2Id);

				expect(entryA1).not.toBeNull();
				expect(entryA1?.status).toBe("disbursed");
				expect(entryA1?.payoutDate).toBe("2026-03-20");
				expect(entryA1?.transferRequestId).toBeDefined();

				expect(entryA2).not.toBeNull();
				expect(entryA2?.status).toBe("disbursed");
				expect(entryA2?.payoutDate).toBe("2026-03-20");
				expect(entryA2?.transferRequestId).toBeDefined();
			});

			// (3) Assert lender's lastPayoutDate is updated
			await t.run(async (ctx) => {
				const lender = await ctx.db.get(seeded.lenderId);
				expect(lender).not.toBeNull();
				expect(lender?.lastPayoutDate).toBe("2026-03-20");
			});
		} finally {
			vi.useRealTimers();
		}
	});

	it("creates separate transfer-owned payouts for every eligible entry across mortgages", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-03-20T08:00:00.000Z"));

		try {
			const t = createActionHarness();
			const seeded = await seedPayoutScenario(t, { twoMortgages: true });

			await t.action(
				internal.payments.payout.batchPayout.processPayoutBatch,
				{}
			);

			// Verify one LENDER_PAYOUT_SENT entry per dispersal entry
			await t.run(async (ctx) => {
				const journalEntries = await ctx.db
					.query("cash_ledger_journal_entries")
					.collect();

				const payoutEntries = journalEntries.filter(
					(e) => e.entryType === "LENDER_PAYOUT_SENT"
				);
				expect(payoutEntries).toHaveLength(3);
				expect(
					payoutEntries
						.map((entry) => Number(entry.amount))
						.sort((a, b) => a - b)
				).toEqual([2000, 3000, 4000]);
			});

			// All three dispersal entries should be disbursed
			await t.run(async (ctx) => {
				const entryA1 = await ctx.db.get(seeded.entryA1Id);
				const entryA2 = await ctx.db.get(seeded.entryA2Id);
				if (!seeded.entryB1Id) {
					throw new Error(
						"entryB1Id should be defined in twoMortgages scenario"
					);
				}
				const entryB1 = await ctx.db.get(seeded.entryB1Id);

				expect(entryA1?.status).toBe("disbursed");
				expect(entryA2?.status).toBe("disbursed");
				expect(entryB1?.status).toBe("disbursed");
				expect(entryA1?.transferRequestId).toBeDefined();
				expect(entryA2?.transferRequestId).toBeDefined();
				expect(entryB1?.transferRequestId).toBeDefined();
			});

			// lastPayoutDate updated once for the lender
			await t.run(async (ctx) => {
				const lender = await ctx.db.get(seeded.lenderId);
				expect(lender?.lastPayoutDate).toBe("2026-03-20");
			});
		} finally {
			vi.useRealTimers();
		}
	});
});
