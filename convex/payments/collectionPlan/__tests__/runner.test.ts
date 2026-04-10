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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	createGovernedTestConvex,
	drainScheduledWork,
	seedBorrowerProfile,
	seedCollectionRules,
	seedMortgage,
	seedObligation,
	seedPlanEntry,
} from "../../../../src/test/convex/payments/helpers";
import { internal } from "../../../_generated/api";
import type { Id } from "../../../_generated/dataModel";

type GovernedTestConvex = ReturnType<typeof createGovernedTestConvex>;

beforeEach(() => {
	globalThis.crypto ??= webcrypto;
	vi.useFakeTimers({
		toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"],
	});
});

afterEach(() => {
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
	return { obligationId, planEntryId };
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
		const t = createGovernedTestConvex();
		const { obligationId, planEntryId } = await seedExecutionFixture(t, {
			method: "manual",
			scheduledDate: Date.now() - 1000,
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
		expect(attempt?.providerRef).toBeTruthy();
		if (!attempt) {
			throw new Error("Expected a collection attempt for the due plan entry");
		}

		const transfers = await getTransfersForAttempt(t, attempt._id);
		expect(transfers).toHaveLength(1);
		expect(transfers[0]?.status).toBe("confirmed");

		const obligation = await t.run((ctx) => ctx.db.get(obligationId));
		expect(obligation?.status).toBe("settled");
		expect(obligation?.amountSettled).toBe(300_000);

		const duePlanEntry = await t.run((ctx) => ctx.db.get(planEntryId));
		expect(duePlanEntry?.status).toBe("executing");

		const futurePlanEntry = await t.run((ctx) => ctx.db.get(futurePlanEntryId));
		expect(futurePlanEntry?.status).toBe("planned");

		const futureAttempts = await getAttemptsForPlanEntry(t, futurePlanEntryId);
		expect(futureAttempts).toHaveLength(0);
	});

	it("is replay-safe across cron reruns", async () => {
		const t = createGovernedTestConvex();
		const { planEntryId } = await seedExecutionFixture(t, {
			method: "manual",
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
	});

	it("keeps failure execution durable and feeds the retry loop", async () => {
		const t = createGovernedTestConvex();
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
		if (!attempt) {
			throw new Error("Expected a durable failed collection attempt");
		}

		const transfers = await getTransfersForAttempt(t, attempt._id);
		expect(transfers).toHaveLength(0);

		const retryEntry = await t.run(async (ctx) =>
			ctx.db
				.query("collectionPlanEntries")
				.withIndex("by_rescheduled_from", (q) =>
					q.eq("rescheduledFromId", planEntryId).eq("source", "retry_rule")
				)
				.first()
		);
		expect(retryEntry?._id).toBeTruthy();
		expect(retryEntry?.status).toBe("planned");
	});
});
