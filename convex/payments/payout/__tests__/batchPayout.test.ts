import { describe, expect, it } from "vitest";
import type { Id } from "../../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../../_generated/server";
import {
	createHarness,
	seedMinimalEntities,
} from "../../cashLedger/__tests__/testUtils";
import { markEntriesDisbursed } from "../mutations";
import {
	getEligibleDispersalEntries,
	getLendersWithPayableBalance,
} from "../queries";

const modules = import.meta.glob("/convex/**/*.ts");

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
const getLendersQuery =
	getLendersWithPayableBalance as unknown as GetLendersHandler;
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

	// ── getLendersWithPayableBalance ─────────────────────────────

	describe("getLendersWithPayableBalance", () => {
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

			// Verify both entries now have status "disbursed"
			await t.run(async (ctx) => {
				for (const id of entryIds) {
					const entry = await ctx.db.get(id);
					expect(entry).not.toBeNull();
					expect(entry?.status).toBe("disbursed");
				}
			});
		});
	});
});
