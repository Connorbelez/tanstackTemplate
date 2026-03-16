import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setup } from "xstate";
import { internal } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
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
	rejectRequest,
	seedDefaultGovernedActors,
} from "../onboarding/helpers";

interface AuditHistoryEvent {
	action?: string;
	metadata?: {
		outcome?: string;
	};
}

type GovernedTestConvex = ReturnType<typeof createGovernedTestConvex>;

async function getConvexErrorData(error: unknown) {
	if (typeof error === "string") {
		const parsed = JSON.parse(error) as unknown;
		return typeof parsed === "string" ? JSON.parse(parsed) : parsed;
	}
	if (
		error &&
		typeof error === "object" &&
		"data" in error &&
		typeof error.data === "string"
	) {
		const parsed = JSON.parse(error.data) as unknown;
		return typeof parsed === "string" ? JSON.parse(parsed) : parsed;
	}
	if (error && typeof error === "object" && "data" in error) {
		return error.data;
	}
	return undefined;
}

async function getEntityJournalRows(
	t: GovernedTestConvex,
	entityType: "mortgage" | "onboardingRequest",
	entityId: string
) {
	return t.run(async (ctx) => {
		return ctx.db
			.query("auditJournal")
			.withIndex("by_entity", (q) =>
				q.eq("entityType", entityType).eq("entityId", entityId)
			)
			.collect();
	});
}

async function seedMortgage(
	t: GovernedTestConvex,
	options?: {
		machineContext?: {
			lastPaymentAt: number;
			missedPayments: number;
		};
		status?: string;
	}
): Promise<Id<"mortgages">> {
	return t.run(async (ctx) => {
		const createdAt = Date.now();
		const brokerUserId = await ctx.db.insert("users", {
			authId: `user_mortgage_broker_${createdAt}`,
			email: `mortgage-broker-${createdAt}@fairlend.test`,
			firstName: "Mortgage",
			lastName: "Broker",
		});
		const brokerId = await ctx.db.insert("brokers", {
			status: "active",
			userId: brokerUserId,
			createdAt,
		});
		const propertyId = await ctx.db.insert("properties", {
			streetAddress: "1 Test Street",
			city: "Toronto",
			province: "ON",
			postalCode: "M5V1E1",
			propertyType: "residential",
			createdAt,
		});

		return ctx.db.insert("mortgages", {
			status: options?.status ?? "active",
			machineContext: options?.machineContext,
			propertyId,
			principal: 500_000_00,
			interestRate: 0.0599,
			rateType: "fixed",
			termMonths: 12,
			amortizationMonths: 300,
			paymentAmount: 2_950_00,
			paymentFrequency: "monthly",
			loanType: "conventional",
			lienPosition: 1,
			interestAdjustmentDate: "2026-01-01",
			termStartDate: "2026-01-01",
			maturityDate: "2027-01-01",
			firstPaymentDate: "2026-02-01",
			brokerOfRecordId: brokerId,
			createdAt,
		});
	});
}

async function getMortgage(t: GovernedTestConvex, mortgageId: Id<"mortgages">) {
	return t.run(async (ctx) => ctx.db.get(mortgageId));
}

async function seedPendingOnboardingRequest(
	t: GovernedTestConvex
): Promise<Id<"onboardingRequests">> {
	return t.run(async (ctx) => {
		const createdAt = Date.now();
		const userId = await ctx.db.insert("users", {
			authId: `user_onboarding_${createdAt}`,
			email: `onboarding-${createdAt}@fairlend.test`,
			firstName: "Onboarding",
			lastName: "Member",
		});

		return ctx.db.insert("onboardingRequests", {
			userId,
			requestedRole: "lender",
			status: "pending_review",
			referralSource: "self_signup",
			targetOrganizationId: "org_fairlend_brokerage",
			createdAt,
		});
	});
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

		const latestJournal = (await getAuditJournalRows(t, requestId)).at(-1);
		expect(latestJournal).toMatchObject({
			entityType: "onboardingRequest",
			entityId: requestId,
			eventType: "APPROVE",
			previousState: "pending_review",
			newState: "approved",
			outcome: "transitioned",
			actorId: "user_fairlend_admin",
			actorType: "admin",
			channel: "admin_dashboard",
			machineVersion: "onboardingRequest@1.0.0",
		});
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

	it("rejects terminal onboarding requests without scheduling effects", async () => {
		const t = createGovernedTestConvex();
		await seedDefaultGovernedActors(t);

		const requestId = await createSelfSignupRequest(t, "lender");
		await rejectRequest(t, requestId, "Incomplete application");
		const journalCountBefore = (await getAuditJournalRows(t, requestId)).length;

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
			previousState: "rejected",
			newState: "rejected",
		});
		expect(result.effectsScheduled).toBeUndefined();
		expect((await getRequest(t, requestId))?.status).toBe("rejected");

		const latestJournal = (await getAuditJournalRows(t, requestId)).at(-1);
		expect(latestJournal).toMatchObject({
			eventType: "APPROVE",
			outcome: "rejected",
			previousState: "rejected",
			newState: "rejected",
		});
		expect(latestJournal?.reason).toContain('Event "APPROVE" not valid');
		expect((await getAuditJournalRows(t, requestId)).length).toBe(
			journalCountBefore + 1
		);
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

	it("rejects DEFAULT_THRESHOLD_REACHED when the mortgage guard fails", async () => {
		const t = createGovernedTestConvex();
		const mortgageId = await seedMortgage(t, {
			status: "delinquent",
			machineContext: {
				lastPaymentAt: 0,
				missedPayments: 2,
			},
		});

		const result = await t.mutation(
			internal.engine.transitionMutation.transitionMutation,
			{
				entityType: "mortgage",
				entityId: mortgageId,
				eventType: "DEFAULT_THRESHOLD_REACHED",
				payload: {},
				source: {
					channel: "scheduler",
					actorType: "system",
				},
			}
		);

		expect(result).toMatchObject({
			success: false,
			previousState: "delinquent",
			newState: "delinquent",
		});
		expect(result.effectsScheduled).toBeUndefined();

		const mortgage = await getMortgage(t, mortgageId);
		expect(mortgage?.status).toBe("delinquent");
		expect(mortgage?.machineContext).toEqual({
			lastPaymentAt: 0,
			missedPayments: 2,
		});

		const latestJournal = (
			await getEntityJournalRows(t, "mortgage", mortgageId)
		).at(-1);
		expect(latestJournal).toMatchObject({
			entityType: "mortgage",
			entityId: mortgageId,
			eventType: "DEFAULT_THRESHOLD_REACHED",
			outcome: "rejected",
			previousState: "delinquent",
			newState: "delinquent",
		});
	});

	it("writes an unbroken audit journal chain across multiple transition-engine events", async () => {
		const t = createGovernedTestConvex();
		const requestId = await seedPendingOnboardingRequest(t);

		await t.mutation(internal.engine.transitionMutation.transitionMutation, {
			entityType: "onboardingRequest",
			entityId: requestId,
			eventType: "APPROVE",
			payload: {},
			source: {
				actorId: "user_fairlend_admin",
				actorType: "admin",
				channel: "admin_dashboard",
			},
		});
		await t.mutation(internal.engine.transitionMutation.transitionMutation, {
			entityType: "onboardingRequest",
			entityId: requestId,
			eventType: "ASSIGN_ROLE",
			payload: {},
			source: { channel: "scheduler", actorType: "system" },
		});

		const journalEntries = await getEntityJournalRows(
			t,
			"onboardingRequest",
			requestId
		);
		expect(journalEntries).toHaveLength(2);
		expect(
			journalEntries.map((entry) => ({
				eventType: entry.eventType,
				previousState: entry.previousState,
				newState: entry.newState,
			}))
		).toEqual([
			{
				eventType: "APPROVE",
				previousState: "pending_review",
				newState: "approved",
			},
			{
				eventType: "ASSIGN_ROLE",
				previousState: "approved",
				newState: "role_assigned",
			},
		]);

		for (let index = 1; index < journalEntries.length; index += 1) {
			expect(journalEntries[index]?.previousState).toBe(
				journalEntries[index - 1]?.newState
			);
		}

		expect((await getRequest(t, requestId))?.status).toBe("role_assigned");
	});

	it("warns and still commits the transition when an effect is missing from the registry", async () => {
		const t = createGovernedTestConvex();
		await seedDefaultGovernedActors(t);
		const requestId = await createSelfSignupRequest(t, "lender");
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		const missingEffectMachine = setup({
			types: {
				context: {} as Record<string, never>,
				events: {} as { type: "APPROVE" },
			},
			actions: {
				missingEffect: () => {
					// noop test action
				},
			},
		}).createMachine({
			id: "onboardingRequest",
			initial: "pending_review",
			context: {},
			states: {
				pending_review: {
					on: {
						APPROVE: {
							target: "approved",
							actions: ["missingEffect"],
						},
					},
				},
				approved: {},
			},
		});

		machineRegistry.onboardingRequest =
			missingEffectMachine as unknown as typeof originalMachine;

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
			effectsScheduled: [],
		});
		expect(warnSpy).toHaveBeenCalledWith(
			expect.stringContaining('No handler registered for effect "missingEffect"')
		);
		expect((await getRequest(t, requestId))?.status).toBe("approved");
	});

	it("keeps a consistent final state under competing transition requests", async () => {
		const t = createGovernedTestConvex();
		await seedDefaultGovernedActors(t);
		const requestId = await createSelfSignupRequest(t, "lender");

		// convex-test serializes top-level functions, so this models competing
		// requests in the test harness while production relies on OCC retries.
		const [first, second] = await Promise.all([
			t.mutation(internal.engine.transitionMutation.transitionMutation, {
				entityType: "onboardingRequest",
				entityId: requestId,
				eventType: "APPROVE",
				payload: {},
				source: {
					actorId: "user_fairlend_admin",
					actorType: "admin",
					channel: "admin_dashboard",
				},
			}),
			t.mutation(internal.engine.transitionMutation.transitionMutation, {
				entityType: "onboardingRequest",
				entityId: requestId,
				eventType: "APPROVE",
				payload: {},
				source: {
					actorId: "user_fairlend_admin",
					actorType: "admin",
					channel: "admin_dashboard",
				},
			}),
		]);

		const results = [first, second];
		expect(results.filter((result) => result.success)).toHaveLength(1);
		expect(results.filter((result) => !result.success)).toHaveLength(1);
		expect((await getRequest(t, requestId))?.status).toBe("approved");

		const approveEntries = (await getAuditJournalRows(t, requestId)).filter(
			(entry) => entry.eventType === "APPROVE"
		);
		expect(approveEntries).toHaveLength(2);
		expect(approveEntries.map((entry) => entry.outcome)).toEqual([
			"transitioned",
			"rejected",
		]);
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

	it("throws UNKNOWN_ENTITY_TYPE before attempting to load the entity", async () => {
		const t = createGovernedTestConvex();

		const error = await t
			.run(async (ctx) =>
				executeTransition(ctx as never, {
					entityType: "notARealEntityType" as never,
					entityId: "fake_entity_id",
					eventType: "ANY_EVENT",
					payload: {},
					source: {
						channel: "scheduler",
					},
				})
			)
			.catch((caughtError: unknown) => caughtError);

		expect(await getConvexErrorData(error)).toMatchObject({
			code: "UNKNOWN_ENTITY_TYPE",
		});
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
