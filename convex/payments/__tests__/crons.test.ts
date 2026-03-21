import auditLogTest from "convex-audit-log/test";
import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";
import workflowSchema from "../../../node_modules/@convex-dev/workflow/dist/component/schema.js";
import workpoolSchema from "../../../node_modules/@convex-dev/workpool/dist/component/schema.js";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import auditTrailSchema from "../../components/auditTrail/schema";
import schema from "../../schema";

const modules = import.meta.glob("/convex/**/*.ts");
const auditTrailModules = import.meta.glob(
	"/convex/components/auditTrail/**/*.ts"
);
const workflowModules = import.meta.glob(
	"/node_modules/@convex-dev/workflow/dist/component/**/*.js"
);
const workpoolModules = import.meta.glob(
	"/node_modules/@convex-dev/workpool/dist/component/**/*.js"
);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MS_PER_DAY = 86_400_000;
const GRACE_PERIOD_DAYS = 15;

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

type TestHarness = ReturnType<typeof convexTest>;

function createTestHarness(): TestHarness {
	const t = convexTest(schema, modules);
	auditLogTest.register(t, "auditLog");
	t.registerComponent("auditTrail", auditTrailSchema, auditTrailModules);
	t.registerComponent("workflow", workflowSchema, workflowModules);
	t.registerComponent("workflow/workpool", workpoolSchema, workpoolModules);
	return t;
}

/**
 * Seed a mortgage with a linked borrower and return IDs needed for obligation seeding.
 */
async function seedMortgageWithBorrower(
	t: ReturnType<typeof createTestHarness>
) {
	return await t.run(async (ctx) => {
		const userId = await ctx.db.insert("users", {
			authId: "test_auth_cron_001",
			email: "cron-test@example.com",
			firstName: "Cron",
			lastName: "Test",
		});

		const propertyId = await ctx.db.insert("properties", {
			streetAddress: "456 Cron Ave",
			city: "Toronto",
			province: "ON",
			postalCode: "M5V 2B2",
			propertyType: "residential",
			createdAt: Date.now(),
		});

		const borrowerId = await ctx.db.insert("borrowers", {
			status: "active",
			userId,
			createdAt: Date.now(),
		});

		const brokerId = await ctx.db.insert("brokers", {
			status: "active",
			userId,
			createdAt: Date.now(),
		});

		const mortgageId = await ctx.db.insert("mortgages", {
			status: "active",
			propertyId,
			principal: 50_000_000,
			interestRate: 0.08,
			rateType: "fixed",
			termMonths: 12,
			amortizationMonths: 12,
			paymentAmount: 333_333,
			paymentFrequency: "monthly",
			loanType: "conventional",
			lienPosition: 1,
			interestAdjustmentDate: "2026-01-15",
			termStartDate: "2026-01-15",
			maturityDate: "2026-12-15",
			firstPaymentDate: "2026-01-15",
			brokerOfRecordId: brokerId,
			createdAt: Date.now(),
		});

		return { mortgageId, borrowerId, brokerId, userId, propertyId };
	});
}

/**
 * Directly seed an obligation with the given status and dates.
 */
async function seedObligation(
	t: ReturnType<typeof createTestHarness>,
	opts: {
		mortgageId: Id<"mortgages">;
		borrowerId: Id<"borrowers">;
		status: string;
		dueDate: number;
		gracePeriodEnd: number;
		paymentNumber?: number;
		settledAt?: number;
	}
): Promise<Id<"obligations">> {
	return await t.run(async (ctx) => {
		return ctx.db.insert("obligations", {
			status: opts.status,
			machineContext: { obligationId: "", paymentsApplied: 0 },
			mortgageId: opts.mortgageId,
			borrowerId: opts.borrowerId,
			paymentNumber: opts.paymentNumber ?? 1,
			type: "regular_interest",
			amount: 333_333,
			amountSettled: 0,
			dueDate: opts.dueDate,
			gracePeriodEnd: opts.gracePeriodEnd,
			settledAt: opts.settledAt,
			createdAt: Date.now(),
		});
	});
}

async function seedObligationBatch(
	t: ReturnType<typeof createTestHarness>,
	opts: {
		mortgageId: Id<"mortgages">;
		borrowerId: Id<"borrowers">;
		status: string;
		dueDate: number;
		gracePeriodEnd: number;
		count: number;
		startPaymentNumber?: number;
	}
) {
	const ids: Id<"obligations">[] = [];
	for (let index = 0; index < opts.count; index += 1) {
		ids.push(
			await seedObligation(t, {
				mortgageId: opts.mortgageId,
				borrowerId: opts.borrowerId,
				status: opts.status,
				dueDate: opts.dueDate,
				gracePeriodEnd: opts.gracePeriodEnd,
				paymentNumber: (opts.startPaymentNumber ?? 1) + index,
			})
		);
	}
	return ids;
}

async function getCronMonitoring(t: ReturnType<typeof createTestHarness>) {
	return t.query(
		internal.payments.obligations.monitoring.getBatchOverflowMetrics,
		{
			jobName: "daily obligation transitions",
		}
	);
}

// ---------------------------------------------------------------------------
// processObligationTransitions tests
// ---------------------------------------------------------------------------

describe("processObligationTransitions", () => {
	it("transitions upcoming obligations to due when dueDate <= now", async () => {
		const t = createTestHarness();
		const { mortgageId, borrowerId } = await seedMortgageWithBorrower(t);

		const pastDueDate = Date.now() - MS_PER_DAY; // yesterday
		const gracePeriodEnd = pastDueDate + GRACE_PERIOD_DAYS * MS_PER_DAY;

		const obligationId = await seedObligation(t, {
			mortgageId,
			borrowerId,
			status: "upcoming",
			dueDate: pastDueDate,
			gracePeriodEnd,
		});

		// Run the cron action
		await t.action(
			internal.payments.obligations.crons.processObligationTransitions,
			{}
		);

		// Verify obligation transitioned to "due"
		const obligation = await t.run(async (ctx) => {
			return ctx.db.get(obligationId);
		});
		expect(obligation).not.toBeNull();
		expect(obligation?.status).toBe("due");
	});

	it("transitions due obligations to overdue when gracePeriodEnd <= now", async () => {
		vi.useFakeTimers();
		const t = createTestHarness();
		const { mortgageId, borrowerId } = await seedMortgageWithBorrower(t);

		const pastDueDate = Date.now() - 20 * MS_PER_DAY;
		const gracePeriodEnd = Date.now() - MS_PER_DAY; // grace expired yesterday

		const obligationId = await seedObligation(t, {
			mortgageId,
			borrowerId,
			status: "due",
			dueDate: pastDueDate,
			gracePeriodEnd,
		});

		await t.action(
			internal.payments.obligations.crons.processObligationTransitions,
			{}
		);

		// Drain scheduled effects (emitObligationOverdue, createLateFeeObligation)
		await t.finishAllScheduledFunctions(vi.runAllTimers);

		const obligation = await t.run(async (ctx) => {
			return ctx.db.get(obligationId);
		});
		expect(obligation).not.toBeNull();
		expect(obligation?.status).toBe("overdue");
		vi.useRealTimers();
	});

	it("does not transition obligations that are not yet due", async () => {
		const t = createTestHarness();
		const { mortgageId, borrowerId } = await seedMortgageWithBorrower(t);

		const futureDueDate = Date.now() + 7 * MS_PER_DAY; // 7 days from now
		const gracePeriodEnd = futureDueDate + GRACE_PERIOD_DAYS * MS_PER_DAY;

		const obligationId = await seedObligation(t, {
			mortgageId,
			borrowerId,
			status: "upcoming",
			dueDate: futureDueDate,
			gracePeriodEnd,
		});

		await t.action(
			internal.payments.obligations.crons.processObligationTransitions,
			{}
		);

		const obligation = await t.run(async (ctx) => {
			return ctx.db.get(obligationId);
		});
		expect(obligation).not.toBeNull();
		expect(obligation?.status).toBe("upcoming");
	});

	it("one failure does not abort the batch — other obligations still transition", async () => {
		const t = createTestHarness();
		const { mortgageId, borrowerId } = await seedMortgageWithBorrower(t);

		const pastDueDate = Date.now() - MS_PER_DAY;
		const gracePeriodEnd = pastDueDate + GRACE_PERIOD_DAYS * MS_PER_DAY;

		// Seed an obligation that is already "due" — BECAME_DUE will be rejected
		// (not thrown) by the GT engine since "due" does not handle BECAME_DUE
		const alreadyDueId = await seedObligation(t, {
			mortgageId,
			borrowerId,
			status: "due",
			dueDate: pastDueDate,
			gracePeriodEnd,
			paymentNumber: 1,
		});

		// Seed a valid "upcoming" obligation that should transition successfully
		const upcomingId = await seedObligation(t, {
			mortgageId,
			borrowerId,
			status: "upcoming",
			dueDate: pastDueDate,
			gracePeriodEnd,
			paymentNumber: 2,
		});

		await t.action(
			internal.payments.obligations.crons.processObligationTransitions,
			{}
		);

		// The valid upcoming obligation should have transitioned
		const upcomingObligation = await t.run(async (ctx) => {
			return ctx.db.get(upcomingId);
		});
		expect(upcomingObligation).not.toBeNull();
		expect(upcomingObligation?.status).toBe("due");

		// The already-due obligation stays "due" (BECAME_DUE rejected, not thrown)
		const alreadyDueObligation = await t.run(async (ctx) => {
			return ctx.db.get(alreadyDueId);
		});
		expect(alreadyDueObligation).not.toBeNull();
		expect(alreadyDueObligation?.status).toBe("due");
	});

	it("processes both phases in a single run", async () => {
		vi.useFakeTimers();
		const t = createTestHarness();
		const { mortgageId, borrowerId } = await seedMortgageWithBorrower(t);

		const now = Date.now();

		// Phase 1 candidate: upcoming, dueDate in the past
		const upcomingId = await seedObligation(t, {
			mortgageId,
			borrowerId,
			status: "upcoming",
			dueDate: now - MS_PER_DAY,
			gracePeriodEnd: now + 14 * MS_PER_DAY,
			paymentNumber: 1,
		});

		// Phase 2 candidate: due, grace period expired
		const dueId = await seedObligation(t, {
			mortgageId,
			borrowerId,
			status: "due",
			dueDate: now - 20 * MS_PER_DAY,
			gracePeriodEnd: now - MS_PER_DAY,
			paymentNumber: 2,
		});

		await t.action(
			internal.payments.obligations.crons.processObligationTransitions,
			{}
		);

		// Drain scheduled effects from GRACE_PERIOD_EXPIRED
		await t.finishAllScheduledFunctions(vi.runAllTimers);

		const [upcomingObl, dueObl] = await t.run(async (ctx) => {
			return Promise.all([ctx.db.get(upcomingId), ctx.db.get(dueId)]);
		});

		expect(upcomingObl?.status).toBe("due");
		expect(dueObl?.status).toBe("overdue");
		vi.useRealTimers();
	});

	it("logs batch overflow warnings and records the UTC business-date streak", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-03-21T06:00:00.000Z"));
		const warnSpy = vi
			.spyOn(console, "warn")
			.mockImplementation(() => undefined);

		try {
			const t = createTestHarness();
			const { mortgageId, borrowerId } = await seedMortgageWithBorrower(t);

			await seedObligationBatch(t, {
				mortgageId,
				borrowerId,
				status: "upcoming",
				dueDate: Date.now() - MS_PER_DAY,
				gracePeriodEnd: Date.now() + GRACE_PERIOD_DAYS * MS_PER_DAY,
				count: 101,
			});

			await t.action(
				internal.payments.obligations.crons.processObligationTransitions,
				{}
			);

			const monitoring = await getCronMonitoring(t);
			expect(monitoring).not.toBeNull();
			expect(monitoring?.lastRunBusinessDate).toBe("2026-03-21");
			expect(monitoring?.newlyDueOverflowStreak).toBe(1);
			expect(monitoring?.lastNewlyDueCount).toBe(101);
			expect(warnSpy).toHaveBeenCalledWith(
				expect.stringContaining("BECAME_DUE batch overflow")
			);
		} finally {
			warnSpy.mockRestore();
			vi.useRealTimers();
		}
	});

	it("resets the overflow streak when the next UTC business day does not overflow", async () => {
		vi.useFakeTimers();
		const warnSpy = vi
			.spyOn(console, "warn")
			.mockImplementation(() => undefined);

		try {
			const t = createTestHarness();
			const { mortgageId, borrowerId } = await seedMortgageWithBorrower(t);

			await seedObligationBatch(t, {
				mortgageId,
				borrowerId,
				status: "upcoming",
				dueDate: Date.UTC(2026, 2, 20, 0, 0, 0, 0),
				gracePeriodEnd: Date.UTC(2026, 3, 4, 0, 0, 0, 0),
				count: 150,
			});

			vi.setSystemTime(new Date("2026-03-21T06:00:00.000Z"));
			await t.action(
				internal.payments.obligations.crons.processObligationTransitions,
				{}
			);

			vi.setSystemTime(new Date("2026-03-22T06:00:00.000Z"));
			await t.action(
				internal.payments.obligations.crons.processObligationTransitions,
				{}
			);

			const monitoring = await getCronMonitoring(t);
			expect(monitoring?.newlyDueOverflowStreak).toBe(0);
			expect(monitoring?.lastRunBusinessDate).toBe("2026-03-22");
			expect(monitoring?.lastNewlyDueCount).toBe(50);
		} finally {
			warnSpy.mockRestore();
			vi.useRealTimers();
		}
	});

	it("does not increment overflow streaks twice when rerun on the same UTC business day", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-03-21T06:00:00.000Z"));
		const warnSpy = vi
			.spyOn(console, "warn")
			.mockImplementation(() => undefined);

		try {
			const t = createTestHarness();
			const { mortgageId, borrowerId } = await seedMortgageWithBorrower(t);

			await seedObligationBatch(t, {
				mortgageId,
				borrowerId,
				status: "upcoming",
				dueDate: Date.now() - MS_PER_DAY,
				gracePeriodEnd: Date.now() + GRACE_PERIOD_DAYS * MS_PER_DAY,
				count: 250,
			});

			await t.action(
				internal.payments.obligations.crons.processObligationTransitions,
				{}
			);
			await t.action(
				internal.payments.obligations.crons.processObligationTransitions,
				{}
			);

			const monitoring = await getCronMonitoring(t);
			expect(monitoring?.newlyDueOverflowStreak).toBe(1);
			expect(monitoring?.lastRunBusinessDate).toBe("2026-03-21");
			expect(monitoring?.lastNewlyDueCount).toBe(150);
		} finally {
			warnSpy.mockRestore();
			vi.useRealTimers();
		}
	});

	it("emits an alert log after more than three consecutive UTC business days of overflow", async () => {
		vi.useFakeTimers();
		const warnSpy = vi
			.spyOn(console, "warn")
			.mockImplementation(() => undefined);
		const errorSpy = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined);

		try {
			const t = createTestHarness();
			const { mortgageId, borrowerId } = await seedMortgageWithBorrower(t);

			await seedObligationBatch(t, {
				mortgageId,
				borrowerId,
				status: "upcoming",
				dueDate: Date.UTC(2026, 2, 15, 0, 0, 0, 0),
				gracePeriodEnd: Date.UTC(2026, 2, 30, 0, 0, 0, 0),
				count: 450,
			});

			for (const day of [21, 22, 23, 24]) {
				vi.setSystemTime(new Date(`2026-03-${day}T06:00:00.000Z`));
				await t.action(
					internal.payments.obligations.crons.processObligationTransitions,
					{}
				);
			}

			const monitoring = await getCronMonitoring(t);
			expect(monitoring?.newlyDueOverflowStreak).toBe(4);
			expect(errorSpy).toHaveBeenCalledWith(
				expect.stringContaining("ALERT: BECAME_DUE overflow persisted")
			);
		} finally {
			errorSpy.mockRestore();
			warnSpy.mockRestore();
			vi.useRealTimers();
		}
	});

	it("preserves legacy obligation date fields as numeric timestamps", async () => {
		const t = createTestHarness();
		const { mortgageId, borrowerId } = await seedMortgageWithBorrower(t);

		const obligationId = await seedObligation(t, {
			mortgageId,
			borrowerId,
			status: "upcoming",
			dueDate: Date.now() - MS_PER_DAY,
			gracePeriodEnd: Date.now() + GRACE_PERIOD_DAYS * MS_PER_DAY,
			settledAt: Date.now() - 2 * MS_PER_DAY,
		});

		await t.action(
			internal.payments.obligations.crons.processObligationTransitions,
			{}
		);

		const obligation = await t.run(async (ctx) => ctx.db.get(obligationId));
		expect(typeof obligation?.dueDate).toBe("number");
		expect(typeof obligation?.gracePeriodEnd).toBe("number");
		expect(typeof obligation?.settledAt).toBe("number");
	});
});
