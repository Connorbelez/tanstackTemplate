/**
 * Contract tests for the canonical plan-entry execution API.
 * Spec: https://www.notion.so/337fc1b440248115b4d3c21577f27601
 *
 * Use Cases covered:
 * - UC-1: System-triggered execution runs an eligible plan entry
 * - UC-2: Safe replay reuses the same business attempt
 * - UC-3: Invalid or ineligible plan entries are rejected without side effects
 *
 * Requirements covered:
 * - REQ-1: One canonical internal execution command exists
 * - REQ-2: Structured result union keyed by outcome
 * - REQ-3: Replay safety before downstream transfer creation
 * - REQ-4: Attempt created before Payment Rails handoff
 * - REQ-5: AMPS stops at the Payment Rails handoff boundary
 * - REQ-6: No direct obligation settlement, cash posting, or mortgage lifecycle mutation
 * - REQ-7: Minimum replay/linkage metadata is persisted
 * - REQ-8: Contract-focused tests lock the behavior
 */

import process from "node:process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	createGovernedTestConvex,
	drainScheduledWork,
	seedBalancePreCheckRule,
	seedBorrowerProfile,
	seedCollectionAttempt,
	seedCollectionRules,
	seedCollectionSettlementPrereqs,
	seedMortgage,
	seedObligation,
	seedPlanEntry,
	seedRecentFailedInboundTransfer,
} from "../../../../src/test/convex/payments/helpers";
import { internal } from "../../../_generated/api";
import type { Doc, Id } from "../../../_generated/dataModel";
import { obligationTypeToTransferType } from "../../transfers/types";

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

beforeEach(() => {
	envRestorers.length = 0;
	setTestEnv("DISABLE_GT_HASHCHAIN", "true");
	setTestEnv("DISABLE_CASH_LEDGER_HASHCHAIN", "true");
	vi.useFakeTimers();
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

type GovernedTestConvex = ReturnType<typeof createGovernedTestConvex>;

function createBackendTestConvex() {
	return createGovernedTestConvex({ includeWorkflowComponents: false });
}

async function seedExecutionFixture(
	t: GovernedTestConvex,
	options?: {
		method?: string;
		obligationStatus?: Doc<"obligations">["status"];
		planStatus?: Doc<"collectionPlanEntries">["status"];
		scheduledDate?: number;
	}
) {
	const borrowerId = await seedBorrowerProfile(t);
	const mortgageId = await seedMortgage(t);
	const obligationId = await seedObligation(t, mortgageId, borrowerId, {
		status: options?.obligationStatus ?? "due",
	});
	const scheduledDate = options?.scheduledDate ?? Date.now() - 1000;
	const planEntryId = await seedPlanEntry(t, {
		obligationIds: [obligationId],
		amount: 300_000,
		method: options?.method ?? "manual",
		scheduledDate,
		status: options?.planStatus ?? "planned",
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

async function getTransferForAttempt(
	t: GovernedTestConvex,
	attemptId: Id<"collectionAttempts">
) {
	return t.run(async (ctx) =>
		ctx.db
			.query("transferRequests")
			.filter((q) => q.eq(q.field("collectionAttemptId"), attemptId))
			.first()
	);
}

async function getTransferCountForPlanEntry(
	t: GovernedTestConvex,
	planEntryId: Id<"collectionPlanEntries">
) {
	return t.run(async (ctx) =>
		ctx.db
			.query("transferRequests")
			.filter((q) => q.eq(q.field("planEntryId"), planEntryId))
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

describe("executePlanEntry", () => {
	it("creates exactly one collection attempt for an eligible plan entry", async () => {
		const t = createBackendTestConvex();
		const { mortgageId, obligationId, planEntryId } =
			await seedExecutionFixture(t);
		await seedCollectionSettlementPrereqs(t, {
			mortgageId,
			obligationId,
		});
		const requestedAt = Date.now();

		const result = await t.action(
			internal.payments.collectionPlan.execution.executePlanEntry,
			{
				planEntryId,
				triggerSource: "admin_manual",
				requestedAt,
				idempotencyKey: "exec-plan-entry-admin-1",
				requestedByActorType: "admin",
				requestedByActorId: "user_fairlend_admin",
				reason: "manual collection execution",
			}
		);
		await drainScheduledWork(t);
		expect(result.outcome).toBe("attempt_created");
		expect(result.planEntryId).toBe(planEntryId);
		expect(result.planEntryStatusAfter).toBe("executing");
		expect(result.collectionAttemptId).toBeTruthy();
		expect(result.attemptStatusAfter).toBe("confirmed");
		expect(result.transferRequestId).toBeTruthy();

		const planEntry = await t.run((ctx) => ctx.db.get(planEntryId));
		expect(planEntry?.status).toBe("executing");
		expect(planEntry?.collectionAttemptId).toBe(result.collectionAttemptId);
		expect(planEntry?.executionIdempotencyKey).toBe("exec-plan-entry-admin-1");
		expect(planEntry?.executedAt).toBe(requestedAt);

		const attempts = await getAttemptsForPlanEntry(t, planEntryId);
		expect(attempts).toHaveLength(1);
		expect(attempts[0]?.executionIdempotencyKey).toBe(
			"exec-plan-entry-admin-1"
		);
		expect(attempts[0]?.requestedByActorType).toBe("admin");
		expect(attempts[0]?.requestedByActorId).toBe("user_fairlend_admin");
		expect(attempts[0]?.triggerSource).toBe("admin_manual");
		expect(attempts[0]?.status).toBe("confirmed");
		expect(attempts[0]?.transferRequestId).toBe(result.transferRequestId);
		expect(attempts[0]).not.toHaveProperty("providerStatus");

		const transfer = await getTransferForAttempt(
			t,
			result.collectionAttemptId as Id<"collectionAttempts">
		);
		expect(transfer?._id).toBe(result.transferRequestId);
		expect(transfer?.planEntryId).toBe(planEntryId);
		expect(transfer?.status).toBe("confirmed");
		expect(transfer?.providerRef).toBeTruthy();
	});

	it("returns already_executed on replay without creating a duplicate attempt", async () => {
		const t = createBackendTestConvex();
		const { mortgageId, obligationId, planEntryId } =
			await seedExecutionFixture(t);
		await seedCollectionSettlementPrereqs(t, {
			mortgageId,
			obligationId,
		});
		const args = {
			planEntryId,
			triggerSource: "system_scheduler" as const,
			requestedAt: Date.now(),
			idempotencyKey: "exec-plan-entry-replay-1",
			requestedByActorType: "system" as const,
			requestedByActorId: "scheduler",
		};

		const first = await t.action(
			internal.payments.collectionPlan.execution.executePlanEntry,
			args
		);
		const replay = await t.action(
			internal.payments.collectionPlan.execution.executePlanEntry,
			args
		);
		await drainScheduledWork(t);
		expect(first.outcome).toBe("attempt_created");
		expect(first.attemptStatusAfter).toBe("confirmed");
		expect(replay.outcome).toBe("already_executed");
		expect(replay.collectionAttemptId).toBe(first.collectionAttemptId);
		expect(replay.attemptStatusAfter).toBe("confirmed");
		expect(replay.transferRequestId).toBe(first.transferRequestId);

		const attempts = await getAttemptsForPlanEntry(t, planEntryId);
		expect(attempts).toHaveLength(1);

		const transfer = await getTransferForAttempt(
			t,
			first.collectionAttemptId as Id<"collectionAttempts">
		);
		expect(transfer?._id).toBe(first.transferRequestId);
		expect(transfer?.status).toBe("confirmed");
	});

	it("recovers a linked transfer when an initiated attempt lost transferRequestId", async () => {
		const t = createBackendTestConvex();
		const { mortgageId, obligationId, planEntryId } =
			await seedExecutionFixture(t);
		await seedCollectionSettlementPrereqs(t, {
			mortgageId,
			obligationId,
		});
		const args = {
			planEntryId,
			triggerSource: "system_scheduler" as const,
			requestedAt: Date.now(),
			idempotencyKey: "exec-plan-entry-recovery-1",
			requestedByActorType: "system" as const,
			requestedByActorId: "scheduler",
		};

		const staged = await t.mutation(
			internal.payments.collectionPlan.execution
				.stagePlanEntryExecutionMutation,
			args
		);
		expect(staged.result.outcome).toBe("attempt_created");
		expect(staged.transferHandoffRequest).toBeTruthy();

		const handoff = staged.transferHandoffRequest;
		if (!handoff) {
			throw new Error("Expected transfer handoff request");
		}
		const transferRequestId = await t.mutation(
			internal.payments.transfers.mutations.createTransferRequestInternal,
			{
				direction: "inbound",
				transferType: obligationTypeToTransferType(
					handoff.primaryObligationType
				),
				amount: handoff.amount,
				counterpartyType: "borrower",
				counterpartyId: handoff.counterpartyId,
				mortgageId: handoff.mortgageId,
				obligationId: handoff.obligationIds[0],
				planEntryId: handoff.planEntryId,
				collectionAttemptId: handoff.collectionAttemptId,
				borrowerId: handoff.borrowerId,
				providerCode: "manual",
				idempotencyKey: `transfer:plan-entry-execution:${planEntryId}`,
				metadata: {
					executionContract: "collection_plan.execute_plan_entry.v1",
				},
				source: handoff.source,
			}
		);

		const replay = await t.action(
			internal.payments.collectionPlan.execution.executePlanEntry,
			{
				...args,
				idempotencyKey: "exec-plan-entry-recovery-replay",
				requestedAt: Date.now() + 1,
			}
		);
		await drainScheduledWork(t);

		expect(replay.outcome).toBe("already_executed");
		expect(replay.collectionAttemptId).toBe(staged.result.collectionAttemptId);
		expect(replay.transferRequestId).toBe(transferRequestId);
		expect(replay.attemptStatusAfter).toBe("confirmed");

		const attempt = await t.run((ctx) =>
			ctx.db.get(staged.result.collectionAttemptId)
		);
		expect(attempt?.transferRequestId).toBe(transferRequestId);

		const transfer = await getTransferForAttempt(
			t,
			staged.result.collectionAttemptId
		);
		expect(transfer?._id).toBe(transferRequestId);
		expect(transfer?.status).toBe("confirmed");
	});

	it("reconciles an existing attempt when the plan entry has no collectionAttemptId", async () => {
		const t = createGovernedTestConvex();
		const { planEntryId, mortgageId, borrowerId } =
			await seedExecutionFixture(t);
		const existingAttemptId = await seedCollectionAttempt(t, {
			planEntryId,
			method: "manual",
			amount: 300_000,
		});

		const result = await t.action(
			internal.payments.collectionPlan.execution.executePlanEntry,
			{
				planEntryId,
				triggerSource: "workflow_replay",
				requestedAt: Date.now(),
				idempotencyKey: "exec-plan-entry-reconcile-1",
				requestedByActorType: "workflow",
				requestedByActorId: "workflow:collection-plan-replay",
			}
		);
		await drainScheduledWork(t);

		expect(result.outcome).toBe("already_executed");
		expect(result.collectionAttemptId).toBe(existingAttemptId);
		expect(result.transferRequestId).toBeTruthy();

		const planEntry = await t.run((ctx) => ctx.db.get(planEntryId));
		expect(planEntry?.collectionAttemptId).toBe(existingAttemptId);
		expect(planEntry?.executedAt).toBeDefined();
		expect(planEntry?.executionIdempotencyKey).toBe(
			"exec-plan-entry-reconcile-1"
		);
		expect(planEntry?.status).toBe("executing");

		const attempts = await getAttemptsForPlanEntry(t, planEntryId);
		expect(attempts).toHaveLength(1);
		expect(attempts[0]?._id).toBe(existingAttemptId);
		expect(attempts[0]?.transferRequestId).toBe(result.transferRequestId);

		const transfer = await getTransferForAttempt(
			t,
			existingAttemptId as Id<"collectionAttempts">
		);
		expect(transfer?._id).toBe(result.transferRequestId);
		expect(transfer?.planEntryId).toBe(planEntryId);
		expect(transfer?.mortgageId).toBe(mortgageId);
		expect(transfer?.borrowerId).toBe(borrowerId);
	});

	it("returns noop for dry runs without creating attempts or transfers", async () => {
		const t = createGovernedTestConvex();
		const { planEntryId } = await seedExecutionFixture(t);

		const result = await t.action(
			internal.payments.collectionPlan.execution.executePlanEntry,
			{
				planEntryId,
				triggerSource: "system_scheduler",
				requestedAt: Date.now(),
				idempotencyKey: "exec-plan-entry-dry-run-1",
				dryRun: true,
			}
		);

		expect(result.outcome).toBe("noop");
		expect(result.reasonCode).toBe("dry_run_requested");
		expect(result.collectionAttemptId).toBeUndefined();

		const attempts = await getAttemptsForPlanEntry(t, planEntryId);
		expect(attempts).toHaveLength(0);

		const transfers = await getTransferCountForPlanEntry(t, planEntryId);
		expect(transfers).toHaveLength(0);
	});

	it("rejects plan entries with mixed obligation handoff context", async () => {
		const t = createGovernedTestConvex();
		const borrowerId = await seedBorrowerProfile(t);
		const otherBorrowerId = await seedBorrowerProfile(t);
		const mortgageId = await seedMortgage(t);
		const otherMortgageId = await seedMortgage(t);
		const firstObligationId = await seedObligation(t, mortgageId, borrowerId, {
			status: "due",
		});
		const secondObligationId = await seedObligation(
			t,
			otherMortgageId,
			otherBorrowerId,
			{
				status: "due",
			}
		);
		const planEntryId = await seedPlanEntry(t, {
			obligationIds: [firstObligationId, secondObligationId],
			amount: 300_000,
			method: "manual",
			scheduledDate: Date.now() - 1000,
			status: "planned",
			source: "default_schedule",
		});

		const result = await t.action(
			internal.payments.collectionPlan.execution.executePlanEntry,
			{
				planEntryId,
				triggerSource: "system_scheduler",
				requestedAt: Date.now(),
				idempotencyKey: "exec-plan-entry-mixed-context-1",
			}
		);

		expect(result.outcome).toBe("rejected");
		expect(result.reasonCode).toBe("missing_execution_metadata");

		const attempts = await getAttemptsForPlanEntry(t, planEntryId);
		expect(attempts).toHaveLength(0);
	});

	it("rejects unsupported plan entry methods instead of defaulting to manual", async () => {
		const t = createGovernedTestConvex();
		const { planEntryId } = await seedExecutionFixture(t, {
			method: "legacy_wire",
		});

		const result = await t.action(
			internal.payments.collectionPlan.execution.executePlanEntry,
			{
				planEntryId,
				triggerSource: "system_scheduler",
				requestedAt: Date.now(),
				idempotencyKey: "exec-plan-entry-unsupported-method-1",
			}
		);

		expect(result.outcome).toBe("rejected");
		expect(result.reasonCode).toBe("unsupported_plan_entry_method");

		const attempts = await getAttemptsForPlanEntry(t, planEntryId);
		expect(attempts).toHaveLength(0);
	});

	it("returns rejected when the plan entry does not exist", async () => {
		const t = createBackendTestConvex();
		const { planEntryId } = await seedExecutionFixture(t);
		await t.run(async (ctx) => {
			await ctx.db.delete(planEntryId);
		});

		const result = await t.action(
			internal.payments.collectionPlan.execution.executePlanEntry,
			{
				planEntryId,
				triggerSource: "system_scheduler",
				requestedAt: Date.now(),
				idempotencyKey: "exec-plan-entry-missing-1",
			}
		);

		expect(result.outcome).toBe("rejected");
		expect(result.reasonCode).toBe("plan_entry_not_found");
		expect(result.collectionAttemptId).toBeUndefined();

		const allAttempts = await t.run((ctx) =>
			ctx.db.query("collectionAttempts").collect()
		);
		expect(allAttempts).toHaveLength(0);
	});

	it("returns not_eligible when the plan entry is scheduled for the future", async () => {
		const t = createBackendTestConvex();
		const { planEntryId } = await seedExecutionFixture(t, {
			scheduledDate: Date.now() + 60_000,
		});

		const result = await t.action(
			internal.payments.collectionPlan.execution.executePlanEntry,
			{
				planEntryId,
				triggerSource: "system_scheduler",
				requestedAt: Date.now(),
				idempotencyKey: "exec-plan-entry-future-1",
			}
		);

		expect(result.outcome).toBe("not_eligible");
		expect(result.reasonCode).toBe("plan_entry_not_due");
		expect(result.collectionAttemptId).toBeUndefined();

		const attempts = await getAttemptsForPlanEntry(t, planEntryId);
		expect(attempts).toHaveLength(0);
	});

	it("defers execution before attempt creation when balance pre-check blocks with a defer decision", async () => {
		const t = createBackendTestConvex();
		const requestedAt = new Date("2026-04-01T12:00:00.000Z").getTime();
		const { borrowerId, mortgageId, planEntryId } = await seedExecutionFixture(
			t,
			{
				scheduledDate: requestedAt - 1000,
			}
		);
		await seedBalancePreCheckRule(t, {
			blockingDecision: "defer",
			deferDays: 3,
		});
		await seedRecentFailedInboundTransfer(t, {
			borrowerId,
			mortgageId,
			createdAt: requestedAt - 60_000,
		});

		const result = await t.action(
			internal.payments.collectionPlan.execution.executePlanEntry,
			{
				planEntryId,
				triggerSource: "system_scheduler",
				requestedAt,
				idempotencyKey: "exec-plan-entry-balance-defer-1",
			}
		);

		expect(result.outcome).toBe("not_eligible");
		expect(result.reasonCode).toBe("balance_pre_check_deferred");
		expect(result.collectionAttemptId).toBeUndefined();

		const attempts = await getAttemptsForPlanEntry(t, planEntryId);
		expect(attempts).toHaveLength(0);

		const planEntry = (await t.run((ctx) => ctx.db.get(planEntryId))) as
			| (Doc<"collectionPlanEntries"> & Record<string, unknown>)
			| null;
		expect(planEntry?.status).toBe("planned");
		expect(planEntry?.collectionAttemptId).toBeUndefined();
		expect(planEntry?.balancePreCheckDecision).toBe("defer");
		expect(planEntry?.balancePreCheckReasonCode).toBe(
			"recent_failed_inbound_transfer"
		);
		expect(planEntry?.balancePreCheckSignalSource).toBe(
			"recent_transfer_failures"
		);
		expect(planEntry?.balancePreCheckNextEvaluationAt).toBe(
			requestedAt + 3 * 86_400_000
		);
	});

	it("suppresses execution before attempt creation when balance pre-check blocks with a suppress decision", async () => {
		const t = createBackendTestConvex();
		const requestedAt = new Date("2026-04-01T12:00:00.000Z").getTime();
		const { borrowerId, mortgageId, planEntryId } = await seedExecutionFixture(
			t,
			{
				scheduledDate: requestedAt - 1000,
			}
		);
		await seedBalancePreCheckRule(t, {
			blockingDecision: "suppress",
		});
		await seedRecentFailedInboundTransfer(t, {
			borrowerId,
			mortgageId,
			createdAt: requestedAt - 60_000,
		});

		const result = await t.action(
			internal.payments.collectionPlan.execution.executePlanEntry,
			{
				planEntryId,
				triggerSource: "system_scheduler",
				requestedAt,
				idempotencyKey: "exec-plan-entry-balance-suppress-1",
			}
		);

		expect(result.outcome).toBe("not_eligible");
		expect(result.reasonCode).toBe("balance_pre_check_suppressed");
		expect(result.collectionAttemptId).toBeUndefined();

		const attempts = await getAttemptsForPlanEntry(t, planEntryId);
		expect(attempts).toHaveLength(0);

		const planEntry = (await t.run((ctx) => ctx.db.get(planEntryId))) as
			| (Doc<"collectionPlanEntries"> & Record<string, unknown>)
			| null;
		expect(planEntry?.status).toBe("planned");
		expect(planEntry?.balancePreCheckDecision).toBe("suppress");
		expect(planEntry?.balancePreCheckReasonCode).toBe(
			"recent_failed_inbound_transfer"
		);
		expect(planEntry?.balancePreCheckNextEvaluationAt).toBeUndefined();
	});

	it("requires operator review before attempt creation when balance pre-check blocks with a review decision", async () => {
		const t = createBackendTestConvex();
		const requestedAt = new Date("2026-04-01T12:00:00.000Z").getTime();
		const { borrowerId, mortgageId, planEntryId } = await seedExecutionFixture(
			t,
			{
				scheduledDate: requestedAt - 1000,
			}
		);
		await seedBalancePreCheckRule(t, {
			blockingDecision: "require_operator_review",
		});
		await seedRecentFailedInboundTransfer(t, {
			borrowerId,
			mortgageId,
			createdAt: requestedAt - 60_000,
		});

		const result = await t.action(
			internal.payments.collectionPlan.execution.executePlanEntry,
			{
				planEntryId,
				triggerSource: "system_scheduler",
				requestedAt,
				idempotencyKey: "exec-plan-entry-balance-review-1",
			}
		);

		expect(result.outcome).toBe("not_eligible");
		expect(result.reasonCode).toBe(
			"balance_pre_check_operator_review_required"
		);
		expect(result.collectionAttemptId).toBeUndefined();

		const attempts = await getAttemptsForPlanEntry(t, planEntryId);
		expect(attempts).toHaveLength(0);

		const planEntry = (await t.run((ctx) => ctx.db.get(planEntryId))) as
			| (Doc<"collectionPlanEntries"> & Record<string, unknown>)
			| null;
		expect(planEntry?.status).toBe("planned");
		expect(planEntry?.balancePreCheckDecision).toBe("require_operator_review");
		expect(planEntry?.balancePreCheckReasonCode).toBe(
			"recent_failed_inbound_transfer"
		);
		expect(planEntry?.balancePreCheckNextEvaluationAt).toBeUndefined();
	});

	it("preserves the created attempt when Payment Rails handoff fails", async () => {
		setTestEnv("ENABLE_MOCK_PROVIDERS", "false");

		const t = createBackendTestConvex();
		const { planEntryId } = await seedExecutionFixture(t, {
			method: "mock_pad",
		});
		await seedCollectionRules(t);
		const args = {
			planEntryId,
			triggerSource: "workflow_replay" as const,
			requestedAt: Date.now(),
			idempotencyKey: "exec-plan-entry-handoff-failure-1",
			requestedByActorType: "workflow" as const,
			requestedByActorId: "workflow:collection-plan-replay",
		};

		const result = await t.action(
			internal.payments.collectionPlan.execution.executePlanEntry,
			args
		);
		await drainScheduledWork(t);
		expect(result.outcome).toBe("attempt_created");
		expect(result.reasonCode).toBe("transfer_handoff_failed");
		expect(result.collectionAttemptId).toBeTruthy();
		expect(result.attemptStatusAfter).toBe("retry_scheduled");
		expect(result.transferRequestId).toBeUndefined();

		const planEntry = await t.run((ctx) => ctx.db.get(planEntryId));
		expect(planEntry?.collectionAttemptId).toBe(result.collectionAttemptId);
		expect(planEntry?.status).toBe("executing");

		const attempts = await getAttemptsForPlanEntry(t, planEntryId);
		expect(attempts).toHaveLength(1);
		expect(attempts[0]?.status).toBe("retry_scheduled");
		expect(attempts[0]?.failureReason).toContain("disabled by default");
		expect(attempts[0]).not.toHaveProperty("providerStatus");
		expect(attempts[0]?.triggerSource).toBe("workflow_replay");

		const transfer = await getTransferForAttempt(
			t,
			result.collectionAttemptId as Id<"collectionAttempts">
		);
		expect(transfer).toBeNull();

		const replay = await t.action(
			internal.payments.collectionPlan.execution.executePlanEntry,
			{
				...args,
				idempotencyKey: "exec-plan-entry-handoff-failure-replay",
				requestedAt: Date.now() + 1,
			}
		);
		await drainScheduledWork(t);
		expect(replay.outcome).toBe("already_executed");
		expect(replay.collectionAttemptId).toBe(result.collectionAttemptId);
		expect(replay.attemptStatusAfter).toBe("retry_scheduled");
		expect(replay.transferRequestId).toBeUndefined();

		const replayAttempts = await getAttemptsForPlanEntry(t, planEntryId);
		expect(replayAttempts).toHaveLength(1);
		const replayTransfers = await getTransfersForAttempt(
			t,
			result.collectionAttemptId as Id<"collectionAttempts">
		);
		expect(replayTransfers).toHaveLength(0);

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

	it("replays without duplicates after transfer creation succeeds but initiation fails", async () => {
		const t = createBackendTestConvex();
		const { planEntryId } = await seedExecutionFixture(t, {
			method: "manual",
		});
		const args = {
			planEntryId,
			triggerSource: "workflow_replay" as const,
			requestedAt: Date.now(),
			idempotencyKey: "exec-plan-entry-linked-failure-1",
			requestedByActorType: "workflow" as const,
			requestedByActorId: "workflow:collection-plan-replay",
		};

		const staged = await t.mutation(
			internal.payments.collectionPlan.execution
				.stagePlanEntryExecutionMutation,
			args
		);
		expect(staged.result.outcome).toBe("attempt_created");
		expect(staged.transferHandoffRequest).toBeTruthy();

		const handoff = staged.transferHandoffRequest;
		if (!handoff) {
			throw new Error("Expected transfer handoff request");
		}
		const transferRequestId = await t.mutation(
			internal.payments.transfers.mutations.createTransferRequestInternal,
			{
				direction: "inbound",
				transferType: obligationTypeToTransferType(
					handoff.primaryObligationType
				),
				amount: handoff.amount,
				counterpartyType: "borrower",
				counterpartyId: handoff.counterpartyId,
				mortgageId: handoff.mortgageId,
				obligationId: handoff.obligationIds[0],
				planEntryId: handoff.planEntryId,
				collectionAttemptId: handoff.collectionAttemptId,
				borrowerId: handoff.borrowerId,
				providerCode: "pad_vopay",
				idempotencyKey: `transfer:plan-entry-execution:${planEntryId}`,
				metadata: {
					executionContract: "collection_plan.execute_plan_entry.v1",
				},
				source: handoff.source,
			}
		);
		await t.mutation(
			internal.payments.collectionPlan.execution
				.recordTransferHandoffSuccessMutation,
			{
				attemptId: staged.result.collectionAttemptId,
				transferRequestId,
			}
		);

		const replay = await t.action(
			internal.payments.collectionPlan.execution.executePlanEntry,
			{
				...args,
				idempotencyKey: "exec-plan-entry-linked-failure-replay",
				requestedAt: Date.now() + 1,
			}
		);
		await drainScheduledWork(t);
		expect(replay.outcome).toBe("already_executed");
		expect(replay.reasonCode).toBe("transfer_handoff_failed");
		expect(replay.collectionAttemptId).toBe(staged.result.collectionAttemptId);
		expect(replay.transferRequestId).toBe(transferRequestId);

		const attempts = await getAttemptsForPlanEntry(t, planEntryId);
		expect(attempts).toHaveLength(1);
		const transfers = await getTransfersForAttempt(
			t,
			staged.result.collectionAttemptId as Id<"collectionAttempts">
		);
		expect(transfers).toHaveLength(1);
		expect(transfers[0]?._id).toBe(transferRequestId);
		expect(transfers[0]?.status).toBe("initiated");
	});
});
