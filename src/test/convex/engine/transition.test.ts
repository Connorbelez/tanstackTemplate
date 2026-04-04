import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setup } from "xstate";
import { internal } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { effectRegistry } from "../../../../convex/engine/effects/registry";
import { machineRegistry } from "../../../../convex/engine/machines/registry";
import { executeTransition } from "../../../../convex/engine/transition";
import type { EntityType } from "../../../../convex/engine/types";
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
import {
	seedBorrowerProfile,
	seedCollectionAttempt,
	seedObligation,
	seedPlanEntry,
} from "../payments/helpers";
import {
	getAuditJournalForEntity,
	getEntity,
} from "./helpers";

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

async function seedDeal(
	t: GovernedTestConvex,
	options?: {
		machineContext?: Record<string, unknown>;
		status?: string;
	}
): Promise<Id<"deals">> {
	const mortgageId = await seedMortgage(t);

	return t.run(async (ctx) => {
		const createdAt = Date.now();

		return ctx.db.insert("deals", {
			status: options?.status ?? "initiated",
			machineContext: options?.machineContext ?? { dealId: "deal_test_1" },
			lastTransitionAt: createdAt,
			mortgageId,
			buyerId: "buyer_test_1",
			sellerId: "seller_test_1",
			fractionalShare: 0.5,
			closingDate: createdAt + 86_400_000,
			createdAt,
			createdBy: "user_fairlend_admin",
		});
	});
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
	const originalCreateDealAccess = effectRegistry.createDealAccess;
	const originalTestEffect = effectRegistry.testEffect;

	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		(machineRegistry as Record<string, unknown>).onboardingRequest =
			originalMachine;
		if (originalCreateDealAccess) {
			effectRegistry.createDealAccess = originalCreateDealAccess;
		} else {
			delete effectRegistry.createDealAccess;
		}
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

	it("does not warn or schedule effects for XState assign actions", async () => {
		const t = createGovernedTestConvex();
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		const borrowerId = await seedBorrowerProfile(t);
		const mortgageId = await seedMortgage(t);
		const obligationId = await seedObligation(t, mortgageId, borrowerId, {
			status: "due",
		});
		const planEntryId = await seedPlanEntry(t, {
			obligationIds: [obligationId],
			amount: 300_000,
			method: "manual",
		});
		const attemptId = await seedCollectionAttempt(t, {
			planEntryId,
			method: "manual",
			amount: 300_000,
		});

		const result = await t.mutation(
			internal.engine.transitionMutation.transitionMutation,
			{
				entityType: "collectionAttempt",
				entityId: attemptId,
				eventType: "DRAW_FAILED",
				payload: { reason: "NSF", code: "R01" },
				source: {
					actorType: "system",
					channel: "scheduler",
				},
			}
		);

		expect(result.success).toBe(true);
		expect(result.newState).toBe("failed");
		expect(result.effectsScheduled ?? []).toEqual([]);
		expect(warnSpy).not.toHaveBeenCalledWith(
			expect.stringContaining('No handler registered for effect "incrementRetryCount"')
		);

		const attempt = await t.run((ctx) => ctx.db.get(attemptId));
		expect(attempt?.machineContext?.retryCount).toBe(1);
	});

	it("schedules nested compound-state effects for deal sub-state transitions", async () => {
		const t = createGovernedTestConvex();
		await seedDefaultGovernedActors(t);
		effectRegistry.createDealAccess =
			internal.engine.effects.onboarding.assignRole;

		const dealId = await seedDeal(t, {
			status: "lawyerOnboarding.pending",
			machineContext: { dealId: "deal_test_nested_effect" },
		});

		const result = await t.mutation(
			internal.engine.transitionMutation.transitionMutation,
			{
				entityType: "deal",
				entityId: dealId,
				eventType: "LAWYER_VERIFIED",
				payload: { verificationId: "v-1" },
				source: {
					actorId: "user_fairlend_admin",
					actorType: "admin",
					channel: "admin_dashboard",
				},
			}
		);

		expect(result).toMatchObject({
			success: true,
			previousState: "lawyerOnboarding.pending",
			newState: "lawyerOnboarding.verified",
			effectsScheduled: ["createDealAccess"],
		});

		const deal = await getEntity(t, dealId);
		expect(deal?.status).toBe("lawyerOnboarding.verified");
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

		// Delete the key entirely so `in` check fails via isGovernedEntityType
		// biome-ignore lint/performance/noDelete: test needs key removal to trigger UNKNOWN_ENTITY_TYPE
		delete (machineRegistry as Record<string, unknown>).onboardingRequest;

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
		).rejects.toThrow("No machine registered for entity type: onboardingRequest");
	});

	it("warns but succeeds when a machine action has no effect registry entry", async () => {
		const t = createGovernedTestConvex();
		await seedDefaultGovernedActors(t);

		// Register a test machine whose initial state matches "pending_review"
		// (the state created by createSelfSignupRequest)
		const testMachine = setup({
			types: {
				context: {} as Record<string, never>,
				events: {} as { type: "GO" },
			},
			actions: {
				unknownEffect: () => {
					/* no-op stub */
				},
			},
		}).createMachine({
			id: "testMachineForMissingEffect",
			initial: "pending_review",
			context: {},
			states: {
				pending_review: {
					on: {
						GO: { target: "end", actions: ["unknownEffect"] },
					},
				},
				end: { type: "final" },
			},
		});

		const requestId = await createSelfSignupRequest(t, "lender");

		// Temporarily register the test machine
		const originalOnboarding = machineRegistry.onboardingRequest;
		machineRegistry.onboardingRequest = testMachine;

		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		const result = await t.mutation(
			internal.engine.transitionMutation.transitionMutation,
			{
				entityType: "onboardingRequest",
				entityId: requestId,
				eventType: "GO",
				payload: {},
				source: { actorType: "admin", channel: "admin_dashboard" },
			}
		);

		// Transition succeeds despite missing effect handler
		expect(result.success).toBe(true);
		expect(result.newState).toBe("end");

		// Warning was logged
		expect(warnSpy).toHaveBeenCalledWith(
			expect.stringContaining("unknownEffect")
		);

		machineRegistry.onboardingRequest = originalOnboarding;
		warnSpy.mockRestore();
	});

	// ── AC: Happy path — journal entry field assertions ──────────────

	it("happy path: APPROVE produces journal entry with correct fields", async () => {
		const t = createGovernedTestConvex();
		await seedDefaultGovernedActors(t);

		const requestId = await createSelfSignupRequest(t, "lender");
		await t.mutation(
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

		const journal = await getAuditJournalRows(t, requestId);
		const entry = journal.find(
			(j) => j.eventType === "APPROVE" && j.outcome === "transitioned"
		);
		expect(entry).toBeDefined();
		expect(entry).toMatchObject({
			entityType: "onboardingRequest",
			entityId: requestId,
			eventType: "APPROVE",
			previousState: "pending_review",
			newState: "approved",
			outcome: "transitioned",
			actorId: "user_fairlend_admin",
			channel: "admin_dashboard",
		});
		expect(entry?.machineVersion).toMatch(/^onboardingRequest@/);
		expect(entry?.timestamp).toBeGreaterThan(0);
	});

	// ── AC: Rejection path — terminal state ─────────────────────────

	it("rejects APPROVE on terminal 'rejected' state with rejection journal entry", async () => {
		const t = createGovernedTestConvex();
		await seedDefaultGovernedActors(t);

		const requestId = await createSelfSignupRequest(t, "lender");
		await rejectRequest(t, requestId);

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
		expect(result.reason).toContain("not valid");

		// Entity status unchanged
		const request = await getRequest(t, requestId);
		expect(request?.status).toBe("rejected");

		// Rejection journal entry written
		const journal = await getAuditJournalRows(t, requestId);
		const rejectionEntries = journal.filter(
			(j) => j.eventType === "APPROVE" && j.outcome === "rejected"
		);
		expect(rejectionEntries).toHaveLength(1);
		expect(rejectionEntries[0].previousState).toBe("rejected");
		expect(rejectionEntries[0].newState).toBe("rejected");
	});

	// ── AC: Concurrency ─────────────────────────────────────────────

	it("handles concurrent transitions with sequential consistency", async () => {
		// convex-test serializes mutations, so true OCC contention cannot be triggered.
		// This test verifies that two transitions dispatched via Promise.allSettled
		// produce a consistent final state with no data corruption.
		const t = createGovernedTestConvex();
		await seedDefaultGovernedActors(t);

		const requestId = await createSelfSignupRequest(t, "lender");
		const [r1, r2] = await Promise.allSettled([
			t.mutation(internal.engine.transitionMutation.transitionMutation, {
				entityType: "onboardingRequest",
				entityId: requestId,
				eventType: "APPROVE",
				payload: {},
				source: {
					actorId: "admin1",
					actorType: "admin",
					channel: "admin_dashboard",
				},
			}),
			t.mutation(internal.engine.transitionMutation.transitionMutation, {
				entityType: "onboardingRequest",
				entityId: requestId,
				eventType: "REJECT",
				payload: {},
				source: {
					actorId: "admin2",
					actorType: "admin",
					channel: "admin_dashboard",
				},
			}),
		]);

		// At least one should have fulfilled
		const fulfilled = [r1, r2].filter((r) => r.status === "fulfilled");
		expect(fulfilled.length).toBeGreaterThanOrEqual(1);

		// Final entity state must be one of the two valid outcomes
		const request = await getRequest(t, requestId);
		expect(["approved", "rejected"]).toContain(request?.status);

		// Journal entries: each successful transition has a matching entry
		const journal = await getAuditJournalRows(t, requestId);
		const transitioned = journal.filter((j) => j.outcome === "transitioned");
		expect(transitioned.length).toBeGreaterThanOrEqual(1);

		// No corruption: last transitioned journal entry's newState matches entity status
		const lastTransitioned = transitioned.at(-1);
		expect(lastTransitioned?.newState).toBe(request?.status);
	});

	// ── AC: Audit completeness ──────────────────────────────────────

	it("produces N journal entries for N transitions with correct state chains", async () => {
		const t = createGovernedTestConvex();
		await seedDefaultGovernedActors(t);

		const requestId = await createSelfSignupRequest(t, "lender");

		// Transition 1: pending_review → approved
		await t.mutation(
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

		// Transition 2: approved → role_assigned
		await t.mutation(
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

		const journal = await getAuditJournalRows(t, requestId);
		const transitioned = journal.filter((j) => j.outcome === "transitioned");

		// The APPROVE and ASSIGN_ROLE transitions must be present
		const approve = transitioned.find((j) => j.eventType === "APPROVE");
		const assignRole = transitioned.find(
			(j) => j.eventType === "ASSIGN_ROLE"
		);
		expect(approve).toBeDefined();
		expect(assignRole).toBeDefined();

		// Chain integrity for our two transitions
		expect(approve).toMatchObject({
			previousState: "pending_review",
			newState: "approved",
		});
		expect(assignRole).toMatchObject({
			previousState: "approved",
			newState: "role_assigned",
		});

		// Full chain validation: each entry's previousState = prior entry's newState
		for (let i = 1; i < transitioned.length; i++) {
			expect(transitioned[i].previousState).toBe(
				transitioned[i - 1].newState
			);
		}

		// Timestamps are monotonically increasing
		for (let i = 1; i < transitioned.length; i++) {
			expect(transitioned[i].timestamp).toBeGreaterThanOrEqual(
				transitioned[i - 1].timestamp
			);
		}
	});

	// ── AC: Unknown entity type ─────────────────────────────────────

	it("throws UNKNOWN_ENTITY_TYPE for a non-governed entity type", async () => {
		const t = createGovernedTestConvex();

		const error = await t
			.mutation(internal.engine.transitionMutation.transitionMutation, {
				entityType: "borrower" as EntityType,
				entityId: "fake_borrower_id",
				eventType: "APPROVE",
				payload: {},
				source: {
					actorType: "system",
					channel: "scheduler",
				},
			})
			.catch((e: unknown) => e);

		const data =
			error &&
			typeof error === "object" &&
			"data" in error &&
			typeof error.data === "string"
				? JSON.parse(error.data)
				: (error as { data: unknown }).data;

		expect(data).toMatchObject({ code: "UNKNOWN_ENTITY_TYPE" });
	});

	// ── AC: Guard failure — mortgage ────────────────────────────────

	it("rejects DEFAULT_THRESHOLD_REACHED when missedPayments < 3", async () => {
		const t = createGovernedTestConvex();
		await seedDefaultGovernedActors(t);

		// Seed mortgage in 'delinquent' with missedPayments = 2 (below threshold of >= 3)
		const mortgageId = await seedMortgage(t, {
			status: "delinquent",
			machineContext: { missedPayments: 2, lastPaymentAt: 0 },
		});

		const result = await t.mutation(
			internal.engine.transitionMutation.transitionMutation,
			{
				entityType: "mortgage",
				entityId: mortgageId,
				eventType: "DEFAULT_THRESHOLD_REACHED",
				payload: {},
				source: {
					actorType: "system",
					channel: "scheduler",
				},
			}
		);

		expect(result).toMatchObject({
			success: false,
			previousState: "delinquent",
			newState: "delinquent",
		});

		// Entity status unchanged
		const mortgage = await getEntity(t, mortgageId);
		expect(mortgage?.status).toBe("delinquent");

		// Rejection journal entry
		const journal = await getAuditJournalForEntity(
			t,
			"mortgage",
			mortgageId
		);
		const lastEntry = journal.at(-1);
		expect(lastEntry?.outcome).toBe("rejected");
	});

	// ── AC: Missing effect ──────────────────────────────────────────

	it("warns and continues when machine declares an unregistered effect", async () => {
		const t = createGovernedTestConvex();
		await seedDefaultGovernedActors(t);

		const warnSpy = vi
			.spyOn(console, "warn")
			.mockImplementation(() => {});

		const machineWithMissingEffect = setup({
			types: {
				context: {} as Record<string, never>,
				events: {} as { type: "APPROVE" },
			},
			actions: {
				nonExistentEffect: () => {
					/* noop */
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
							actions: ["nonExistentEffect"],
						},
					},
				},
				approved: { type: "final" },
			},
		});

		machineRegistry.onboardingRequest =
			machineWithMissingEffect as unknown as typeof originalMachine;

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

		// Transition succeeds despite missing handler
		expect(result.success).toBe(true);
		expect(result.newState).toBe("approved");

		// console.warn called about missing handler
		expect(warnSpy).toHaveBeenCalledWith(
			expect.stringContaining("nonExistentEffect")
		);

		warnSpy.mockRestore();
	});
});
