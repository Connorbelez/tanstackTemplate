import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setup } from "xstate";
import { internal } from "../../../../convex/_generated/api";
import { effectRegistry } from "../../../../convex/engine/effects/registry";
import { machineRegistry } from "../../../../convex/engine/machines/registry";
import { executeTransition } from "../../../../convex/engine/transition";
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
			effectsScheduled: ["notifyApplicantApproved"],
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
			effectsScheduled: ["notifyApplicantRejected"],
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
			effectsScheduled: ["assignRole"],
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
				assignRole: () => {
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
								"assignRole",
								{ type: "testEffect", params: { attempt: "retry" } },
							] as unknown as never,
						},
					},
				},
			},
		});

		machineRegistry.onboardingRequest =
			retryMachine as unknown as typeof originalMachine;
		effectRegistry.testEffect = internal.engine.effects.onboarding.assignRole;

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
			effectsScheduled: ["assignRole", "testEffect"],
		});
		// Same-state-with-effects still writes a journal entry for traceability
		expect((await getAuditJournalRows(t, requestId)).length).toBe(
			journalCountBefore + 1
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

	it("rejects same-state transitions when the event config is a string target", async () => {
		const t = createGovernedTestConvex();
		await seedDefaultGovernedActors(t);
		const requestId = await createSelfSignupRequest(t, "broker");
		await approveRequest(t, requestId);

		const stringTargetMachine = setup({
			types: {
				context: {} as Record<string, never>,
				events: {} as { type: "RETRY_STRING" },
			},
		}).createMachine({
			id: "onboardingRequest",
			initial: "approved",
			context: {},
			states: {
				approved: {
					on: {
						RETRY_STRING: "approved",
					},
				},
			},
		});

		machineRegistry.onboardingRequest =
			stringTargetMachine as unknown as typeof originalMachine;

		const result = await t.mutation(
			internal.engine.transitionMutation.transitionMutation,
			{
				entityType: "onboardingRequest",
				entityId: requestId,
				eventType: "RETRY_STRING",
				payload: {},
				source: {
					actorType: "system",
					channel: "scheduler",
				},
			}
		);

		expect(result).toMatchObject({
			success: false,
			previousState: "approved",
			newState: "approved",
		});
	});

	it("ignores undefined action descriptors when extracting scheduled effects", async () => {
		const t = createGovernedTestConvex();
		await seedDefaultGovernedActors(t);
		const requestId = await createSelfSignupRequest(t, "broker");
		await approveRequest(t, requestId);

		const undefinedActionMachine = setup({
			types: {
				context: {} as Record<string, never>,
				events: {} as { type: "RETRY_UNDEFINED" },
			},
		}).createMachine({
			id: "onboardingRequest",
			initial: "approved",
			context: {},
			states: {
				approved: {
					on: {
						RETRY_UNDEFINED: {
							actions: undefined,
						},
					},
				},
			},
		});

		machineRegistry.onboardingRequest =
			undefinedActionMachine as unknown as typeof originalMachine;

		const result = await t.mutation(
			internal.engine.transitionMutation.transitionMutation,
			{
				entityType: "onboardingRequest",
				entityId: requestId,
				eventType: "RETRY_UNDEFINED",
				payload: {},
				source: {
					actorType: "system",
					channel: "scheduler",
				},
			}
		);

		expect(result).toMatchObject({
			success: false,
			previousState: "approved",
			newState: "approved",
		});
	});

	it("schedules single object action descriptors without array wrapping", async () => {
		const t = createGovernedTestConvex();
		await seedDefaultGovernedActors(t);
		const requestId = await createSelfSignupRequest(t, "broker");
		await approveRequest(t, requestId);

		const singleActionMachine = setup({
			types: {
				context: {} as Record<string, never>,
				events: {} as { type: "RETRY_SINGLE_ACTION" },
			},
			actions: {
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
						RETRY_SINGLE_ACTION: {
							actions: {
								type: "testEffect",
								params: { attempt: "single" },
							} as never,
						},
					},
				},
			},
		});

		machineRegistry.onboardingRequest =
			singleActionMachine as unknown as typeof originalMachine;
		effectRegistry.testEffect = internal.engine.effects.onboarding.assignRole;

		const result = await t.mutation(
			internal.engine.transitionMutation.transitionMutation,
			{
				entityType: "onboardingRequest",
				entityId: requestId,
				eventType: "RETRY_SINGLE_ACTION",
				payload: {},
				source: {
					actorType: "system",
					channel: "scheduler",
				},
			}
		);

		expect(result).toMatchObject({
			success: true,
			newState: "approved",
			effectsScheduled: ["testEffect"],
		});
	});

	it("uses scheduler channel when source specifies scheduler", async () => {
		const t = createGovernedTestConvex();
		await seedDefaultGovernedActors(t);
		const requestId = await createSelfSignupRequest(t, "lender");

		const result = await t.run(async (ctx) =>
			executeTransition(ctx as never, {
				entityType: "onboardingRequest",
				entityId: requestId,
				eventType: "ASSIGN_ROLE",
				source: { channel: "scheduler" },
			})
		);

		expect(result).toMatchObject({
			success: false,
			previousState: "pending_review",
			newState: "pending_review",
		});

		const latestJournal = (await getAuditJournalRows(t, requestId)).at(-1);
		expect(latestJournal?.channel).toBe("scheduler");
	});

	it("defaults to scheduler channel when source is omitted", async () => {
		const t = createGovernedTestConvex();
		await seedDefaultGovernedActors(t);
		const requestId = await createSelfSignupRequest(t, "lender");

		const result = await t.run(async (ctx) =>
			executeTransition(
				ctx as never,
				// Omit `source` to exercise the default fallback path
				{
					entityType: "onboardingRequest",
					entityId: requestId,
					eventType: "ASSIGN_ROLE",
				} as Parameters<typeof executeTransition>[1]
			)
		);

		expect(result).toMatchObject({
			success: false,
			previousState: "pending_review",
			newState: "pending_review",
		});

		const latestJournal = (await getAuditJournalRows(t, requestId)).at(-1);
		expect(latestJournal).toBeDefined();
		expect(latestJournal?.channel).toBe("scheduler");
	});

	it("throws ENTITY_NOT_FOUND for a governed entity type with an invalid entity ID", async () => {
		const t = createGovernedTestConvex();

		const error = await t
			.mutation(internal.engine.transitionMutation.transitionMutation, {
				entityType: "mortgage",
				entityId: "mortgage_123",
				eventType: "APPROVE",
				payload: {},
				source: {
					actorType: "system",
					channel: "scheduler",
				},
			})
			.catch((e: unknown) => e);

		// ConvexError data may be serialised to a JSON string by convex-test
		const data =
			error &&
			typeof error === "object" &&
			"data" in error &&
			typeof error.data === "string"
				? JSON.parse(error.data)
				: (error as { data: unknown }).data;

		expect(data).toMatchObject({ code: "ENTITY_NOT_FOUND" });
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
