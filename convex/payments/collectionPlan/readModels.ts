import type { Doc, Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import {
	getAttemptLinkedInboundReversalHealth,
	getAttemptLinkedInboundSettlementHealth,
} from "../transfers/collectionAttemptReconciliation";
import type {
	CollectionRuleConfig,
	CollectionRuleKind,
	CollectionRuleScope,
	CollectionRuleStatus,
} from "./ruleContract";
import {
	getCollectionRuleCode,
	getCollectionRuleDisplayName,
	getCollectionRuleScope,
	getCollectionRuleStatus,
	isCollectionRuleEffectiveAt,
} from "./ruleContract";

export interface CollectionRuleRow {
	code: string;
	config: CollectionRuleConfig;
	configSummary: string;
	createdAt: number;
	createdByActorId: string;
	description: string;
	displayName: string;
	effectiveFrom?: number;
	effectiveTo?: number;
	isCurrentlyEffective: boolean;
	kind: CollectionRuleKind;
	priority: number;
	ruleId: Id<"collectionRules">;
	scope: CollectionRuleScope;
	scopeSummary: string;
	status: CollectionRuleStatus;
	trigger: "event" | "schedule";
	updatedAt: number;
	updatedByActorId: string;
	version: number;
}

export interface TransferSummary {
	collectionAttemptId?: Id<"collectionAttempts">;
	confirmedAt?: number;
	counterpartyId?: string;
	counterpartyType?: string;
	createdAt: number;
	direction?: string;
	failedAt?: number;
	failureCode?: string;
	failureReason?: string;
	idempotencyKey: string;
	metadata?: unknown;
	providerCode?: string;
	providerRef?: string;
	reversedAt?: number;
	status: string;
	transferId: Id<"transferRequests">;
	transferType?: string;
}

export interface ReconciliationSummary {
	expectedLifecycle:
		| "attempt_confirmed_and_cash_received"
		| "attempt_reversed_and_reversal_posted";
	hasExpectedPostingEntry: boolean;
	isHealthy: boolean;
	reason?:
		| "attempt_status_mismatch"
		| "missing_attempt"
		| "missing_posting_entry";
}

export interface CollectionAttemptRow {
	amount: number;
	cancelledAt?: number;
	collectionAttemptId: Id<"collectionAttempts">;
	confirmedAt?: number;
	executionIdempotencyKey?: string;
	executionReason?: string;
	executionRequestedAt?: number;
	failedAt?: number;
	failureReason?: string;
	initiatedAt: number;
	method: string;
	mortgageId: Id<"mortgages">;
	obligationIds: Id<"obligations">[];
	planEntryId: Id<"collectionPlanEntries">;
	reconciliation?: ReconciliationSummary | null;
	requestedByActorId?: string;
	requestedByActorType?: string;
	reversedAt?: number;
	status: string;
	transfer?: TransferSummary | null;
	triggerSource?: string;
}

export interface CollectionPlanEntryRow {
	amount: number;
	balancePreCheck: {
		decision?: Doc<"collectionPlanEntries">["balancePreCheckDecision"];
		evaluatedAt?: number;
		nextEvaluationAt?: number;
		reasonCode?: Doc<"collectionPlanEntries">["balancePreCheckReasonCode"];
		reasonDetail?: string;
		ruleId?: Id<"collectionRules">;
		signalSource?: Doc<"collectionPlanEntries">["balancePreCheckSignalSource"];
	};
	collectionAttemptId?: Id<"collectionAttempts">;
	createdAt: number;
	createdByRule?: CollectionRuleRow | null;
	executedAt?: number;
	executionIdempotencyKey?: string;
	lineage: {
		rescheduledFromId?: Id<"collectionPlanEntries">;
		retryOfId?: Id<"collectionPlanEntries">;
		supersededAt?: number;
		supersededByWorkoutPlanId?: Id<"workoutPlans">;
		workoutPlanId?: Id<"workoutPlans">;
	};
	method: string;
	mortgageId: Id<"mortgages">;
	obligationIds: Id<"obligations">[];
	planEntryId: Id<"collectionPlanEntries">;
	relatedAttempt?: CollectionAttemptRow | null;
	reschedule: {
		reason?: string;
		requestedAt?: number;
		requestedByActorId?: string;
		requestedByActorType?: string;
	};
	scheduledDate: number;
	source: Doc<"collectionPlanEntries">["source"];
	status: Doc<"collectionPlanEntries">["status"];
	workoutPlan?: {
		name: string;
		status: Doc<"workoutPlans">["status"];
		workoutPlanId: Id<"workoutPlans">;
	} | null;
}

type DbReader = Pick<QueryCtx, "db">;

function describeCollectionRuleScope(scope: CollectionRuleScope) {
	return scope.scopeType === "global"
		? "Global"
		: `Mortgage ${String(scope.mortgageId)}`;
}

function describeCollectionRuleConfig(config: CollectionRuleConfig) {
	switch (config.kind) {
		case "schedule":
			return `Schedule ${config.delayDays} day(s) after due date`;
		case "retry":
			return `Retry up to ${config.maxRetries} time(s) with ${config.backoffBaseDays} day(s) between attempts`;
		case "late_fee":
			return `Assess ${config.feeCode} on ${config.feeSurface}`;
		case "balance_pre_check":
			if ("mode" in config) {
				return "Legacy balance pre-check placeholder";
			}
			return config.blockingDecision === "defer"
				? `Balance pre-check defers ${config.deferDays} day(s) after ${config.failureCountThreshold} failure(s) in ${config.lookbackDays} day(s)`
				: `Balance pre-check ${config.blockingDecision} after ${config.failureCountThreshold} failure(s) in ${config.lookbackDays} day(s)`;
		case "reschedule_policy":
			return "Borrower reschedule policy placeholder";
		case "workout_policy":
			return "Workout policy placeholder";
		default:
			return "Unknown rule configuration";
	}
}

export function buildCollectionRuleRow(
	rule: Doc<"collectionRules">,
	asOf = Date.now()
): CollectionRuleRow {
	return {
		ruleId: rule._id,
		kind: rule.kind,
		code: getCollectionRuleCode(rule),
		displayName: getCollectionRuleDisplayName(rule),
		description: rule.description,
		trigger: rule.trigger,
		status: getCollectionRuleStatus(rule),
		scope: getCollectionRuleScope(rule),
		scopeSummary: describeCollectionRuleScope(getCollectionRuleScope(rule)),
		config: rule.config,
		configSummary: describeCollectionRuleConfig(rule.config),
		effectiveFrom: rule.effectiveFrom,
		effectiveTo: rule.effectiveTo,
		isCurrentlyEffective: isCollectionRuleEffectiveAt(rule, asOf),
		createdByActorId: rule.createdByActorId,
		updatedByActorId: rule.updatedByActorId,
		priority: rule.priority,
		version: rule.version,
		createdAt: rule.createdAt,
		updatedAt: rule.updatedAt,
	};
}

async function loadTransferSummary(
	ctx: DbReader,
	transferRequestId?: Id<"transferRequests">
): Promise<TransferSummary | null> {
	if (!transferRequestId) {
		return null;
	}

	const transfer = await ctx.db.get(transferRequestId);
	if (!transfer) {
		return null;
	}

	return {
		transferId: transfer._id,
		status: transfer.status,
		direction: transfer.direction,
		transferType: transfer.transferType,
		counterpartyType: transfer.counterpartyType,
		counterpartyId: transfer.counterpartyId,
		providerCode: transfer.providerCode,
		providerRef: transfer.providerRef,
		failureCode: transfer.failureCode,
		failureReason: transfer.failureReason,
		confirmedAt: transfer.confirmedAt,
		failedAt: transfer.failedAt,
		reversedAt: transfer.reversedAt,
		createdAt: transfer.createdAt,
		idempotencyKey: transfer.idempotencyKey,
		collectionAttemptId: transfer.collectionAttemptId,
		metadata: transfer.metadata,
	};
}

async function loadReconciliationSummary(
	ctx: DbReader,
	transferRequestId?: Id<"transferRequests">
): Promise<ReconciliationSummary | null> {
	if (!transferRequestId) {
		return null;
	}

	const transfer = await ctx.db.get(transferRequestId);
	if (!transfer) {
		return null;
	}

	if (transfer.status === "confirmed") {
		const health = await getAttemptLinkedInboundSettlementHealth(ctx, transfer);
		return {
			expectedLifecycle: "attempt_confirmed_and_cash_received",
			hasExpectedPostingEntry: health.hasPostingEntry,
			isHealthy: health.isHealthy,
			reason: health.reason,
		};
	}

	if (transfer.status === "reversed") {
		const health = await getAttemptLinkedInboundReversalHealth(ctx, transfer);
		return {
			expectedLifecycle: "attempt_reversed_and_reversal_posted",
			hasExpectedPostingEntry: health.hasPostingEntry,
			isHealthy: health.isHealthy,
			reason: health.reason,
		};
	}

	return null;
}

export async function buildCollectionAttemptRow(
	ctx: DbReader,
	attempt: Doc<"collectionAttempts">
): Promise<CollectionAttemptRow> {
	const [transfer, reconciliation] = await Promise.all([
		loadTransferSummary(ctx, attempt.transferRequestId),
		loadReconciliationSummary(ctx, attempt.transferRequestId),
	]);

	return {
		collectionAttemptId: attempt._id,
		status: attempt.status,
		planEntryId: attempt.planEntryId,
		mortgageId: attempt.mortgageId,
		obligationIds: attempt.obligationIds,
		method: attempt.method,
		amount: attempt.amount,
		triggerSource: attempt.triggerSource,
		executionRequestedAt: attempt.executionRequestedAt,
		executionIdempotencyKey: attempt.executionIdempotencyKey,
		requestedByActorType: attempt.requestedByActorType,
		requestedByActorId: attempt.requestedByActorId,
		executionReason: attempt.executionReason,
		initiatedAt: attempt.initiatedAt,
		confirmedAt: attempt.confirmedAt,
		cancelledAt: attempt.cancelledAt,
		failedAt: attempt.failedAt,
		reversedAt: attempt.reversedAt,
		failureReason: attempt.failureReason,
		transfer,
		reconciliation,
	};
}

export async function buildCollectionPlanEntryRow(
	ctx: DbReader,
	entry: Doc<"collectionPlanEntries">
): Promise<CollectionPlanEntryRow> {
	const [relatedAttempt, createdByRule, workoutPlan] = await Promise.all([
		entry.collectionAttemptId ? ctx.db.get(entry.collectionAttemptId) : null,
		entry.createdByRuleId ? ctx.db.get(entry.createdByRuleId) : null,
		entry.workoutPlanId ? ctx.db.get(entry.workoutPlanId) : null,
	]);

	return {
		planEntryId: entry._id,
		mortgageId: entry.mortgageId,
		obligationIds: entry.obligationIds,
		amount: entry.amount,
		method: entry.method,
		scheduledDate: entry.scheduledDate,
		status: entry.status,
		source: entry.source,
		createdAt: entry.createdAt,
		collectionAttemptId: entry.collectionAttemptId,
		executedAt: entry.executedAt,
		executionIdempotencyKey: entry.executionIdempotencyKey,
		createdByRule: createdByRule ? buildCollectionRuleRow(createdByRule) : null,
		lineage: {
			retryOfId: entry.retryOfId,
			rescheduledFromId: entry.rescheduledFromId,
			workoutPlanId: entry.workoutPlanId,
			supersededByWorkoutPlanId: entry.supersededByWorkoutPlanId,
			supersededAt: entry.supersededAt,
		},
		reschedule: {
			reason: entry.rescheduleReason,
			requestedAt: entry.rescheduleRequestedAt,
			requestedByActorId: entry.rescheduleRequestedByActorId,
			requestedByActorType: entry.rescheduleRequestedByActorType,
		},
		balancePreCheck: {
			decision: entry.balancePreCheckDecision,
			reasonCode: entry.balancePreCheckReasonCode,
			reasonDetail: entry.balancePreCheckReasonDetail,
			signalSource: entry.balancePreCheckSignalSource,
			ruleId: entry.balancePreCheckRuleId,
			evaluatedAt: entry.balancePreCheckEvaluatedAt,
			nextEvaluationAt: entry.balancePreCheckNextEvaluationAt,
		},
		relatedAttempt: relatedAttempt
			? await buildCollectionAttemptRow(ctx, relatedAttempt)
			: null,
		workoutPlan: workoutPlan
			? {
					workoutPlanId: workoutPlan._id,
					name: workoutPlan.name,
					status: workoutPlan.status,
				}
			: null,
	};
}
