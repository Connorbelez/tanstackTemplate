import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import workflowSchema from "../../../node_modules/@convex-dev/workflow/dist/component/schema.js";
import workpoolSchema from "../../../node_modules/@convex-dev/workpool/dist/component/schema.js";
import { registerAuditLogComponent } from "../../../src/test/convex/registerAuditLogComponent";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import auditTrailSchema from "../../components/auditTrail/schema";
import schema from "../../schema";
import {
	convexModules,
	auditTrailModules as sharedAuditTrailModules,
	workflowModules as sharedWorkflowModules,
	workpoolModules as sharedWorkpoolModules,
} from "../../test/moduleMaps";
import { processObligationTransitionsImpl } from "../obligations/crons";

const modules = convexModules;
const auditTrailModules = sharedAuditTrailModules;
const workflowModules = sharedWorkflowModules;
const workpoolModules = sharedWorkpoolModules;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MS_PER_DAY = 86_400_000;
const GRACE_PERIOD_DAYS = 7;

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

type TestHarness = ReturnType<typeof convexTest>;

function createTestHarness(): TestHarness {
	const t = convexTest(schema, modules);
	registerAuditLogComponent(t, "auditLog");
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

function createCronSimulationHarness(initial: {
	pastGraceCount?: number;
	rejectBecameDueCount?: number;
	upcomingCount?: number;
}) {
	let nextId = 1;
	let upcomingIds = Array.from(
		{ length: initial.upcomingCount ?? 0 },
		() => `upcoming-${nextId++}` as Id<"obligations">
	);
	let pastGraceIds = Array.from(
		{ length: initial.pastGraceCount ?? 0 },
		() => `past-grace-${nextId++}` as Id<"obligations">
	);
	let monitoring: {
		lastNewlyDueCount: number;
		lastPastGraceCount: number;
		lastRunBusinessDate: string;
		newlyDueOverflowStreak: number;
		pastGraceOverflowStreak: number;
	} | null = null;
	const infos: string[] = [];
	const warnings: string[] = [];
	const errors: string[] = [];
	const transitionCalls: Array<"BECAME_DUE" | "GRACE_PERIOD_EXPIRED"> = [];
	let rejectedBecameDueCount = 0;

	return {
		deps: {
			getBatchOverflowMetrics: async () =>
				monitoring
					? { lastRunBusinessDate: monitoring.lastRunBusinessDate }
					: null,
			getDuePastGrace: async () => pastGraceIds.map((_id) => ({ _id })),
			getUpcomingDue: async () => upcomingIds.map((_id) => ({ _id })),
			logError: (...args: unknown[]) => {
				errors.push(args.map(String).join(" "));
			},
			logInfo: (message: string) => {
				infos.push(message);
			},
			logWarn: (...args: unknown[]) => {
				warnings.push(args.map(String).join(" "));
			},
			recordBatchOverflowMetrics: async (args: {
				jobName: string;
				batchSize: number;
				businessDate: string;
				newlyDueCount: number;
				pastGraceCount: number;
			}) => {
				const newlyDueOverflow = args.newlyDueCount > args.batchSize;
				const pastGraceOverflow = args.pastGraceCount > args.batchSize;

				if (monitoring?.lastRunBusinessDate === args.businessDate) {
					monitoring = {
						...monitoring,
						lastNewlyDueCount: args.newlyDueCount,
						lastPastGraceCount: args.pastGraceCount,
					};
					return {
						isSameBusinessDate: true,
						newlyDueOverflow,
						pastGraceOverflow,
						newlyDueOverflowStreak: monitoring.newlyDueOverflowStreak,
						pastGraceOverflowStreak: monitoring.pastGraceOverflowStreak,
					};
				}

				const nextMonitoring = {
					lastRunBusinessDate: args.businessDate,
					lastNewlyDueCount: args.newlyDueCount,
					lastPastGraceCount: args.pastGraceCount,
					newlyDueOverflowStreak: newlyDueOverflow
						? (monitoring?.newlyDueOverflowStreak ?? 0) + 1
						: 0,
					pastGraceOverflowStreak: pastGraceOverflow
						? (monitoring?.pastGraceOverflowStreak ?? 0) + 1
						: 0,
				};
				monitoring = nextMonitoring;
				return {
					isSameBusinessDate: false,
					newlyDueOverflow,
					pastGraceOverflow,
					newlyDueOverflowStreak: nextMonitoring.newlyDueOverflowStreak,
					pastGraceOverflowStreak: nextMonitoring.pastGraceOverflowStreak,
				};
			},
			transitionObligation: async ({
				entityId,
				eventType,
			}: {
				entityId: Id<"obligations">;
				eventType: "BECAME_DUE" | "GRACE_PERIOD_EXPIRED";
				payload: Record<string, never>;
				source: {
					actorType: "system";
					channel: "scheduler";
				};
			}) => {
				transitionCalls.push(eventType);
				if (eventType === "BECAME_DUE") {
					if (rejectedBecameDueCount < (initial.rejectBecameDueCount ?? 0)) {
						rejectedBecameDueCount += 1;
						upcomingIds = upcomingIds.filter(
							(candidateId) => candidateId !== entityId
						);
						return {
							success: false,
							previousState: "upcoming",
							newState: "upcoming",
							reason: "synthetic rejection",
						};
					}
					upcomingIds = upcomingIds.filter(
						(candidateId) => candidateId !== entityId
					);
					return {
						success: true,
						previousState: "upcoming",
						newState: "due",
					};
				}
				pastGraceIds = pastGraceIds.filter(
					(candidateId) => candidateId !== entityId
				);
				return {
					success: true,
					previousState: "due",
					newState: "overdue",
				};
			},
		},
		getErrors: () => errors,
		getInfos: () => infos,
		getMonitoring: () => monitoring,
		getRemainingCounts: () => ({
			pastGraceCount: pastGraceIds.length,
			upcomingCount: upcomingIds.length,
		}),
		getTransitionCallCount: (
			eventType?: "BECAME_DUE" | "GRACE_PERIOD_EXPIRED"
		) =>
			eventType
				? transitionCalls.filter((call) => call === eventType).length
				: transitionCalls.length,
		getWarnings: () => warnings,
	};
}

// ---------------------------------------------------------------------------
// processObligationTransitions tests
// ---------------------------------------------------------------------------

describe("processObligationTransitions", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	it("transitions upcoming obligations to due when dueDate <= now", async () => {
		const harness = createCronSimulationHarness({ upcomingCount: 1 });

		await processObligationTransitionsImpl(harness.deps, {
			now: Date.parse("2026-04-20T00:00:00.000Z"),
		});

		expect(harness.getRemainingCounts().upcomingCount).toBe(0);
		expect(harness.getTransitionCallCount("BECAME_DUE")).toBe(1);
	});

	it("transitions due obligations to overdue when gracePeriodEnd <= now", async () => {
		const harness = createCronSimulationHarness({ pastGraceCount: 1 });

		await processObligationTransitionsImpl(harness.deps, {
			now: Date.parse("2026-04-20T00:00:00.000Z"),
		});

		expect(harness.getRemainingCounts().pastGraceCount).toBe(0);
		expect(harness.getTransitionCallCount("GRACE_PERIOD_EXPIRED")).toBe(1);
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
		const harness = createCronSimulationHarness({
			rejectBecameDueCount: 1,
			upcomingCount: 2,
		});

		await processObligationTransitionsImpl(harness.deps, {
			now: Date.parse("2026-04-20T00:00:00.000Z"),
		});

		expect(harness.getTransitionCallCount("BECAME_DUE")).toBe(2);
		expect(
			harness
				.getWarnings()
				.some((message) => message.includes("synthetic rejection"))
		).toBe(true);
		expect(harness.getRemainingCounts().upcomingCount).toBe(0);
	});

	it("processes both phases in a single run", async () => {
		const harness = createCronSimulationHarness({
			pastGraceCount: 1,
			upcomingCount: 1,
		});

		await processObligationTransitionsImpl(harness.deps, {
			now: Date.parse("2026-04-20T00:00:00.000Z"),
		});

		expect(harness.getRemainingCounts()).toEqual({
			pastGraceCount: 0,
			upcomingCount: 0,
		});
		expect(harness.getTransitionCallCount("BECAME_DUE")).toBe(1);
		expect(harness.getTransitionCallCount("GRACE_PERIOD_EXPIRED")).toBe(1);
	});

	it("logs batch overflow warnings and records the UTC business-date streak", async () => {
		const harness = createCronSimulationHarness({ upcomingCount: 101 });

		await processObligationTransitionsImpl(harness.deps, {
			now: Date.parse("2026-03-21T06:00:00.000Z"),
		});

		const monitoring = harness.getMonitoring();
		expect(monitoring).not.toBeNull();
		expect(monitoring?.lastRunBusinessDate).toBe("2026-03-21");
		expect(monitoring?.newlyDueOverflowStreak).toBe(1);
		expect(monitoring?.lastNewlyDueCount).toBe(1);
		expect(
			harness
				.getWarnings()
				.some((message) => message.includes("BECAME_DUE batch overflow"))
		).toBe(true);
	});

	it("resets the overflow streak when the next UTC business day does not overflow", async () => {
		const harness = createCronSimulationHarness({ upcomingCount: 150 });

		await processObligationTransitionsImpl(harness.deps, {
			now: Date.parse("2026-03-21T06:00:00.000Z"),
		});
		await processObligationTransitionsImpl(harness.deps, {
			now: Date.parse("2026-03-22T06:00:00.000Z"),
		});

		const monitoring = harness.getMonitoring();
		expect(monitoring?.newlyDueOverflowStreak).toBe(0);
		expect(monitoring?.lastRunBusinessDate).toBe("2026-03-22");
		expect(monitoring?.lastNewlyDueCount).toBe(0);
	});

	it("drains a 105-obligation BECAME_DUE backlog in one cron invocation (multi-wave)", async () => {
		const harness = createCronSimulationHarness({ upcomingCount: 105 });

		await processObligationTransitionsImpl(harness.deps, {
			now: Date.parse("2026-03-21T06:00:00.000Z"),
		});

		expect(harness.getRemainingCounts().upcomingCount).toBe(0);
		expect(harness.getTransitionCallCount("BECAME_DUE")).toBe(105);
		expect(
			harness.getInfos().some((message) => message.includes("[wave=2]"))
		).toBe(true);
	});

	it("does not increment overflow streaks twice when rerun on the same UTC business day", async () => {
		const harness = createCronSimulationHarness({ upcomingCount: 250 });

		await processObligationTransitionsImpl(harness.deps, {
			now: Date.parse("2026-03-21T06:00:00.000Z"),
		});
		await processObligationTransitionsImpl(harness.deps, {
			now: Date.parse("2026-03-21T06:00:00.000Z"),
		});

		const monitoring = harness.getMonitoring();
		expect(monitoring?.newlyDueOverflowStreak).toBe(1);
		expect(monitoring?.lastRunBusinessDate).toBe("2026-03-21");
		expect(monitoring?.lastNewlyDueCount).toBe(50);
	});

	it("does not emit a persistent overflow alert when the backlog drains within the same cron day", async () => {
		const harness = createCronSimulationHarness({ upcomingCount: 450 });

		for (const day of [21, 22, 23, 24]) {
			await processObligationTransitionsImpl(harness.deps, {
				now: Date.parse(`2026-03-${day}T06:00:00.000Z`),
			});
		}

		const monitoring = harness.getMonitoring();
		expect(monitoring?.newlyDueOverflowStreak).toBe(0);
		expect(harness.getErrors()).toHaveLength(0);
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

		const obligation = await t.run(async (ctx) => ctx.db.get(obligationId));
		expect(typeof obligation?.dueDate).toBe("number");
		expect(typeof obligation?.gracePeriodEnd).toBe("number");
		expect(typeof obligation?.settledAt).toBe("number");
	});
});
