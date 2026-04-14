import { v } from "convex/values";
import type { Id } from "../../_generated/dataModel";
import type { CommandSource } from "../../engine/types";
import type { ManualSettlementDetails } from "../transfers/interface";
import type { ProviderCode } from "../transfers/types";
import { obligationTypeToTransferType } from "../transfers/types";
import { manualSettlementValidator } from "../transfers/validators";

export const executionTriggerSourceValues = [
	"system_scheduler",
	"admin_manual",
	"workflow_replay",
	"migration_backfill",
] as const;

export type ExecutionTriggerSource =
	(typeof executionTriggerSourceValues)[number];

export const executionRequestedByActorTypeValues = [
	"system",
	"admin",
	"workflow",
] as const;

export type ExecutionRequestedByActorType =
	(typeof executionRequestedByActorTypeValues)[number];

export const triggerSourceValidator = v.union(
	v.literal("system_scheduler"),
	v.literal("admin_manual"),
	v.literal("workflow_replay"),
	v.literal("migration_backfill")
);

export const requestedByActorTypeValidator = v.union(
	v.literal("system"),
	v.literal("admin"),
	v.literal("workflow")
);

export const executePlanEntryInputValidator = {
	planEntryId: v.id("collectionPlanEntries"),
	triggerSource: triggerSourceValidator,
	requestedAt: v.number(),
	idempotencyKey: v.string(),
	requestedByActorType: v.optional(requestedByActorTypeValidator),
	requestedByActorId: v.optional(v.string()),
	reason: v.optional(v.string()),
	dryRun: v.optional(v.boolean()),
	manualSettlement: v.optional(manualSettlementValidator),
};

export interface ExecutePlanEntryArgs {
	dryRun?: boolean;
	idempotencyKey: string;
	manualSettlement?: ManualSettlementDetails;
	planEntryId: Id<"collectionPlanEntries">;
	reason?: string;
	requestedAt: number;
	requestedByActorId?: string;
	requestedByActorType?: ExecutionRequestedByActorType;
	triggerSource: ExecutionTriggerSource;
}

export type ExecutePlanEntryReasonCode =
	| "balance_pre_check_deferred"
	| "balance_pre_check_operator_review_required"
	| "balance_pre_check_suppressed"
	| "dry_run_requested"
	| "invalid_idempotency_key"
	| "missing_execution_metadata"
	| "obligation_not_collectible"
	| "obligation_not_found"
	| "plan_entry_not_due"
	| "plan_entry_not_executable_state"
	| "plan_entry_not_found"
	| "plan_entry_already_executed"
	| "unsupported_plan_entry_method"
	| "transfer_handoff_failed";

export type PlanEntryExecutionOutcome =
	| "attempt_created"
	| "already_executed"
	| "not_eligible"
	| "rejected"
	| "noop";

export type PlanEntryStatus =
	| "planned"
	| "provider_scheduled"
	| "executing"
	| "completed"
	| "cancelled"
	| "rescheduled";

interface ExecutePlanEntryResultBase {
	executionRecordedAt: number;
	idempotencyKey: string;
	outcome: PlanEntryExecutionOutcome;
	planEntryId: Id<"collectionPlanEntries">;
	planEntryStatusAfter: PlanEntryStatus;
	reasonCode?: ExecutePlanEntryReasonCode;
	reasonDetail?: string;
}

interface ExecutePlanEntryAttemptResult extends ExecutePlanEntryResultBase {
	attemptStatusAfter: string;
	collectionAttemptId: Id<"collectionAttempts">;
	transferRequestId?: Id<"transferRequests">;
}

export interface AttemptCreatedResult extends ExecutePlanEntryAttemptResult {
	outcome: "attempt_created";
}

export interface AlreadyExecutedResult extends ExecutePlanEntryAttemptResult {
	outcome: "already_executed";
}

export interface NotEligibleResult extends ExecutePlanEntryResultBase {
	outcome: "not_eligible";
}

export interface RejectedResult extends ExecutePlanEntryResultBase {
	outcome: "rejected";
}

export interface NoopResult extends ExecutePlanEntryResultBase {
	outcome: "noop";
}

export type ExecutePlanEntryResult =
	| AttemptCreatedResult
	| AlreadyExecutedResult
	| NotEligibleResult
	| RejectedResult
	| NoopResult;

export interface TransferHandoffRequest {
	amount: number;
	borrowerId: Id<"borrowers">;
	collectionAttemptId: Id<"collectionAttempts">;
	counterpartyId: string;
	idempotencyKey: string;
	method: string;
	mortgageId: Id<"mortgages">;
	obligationIds: Id<"obligations">[];
	planEntryId: Id<"collectionPlanEntries">;
	primaryObligationType?: string;
	providerCode: ProviderCode;
	source: CommandSource;
}

export interface StagePlanEntryExecutionResult {
	existingTransferRequestId?: Id<"transferRequests">;
	result: ExecutePlanEntryResult;
	transferHandoffRequest?: TransferHandoffRequest;
}

export function buildExecutionSource(
	args: Pick<ExecutePlanEntryArgs, "requestedByActorId" | "triggerSource">
): CommandSource {
	switch (args.triggerSource) {
		case "admin_manual":
			return {
				channel: "admin_dashboard",
				actorId: args.requestedByActorId,
				actorType: "admin",
			};
		case "workflow_replay":
			return {
				channel: "simulation",
				actorId: args.requestedByActorId,
				actorType: "system",
			};
		case "migration_backfill":
			return {
				channel: "simulation",
				actorId: args.requestedByActorId,
				actorType: "system",
			};
		default:
			return {
				channel: "scheduler",
				actorId: args.requestedByActorId,
				actorType: "system",
			};
	}
}

export function normalizeExecutionIdempotencyKey(
	idempotencyKey: string
): string | null {
	const normalized = idempotencyKey.trim();
	return normalized.length > 0 ? normalized : null;
}

export function buildTransferHandoffIdempotencyKey(
	planEntryId: Id<"collectionPlanEntries">
) {
	return `transfer:plan-entry-execution:${planEntryId}`;
}

export function buildTransferHandoffMetadata(
	args: TransferHandoffRequest,
	firstObligationType: string | undefined
) {
	return {
		executionContract: "collection_plan.execute_plan_entry.v1",
		executionIdempotencyKey: args.idempotencyKey,
		obligationIds: args.obligationIds.map((obligationId) => `${obligationId}`),
		planEntryMethod: args.method,
		triggerSource: args.source.channel,
		transferTypeHint: obligationTypeToTransferType(firstObligationType),
	};
}

export function buildAttemptCreatedResult(
	result: Omit<AttemptCreatedResult, "outcome">
): AttemptCreatedResult {
	return { outcome: "attempt_created", ...result };
}

export function buildAlreadyExecutedResult(
	result: Omit<AlreadyExecutedResult, "outcome">
): AlreadyExecutedResult {
	return { outcome: "already_executed", ...result };
}

export function buildNotEligibleResult(
	result: Omit<NotEligibleResult, "outcome">
): NotEligibleResult {
	return { outcome: "not_eligible", ...result };
}

export function buildRejectedResult(
	result: Omit<RejectedResult, "outcome">
): RejectedResult {
	return { outcome: "rejected", ...result };
}

export function buildNoopResult(
	result: Omit<NoopResult, "outcome">
): NoopResult {
	return { outcome: "noop", ...result };
}
