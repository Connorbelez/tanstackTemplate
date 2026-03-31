import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "../../_generated/api";
import schema from "../../schema";
import { convexModules } from "../../test/moduleMaps";

const modules = convexModules;

// ---------------------------------------------------------------------------
// Constants (mirror the implementation)
// ---------------------------------------------------------------------------

const GRACE_PERIOD_DAYS = 15;
const MS_PER_DAY = 86_400_000;
const PERIODS_PER_YEAR: Record<string, number> = {
	monthly: 12,
	bi_weekly: 26,
	accelerated_bi_weekly: 26,
	weekly: 52,
};

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const PRINCIPAL = 50_000_000; // $500,000 in cents
const INTEREST_RATE = 0.08; // 8% annual

// Error patterns (must be top-level for biome lint/performance/useTopLevelRegex)
const MORTGAGE_NOT_FOUND_PATTERN = /Mortgage not found/;
const NO_BORROWER_FOUND_PATTERN = /No borrower found for mortgage/;

// ---------------------------------------------------------------------------
// Seed helper
// ---------------------------------------------------------------------------

interface SeedOverrides {
	firstPaymentDate?: string;
	interestRate?: number;
	maturityDate?: string;
	paymentFrequency?:
		| "monthly"
		| "bi_weekly"
		| "accelerated_bi_weekly"
		| "weekly";
	principal?: number;
	skipBorrowerLink?: boolean;
	termMonths?: number;
}

function createTestHarness() {
	return convexTest(schema, modules);
}

async function seedMortgageWithBorrower(
	t: ReturnType<typeof createTestHarness>,
	overrides: SeedOverrides = {}
) {
	return await t.run(async (ctx) => {
		// 1. Seed a user (required by borrowers and brokers)
		const userId = await ctx.db.insert("users", {
			authId: "test_auth_user_001",
			email: "test@example.com",
			firstName: "Test",
			lastName: "User",
		});

		// 2. Seed a property
		const propertyId = await ctx.db.insert("properties", {
			streetAddress: "123 Test St",
			city: "Toronto",
			province: "ON",
			postalCode: "M5V 1A1",
			propertyType: "residential",
			createdAt: Date.now(),
		});

		// 3. Seed a borrower
		const borrowerId = await ctx.db.insert("borrowers", {
			status: "active",
			userId,
			createdAt: Date.now(),
		});

		// 4. Seed a broker
		const brokerId = await ctx.db.insert("brokers", {
			status: "active",
			userId,
			createdAt: Date.now(),
		});

		// 5. Seed the mortgage
		const paymentFrequency = overrides.paymentFrequency ?? "monthly";
		const principal = overrides.principal ?? PRINCIPAL;
		const interestRate = overrides.interestRate ?? INTEREST_RATE;
		const termMonths = overrides.termMonths ?? 12;
		const firstPaymentDate = overrides.firstPaymentDate ?? "2026-01-15";
		const maturityDate = overrides.maturityDate ?? "2026-12-15";
		const periodsPerYear = PERIODS_PER_YEAR[paymentFrequency] ?? 12;
		const paymentAmount = Math.round(
			(interestRate * principal) / periodsPerYear
		);

		const mortgageId = await ctx.db.insert("mortgages", {
			status: "active",
			propertyId,
			principal,
			interestRate,
			rateType: "fixed",
			termMonths,
			amortizationMonths: termMonths,
			paymentAmount,
			paymentFrequency,
			loanType: "conventional",
			lienPosition: 1,
			interestAdjustmentDate: firstPaymentDate,
			termStartDate: firstPaymentDate,
			maturityDate,
			firstPaymentDate,
			brokerOfRecordId: brokerId,
			createdAt: Date.now(),
		});

		// 6. Link borrower to mortgage (unless skipped)
		if (!overrides.skipBorrowerLink) {
			await ctx.db.insert("mortgageBorrowers", {
				mortgageId,
				borrowerId,
				role: "primary",
				addedAt: Date.now(),
			});
		}

		return { mortgageId, borrowerId, propertyId, brokerId, userId };
	});
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Replicates the advanceMonth logic from generate.ts to compute expected dates.
 */
function advanceMonth(date: Date): Date {
	const result = new Date(date);
	const targetMonth = result.getMonth() + 1;
	result.setMonth(targetMonth);
	if (result.getMonth() !== targetMonth % 12) {
		result.setDate(0);
	}
	return result;
}

/**
 * Compute expected obligation dates for the given frequency and date range.
 */
function computeExpectedDates(
	firstPaymentDate: string,
	maturityDate: string,
	frequency: "monthly" | "bi_weekly" | "accelerated_bi_weekly" | "weekly"
): number[] {
	const firstTs = new Date(firstPaymentDate).getTime();
	const maturityTs = new Date(maturityDate).getTime();
	const dates: number[] = [];
	let current = new Date(firstTs);

	while (current.getTime() <= maturityTs) {
		dates.push(current.getTime());
		if (frequency === "monthly") {
			current = advanceMonth(current);
		} else if (
			frequency === "bi_weekly" ||
			frequency === "accelerated_bi_weekly"
		) {
			current = new Date(current.getTime() + 14 * MS_PER_DAY);
		} else {
			current = new Date(current.getTime() + 7 * MS_PER_DAY);
		}
	}

	return dates;
}

// ---------------------------------------------------------------------------
// generateObligations tests
// ---------------------------------------------------------------------------

describe("generateObligations", () => {
	it("generates correct obligations for a monthly mortgage", async () => {
		const t = createTestHarness();
		const firstPaymentDate = "2026-01-15";
		const maturityDate = "2026-12-15";
		const { mortgageId } = await seedMortgageWithBorrower(t, {
			firstPaymentDate,
			maturityDate,
			paymentFrequency: "monthly",
		});

		const result = await t.mutation(
			internal.payments.obligations.generate.generateObligations,
			{ mortgageId }
		);

		const expectedDates = computeExpectedDates(
			firstPaymentDate,
			maturityDate,
			"monthly"
		);
		const expectedAmount = Math.round((INTEREST_RATE * PRINCIPAL) / 12);

		expect(result.generated).toBe(expectedDates.length);
		expect(result.obligations).toHaveLength(expectedDates.length);
		expect("skipped" in result).toBe(false);

		// Verify in DB
		const obligations = await t.run(async (ctx) => {
			return ctx.db
				.query("obligations")
				.withIndex("by_mortgage", (q) => q.eq("mortgageId", mortgageId))
				.collect();
		});

		expect(obligations).toHaveLength(expectedDates.length);
		expect(expectedAmount).toBe(333_333);

		for (const obligation of obligations) {
			expect(obligation.amount).toBe(expectedAmount);
			expect(obligation.type).toBe("regular_interest");
		}
	});

	it("generates correct obligations for a bi-weekly mortgage", async () => {
		const t = createTestHarness();
		const firstPaymentDate = "2026-04-01";
		const maturityDate = "2026-09-01";
		const { mortgageId } = await seedMortgageWithBorrower(t, {
			paymentFrequency: "bi_weekly",
			termMonths: 6,
			firstPaymentDate,
			maturityDate,
		});

		const result = await t.mutation(
			internal.payments.obligations.generate.generateObligations,
			{ mortgageId }
		);

		const expectedDates = computeExpectedDates(
			firstPaymentDate,
			maturityDate,
			"bi_weekly"
		);
		const expectedAmount = Math.round((INTEREST_RATE * PRINCIPAL) / 26);

		expect(result.generated).toBe(expectedDates.length);
		expect(result.obligations).toHaveLength(expectedDates.length);
		expect(expectedAmount).toBe(153_846);

		// Verify obligation dates are 14 days apart
		const obligations = await t.run(async (ctx) => {
			return ctx.db
				.query("obligations")
				.withIndex("by_mortgage_and_date", (q) =>
					q.eq("mortgageId", mortgageId)
				)
				.collect();
		});

		for (let i = 1; i < obligations.length; i++) {
			const gap = obligations[i].dueDate - obligations[i - 1].dueDate;
			expect(gap).toBe(14 * MS_PER_DAY);
		}
	});

	it("generates correct obligations for a weekly mortgage", async () => {
		const t = createTestHarness();
		const firstPaymentDate = "2026-04-01";
		const maturityDate = "2026-06-01";
		const { mortgageId } = await seedMortgageWithBorrower(t, {
			paymentFrequency: "weekly",
			termMonths: 3,
			firstPaymentDate,
			maturityDate,
		});

		const result = await t.mutation(
			internal.payments.obligations.generate.generateObligations,
			{ mortgageId }
		);

		const expectedDates = computeExpectedDates(
			firstPaymentDate,
			maturityDate,
			"weekly"
		);
		const expectedAmount = Math.round((INTEREST_RATE * PRINCIPAL) / 52);

		expect(result.generated).toBe(expectedDates.length);
		expect(result.obligations).toHaveLength(expectedDates.length);
		expect(expectedAmount).toBe(76_923);

		// Verify obligation dates are 7 days apart
		const obligations = await t.run(async (ctx) => {
			return ctx.db
				.query("obligations")
				.withIndex("by_mortgage_and_date", (q) =>
					q.eq("mortgageId", mortgageId)
				)
				.collect();
		});

		for (let i = 1; i < obligations.length; i++) {
			const gap = obligations[i].dueDate - obligations[i - 1].dueDate;
			expect(gap).toBe(7 * MS_PER_DAY);
		}
	});

	it("sets gracePeriodEnd to dueDate + 15 days for each obligation", async () => {
		const t = createTestHarness();
		const { mortgageId } = await seedMortgageWithBorrower(t);

		await t.mutation(
			internal.payments.obligations.generate.generateObligations,
			{ mortgageId }
		);

		const obligations = await t.run(async (ctx) => {
			return ctx.db
				.query("obligations")
				.withIndex("by_mortgage", (q) => q.eq("mortgageId", mortgageId))
				.collect();
		});

		expect(obligations.length).toBeGreaterThan(0);
		for (const obligation of obligations) {
			expect(obligation.gracePeriodEnd).toBe(
				obligation.dueDate + GRACE_PERIOD_DAYS * MS_PER_DAY
			);
		}
	});

	it("sets machineContext with obligationId and paymentsApplied: 0", async () => {
		const t = createTestHarness();
		const { mortgageId } = await seedMortgageWithBorrower(t);

		await t.mutation(
			internal.payments.obligations.generate.generateObligations,
			{ mortgageId }
		);

		const obligations = await t.run(async (ctx) => {
			return ctx.db
				.query("obligations")
				.withIndex("by_mortgage", (q) => q.eq("mortgageId", mortgageId))
				.collect();
		});

		expect(obligations.length).toBeGreaterThan(0);
		for (const obligation of obligations) {
			expect(obligation.machineContext).toEqual({
				obligationId: obligation._id,
				paymentsApplied: 0,
			});
		}
	});

	it("sets all obligations to 'upcoming' status", async () => {
		const t = createTestHarness();
		const { mortgageId } = await seedMortgageWithBorrower(t);

		await t.mutation(
			internal.payments.obligations.generate.generateObligations,
			{ mortgageId }
		);

		const obligations = await t.run(async (ctx) => {
			return ctx.db
				.query("obligations")
				.withIndex("by_mortgage", (q) => q.eq("mortgageId", mortgageId))
				.collect();
		});

		expect(obligations.length).toBeGreaterThan(0);
		for (const obligation of obligations) {
			expect(obligation.status).toBe("upcoming");
		}
	});

	it("assigns sequential payment numbers starting from 1", async () => {
		const t = createTestHarness();
		const { mortgageId } = await seedMortgageWithBorrower(t);

		await t.mutation(
			internal.payments.obligations.generate.generateObligations,
			{ mortgageId }
		);

		const obligations = await t.run(async (ctx) => {
			return ctx.db
				.query("obligations")
				.withIndex("by_mortgage_and_date", (q) =>
					q.eq("mortgageId", mortgageId)
				)
				.collect();
		});

		expect(obligations.length).toBeGreaterThan(0);
		const paymentNumbers = obligations
			.map((o) => o.paymentNumber)
			.sort((a, b) => a - b);
		for (let i = 0; i < paymentNumbers.length; i++) {
			expect(paymentNumbers[i]).toBe(i + 1);
		}
	});

	it("is idempotent — second call returns skipped: true", async () => {
		const t = createTestHarness();
		const { mortgageId } = await seedMortgageWithBorrower(t);

		const first = await t.mutation(
			internal.payments.obligations.generate.generateObligations,
			{ mortgageId }
		);
		expect(first.generated).toBeGreaterThan(0);
		expect("skipped" in first).toBe(false);

		const second = await t.mutation(
			internal.payments.obligations.generate.generateObligations,
			{ mortgageId }
		);
		expect(second.generated).toBe(0);
		expect(second.obligations).toHaveLength(0);
		expect("skipped" in second && second.skipped).toBe(true);
	});

	it("throws when mortgage does not exist", async () => {
		const t = createTestHarness();
		// Create a valid-format but nonexistent mortgage ID by seeding then deleting
		const { mortgageId } = await seedMortgageWithBorrower(t);
		await t.run(async (ctx) => {
			await ctx.db.delete(mortgageId);
		});

		await expect(
			t.mutation(internal.payments.obligations.generate.generateObligations, {
				mortgageId,
			})
		).rejects.toThrow(MORTGAGE_NOT_FOUND_PATTERN);
	});

	it("throws when no borrower is linked to the mortgage", async () => {
		const t = createTestHarness();
		const { mortgageId } = await seedMortgageWithBorrower(t, {
			skipBorrowerLink: true,
		});

		await expect(
			t.mutation(internal.payments.obligations.generate.generateObligations, {
				mortgageId,
			})
		).rejects.toThrow(NO_BORROWER_FOUND_PATTERN);
	});
});

// ---------------------------------------------------------------------------
// Obligation query tests
// ---------------------------------------------------------------------------

describe("obligation queries", () => {
	it("getObligationsByMortgage returns all obligations for a mortgage", async () => {
		const t = createTestHarness();
		const { mortgageId } = await seedMortgageWithBorrower(t);

		const genResult = await t.mutation(
			internal.payments.obligations.generate.generateObligations,
			{ mortgageId }
		);

		const obligations = await t.query(
			internal.payments.obligations.queries.getObligationsByMortgage,
			{ mortgageId }
		);

		expect(obligations).toHaveLength(genResult.generated);
	});

	it("getObligationsByMortgage with status filter returns only matching", async () => {
		const t = createTestHarness();
		const { mortgageId } = await seedMortgageWithBorrower(t);

		await t.mutation(
			internal.payments.obligations.generate.generateObligations,
			{ mortgageId }
		);

		// All generated obligations are "upcoming"
		const upcoming = await t.query(
			internal.payments.obligations.queries.getObligationsByMortgage,
			{ mortgageId, status: "upcoming" }
		);
		expect(upcoming.length).toBeGreaterThan(0);

		// No obligations should be "overdue" since they all start as "upcoming"
		const overdue = await t.query(
			internal.payments.obligations.queries.getObligationsByMortgage,
			{ mortgageId, status: "overdue" }
		);
		expect(overdue).toHaveLength(0);
	});

	it("getUpcomingDue returns obligations due at or before a given timestamp", async () => {
		const t = createTestHarness();
		const { mortgageId } = await seedMortgageWithBorrower(t, {
			firstPaymentDate: "2026-01-15",
			maturityDate: "2026-12-15",
			paymentFrequency: "monthly",
		});

		await t.mutation(
			internal.payments.obligations.generate.generateObligations,
			{ mortgageId }
		);

		// Query for obligations due on or before mid-year
		const midYear = new Date("2026-06-30").getTime();
		const due = await t.query(
			internal.payments.obligations.queries.getUpcomingDue,
			{ asOf: midYear }
		);

		// All returned should have dueDate <= midYear
		expect(due.length).toBeGreaterThan(0);
		for (const o of due) {
			expect(o.dueDate).toBeLessThanOrEqual(midYear);
			expect(o.status).toBe("upcoming");
		}
	});

	it("getOverdue returns empty for freshly generated obligations", async () => {
		const t = createTestHarness();
		const { mortgageId } = await seedMortgageWithBorrower(t);

		await t.mutation(
			internal.payments.obligations.generate.generateObligations,
			{ mortgageId }
		);

		const overdue = await t.query(
			internal.payments.obligations.queries.getOverdue,
			{ mortgageId }
		);

		expect(overdue).toHaveLength(0);
	});
});
