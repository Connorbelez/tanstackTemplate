import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockViewer } from "../../../../src/test/auth/helpers";
import { FAIRLEND_ADMIN } from "../../../../src/test/auth/identities";
import {
	createGovernedTestConvex,
	drainScheduledWork,
	seedBorrowerProfile,
	seedCollectionAttempt,
	seedCollectionRules,
	seedMortgage,
	seedObligation,
	seedPlanEntry,
} from "../../../../src/test/convex/payments/helpers";
import { api, internal } from "../../../_generated/api";
import type { Id } from "../../../_generated/dataModel";

type GovernedTestConvex = ReturnType<typeof createGovernedTestConvex>;

function createBackendTestConvex() {
	return createGovernedTestConvex({ includeWorkflowComponents: false });
}

const PAYMENT_OPERATOR = createMockViewer({
	roles: ["admin"],
	permissions: ["payment:view", "payment:manage"],
	orgId: FAIRLEND_ADMIN.org_id,
	orgName: FAIRLEND_ADMIN.organization_name,
	subject: "user_payment_operator",
	email: "payments@test.fairlend.ca",
	firstName: "Payment",
	lastName: "Operator",
});

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

async function seedWorkoutFixture(
	t: GovernedTestConvex,
	options?: {
		entryScheduledDate?: number;
		obligationStatuses?: Array<
			"due" | "upcoming" | "overdue" | "partially_settled"
		>;
		workoutMethod?: string;
		workoutScheduledDate?: number;
	}
) {
	const borrowerId = await seedBorrowerProfile(t);
	const mortgageId = await seedMortgage(t);
	const obligationStatuses = options?.obligationStatuses ?? [
		"upcoming",
		"upcoming",
	];

	const obligationIds: Id<"obligations">[] = [];
	for (const status of obligationStatuses) {
		obligationIds.push(
			await seedObligation(t, mortgageId, borrowerId, {
				status,
			})
		);
	}

	const originalPlanEntryIds: Id<"collectionPlanEntries">[] = [];
	for (const obligationId of obligationIds) {
		originalPlanEntryIds.push(
			await seedPlanEntry(t, {
				obligationIds: [obligationId],
				amount: 300_000,
				method: "manual",
				scheduledDate:
					options?.entryScheduledDate ?? Date.now() + 5 * 86_400_000,
				status: "planned",
				source: "default_schedule",
			})
		);
	}

	const createResult = await t
		.withIdentity(PAYMENT_OPERATOR)
		.mutation(api.payments.collectionPlan.workout.createWorkoutPlan, {
			mortgageId,
			name: "Borrower hardship workout",
			rationale:
				"Temporary hardship requires governed alternate collection dates",
			installments: obligationIds.map((obligationId, index) => ({
				obligationIds: [obligationId],
				scheduledDate:
					(options?.workoutScheduledDate ?? Date.now() + 2 * 86_400_000) +
					index * 86_400_000,
				method: options?.workoutMethod ?? "manual",
			})),
		});

	if (createResult.outcome !== "created") {
		throw new Error("Expected workout plan creation to succeed");
	}

	return {
		borrowerId,
		createResult,
		mortgageId,
		obligationIds,
		originalPlanEntryIds,
	};
}

async function getWorkoutOwnedEntries(
	t: GovernedTestConvex,
	workoutPlanId: Id<"workoutPlans">
) {
	return t.run(async (ctx) =>
		ctx.db
			.query("collectionPlanEntries")
			.withIndex("by_workout_plan", (q) => q.eq("workoutPlanId", workoutPlanId))
			.collect()
	);
}

describe("workout plans", () => {
	it("activates a workout plan by superseding future planned entries without rewriting obligations", async () => {
		const t = createBackendTestConvex();
		const asOf = new Date("2026-04-06T12:00:00.000Z").getTime();
		vi.setSystemTime(asOf);

		const { createResult, mortgageId, obligationIds, originalPlanEntryIds } =
			await seedWorkoutFixture(t, {
				entryScheduledDate: asOf + 5 * 86_400_000,
				workoutScheduledDate: asOf + 2 * 86_400_000,
			});

		const activation = await t
			.withIdentity(PAYMENT_OPERATOR)
			.mutation(api.payments.collectionPlan.workout.activateWorkoutPlan, {
				workoutPlanId: createResult.workoutPlanId,
			});

		expect(activation.outcome).toBe("activated");
		if (activation.outcome !== "activated") {
			throw new Error("Expected workout activation to succeed");
		}
		expect(activation.activatedPlanEntryIds).toHaveLength(2);
		expect(activation.supersededPlanEntryIds).toHaveLength(2);
		expect(activation.supersededPlanEntryIds).toEqual(
			expect.arrayContaining(originalPlanEntryIds)
		);

		const workoutPlanView = await t
			.withIdentity(PAYMENT_OPERATOR)
			.query(api.payments.collectionPlan.workout.getWorkoutPlan, {
				workoutPlanId: createResult.workoutPlanId,
			});
		expect(workoutPlanView?.workoutPlan.status).toBe("active");
		expect(workoutPlanView?.workoutPlan.mortgageId).toBe(mortgageId);
		expect(workoutPlanView?.workoutPlan.rationale).toContain(
			"Temporary hardship"
		);
		expect(workoutPlanView?.ownedPlanEntries).toHaveLength(2);
		expect(workoutPlanView?.supersededPlanEntries).toHaveLength(2);

		for (const originalPlanEntryId of originalPlanEntryIds) {
			const original = await t.run((ctx) => ctx.db.get(originalPlanEntryId));
			expect(original?.status).toBe("cancelled");
			expect(original?.cancelledAt).toBe(asOf);
			expect(original?.supersededByWorkoutPlanId).toBe(
				createResult.workoutPlanId
			);
			expect(original?.supersededAt).toBe(asOf);
		}

		const workoutOwnedEntries = await getWorkoutOwnedEntries(
			t,
			createResult.workoutPlanId
		);
		expect(workoutOwnedEntries).toHaveLength(2);
		expect(
			workoutOwnedEntries.every((entry) => entry.source === "admin_workout")
		).toBe(true);

		for (const obligationId of obligationIds) {
			const obligation = await t.run((ctx) => ctx.db.get(obligationId));
			expect(obligation?.status).not.toBe("settled");
			expect(obligation?.amountSettled).toBe(0);
		}
	});

	it("rejects activation when a covered entry is already due for execution", async () => {
		const t = createBackendTestConvex();
		const asOf = new Date("2026-04-06T12:00:00.000Z").getTime();
		vi.setSystemTime(asOf);

		const { createResult } = await seedWorkoutFixture(t, {
			entryScheduledDate: asOf - 1000,
			workoutScheduledDate: asOf + 2 * 86_400_000,
		});

		const activation = await t
			.withIdentity(PAYMENT_OPERATOR)
			.mutation(api.payments.collectionPlan.workout.activateWorkoutPlan, {
				workoutPlanId: createResult.workoutPlanId,
			});

		expect(activation.outcome).toBe("rejected");
		if (activation.outcome !== "rejected") {
			throw new Error("Expected workout activation rejection");
		}
		expect(activation.reasonCode).toBe("blocking_plan_entry_due_for_execution");
		expect(activation.blockingPlanEntryId).toBeTruthy();

		const workoutOwnedEntries = await getWorkoutOwnedEntries(
			t,
			createResult.workoutPlanId
		);
		expect(workoutOwnedEntries).toHaveLength(0);
	});

	it("preserves workout ownership when a workout-owned entry is rescheduled", async () => {
		const t = createBackendTestConvex();
		const asOf = new Date("2026-04-06T12:00:00.000Z").getTime();
		vi.setSystemTime(asOf);

		const { createResult } = await seedWorkoutFixture(t, {
			entryScheduledDate: asOf + 5 * 86_400_000,
			workoutScheduledDate: asOf + 3_600_000,
		});
		const activation = await t
			.withIdentity(PAYMENT_OPERATOR)
			.mutation(api.payments.collectionPlan.workout.activateWorkoutPlan, {
				workoutPlanId: createResult.workoutPlanId,
			});
		if (activation.outcome !== "activated") {
			throw new Error("Expected workout activation to succeed");
		}

		const [workoutEntry] = await getWorkoutOwnedEntries(
			t,
			createResult.workoutPlanId
		);
		if (!workoutEntry) {
			throw new Error("Expected workout-owned plan entry");
		}

		const reschedule = await t
			.withIdentity(PAYMENT_OPERATOR)
			.mutation(api.payments.collectionPlan.reschedule.reschedulePlanEntry, {
				planEntryId: workoutEntry._id,
				newScheduledDate: asOf + 2 * 3_600_000,
				reason:
					"Operator aligned workout installment to reviewed hardship schedule",
			});

		expect(reschedule.outcome).toBe("rescheduled");
		if (reschedule.outcome !== "rescheduled") {
			throw new Error("Expected workout entry reschedule to succeed");
		}

		const replacement = await t.run((ctx) =>
			ctx.db.get(reschedule.replacementPlanEntryId)
		);
		expect(replacement?.source).toBe("admin_reschedule");
		expect(replacement?.workoutPlanId).toBe(createResult.workoutPlanId);
		expect(replacement?.rescheduledFromId).toBe(workoutEntry._id);
	});

	it("keeps retry ownership on a failed workout execution", async () => {
		vi.stubEnv("ENABLE_MOCK_PROVIDERS", "false");

		const t = createBackendTestConvex();
		const asOf = new Date("2026-04-06T12:00:00.000Z").getTime();
		vi.setSystemTime(asOf);

		await seedCollectionRules(t);
		const { createResult } = await seedWorkoutFixture(t, {
			entryScheduledDate: asOf + 5 * 86_400_000,
			obligationStatuses: ["due", "upcoming"],
			workoutMethod: "mock_pad",
			workoutScheduledDate: asOf - 1000,
		});
		const activation = await t
			.withIdentity(PAYMENT_OPERATOR)
			.mutation(api.payments.collectionPlan.workout.activateWorkoutPlan, {
				workoutPlanId: createResult.workoutPlanId,
			});
		if (activation.outcome !== "activated") {
			throw new Error("Expected workout activation to succeed");
		}

		const [workoutEntry] = await getWorkoutOwnedEntries(
			t,
			createResult.workoutPlanId
		);
		if (!workoutEntry) {
			throw new Error("Expected workout-owned plan entry");
		}

		const summary = await t.action(
			internal.payments.collectionPlan.runner.processDuePlanEntries,
			{
				asOf,
				batchSize: 10,
			}
		);
		await drainScheduledWork(t);

		expect(summary.attemptCreatedCount).toBe(1);
		expect(summary.handoffFailureCount).toBe(1);

		const retryEntry = await t.run(async (ctx) =>
			ctx.db
				.query("collectionPlanEntries")
				.withIndex("by_retry_of", (q) =>
					q.eq("retryOfId", workoutEntry._id).eq("source", "retry_rule")
				)
				.first()
		);
		expect(retryEntry?._id).toBeTruthy();
		expect(retryEntry?.workoutPlanId).toBe(createResult.workoutPlanId);
	});

	it("completes an active workout by cancelling future workout entries and restoring canonical default scheduling", async () => {
		const t = createBackendTestConvex();
		const asOf = new Date("2026-02-01T12:00:00.000Z").getTime();
		vi.setSystemTime(asOf);

		const { scheduleRuleId } = await seedCollectionRules(t);
		const { createResult, obligationIds } = await seedWorkoutFixture(t, {
			entryScheduledDate: asOf + 8 * 86_400_000,
			workoutScheduledDate: asOf + 2 * 86_400_000,
		});

		const activation = await t
			.withIdentity(PAYMENT_OPERATOR)
			.mutation(api.payments.collectionPlan.workout.activateWorkoutPlan, {
				workoutPlanId: createResult.workoutPlanId,
			});
		if (activation.outcome !== "activated") {
			throw new Error("Expected workout activation to succeed");
		}

		const completion = await t
			.withIdentity(PAYMENT_OPERATOR)
			.mutation(api.payments.collectionPlan.workout.completeWorkoutPlan, {
				workoutPlanId: createResult.workoutPlanId,
			});

		expect(completion.outcome).toBe("completed");
		if (completion.outcome !== "completed") {
			throw new Error("Expected workout completion to succeed");
		}
		expect(completion.statusAfter).toBe("completed");
		expect(completion.cancelledPlanEntryIds).toHaveLength(2);
		expect(completion.restoredPlanEntryIds).toHaveLength(2);

		const workoutPlanView = await t
			.withIdentity(PAYMENT_OPERATOR)
			.query(api.payments.collectionPlan.workout.getWorkoutPlan, {
				workoutPlanId: createResult.workoutPlanId,
			});
		expect(workoutPlanView?.workoutPlan.status).toBe("completed");
		expect(workoutPlanView?.workoutPlan.completedAt).toBe(asOf);

		const workoutOwnedEntries = await getWorkoutOwnedEntries(
			t,
			createResult.workoutPlanId
		);
		expect(workoutOwnedEntries).toHaveLength(2);
		expect(
			workoutOwnedEntries.every((entry) => entry.status === "cancelled")
		).toBe(true);
		expect(
			workoutOwnedEntries.every((entry) => entry.cancelledAt === asOf)
		).toBe(true);
		expect(
			workoutOwnedEntries.every(
				(entry) => entry.supersededByWorkoutPlanId === undefined
			)
		).toBe(true);

		const restoredEntries = await t.run(async (ctx) => {
			const entries = await ctx.db
				.query("collectionPlanEntries")
				.withIndex("by_status", (q) => q.eq("status", "planned"))
				.collect();
			return entries.filter(
				(entry) =>
					entry.source === "default_schedule" &&
					entry.workoutPlanId === undefined &&
					entry.createdByRuleId === scheduleRuleId &&
					entry.obligationIds.some((obligationId) =>
						obligationIds.includes(obligationId)
					)
			);
		});
		expect(restoredEntries).toHaveLength(2);
		expect(
			restoredEntries.every(
				(entry) =>
					entry.scheduledDate === new Date("2026-02-10T12:00:00.000Z").getTime()
			)
		).toBe(true);
	});

	it("cancels an active workout and restores immediate default scheduling for collectible non-upcoming obligations", async () => {
		const t = createBackendTestConvex();
		const asOf = new Date("2026-02-01T12:00:00.000Z").getTime();
		vi.setSystemTime(asOf);

		await seedCollectionRules(t);
		const { createResult, obligationIds } = await seedWorkoutFixture(t, {
			entryScheduledDate: asOf + 8 * 86_400_000,
			obligationStatuses: ["due", "overdue", "partially_settled"],
			workoutScheduledDate: asOf + 2 * 86_400_000,
		});

		const activation = await t
			.withIdentity(PAYMENT_OPERATOR)
			.mutation(api.payments.collectionPlan.workout.activateWorkoutPlan, {
				workoutPlanId: createResult.workoutPlanId,
			});
		if (activation.outcome !== "activated") {
			throw new Error("Expected workout activation to succeed");
		}

		const cancellation = await t
			.withIdentity(PAYMENT_OPERATOR)
			.mutation(api.payments.collectionPlan.workout.cancelWorkoutPlan, {
				workoutPlanId: createResult.workoutPlanId,
				reason: "Borrower returned to canonical collection strategy",
			});

		expect(cancellation.outcome).toBe("cancelled");
		if (cancellation.outcome !== "cancelled") {
			throw new Error("Expected workout cancellation to succeed");
		}
		expect(cancellation.statusAfter).toBe("cancelled");
		expect(cancellation.cancelledPlanEntryIds).toHaveLength(3);
		expect(cancellation.restoredPlanEntryIds).toHaveLength(3);

		const restoredEntries = await t.run(async (ctx) => {
			const entries = await ctx.db
				.query("collectionPlanEntries")
				.withIndex("by_status", (q) => q.eq("status", "planned"))
				.collect();
			return entries.filter(
				(entry) =>
					entry.source === "default_schedule" &&
					entry.workoutPlanId === undefined &&
					entry.obligationIds.some((obligationId) =>
						obligationIds.includes(obligationId)
					)
			);
		});
		expect(restoredEntries).toHaveLength(3);
		expect(restoredEntries.every((entry) => entry.scheduledDate === asOf)).toBe(
			true
		);
	});

	it("cancels a draft workout without rewriting collection entries", async () => {
		const t = createBackendTestConvex();
		const asOf = new Date("2026-02-01T12:00:00.000Z").getTime();
		vi.setSystemTime(asOf);

		const { createResult } = await seedWorkoutFixture(t, {
			entryScheduledDate: asOf + 8 * 86_400_000,
			workoutScheduledDate: asOf + 2 * 86_400_000,
		});

		const cancellation = await t
			.withIdentity(PAYMENT_OPERATOR)
			.mutation(api.payments.collectionPlan.workout.cancelWorkoutPlan, {
				workoutPlanId: createResult.workoutPlanId,
				reason: "Operator discarded draft workout",
			});

		expect(cancellation.outcome).toBe("cancelled");
		if (cancellation.outcome !== "cancelled") {
			throw new Error("Expected draft workout cancellation to succeed");
		}
		expect(cancellation.cancelledPlanEntryIds).toHaveLength(0);
		expect(cancellation.restoredPlanEntryIds).toHaveLength(0);

		const workoutPlanView = await t
			.withIdentity(PAYMENT_OPERATOR)
			.query(api.payments.collectionPlan.workout.getWorkoutPlan, {
				workoutPlanId: createResult.workoutPlanId,
			});
		expect(workoutPlanView?.workoutPlan.status).toBe("cancelled");
		expect(workoutPlanView?.workoutPlan.cancelReason).toBe(
			"Operator discarded draft workout"
		);
		expect(workoutPlanView?.ownedPlanEntries).toHaveLength(0);
	});

	it("rejects workout exit when a workout-owned entry is already due for execution", async () => {
		const t = createBackendTestConvex();
		const asOf = new Date("2026-02-01T12:00:00.000Z").getTime();
		vi.setSystemTime(asOf);

		await seedCollectionRules(t);
		const { createResult } = await seedWorkoutFixture(t, {
			entryScheduledDate: asOf + 8 * 86_400_000,
			workoutScheduledDate: asOf - 1000,
		});

		const activation = await t
			.withIdentity(PAYMENT_OPERATOR)
			.mutation(api.payments.collectionPlan.workout.activateWorkoutPlan, {
				workoutPlanId: createResult.workoutPlanId,
			});
		if (activation.outcome !== "activated") {
			throw new Error("Expected workout activation to succeed");
		}

		const completion = await t
			.withIdentity(PAYMENT_OPERATOR)
			.mutation(api.payments.collectionPlan.workout.completeWorkoutPlan, {
				workoutPlanId: createResult.workoutPlanId,
			});

		expect(completion.outcome).toBe("rejected");
		if (completion.outcome !== "rejected") {
			throw new Error("Expected workout completion rejection");
		}
		expect(completion.reasonCode).toBe("blocking_plan_entry_due_for_execution");
		expect(completion.blockingPlanEntryId).toBeTruthy();
	});

	it("rejects workout exit when a workout-owned entry already has execution linkage", async () => {
		const t = createBackendTestConvex();
		const asOf = new Date("2026-02-01T12:00:00.000Z").getTime();
		vi.setSystemTime(asOf);

		await seedCollectionRules(t);
		const { createResult } = await seedWorkoutFixture(t, {
			entryScheduledDate: asOf + 8 * 86_400_000,
			workoutScheduledDate: asOf + 2 * 86_400_000,
		});

		const activation = await t
			.withIdentity(PAYMENT_OPERATOR)
			.mutation(api.payments.collectionPlan.workout.activateWorkoutPlan, {
				workoutPlanId: createResult.workoutPlanId,
			});
		if (activation.outcome !== "activated") {
			throw new Error("Expected workout activation to succeed");
		}

		const [workoutEntry] = await getWorkoutOwnedEntries(
			t,
			createResult.workoutPlanId
		);
		if (!workoutEntry) {
			throw new Error("Expected workout-owned entry");
		}
		await seedCollectionAttempt(t, {
			planEntryId: workoutEntry._id,
			method: workoutEntry.method,
			amount: workoutEntry.amount,
		});

		const completion = await t
			.withIdentity(PAYMENT_OPERATOR)
			.mutation(api.payments.collectionPlan.workout.completeWorkoutPlan, {
				workoutPlanId: createResult.workoutPlanId,
			});

		expect(completion.outcome).toBe("rejected");
		if (completion.outcome !== "rejected") {
			throw new Error("Expected workout completion rejection");
		}
		expect(completion.reasonCode).toBe("blocking_plan_entry_execution_state");
		expect(completion.blockingPlanEntryId).toBe(workoutEntry._id);
	});

	it("does not create duplicate restored entries when non-workout coverage already exists", async () => {
		const t = createBackendTestConvex();
		const asOf = new Date("2026-02-01T12:00:00.000Z").getTime();
		vi.setSystemTime(asOf);

		await seedCollectionRules(t);
		const { createResult, obligationIds } = await seedWorkoutFixture(t, {
			entryScheduledDate: asOf + 8 * 86_400_000,
			workoutScheduledDate: asOf + 2 * 86_400_000,
		});

		const activation = await t
			.withIdentity(PAYMENT_OPERATOR)
			.mutation(api.payments.collectionPlan.workout.activateWorkoutPlan, {
				workoutPlanId: createResult.workoutPlanId,
			});
		if (activation.outcome !== "activated") {
			throw new Error("Expected workout activation to succeed");
		}

		await seedPlanEntry(t, {
			obligationIds: obligationIds.slice(0, 1),
			amount: 300_000,
			method: "manual",
			scheduledDate: asOf + 9 * 86_400_000,
			status: "planned",
			source: "admin",
		});

		const completion = await t
			.withIdentity(PAYMENT_OPERATOR)
			.mutation(api.payments.collectionPlan.workout.completeWorkoutPlan, {
				workoutPlanId: createResult.workoutPlanId,
			});

		expect(completion.outcome).toBe("completed");
		if (completion.outcome !== "completed") {
			throw new Error("Expected workout completion");
		}
		expect(completion.restoredPlanEntryIds).toHaveLength(1);
	});
});
