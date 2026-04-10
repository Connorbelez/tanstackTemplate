import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	EXTERNAL_ORG_ADMIN,
	FAIRLEND_ADMIN,
} from "../../../../src/test/auth/identities";
import {
	createGovernedTestConvex,
	drainScheduledWork,
	seedBorrowerProfile,
	seedCollectionSettlementPrereqs,
	seedMortgage,
	seedObligation,
	seedPlanEntry,
} from "../../../../src/test/convex/payments/helpers";
import { api } from "../../../_generated/api";
import type { Id } from "../../../_generated/dataModel";

type GovernedTestConvex = ReturnType<typeof createGovernedTestConvex>;

function createBackendTestConvex() {
	return createGovernedTestConvex({ includeWorkflowComponents: false });
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.stubEnv("DISABLE_CASH_LEDGER_HASHCHAIN", "true");
	vi.stubEnv("DISABLE_GT_HASHCHAIN", "true");
});

afterEach(() => {
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
	vi.clearAllTimers();
	vi.useRealTimers();
});

async function seedPlanEntryFixture(
	t: GovernedTestConvex,
	options?: {
		createdByRuleId?: Id<"collectionRules">;
		mortgageId?: Id<"mortgages">;
		obligationStatus?: "due" | "upcoming";
		scheduledDate?: number;
	}
) {
	const borrowerId = await seedBorrowerProfile(t);
	const mortgageId = options?.mortgageId ?? (await seedMortgage(t));
	const obligationId = await seedObligation(t, mortgageId, borrowerId, {
		status: options?.obligationStatus ?? "due",
	});
	const planEntryId = await seedPlanEntry(t, {
		obligationIds: [obligationId],
		amount: 300_000,
		method: "manual",
		scheduledDate: options?.scheduledDate ?? Date.now() - 1000,
		status: "planned",
		source: "default_schedule",
		createdByRuleId: options?.createdByRuleId,
	});

	return { borrowerId, mortgageId, obligationId, planEntryId };
}

describe("collection plan admin surfaces", () => {
	it("exposes stable admin read models for rules, plan entries, attempts, and mortgage summaries", async () => {
		const t = createBackendTestConvex();
		const asOf = new Date("2026-04-07T12:00:00.000Z").getTime();
		vi.setSystemTime(asOf);

		const mortgageId = await seedMortgage(t);
		const createdRule = await t
			.withIdentity(FAIRLEND_ADMIN)
			.mutation(api.payments.collectionPlan.admin.createCollectionRule, {
				kind: "schedule",
				code: "page_12_mortgage_schedule_rule",
				displayName: "Mortgage schedule override",
				description: "Operator-managed schedule rule for a single mortgage.",
				priority: 5,
				scope: {
					scopeType: "mortgage",
					mortgageId,
				},
				status: "active",
				config: {
					kind: "schedule",
					delayDays: 2,
				},
			});
		expect(createdRule.outcome).toBe("created");
		if (createdRule.outcome !== "created") {
			throw new Error("Expected collection rule creation to succeed");
		}

		const {
			mortgageId: executionMortgageId,
			obligationId,
			planEntryId,
		} = await seedPlanEntryFixture(t, {
			createdByRuleId: createdRule.ruleId,
			mortgageId,
			obligationStatus: "due",
			scheduledDate: asOf - 1000,
		});
		await seedCollectionSettlementPrereqs(t, {
			mortgageId: executionMortgageId,
			obligationId,
		});

		const execution = await t
			.withIdentity(FAIRLEND_ADMIN)
			.action(api.payments.collectionPlan.admin.executeCollectionPlanEntry, {
				planEntryId,
				reason: "Operator triggered governed manual execution for review",
			});
		await drainScheduledWork(t);

		expect(execution.outcome).toBe("attempt_created");
		if (execution.outcome !== "attempt_created") {
			throw new Error("Expected manual admin execution to create an attempt");
		}

		const rules = await t
			.withIdentity(FAIRLEND_ADMIN)
			.query(api.payments.collectionPlan.admin.listCollectionRules, {
				mortgageId,
			});
		expect(rules.some((rule) => rule.ruleId === createdRule.ruleId)).toBe(true);

		const ruleDetail = await t
			.withIdentity(FAIRLEND_ADMIN)
			.query(api.payments.collectionPlan.admin.getCollectionRule, {
				ruleId: createdRule.ruleId,
			});
		expect(ruleDetail?.rule.ruleId).toBe(createdRule.ruleId);
		expect(ruleDetail?.relatedPlanEntryCount).toBe(1);
		expect(
			ruleDetail?.auditEvents.some(
				(event) => event.action === "collection_rule.created"
			)
		).toBe(true);

		const planEntries = await t
			.withIdentity(FAIRLEND_ADMIN)
			.query(api.payments.collectionPlan.admin.listCollectionPlanEntries, {
				mortgageId,
			});
		expect(planEntries.some((entry) => entry.planEntryId === planEntryId)).toBe(
			true
		);

		const planEntryDetail = await t
			.withIdentity(FAIRLEND_ADMIN)
			.query(api.payments.collectionPlan.admin.getCollectionPlanEntry, {
				planEntryId,
			});
		expect(planEntryDetail?.planEntry.createdByRule?.ruleId).toBe(
			createdRule.ruleId
		);
		expect(planEntryDetail?.planEntry.relatedAttempt?.collectionAttemptId).toBe(
			execution.collectionAttemptId
		);
		expect(
			planEntryDetail?.auditEvents.some(
				(event) => event.action === "collection_plan.execute_plan_entry"
			)
		).toBe(true);

		const attempts = await t
			.withIdentity(FAIRLEND_ADMIN)
			.query(api.payments.collectionPlan.admin.listCollectionAttempts, {
				mortgageId,
			});
		expect(
			attempts.some(
				(attempt) =>
					attempt.collectionAttemptId === execution.collectionAttemptId
			)
		).toBe(true);

		const attemptDetail = await t
			.withIdentity(FAIRLEND_ADMIN)
			.query(api.payments.collectionPlan.admin.getCollectionAttempt, {
				attemptId: execution.collectionAttemptId,
			});
		expect(attemptDetail?.attempt.transfer?.status).toBe("confirmed");
		expect(typeof attemptDetail?.attempt.reconciliation?.isHealthy).toBe(
			"boolean"
		);
		expect((attemptDetail?.transitionJournal.length ?? 0) > 0).toBe(true);

		const summary = await t
			.withIdentity(FAIRLEND_ADMIN)
			.query(
				api.payments.collectionPlan.admin
					.getMortgageCollectionOperationsSummary,
				{
					mortgageId,
				}
			);
		expect(summary.ruleCount).toBeGreaterThan(0);
		expect(
			summary.recentAttempts.some(
				(attempt) =>
					attempt.collectionAttemptId === execution.collectionAttemptId
			)
		).toBe(true);
		expect(summary.planEntryStats.executing).toBe(1);
	});

	it("delegates reschedule operations through the canonical collection-plan mutation", async () => {
		const t = createBackendTestConvex();
		const asOf = new Date("2026-04-07T12:00:00.000Z").getTime();
		vi.setSystemTime(asOf);

		const { planEntryId } = await seedPlanEntryFixture(t, {
			scheduledDate: asOf + 5 * 86_400_000,
			obligationStatus: "due",
		});

		const reschedule = await t
			.withIdentity(FAIRLEND_ADMIN)
			.action(api.payments.collectionPlan.admin.rescheduleCollectionPlanEntry, {
				planEntryId,
				newScheduledDate: asOf + 10 * 86_400_000,
				reason: "Operator aligned the debit with the borrower payday",
			});

		expect(reschedule.outcome).toBe("rescheduled");
		if (reschedule.outcome !== "rescheduled") {
			throw new Error("Expected admin reschedule to succeed");
		}

		const detail = await t
			.withIdentity(FAIRLEND_ADMIN)
			.query(api.payments.collectionPlan.admin.getCollectionPlanEntry, {
				planEntryId,
			});
		expect(detail?.rescheduleChildren).toHaveLength(1);
		expect(detail?.rescheduleChildren[0]?.source).toBe("admin_reschedule");
	});

	it("delegates workout creation and activation through the canonical workout mutations", async () => {
		const t = createBackendTestConvex();
		const asOf = new Date("2026-04-07T12:00:00.000Z").getTime();
		vi.setSystemTime(asOf);

		const borrowerId = await seedBorrowerProfile(t);
		const mortgageId = await seedMortgage(t);
		const obligationId = await seedObligation(t, mortgageId, borrowerId, {
			status: "upcoming",
		});
		await seedPlanEntry(t, {
			obligationIds: [obligationId],
			amount: 300_000,
			method: "manual",
			scheduledDate: asOf + 5 * 86_400_000,
			status: "planned",
			source: "default_schedule",
		});

		const createdWorkout = await t
			.withIdentity(FAIRLEND_ADMIN)
			.action(api.payments.collectionPlan.admin.createWorkoutPlan, {
				mortgageId,
				name: "Short hardship workout",
				rationale: "Temporary hardship requires a governed alternate draw date",
				installments: [
					{
						obligationIds: [obligationId],
						method: "manual",
						scheduledDate: asOf + 2 * 86_400_000,
					},
				],
			});
		expect(createdWorkout.outcome).toBe("created");
		if (createdWorkout.outcome !== "created") {
			throw new Error("Expected workout plan creation to succeed");
		}

		const activation = await t
			.withIdentity(FAIRLEND_ADMIN)
			.action(api.payments.collectionPlan.admin.activateWorkoutPlan, {
				workoutPlanId: createdWorkout.workoutPlanId,
			});
		expect(activation.outcome).toBe("activated");
		if (activation.outcome !== "activated") {
			throw new Error("Expected workout activation to succeed");
		}

		const workoutEntries = await t
			.withIdentity(FAIRLEND_ADMIN)
			.query(api.payments.collectionPlan.admin.listCollectionPlanEntries, {
				mortgageId,
				workoutPlanId: createdWorkout.workoutPlanId,
			});
		expect(workoutEntries).toHaveLength(1);
		expect(workoutEntries[0]?.source).toBe("admin_workout");

		const summary = await t
			.withIdentity(FAIRLEND_ADMIN)
			.query(
				api.payments.collectionPlan.admin
					.getMortgageCollectionOperationsSummary,
				{
					mortgageId,
				}
			);
		expect(summary.activeWorkoutPlan?.workoutPlanId).toBe(
			createdWorkout.workoutPlanId
		);
	});

	it("delegates workout completion and cancellation through canonical workout exit mutations", async () => {
		const t = createBackendTestConvex();
		const asOf = new Date("2026-02-01T12:00:00.000Z").getTime();
		vi.setSystemTime(asOf);

		const borrowerId = await seedBorrowerProfile(t);
		const mortgageId = await seedMortgage(t);
		const obligationId = await seedObligation(t, mortgageId, borrowerId, {
			status: "upcoming",
		});
		await seedPlanEntry(t, {
			obligationIds: [obligationId],
			amount: 300_000,
			method: "manual",
			scheduledDate: asOf + 10 * 86_400_000,
			status: "planned",
			source: "default_schedule",
		});

		const createdWorkout = await t
			.withIdentity(FAIRLEND_ADMIN)
			.action(api.payments.collectionPlan.admin.createWorkoutPlan, {
				mortgageId,
				name: "Exit flow workout",
				rationale: "Exercise the governed admin workout exit path",
				installments: [
					{
						obligationIds: [obligationId],
						method: "manual",
						scheduledDate: asOf + 3 * 86_400_000,
					},
				],
			});
		if (createdWorkout.outcome !== "created") {
			throw new Error("Expected workout plan creation to succeed");
		}

		const activation = await t
			.withIdentity(FAIRLEND_ADMIN)
			.action(api.payments.collectionPlan.admin.activateWorkoutPlan, {
				workoutPlanId: createdWorkout.workoutPlanId,
			});
		if (activation.outcome !== "activated") {
			throw new Error("Expected workout activation to succeed");
		}

		const completion = await t
			.withIdentity(FAIRLEND_ADMIN)
			.action(api.payments.collectionPlan.admin.completeWorkoutPlan, {
				workoutPlanId: createdWorkout.workoutPlanId,
			});
		expect(completion.outcome).toBe("completed");

		const summaryAfterComplete = await t
			.withIdentity(FAIRLEND_ADMIN)
			.query(
				api.payments.collectionPlan.admin
					.getMortgageCollectionOperationsSummary,
				{
					mortgageId,
				}
			);
		expect(summaryAfterComplete.activeWorkoutPlan).toBeNull();
		expect(
			summaryAfterComplete.historicalWorkoutPlans.some(
				(plan) =>
					plan.workoutPlanId === createdWorkout.workoutPlanId &&
					plan.status === "completed"
			)
		).toBe(true);

		const createdDraftWorkout = await t
			.withIdentity(FAIRLEND_ADMIN)
			.action(api.payments.collectionPlan.admin.createWorkoutPlan, {
				mortgageId,
				name: "Discarded draft workout",
				rationale: "Exercise governed draft cancellation",
				installments: [
					{
						obligationIds: [obligationId],
						method: "manual",
						scheduledDate: asOf + 4 * 86_400_000,
					},
				],
			});
		if (createdDraftWorkout.outcome !== "created") {
			throw new Error("Expected second workout creation to succeed");
		}

		const cancellation = await t
			.withIdentity(FAIRLEND_ADMIN)
			.action(api.payments.collectionPlan.admin.cancelWorkoutPlan, {
				workoutPlanId: createdDraftWorkout.workoutPlanId,
				reason: "Operator cancelled the draft workout after review",
			});
		expect(cancellation.outcome).toBe("cancelled");

		const summaryAfterCancel = await t
			.withIdentity(FAIRLEND_ADMIN)
			.query(
				api.payments.collectionPlan.admin
					.getMortgageCollectionOperationsSummary,
				{
					mortgageId,
				}
			);
		expect(
			summaryAfterCancel.historicalWorkoutPlans.some(
				(plan) =>
					plan.workoutPlanId === createdDraftWorkout.workoutPlanId &&
					plan.status === "cancelled"
			)
		).toBe(true);
	});

	it("creates and updates typed collection rules through governed admin mutations", async () => {
		const t = createBackendTestConvex();
		const asOf = new Date("2026-04-07T12:00:00.000Z").getTime();
		vi.setSystemTime(asOf);

		const createdRule = await t
			.withIdentity(FAIRLEND_ADMIN)
			.mutation(api.payments.collectionPlan.admin.createCollectionRule, {
				kind: "retry",
				code: "page_12_retry_rule",
				displayName: "Retry escalation",
				description: "Admin-managed retry strategy for testing page 12.",
				priority: 20,
				config: {
					kind: "retry",
					maxRetries: 3,
					backoffBaseDays: 3,
				},
				status: "draft",
			});
		expect(createdRule.outcome).toBe("created");
		if (createdRule.outcome !== "created") {
			throw new Error("Expected retry rule creation to succeed");
		}

		const updatedRule = await t
			.withIdentity(FAIRLEND_ADMIN)
			.mutation(api.payments.collectionPlan.admin.updateCollectionRule, {
				ruleId: createdRule.ruleId,
				status: "active",
				priority: 25,
				displayName: "Retry escalation v2",
				config: {
					kind: "retry",
					maxRetries: 4,
					backoffBaseDays: 2,
				},
			});
		expect(updatedRule.outcome).toBe("updated");

		const detail = await t
			.withIdentity(FAIRLEND_ADMIN)
			.query(api.payments.collectionPlan.admin.getCollectionRule, {
				ruleId: createdRule.ruleId,
			});
		expect(detail?.rule.status).toBe("active");
		expect(detail?.rule.priority).toBe(25);
		expect(detail?.rule.displayName).toBe("Retry escalation v2");
		expect(detail?.rule.configSummary).toContain("Retry up to 4 time(s)");
		expect(
			detail?.auditEvents.some(
				(event) => event.action === "collection_rule.updated"
			)
		).toBe(true);
	});

	it("rejects non-FairLend admins from collection admin surfaces", async () => {
		const t = createBackendTestConvex();

		await expect(
			t
				.withIdentity(EXTERNAL_ORG_ADMIN)
				.query(api.payments.collectionPlan.admin.listCollectionRules, {})
		).rejects.toThrow("Forbidden: fair lend admin role required");
	});
});
