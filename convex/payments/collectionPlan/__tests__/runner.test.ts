import { webcrypto } from "node:crypto";
/**
 * Integration tests for the collection-plan due-entry runner.
 * Spec: https://www.notion.so/337fc1b44024812291bac97a93ca6e10
 *
 * Use Cases covered:
 * - UC-1: Scheduler discovers due plan entries and executes them through the canonical spine
 * - UC-2: Cron reruns remain replay-safe and do not create duplicate attempts or transfers
 * - UC-3: Failure execution stays durable on the attempt and continues into the retry loop
 *
 * Requirements covered:
 * - REQ-1: Scheduler-owned due-entry runner executes through executePlanEntry only
 * - REQ-3: One-attempt-per-plan-entry and cron rerun safety
 * - REQ-4: Successful runs initiate downstream transfers
 * - REQ-5: Attempt lifecycle advances via GT transitions
 * - REQ-7: Failure paths preserve retry-loop behavior
 * - REQ-10: Backend integration coverage exercises the production spine
 */

import process from "node:process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	createGovernedTestConvex,
	drainScheduledWork,
	seedBalancePreCheckRule,
	seedBorrowerProfile,
	seedCollectionRules,
	seedCollectionSettlementPrereqs,
	seedMortgage,
	seedObligation,
	seedPlanEntry,
	seedRecentFailedInboundTransfer,
} from "../../../../src/test/convex/payments/helpers";
import { internal } from "../../../_generated/api";
import type { Id } from "../../../_generated/dataModel";

const testGlobal = globalThis as typeof globalThis & {
	process?: {
		env: Record<string, string | undefined>;
	};
};

if (!testGlobal.process) {
	testGlobal.process = process as unknown as {
		env: Record<string, string | undefined>;
	};
}

const testEnv = testGlobal.process.env;
const envRestorers: Array<() => void> = [];

function setTestEnv(key: string, value: string) {
	const previous = testEnv[key];
	testEnv[key] = value;
	envRestorers.push(() => {
		if (previous === undefined) {
			delete testEnv[key];
			return;
		}
		testEnv[key] = previous;
	});
}

type GovernedTestConvex = ReturnType<typeof createGovernedTestConvex>;

function createBackendTestConvex() {
	return createGovernedTestConvex({ includeWorkflowComponents: false });
}

beforeEach(() => {
	envRestorers.length = 0;
	setTestEnv("DISABLE_GT_HASHCHAIN", "true");
	setTestEnv("DISABLE_CASH_LEDGER_HASHCHAIN", "true");
	globalThis.crypto ??= webcrypto;
	vi.useFakeTimers({
		toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"],
	});
});

afterEach(() => {
	while (envRestorers.length > 0) {
		envRestorers.pop()?.();
	}
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
	vi.clearAllTimers();
	vi.useRealTimers();
});

async function seedExecutionFixture(
	t: GovernedTestConvex,
	options?: {
		method?: string;
		scheduledDate?: number;
	}
) {
	const borrowerId = await seedBorrowerProfile(t);
	const mortgageId = await seedMortgage(t);
	const obligationId = await seedObligation(t, mortgageId, borrowerId, {
		status: "due",
	});
	const planEntryId = await seedPlanEntry(t, {
		obligationIds: [obligationId],
		amount: 300_000,
		method: options?.method ?? "manual",
		scheduledDate: options?.scheduledDate ?? Date.now() - 1000,
		status: "planned",
		source: "default_schedule",
	});
	return { borrowerId, mortgageId, obligationId, planEntryId };
}

async function getAttemptsForPlanEntry(
	t: GovernedTestConvex,
	planEntryId: Id<"collectionPlanEntries">
) {
	return t.run(async (ctx) =>
		ctx.db
			.query("collectionAttempts")
			.withIndex("by_plan_entry", (q) => q.eq("planEntryId", planEntryId))
			.collect()
	);
}

async function getTransfersForAttempt(
	t: GovernedTestConvex,
	attemptId: Id<"collectionAttempts">
) {
	return t.run(async (ctx) =>
		ctx.db
			.query("transferRequests")
			.filter((q) => q.eq(q.field("collectionAttemptId"), attemptId))
			.collect()
	);
}

describe("processDuePlanEntries", () => {
	it("executes only due planned entries through the full manual spine", async () => {
		const t = createBackendTestConvex();
		const { mortgageId, obligationId, planEntryId } =
			await seedExecutionFixture(t, {
				method: "manual",
				scheduledDate: Date.now() - 1000,
			});
		await seedCollectionSettlementPrereqs(t, {
			mortgageId,
			obligationId,
		});
		const { planEntryId: futurePlanEntryId } = await seedExecutionFixture(t, {
			method: "manual",
			scheduledDate: Date.now() + 60_000,
		});

		const summary = await t.action(
			internal.payments.collectionPlan.runner.processDuePlanEntries,
			{
				asOf: Date.now(),
				batchSize: 10,
			}
		);
		await drainScheduledWork(t);

		expect(summary.selectedCount).toBe(1);
		expect(summary.attemptedCount).toBe(1);
		expect(summary.attemptCreatedCount).toBe(1);
		expect(summary.alreadyExecutedCount).toBe(0);
		expect(summary.handoffFailureCount).toBe(0);

		const attempts = await getAttemptsForPlanEntry(t, planEntryId);
		expect(attempts).toHaveLength(1);
		const attempt = attempts[0];
		expect(attempt).toBeDefined();
		expect(attempt?.status).toBe("confirmed");
		expect(attempt?.transferRequestId).toBeTruthy();
		expect(attempt).not.toHaveProperty("providerStatus");
		if (!attempt) {
			throw new Error("Expected a collection attempt for the due plan entry");
		}

		const transfers = await getTransfersForAttempt(t, attempt._id);
		expect(transfers).toHaveLength(1);
		expect(transfers[0]?.providerRef).toBeTruthy();
		expect(transfers[0]?.status).toBe("confirmed");

		const duePlanEntry = await t.run((ctx) => ctx.db.get(planEntryId));
		expect(duePlanEntry?.status).toBe("executing");

		const futurePlanEntry = await t.run((ctx) => ctx.db.get(futurePlanEntryId));
		expect(futurePlanEntry?.status).toBe("planned");

		const futureAttempts = await getAttemptsForPlanEntry(t, futurePlanEntryId);
		expect(futureAttempts).toHaveLength(0);
	});

	it("is replay-safe across cron reruns", async () => {
		const t = createBackendTestConvex();
		const { mortgageId, obligationId, planEntryId } =
			await seedExecutionFixture(t, {
				method: "manual",
			});
		await seedCollectionSettlementPrereqs(t, {
			mortgageId,
			obligationId,
		});

		const first = await t.action(
			internal.payments.collectionPlan.runner.processDuePlanEntries,
			{
				asOf: Date.now(),
				batchSize: 10,
			}
		);
		await drainScheduledWork(t);

		const second = await t.action(
			internal.payments.collectionPlan.runner.processDuePlanEntries,
			{
				asOf: Date.now(),
				batchSize: 10,
			}
		);
		await drainScheduledWork(t);

		expect(first.attemptCreatedCount).toBe(1);
		expect(second.selectedCount).toBe(0);
		expect(second.attemptCreatedCount).toBe(0);

		const attempts = await getAttemptsForPlanEntry(t, planEntryId);
		expect(attempts).toHaveLength(1);
		const attempt = attempts[0];
		expect(attempt).toBeDefined();
		if (!attempt) {
			throw new Error(
				"Expected a collection attempt after the first runner pass"
			);
		}

		const transfers = await getTransfersForAttempt(t, attempt._id);
		expect(transfers).toHaveLength(1);
		expect(transfers[0]?.providerRef).toBeTruthy();
		expect(transfers[0]?.status).toBe("confirmed");
	});

	it("keeps failure execution durable and feeds the retry loop", async () => {
		setTestEnv("ENABLE_MOCK_PROVIDERS", "false");

		const t = createBackendTestConvex();
		await seedCollectionRules(t);
		const { planEntryId } = await seedExecutionFixture(t, {
			method: "mock_pad",
		});

		const summary = await t.action(
			internal.payments.collectionPlan.runner.processDuePlanEntries,
			{
				asOf: Date.now(),
				batchSize: 10,
			}
		);
		await drainScheduledWork(t);

		expect(summary.selectedCount).toBe(1);
		expect(summary.attemptCreatedCount).toBe(1);
		expect(summary.handoffFailureCount).toBe(1);

		const attempts = await getAttemptsForPlanEntry(t, planEntryId);
		expect(attempts).toHaveLength(1);
		const attempt = attempts[0];
		expect(attempt).toBeDefined();
		expect(attempt?.status).toBe("retry_scheduled");
		expect(attempt?.failureReason).toBeTruthy();
		expect(attempt?.failureReason).toContain("disabled by default");
		expect(attempt?.transferRequestId).toBeTruthy();
		if (!attempt) {
			throw new Error("Expected a durable failed collection attempt");
		}

		const transfers = await getTransfersForAttempt(t, attempt._id);
		expect(transfers).toHaveLength(1);
		expect(transfers[0]?.status).toBe("initiated");
		expect(transfers[0]?.providerRef).toBeUndefined();

		const replay = await t.action(
			internal.payments.collectionPlan.runner.processDuePlanEntries,
			{
				asOf: Date.now() + 1,
				batchSize: 10,
			}
		);
		await drainScheduledWork(t);

		expect(replay.selectedCount).toBe(0);
		expect(replay.attemptCreatedCount).toBe(0);
		expect(replay.handoffFailureCount).toBe(0);

		const replayAttempts = await getAttemptsForPlanEntry(t, planEntryId);
		expect(replayAttempts).toHaveLength(1);
		const replayTransfers = await getTransfersForAttempt(t, attempt._id);
		expect(replayTransfers).toHaveLength(1);

		const retryEntry = await t.run(async (ctx) =>
			ctx.db
				.query("collectionPlanEntries")
				.withIndex("by_retry_of", (q) =>
					q.eq("retryOfId", planEntryId).eq("source", "retry_rule")
				)
				.first()
		);
		expect(retryEntry?._id).toBeTruthy();
		expect(retryEntry?.status).toBe("planned");
	});

	it("does not thrash deferred entries across immediate scheduler reruns", async () => {
		const t = createBackendTestConvex();
		const asOf = new Date("2026-04-01T12:00:00.000Z").getTime();
		const { borrowerId, mortgageId, planEntryId } = await seedExecutionFixture(
			t,
			{
				method: "manual",
				scheduledDate: asOf - 1000,
			}
		);
		await seedBalancePreCheckRule(t, {
			blockingDecision: "defer",
			deferDays: 3,
		});
		await seedRecentFailedInboundTransfer(t, {
			borrowerId,
			mortgageId,
			createdAt: asOf - 60_000,
		});

		const first = await t.action(
			internal.payments.collectionPlan.runner.processDuePlanEntries,
			{
				asOf,
				batchSize: 10,
			}
		);
		await drainScheduledWork(t);

		const second = await t.action(
			internal.payments.collectionPlan.runner.processDuePlanEntries,
			{
				asOf: asOf + 60_000,
				batchSize: 10,
			}
		);
		await drainScheduledWork(t);

		expect(first.selectedCount).toBe(1);
		expect(first.attemptedCount).toBe(1);
		expect(first.notEligibleCount).toBe(1);
		expect(first.attemptCreatedCount).toBe(0);
		expect(second.selectedCount).toBe(0);
		expect(second.attemptedCount).toBe(0);
		expect(second.notEligibleCount).toBe(0);

		const attempts = await getAttemptsForPlanEntry(t, planEntryId);
		expect(attempts).toHaveLength(0);

		const planEntry = (await t.run((ctx) => ctx.db.get(planEntryId))) as Record<
			string,
			unknown
		> | null;
		expect(planEntry?.status).toBe("planned");
		expect(planEntry?.balancePreCheckDecision).toBe("defer");
		expect(planEntry?.balancePreCheckNextEvaluationAt).toBe(
			asOf + 3 * 86_400_000
		);
	});
});
