import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setup } from "xstate";
import { internal } from "../../../../convex/_generated/api";
import { effectRegistry } from "../../../../convex/engine/effects/registry";
import { machineRegistry } from "../../../../convex/engine/machines/registry";
import {
	approveRequest,
	createGovernedTestConvex,
	createSelfSignupRequest,
	getAuditJournalRows,
	getRequest,
	getRequestAuditHistory,
	seedDefaultGovernedActors,
} from "../onboarding/helpers";

interface AuditHistoryEvent {
	action?: string;
	metadata?: {
		outcome?: string;
	};
}

describe("transition engine", () => {
	const originalMachine = machineRegistry.onboardingRequest;
	const originalTestEffect = effectRegistry.testEffect;

	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		machineRegistry.onboardingRequest = originalMachine;
		if (originalTestEffect) {
			effectRegistry.testEffect = originalTestEffect;
		} else {
			effectRegistry.testEffect = undefined as typeof originalTestEffect;
		}
		vi.restoreAllMocks();
		vi.clearAllTimers();
		vi.useRealTimers();
	});

	it("transitions pending_review to approved via transitionMutation", async () => {
		const t = createGovernedTestConvex();
		await seedDefaultGovernedActors(t);

		const requestId = await createSelfSignupRequest(t, "lender");
		const result = await t.mutation(
			internal.engine.transitionMutation.transitionMutation,
			{
				entityType: "onboardingRequest",
				entityId: requestId,
				eventType: "APPROVE",
				payload: {},
				source: {
					actorId: "user_fairlend_admin",
					actorType: "admin",
					channel: "admin_dashboard",
				},
			}
		);

		expect(result).toMatchObject({
			success: true,
			previousState: "pending_review",
			newState: "approved",
			effectsScheduled: ["assignRoleToUser"],
		});

		const request = await getRequest(t, requestId);
		expect(request?.status).toBe("approved");
	});

	it("transitions pending_review to rejected via transitionMutation", async () => {
		const t = createGovernedTestConvex();
		await seedDefaultGovernedActors(t);

		const requestId = await createSelfSignupRequest(t, "lender");
		const result = await t.mutation(
			internal.engine.transitionMutation.transitionMutation,
			{
				entityType: "onboardingRequest",
				entityId: requestId,
				eventType: "REJECT",
				payload: { rejectionReason: "Insufficient docs" },
				source: {
					actorId: "user_fairlend_admin",
					actorType: "admin",
					channel: "admin_dashboard",
				},
			}
		);

		expect(result).toMatchObject({
			success: true,
			previousState: "pending_review",
			newState: "rejected",
			effectsScheduled: [],
		});

		const request = await getRequest(t, requestId);
		expect(request?.status).toBe("rejected");
	});

	it("transitions approved to role_assigned via transitionMutation", async () => {
		const t = createGovernedTestConvex();
		await seedDefaultGovernedActors(t);

		const requestId = await createSelfSignupRequest(t, "lender");
		await approveRequest(t, requestId);

		const result = await t.mutation(
			internal.engine.transitionMutation.transitionMutation,
			{
				entityType: "onboardingRequest",
				entityId: requestId,
				eventType: "ASSIGN_ROLE",
				payload: {},
				source: {
					actorType: "system",
					channel: "scheduler",
				},
			}
		);

		expect(result).toMatchObject({
			success: true,
			previousState: "approved",
			newState: "role_assigned",
			effectsScheduled: [],
		});

		const request = await getRequest(t, requestId);
		expect(request?.status).toBe("role_assigned");
	});

	it("records a rejected journal entry for invalid events from the current state", async () => {
		const t = createGovernedTestConvex();
		await seedDefaultGovernedActors(t);

		const requestId = await createSelfSignupRequest(t, "lender");
		const result = await t.mutation(
			internal.engine.transitionMutation.transitionMutation,
			{
				entityType: "onboardingRequest",
				entityId: requestId,
				eventType: "ASSIGN_ROLE",
				payload: {},
				source: {
					actorType: "system",
					channel: "scheduler",
				},
			}
		);

		expect(result).toMatchObject({
			success: false,
			previousState: "pending_review",
			newState: "pending_review",
		});
		expect(result.reason).toContain("not valid");

		const latestJournal = (await getAuditJournalRows(t, requestId)).at(-1);
		expect(latestJournal).toMatchObject({
			eventType: "ASSIGN_ROLE",
			outcome: "rejected",
			previousState: "pending_review",
			newState: "pending_review",
		});

		const auditHistory = await getRequestAuditHistory(t, requestId);
		expect(
			auditHistory.some(
				(event: AuditHistoryEvent) =>
					event.action === "transition.onboardingRequest.rejected"
			)
		).toBe(true);
	});

	it("rejects same-state transitions with no effects", async () => {
		const t = createGovernedTestConvex();
		await seedDefaultGovernedActors(t);

		const requestId = await createSelfSignupRequest(t, "lender");
		await approveRequest(t, requestId);

		const result = await t.mutation(
			internal.engine.transitionMutation.transitionMutation,
			{
				entityType: "onboardingRequest",
				entityId: requestId,
				eventType: "APPROVE",
				payload: {},
				source: {
					actorId: "user_fairlend_admin",
					actorType: "admin",
					channel: "admin_dashboard",
				},
			}
		);

		expect(result).toMatchObject({
			success: false,
			previousState: "approved",
			newState: "approved",
		});

		const latestJournal = (await getAuditJournalRows(t, requestId)).at(-1);
		expect(latestJournal?.outcome).toBe("rejected");
	});

	it("schedules same-state effects and skips xstate actions", async () => {
		const t = createGovernedTestConvex();
		await seedDefaultGovernedActors(t);
		const requestId = await createSelfSignupRequest(t, "broker");
		await approveRequest(t, requestId);

		const retryMachine = setup({
			types: {
				context: {} as Record<string, never>,
				events: {} as { type: "RETRY_ASSIGN" },
			},
			actions: {
				assignRoleToUser: () => {
					// noop test action
				},
				testEffect: () => {
					// noop test action
				},
			},
		}).createMachine({
			id: "onboardingRequest",
			initial: "approved",
			context: {},
			states: {
				approved: {
					on: {
						RETRY_ASSIGN: {
							actions: [
								{ type: "xstate.raise" },
								"assignRoleToUser",
								{ type: "testEffect", params: { attempt: "retry" } },
							] as unknown as never,
						},
					},
				},
			},
		});

		machineRegistry.onboardingRequest =
			retryMachine as unknown as typeof originalMachine;
		effectRegistry.testEffect =
			internal.engine.effects.onboarding.assignRoleToUser;

		const journalCountBefore = (await getAuditJournalRows(t, requestId)).length;
		const result = await t.mutation(
			internal.engine.transitionMutation.transitionMutation,
			{
				entityType: "onboardingRequest",
				entityId: requestId,
				eventType: "RETRY_ASSIGN",
				payload: {},
				source: {
					actorType: "system",
					channel: "scheduler",
				},
			}
		);

		expect(result).toMatchObject({
			success: true,
			previousState: "approved",
			newState: "approved",
			effectsScheduled: ["assignRoleToUser", "testEffect"],
		});
		expect((await getAuditJournalRows(t, requestId)).length).toBe(
			journalCountBefore
		);

		const auditHistory = await getRequestAuditHistory(t, requestId);
		expect(
			auditHistory.some(
				(event: AuditHistoryEvent) =>
					event.action === "transition.onboardingRequest.retry_assign" &&
					event.metadata?.outcome === "same_state_with_effects"
			)
		).toBe(true);
	});

	it("throws when the entity type is not supported by the transition engine", async () => {
		const t = createGovernedTestConvex();

		await expect(
			t.mutation(internal.engine.transitionMutation.transitionMutation, {
				entityType: "mortgage",
				entityId: "mortgage_123",
				eventType: "APPROVE",
				payload: {},
				source: {
					actorType: "system",
					channel: "scheduler",
				},
			})
		).rejects.toThrow("not yet supported");
	});

	it("throws when the entity does not exist", async () => {
		const t = createGovernedTestConvex();
		await seedDefaultGovernedActors(t);

		const requestId = await createSelfSignupRequest(t, "lender");
		await t.run(async (ctx) => {
			await ctx.db.delete(requestId);
		});

		await expect(
			t.mutation(internal.engine.transitionMutation.transitionMutation, {
				entityType: "onboardingRequest",
				entityId: requestId,
				eventType: "APPROVE",
				payload: {},
				source: {
					actorType: "system",
					channel: "scheduler",
				},
			})
		).rejects.toThrow("not found");
	});

	it("throws when no machine is registered for the entity type", async () => {
		const t = createGovernedTestConvex();
		await seedDefaultGovernedActors(t);

		const requestId = await createSelfSignupRequest(t, "lender");
		machineRegistry.onboardingRequest = undefined;

		await expect(
			t.mutation(internal.engine.transitionMutation.transitionMutation, {
				entityType: "onboardingRequest",
				entityId: requestId,
				eventType: "APPROVE",
				payload: {},
				source: {
					actorType: "system",
					channel: "scheduler",
				},
			})
		).rejects.toThrow("No machine registered");
	});
});
