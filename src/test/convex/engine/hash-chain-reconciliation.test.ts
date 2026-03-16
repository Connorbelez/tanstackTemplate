import { WorkflowManager } from "@convex-dev/workflow";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { MutationCtx } from "../../../../convex/_generated/server";
import { AuditTrail } from "../../../../convex/auditTrailClient";
import { appendAuditJournalEntry } from "../../../../convex/engine/auditJournal";
import {
	buildAuditTrailInsertArgs,
	runHashChainJournalStep,
	startHashChain,
} from "../../../../convex/engine/hashChain";
import { FAIRLEND_ADMIN } from "../../auth/identities";
import {
	createGovernedTestConvex,
	createSelfSignupRequest,
	getAuditTrailEvents,
	seedDefaultGovernedActors,
} from "../onboarding/helpers";

describe("hash-chain and reconciliation", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.clearAllTimers();
		vi.useRealTimers();
	});

	it("returns healthy reconciliation results when there are no journal rows", async () => {
		const t = createGovernedTestConvex();
		await seedDefaultGovernedActors(t);

		const layer1 = await t
			.withIdentity(FAIRLEND_ADMIN)
			.query(api.engine.reconciliation.reconcile, {});
		const layer2 = await t
			.withIdentity(FAIRLEND_ADMIN)
			.query(api.engine.reconciliation.reconcileLayer2, {});

		expect(layer1).toMatchObject({
			discrepancies: [],
			isHealthy: true,
		});
		expect(layer2).toMatchObject({
			totalEntities: 0,
			brokenChains: [],
			isHealthy: true,
		});
	});

	it("appends a real audit journal id through appendAuditJournalEntry", async () => {
		const t = createGovernedTestConvex();

		const journalEntryId = await t.run(async (ctx) =>
			appendAuditJournalEntry(ctx as unknown as MutationCtx, {
				actorId: "user_member_test",
				channel: "scheduler",
				entityId: "mortgage_future",
				entityType: "mortgage",
				eventType: "CREATED",
				previousState: "none",
				newState: "pending_review",
				outcome: "transitioned",
				timestamp: Date.now(),
			})
		);

		expect(journalEntryId).toContain(";auditJournal");
		const journalEntry = await t.run(async (ctx) => ctx.db.get(journalEntryId));
		expect(journalEntry).toMatchObject({
			entityId: "mortgage_future",
			entityType: "mortgage",
			eventType: "CREATED",
		});
	});

	it("builds auditTrail insert args with serialized metadata", () => {
		expect(
			buildAuditTrailInsertArgs({
				actorId: "user_member_test",
				channel: "scheduler",
				entityId: "entity_args",
				entityType: "onboardingRequest",
				eventType: "APPROVE",
				machineVersion: "machine_v1",
				newState: "approved",
				outcome: "transitioned",
				previousState: "pending_review",
				reason: "Approved in test",
				timestamp: 123,
			})
		).toEqual({
			entityId: "entity_args",
			entityType: "onboardingRequest",
			eventType: "APPROVE",
			actorId: "user_member_test",
			beforeState: "pending_review",
			afterState: "approved",
			metadata: JSON.stringify({
				outcome: "transitioned",
				machineVersion: "machine_v1",
				effectsScheduled: undefined,
				channel: "scheduler",
				reason: "Approved in test",
			}),
			timestamp: 123,
		});
	});

	it("runs the hash-chain journal helper through the process mutation", async () => {
		const step = {
			runMutation: vi.fn().mockResolvedValue(undefined),
		};

		await runHashChainJournalStep(step as never, {
			journalEntryId: "10000;auditJournal" as Id<"auditJournal">,
		});

		expect(step.runMutation).toHaveBeenCalledWith(
			internal.engine.hashChain.processHashChainStep,
			{
				journalEntryId: "10000;auditJournal",
			}
		);
	});

	it("starts the workflow when the test short-circuit is disabled", async () => {
		const startSpy = vi
			.spyOn(WorkflowManager.prototype, "start")
			.mockResolvedValue("workflow_test" as never);
		const previousEnv = process.env.ALLOW_TEST_AUTH_ENDPOINTS;
		process.env.ALLOW_TEST_AUTH_ENDPOINTS = "false";

		try {
			await startHashChain(
				{
					runMutation: vi.fn(),
					scheduler: {} as never,
				},
				"10000;auditJournal" as Id<"auditJournal">
			);
		} finally {
			process.env.ALLOW_TEST_AUTH_ENDPOINTS = previousEnv;
		}

		expect(startSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				runMutation: expect.any(Function),
			}),
			internal.engine.hashChain.hashChainJournalEntry,
			{
				journalEntryId: "10000;auditJournal",
			},
			{
				startAsync: true,
			}
		);
	});

	it("inserts a Layer 2 event when processHashChainStep sees a journal row", async () => {
		const t = createGovernedTestConvex();

		const journalEntryId = await t.run(async (ctx) =>
			appendAuditJournalEntry(ctx as unknown as MutationCtx, {
				actorId: "user_member_test",
				channel: "scheduler",
				entityId: "entity_hash_step",
				entityType: "onboardingRequest",
				eventType: "CREATED",
				previousState: "none",
				newState: "pending_review",
				outcome: "transitioned",
				timestamp: Date.now(),
			})
		);

		await t.mutation(internal.engine.hashChain.processHashChainStep, {
			journalEntryId,
		});

		const events = await getAuditTrailEvents(t, "entity_hash_step");
		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({
			entityId: "entity_hash_step",
			eventType: "CREATED",
		});
	});

	it("no-ops when processHashChainStep receives a missing journal row", async () => {
		const t = createGovernedTestConvex();

		const journalEntryId = await t.run(async (ctx) =>
			appendAuditJournalEntry(ctx as unknown as MutationCtx, {
				actorId: "user_member_test",
				channel: "scheduler",
				entityId: "entity_deleted_journal",
				entityType: "onboardingRequest",
				eventType: "CREATED",
				previousState: "none",
				newState: "pending_review",
				outcome: "transitioned",
				timestamp: Date.now(),
			})
		);
		await t.run(async (ctx) => {
			await ctx.db.delete(journalEntryId);
		});

		await t.mutation(internal.engine.hashChain.processHashChainStep, {
			journalEntryId,
		});

		expect(await getAuditTrailEvents(t, "entity_deleted_journal")).toEqual([]);
	});

	it("rethrows insert failures from processHashChainStep", async () => {
		const t = createGovernedTestConvex();

		const journalEntryId = await t.run(async (ctx) =>
			appendAuditJournalEntry(ctx as unknown as MutationCtx, {
				actorId: "user_member_test",
				channel: "scheduler",
				entityId: "entity_hash_failure",
				entityType: "onboardingRequest",
				eventType: "CREATED",
				previousState: "none",
				newState: "pending_review",
				outcome: "transitioned",
				timestamp: Date.now(),
			})
		);
		vi.spyOn(AuditTrail.prototype, "insert").mockRejectedValueOnce(
			new Error("insert failed")
		);

		await expect(
			t.mutation(internal.engine.hashChain.processHashChainStep, {
				journalEntryId,
			})
		).rejects.toThrow("insert failed");
	});

	it("reports unsupported future entity types as ENTITY_NOT_FOUND when they only exist in the journal", async () => {
		const t = createGovernedTestConvex();
		await seedDefaultGovernedActors(t);

		await t.run(async (ctx) =>
			appendAuditJournalEntry(ctx as unknown as MutationCtx, {
				actorId: "user_member_test",
				channel: "scheduler",
				entityId: "mortgage_future",
				entityType: "mortgage",
				eventType: "CREATED",
				previousState: "none",
				newState: "pending_review",
				outcome: "transitioned",
				timestamp: Date.now(),
			})
		);

		const result = await t
			.withIdentity(FAIRLEND_ADMIN)
			.query(api.engine.reconciliation.reconcile, {});
		expect(result.discrepancies).toContainEqual(
			expect.objectContaining({
				entityId: "mortgage_future",
				entityType: "mortgage",
				entityStatus: "ENTITY_NOT_FOUND",
			})
		);
	});

	it("reports broken chains when Layer 2 verification indicates tampering", async () => {
		const t = createGovernedTestConvex();
		await seedDefaultGovernedActors(t);

		const requestId = await createSelfSignupRequest(t, "lender");
		vi.spyOn(AuditTrail.prototype, "verifyChain").mockImplementation(
			async (_ctx, { entityId }) => {
				if (entityId === requestId) {
					return {
						valid: false,
						eventCount: 2,
						brokenAt: 1,
						error: "Hash mismatch at event 1",
					};
				}
				return {
					valid: true,
					eventCount: 1,
					firstEvent: Date.now(),
					lastEvent: Date.now(),
				};
			}
		);

		const result = await t
			.withIdentity(FAIRLEND_ADMIN)
			.query(api.engine.reconciliation.reconcileLayer2, {});
		expect(result.isHealthy).toBe(false);
		expect(result.brokenChains).toContainEqual(
			expect.objectContaining({
				entityId: requestId,
				valid: false,
				brokenAt: 1,
				error: "Hash mismatch at event 1",
			})
		);
	});

	it("treats null verification payloads as missing Layer 2 chains", async () => {
		const t = createGovernedTestConvex();
		await seedDefaultGovernedActors(t);

		const requestId = await createSelfSignupRequest(t, "lender");
		vi.spyOn(AuditTrail.prototype, "verifyChain").mockResolvedValueOnce(null);

		const result = await t
			.withIdentity(FAIRLEND_ADMIN)
			.query(api.engine.reconciliation.reconcileLayer2, {});

		expect(result.brokenChains).toContainEqual(
			expect.objectContaining({
				entityId: requestId,
				valid: false,
				eventCount: 0,
				error: "No Layer 2 entries found for entity with journal records",
			})
		);
	});

	it("treats verification payloads without a boolean valid flag as missing chains", async () => {
		const t = createGovernedTestConvex();
		await seedDefaultGovernedActors(t);

		const requestId = await createSelfSignupRequest(t, "lender");
		vi.spyOn(AuditTrail.prototype, "verifyChain").mockResolvedValueOnce({
			valid: "yes",
			eventCount: 2,
		} as never);

		const result = await t
			.withIdentity(FAIRLEND_ADMIN)
			.query(api.engine.reconciliation.reconcileLayer2, {});

		expect(result.brokenChains).toContainEqual(
			expect.objectContaining({
				entityId: requestId,
				valid: false,
				eventCount: 0,
			})
		);
	});

	it("returns only the broken subset when healthy and tampered entities coexist", async () => {
		const t = createGovernedTestConvex();
		await seedDefaultGovernedActors(t);

		const healthyRequestId = await createSelfSignupRequest(t, "lender");
		await t.run(async (ctx) => {
			const userId = await ctx.db.insert("users", {
				authId: "user_member_mixed",
				email: "member-mixed@test.fairlend.ca",
				firstName: "Mixed",
				lastName: "Member",
			});
			const requestId = await ctx.db.insert("onboardingRequests", {
				userId,
				requestedRole: "lender",
				status: "pending_review",
				referralSource: "self_signup",
				targetOrganizationId: "org_brokerage_test",
				createdAt: Date.now(),
			});
			await ctx.db.insert("auditJournal", {
				actorId: "user_member_mixed",
				channel: "onboarding_portal",
				entityId: requestId,
				entityType: "onboardingRequest",
				eventType: "CREATED",
				previousState: "none",
				newState: "pending_review",
				outcome: "transitioned",
				timestamp: Date.now(),
			});
		});

		let brokenEntityId: string | null = null;
		await t.run(async (ctx) => {
			const latest = await ctx.db
				.query("auditJournal")
				.withIndex("by_type_and_time", (q) =>
					q.eq("entityType", "onboardingRequest")
				)
				.order("desc")
				.first();
			brokenEntityId = latest?.entityId ?? null;
		});
		if (!brokenEntityId) {
			throw new Error("Expected a second entity id");
		}

		vi.spyOn(AuditTrail.prototype, "verifyChain").mockImplementation(
			async (_ctx, { entityId }) =>
				entityId === brokenEntityId
					? { valid: false, eventCount: 1, brokenAt: 0, error: "Hash mismatch" }
					: {
							valid: true,
							eventCount: 1,
							firstEvent: Date.now(),
							lastEvent: Date.now(),
						}
		);

		const result = await t
			.withIdentity(FAIRLEND_ADMIN)
			.query(api.engine.reconciliation.reconcileLayer2, {});
		expect(result.totalEntities).toBe(2);
		expect(result.brokenChains).toHaveLength(1);
		expect(result.brokenChains[0]?.entityId).toBe(brokenEntityId);
		expect(result.isHealthy).toBe(false);
		expect(
			result.verifications.some((entry) => entry.entityId === healthyRequestId)
		).toBe(true);
	});

	it("reconciles across page boundaries for both Layer 1 and Layer 2 scans", async () => {
		const t = createGovernedTestConvex();
		await seedDefaultGovernedActors(t);

		await t.run(async (ctx) => {
			const baseUserId = await ctx.db.insert("users", {
				authId: "user_member_paged",
				email: "member-paged@test.fairlend.ca",
				firstName: "Paged",
				lastName: "Member",
			});
			for (let index = 0; index < 130; index += 1) {
				const requestId = await ctx.db.insert("onboardingRequests", {
					userId: baseUserId,
					requestedRole: "lender",
					status: "pending_review",
					referralSource: "self_signup",
					targetOrganizationId: "org_brokerage_test",
					createdAt: Date.now() + index,
				});
				await ctx.db.insert("auditJournal", {
					actorId: `user_member_paged_${index}`,
					channel: "onboarding_portal",
					entityId: requestId,
					entityType: "onboardingRequest",
					eventType: "CREATED",
					previousState: "none",
					newState: "pending_review",
					outcome: "transitioned",
					timestamp: Date.now() + index,
				});
			}
		});
		vi.spyOn(AuditTrail.prototype, "verifyChain").mockResolvedValue({
			valid: true,
			eventCount: 1,
			firstEvent: Date.now(),
			lastEvent: Date.now(),
		});

		const layer1 = await t
			.withIdentity(FAIRLEND_ADMIN)
			.query(api.engine.reconciliation.reconcile, {});
		const layer2 = await t
			.withIdentity(FAIRLEND_ADMIN)
			.query(api.engine.reconciliation.reconcileLayer2, {});

		expect(layer1.discrepancies).toEqual([]);
		expect(layer1.isHealthy).toBe(true);
		expect(layer2.totalEntities).toBe(130);
		expect(layer2.isHealthy).toBe(true);
	});
});
