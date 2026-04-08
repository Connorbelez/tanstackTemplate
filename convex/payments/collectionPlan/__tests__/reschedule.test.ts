import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FAIRLEND_ADMIN } from "../../../../src/test/auth/identities";
import {
	createGovernedTestConvex,
	drainScheduledWork,
	seedBorrowerProfile,
	seedCollectionRules,
	seedCollectionSettlementPrereqs,
	seedMortgage,
	seedObligation,
	seedPlanEntry,
} from "../../../../src/test/convex/payments/helpers";
import { api, internal } from "../../../_generated/api";
import type { Id } from "../../../_generated/dataModel";
import { auditLog } from "../../../auditLog";

type GovernedTestConvex = ReturnType<typeof createGovernedTestConvex>;

function createBackendTestConvex() {
	return createGovernedTestConvex({ includeWorkflowComponents: false });
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.stubEnv("DISABLE_CASH_LEDGER_HASHCHAIN", "true");
});

afterEach(() => {
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
	vi.clearAllTimers();
	vi.useRealTimers();
});

async function seedFuturePlanEntryFixture(
	t: GovernedTestConvex,
	options?: {
		method?: string;
		scheduledDate?: number;
		status?:
			| "planned"
			| "executing"
			| "completed"
			| "cancelled"
			| "rescheduled";
	}
) {
	const borrowerId = await seedBorrowerProfile(t);
	const mortgageId = await seedMortgage(t);
	const obligationId = await seedObligation(t, mortgageId, borrowerId, {
		status: "due",
	});
	await seedCollectionSettlementPrereqs(t, {
		mortgageId,
		obligationId,
	});
	const scheduledDate = options?.scheduledDate ?? Date.now() + 5 * 86_400_000;
	const planEntryId = await seedPlanEntry(t, {
		obligationIds: [obligationId],
		amount: 300_000,
		method: options?.method ?? "manual",
		scheduledDate,
		status: options?.status ?? "planned",
		source: "default_schedule",
	});
	return { borrowerId, mortgageId, obligationId, planEntryId, scheduledDate };
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

describe("reschedulePlanEntry", () => {
	it("creates a replacement planned entry and preserves the original as rescheduled", async () => {
		const t = createBackendTestConvex();
		const requestedAt = new Date("2026-04-05T12:00:00.000Z").getTime();
		vi.setSystemTime(requestedAt);

		const { obligationId, planEntryId, scheduledDate } =
			await seedFuturePlanEntryFixture(t, {
				scheduledDate: requestedAt + 5 * 86_400_000,
			});

		const result = await t
			.withIdentity(FAIRLEND_ADMIN)
			.mutation(api.payments.collectionPlan.reschedule.reschedulePlanEntry, {
				planEntryId,
				newScheduledDate: requestedAt + 10 * 86_400_000,
				reason: "Borrower requested payday-aligned reschedule",
			});

		expect(result.outcome).toBe("rescheduled");
		expect(result.originalPlanEntryId).toBe(planEntryId);
		expect(result.originalPlanEntryStatusAfter).toBe("rescheduled");
		expect(result.replacementPlanEntryId).toBeTruthy();
		expect(result.replacementPlanEntryStatusAfter).toBe("planned");
		expect(result.replacementScheduledDate).toBe(requestedAt + 10 * 86_400_000);

		const originalPlanEntry = await t.run((ctx) => ctx.db.get(planEntryId));
		const replacementPlanEntry = await t.run((ctx) =>
			ctx.db.get(result.replacementPlanEntryId as Id<"collectionPlanEntries">)
		);
		expect(originalPlanEntry?.status).toBe("rescheduled");
		expect(originalPlanEntry?.scheduledDate).toBe(scheduledDate);
		expect(originalPlanEntry?.rescheduleReason).toBe(
			"Borrower requested payday-aligned reschedule"
		);
		expect(originalPlanEntry?.rescheduleRequestedAt).toBe(requestedAt);
		expect(originalPlanEntry?.rescheduleRequestedByActorId).toBe(
			FAIRLEND_ADMIN.subject
		);
		expect(originalPlanEntry?.rescheduleRequestedByActorType).toBe("admin");

		expect(replacementPlanEntry?.status).toBe("planned");
		expect(replacementPlanEntry?.source).toBe("admin_reschedule");
		expect(replacementPlanEntry?.scheduledDate).toBe(
			requestedAt + 10 * 86_400_000
		);
		expect(replacementPlanEntry?.rescheduledFromId).toBe(planEntryId);
		expect(replacementPlanEntry?.obligationIds).toEqual([obligationId]);
		expect(replacementPlanEntry?.amount).toBe(300_000);
		expect(replacementPlanEntry?.method).toBe("manual");
		expect(replacementPlanEntry?.collectionAttemptId).toBeUndefined();
		expect(replacementPlanEntry?.executionIdempotencyKey).toBeUndefined();
		expect(replacementPlanEntry?.rescheduleReason).toBe(
			"Borrower requested payday-aligned reschedule"
		);
		expect(replacementPlanEntry?.rescheduleRequestedByActorId).toBe(
			FAIRLEND_ADMIN.subject
		);

		const attempts = await getAttemptsForPlanEntry(t, planEntryId);
		expect(attempts).toHaveLength(0);

		const auditEvents = await t.run(async (ctx) =>
			auditLog.queryByResource(ctx, {
				resourceType: "collectionPlanEntries",
				resourceId: `${planEntryId}`,
				limit: 20,
			})
		);
		expect(
			auditEvents.some(
				(event) =>
					event.action === "collection_plan.reschedule_plan_entry" &&
					(event.metadata?.replacementPlanEntryId as string | undefined) ===
						`${result.replacementPlanEntryId}`
			)
		).toBe(true);
	});

	it("rejects entries that are already due for execution or already linked to execution state", async () => {
		const t = createBackendTestConvex();
		const requestedAt = new Date("2026-04-05T12:00:00.000Z").getTime();
		vi.setSystemTime(requestedAt);

		const { planEntryId: duePlanEntryId } = await seedFuturePlanEntryFixture(
			t,
			{
				scheduledDate: requestedAt - 1000,
			}
		);
		const dueResult = await t
			.withIdentity(FAIRLEND_ADMIN)
			.mutation(api.payments.collectionPlan.reschedule.reschedulePlanEntry, {
				planEntryId: duePlanEntryId,
				newScheduledDate: requestedAt + 2 * 86_400_000,
				reason: "Try to reschedule already-due work",
			});
		expect(dueResult.outcome).toBe("rejected");
		expect(dueResult.reasonCode).toBe("plan_entry_due_for_execution");

		const { planEntryId: executingPlanEntryId } =
			await seedFuturePlanEntryFixture(t, {
				scheduledDate: requestedAt + 5 * 86_400_000,
			});
		await t.run(async (ctx) => {
			await ctx.db.patch(executingPlanEntryId, {
				executedAt: requestedAt,
				executionIdempotencyKey: "page-09-test-execution",
			});
		});

		const executionLinkedResult = await t
			.withIdentity(FAIRLEND_ADMIN)
			.mutation(api.payments.collectionPlan.reschedule.reschedulePlanEntry, {
				planEntryId: executingPlanEntryId,
				newScheduledDate: requestedAt + 3 * 86_400_000,
				reason: "Try to reschedule execution-linked work",
			});
		expect(executionLinkedResult.outcome).toBe("rejected");
		expect(executionLinkedResult.reasonCode).toBe(
			"plan_entry_has_execution_state"
		);
	});

	it("allows reschedule of a blocked planned entry that is not currently scheduler-eligible", async () => {
		const t = createBackendTestConvex();
		const requestedAt = new Date("2026-04-05T12:00:00.000Z").getTime();
		vi.setSystemTime(requestedAt);

		const { planEntryId } = await seedFuturePlanEntryFixture(t, {
			scheduledDate: requestedAt - 1000,
		});
		await t.run(async (ctx) => {
			await ctx.db.patch(planEntryId, {
				balancePreCheckDecision: "defer",
				balancePreCheckNextEvaluationAt: requestedAt + 2 * 86_400_000,
			});
		});

		const result = await t
			.withIdentity(FAIRLEND_ADMIN)
			.mutation(api.payments.collectionPlan.reschedule.reschedulePlanEntry, {
				planEntryId,
				newScheduledDate: requestedAt + 5 * 86_400_000,
				reason: "Borrower requested a new date while execution was deferred",
			});

		expect(result.outcome).toBe("rescheduled");
	});

	it("keeps the original entry non-executable and lets the replacement execute through the runner", async () => {
		const t = createBackendTestConvex();
		const requestedAt = new Date("2026-04-05T12:00:00.000Z").getTime();
		vi.setSystemTime(requestedAt);

		const { planEntryId } = await seedFuturePlanEntryFixture(t, {
			scheduledDate: requestedAt + 5 * 86_400_000,
		});

		const reschedule = await t
			.withIdentity(FAIRLEND_ADMIN)
			.mutation(api.payments.collectionPlan.reschedule.reschedulePlanEntry, {
				planEntryId,
				newScheduledDate: requestedAt + 3_600_000,
				reason: "Bring collection forward to next operator-reviewed date",
			});

		if (reschedule.outcome !== "rescheduled") {
			throw new Error("Expected reschedule to succeed");
		}

		const originalExecution = await t.action(
			internal.payments.collectionPlan.execution.executePlanEntry,
			{
				planEntryId,
				triggerSource: "admin_manual",
				requestedAt: requestedAt + 3_600_000 + 1000,
				idempotencyKey: "page-09-original-execution-attempt",
				requestedByActorType: "admin",
				requestedByActorId: FAIRLEND_ADMIN.subject,
				reason: "Verify original superseded entry stays blocked",
			}
		);
		expect(originalExecution.outcome).toBe("not_eligible");
		expect(originalExecution.reasonCode).toBe(
			"plan_entry_not_executable_state"
		);

		vi.setSystemTime(requestedAt + 3_600_000 + 1000);
		const summary = await t.action(
			internal.payments.collectionPlan.runner.processDuePlanEntries,
			{
				asOf: requestedAt + 3_600_000 + 1000,
				batchSize: 10,
			}
		);
		await drainScheduledWork(t);

		expect(summary.selectedCount).toBe(1);
		expect(summary.attemptCreatedCount).toBe(1);

		const originalAttempts = await getAttemptsForPlanEntry(t, planEntryId);
		expect(originalAttempts).toHaveLength(0);

		const replacementAttempts = await getAttemptsForPlanEntry(
			t,
			reschedule.replacementPlanEntryId
		);
		expect(replacementAttempts).toHaveLength(1);
		expect(replacementAttempts[0]?.status).toBe("confirmed");
	});

	it("keeps retry lineage attached to the replacement entry when a rescheduled execution fails", async () => {
		vi.stubEnv("ENABLE_MOCK_PROVIDERS", "false");

		const t = createBackendTestConvex();
		const requestedAt = new Date("2026-04-05T12:00:00.000Z").getTime();
		vi.setSystemTime(requestedAt);

		await seedCollectionRules(t);
		const { planEntryId } = await seedFuturePlanEntryFixture(t, {
			method: "mock_pad",
			scheduledDate: requestedAt + 5 * 86_400_000,
		});

		const reschedule = await t
			.withIdentity(FAIRLEND_ADMIN)
			.mutation(api.payments.collectionPlan.reschedule.reschedulePlanEntry, {
				planEntryId,
				newScheduledDate: requestedAt + 3_600_000,
				reason: "Move failed draw attempt onto a new operator-approved date",
			});

		if (reschedule.outcome !== "rescheduled") {
			throw new Error("Expected reschedule to succeed");
		}

		vi.setSystemTime(requestedAt + 3_600_000 + 1000);
		const summary = await t.action(
			internal.payments.collectionPlan.runner.processDuePlanEntries,
			{
				asOf: requestedAt + 3_600_000 + 1000,
				batchSize: 10,
			}
		);
		await drainScheduledWork(t);

		expect(summary.attemptCreatedCount).toBe(1);
		expect(summary.handoffFailureCount).toBe(1);

		const retryFromReplacement = await t.run(async (ctx) =>
			ctx.db
				.query("collectionPlanEntries")
				.withIndex("by_retry_of", (q) =>
					q
						.eq("retryOfId", reschedule.replacementPlanEntryId)
						.eq("source", "retry_rule")
				)
				.first()
		);
		expect(retryFromReplacement?._id).toBeTruthy();

		const retryFromOriginal = await t.run(async (ctx) =>
			ctx.db
				.query("collectionPlanEntries")
				.withIndex("by_retry_of", (q) =>
					q.eq("retryOfId", planEntryId).eq("source", "retry_rule")
				)
				.first()
		);
		expect(retryFromOriginal).toBeNull();
	});
});
