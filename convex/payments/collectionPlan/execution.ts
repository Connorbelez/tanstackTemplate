/**
 * Canonical Collection Plan execution contract.
 *
 * This is the AMPS-owned business command for taking one eligible
 * `collectionPlanEntries` row and turning it into exactly one business
 * `collectionAttempts` record. It stops at the Unified Payment Rails handoff
 * boundary by creating a transfer request through the transfer domain contract.
 *
 * Spec: https://www.notion.so/337fc1b440248115b4d3c21577f27601
 */

import { v } from "convex/values";
import { internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { auditLog } from "../../auditLog";
import { convex } from "../../fluent";
import {
	obligationTypeToTransferType,
	PROVIDER_CODES,
	type ProviderCode,
} from "../transfers/types";
import {
	buildAlreadyExecutedResult,
	buildAttemptCreatedResult,
	buildExecutionSource,
	buildNoopResult,
	buildRejectedResult,
	buildTransferHandoffIdempotencyKey,
	buildTransferHandoffMetadata,
	type ExecutePlanEntryArgs,
	type ExecutePlanEntryReasonCode,
	type ExecutePlanEntryResult,
	executePlanEntryInputValidator,
	normalizeExecutionIdempotencyKey,
	type StagePlanEntryExecutionResult,
} from "./executionContract";
import {
	classifyExecutionEligibility,
	loadExecutionPlanEntry,
} from "./executionGuards";

function mapMethodToProviderCode(method: string): ProviderCode {
	if ((PROVIDER_CODES as readonly string[]).includes(method)) {
		return method as ProviderCode;
	}

	if (method === "rotessa_pad") {
		return "pad_rotessa";
	}

	throw new Error(`Unsupported collection plan method "${method}".`);
}

function buildAuditActorId(
	args: Pick<ExecutePlanEntryArgs, "requestedByActorId" | "triggerSource">
) {
	return (
		args.requestedByActorId ??
		(args.triggerSource === "admin_manual" ? "admin" : "system")
	);
}

interface TransferHandoffContextSuccess {
	borrowerId: Id<"borrowers">;
	mortgageId: Id<"mortgages">;
	primaryObligationType?: string;
	providerCode: ProviderCode;
	source: ReturnType<typeof buildExecutionSource>;
}

type TransferHandoffContext =
	| TransferHandoffContextSuccess
	| {
			reasonCode:
				| "missing_execution_metadata"
				| "unsupported_plan_entry_method";
			reasonDetail: string;
	  };

function prepareTransferHandoffContext(args: {
	obligations: Doc<"obligations">[];
	planEntry: Doc<"collectionPlanEntries">;
	triggerSource: ExecutePlanEntryArgs["triggerSource"];
	requestedByActorId?: string;
}): TransferHandoffContext {
	const firstObligation = args.obligations[0];
	if (!(firstObligation?.borrowerId && firstObligation.mortgageId)) {
		return {
			reasonCode: "missing_execution_metadata" as const,
			reasonDetail:
				"Plan entry obligations do not provide the borrower or mortgage context required for Payment Rails handoff.",
		};
	}

	for (const obligation of args.obligations.slice(1)) {
		if (
			obligation.borrowerId !== firstObligation.borrowerId ||
			obligation.mortgageId !== firstObligation.mortgageId ||
			obligation.type !== firstObligation.type
		) {
			return {
				reasonCode: "missing_execution_metadata" as const,
				reasonDetail:
					"Plan entry obligations must share one borrower, one mortgage, and one primary obligation type before AMPS can hand off to Payment Rails.",
			};
		}
	}

	let providerCode: ProviderCode;
	try {
		providerCode = mapMethodToProviderCode(args.planEntry.method);
	} catch {
		return {
			reasonCode: "unsupported_plan_entry_method" as const,
			reasonDetail: `Collection plan entry method "${args.planEntry.method}" is not supported for Payment Rails handoff.`,
		};
	}

	return {
		borrowerId: firstObligation.borrowerId,
		mortgageId: firstObligation.mortgageId,
		primaryObligationType: firstObligation.type,
		providerCode,
		source: buildExecutionSource({
			triggerSource: args.triggerSource,
			requestedByActorId: args.requestedByActorId,
		}),
	};
}

function buildTransferHandoffRequest(args: {
	context: TransferHandoffContextSuccess;
	collectionAttemptId: Id<"collectionAttempts">;
	idempotencyKey: string;
	planEntry: Doc<"collectionPlanEntries">;
}) {
	return {
		amount: args.planEntry.amount,
		borrowerId: args.context.borrowerId,
		collectionAttemptId: args.collectionAttemptId,
		counterpartyId: `${args.context.borrowerId}`,
		idempotencyKey: args.idempotencyKey,
		method: args.planEntry.method,
		mortgageId: args.context.mortgageId,
		obligationIds: args.planEntry.obligationIds,
		primaryObligationType: args.context.primaryObligationType,
		providerCode: args.context.providerCode,
		planEntryId: args.planEntry._id,
		source: args.context.source,
	};
}

async function logPlanEntryExecutionAudit(
	ctx: MutationCtx,
	args: ExecutePlanEntryArgs,
	result: ExecutePlanEntryResult
) {
	const collectionAttemptId =
		"collectionAttemptId" in result ? result.collectionAttemptId : undefined;
	const transferRequestId =
		"transferRequestId" in result ? result.transferRequestId : undefined;
	const attemptStatusAfter =
		"attemptStatusAfter" in result ? result.attemptStatusAfter : undefined;

	await auditLog.log(ctx, {
		action: "collection_plan.execute_plan_entry",
		actorId: buildAuditActorId(args),
		resourceType: "collectionPlanEntries",
		resourceId: `${result.planEntryId}`,
		severity: result.outcome === "rejected" ? "warning" : "info",
		metadata: {
			triggerSource: args.triggerSource,
			requestedAt: args.requestedAt,
			requestedByActorType: args.requestedByActorType,
			requestedByActorId: args.requestedByActorId,
			reason: args.reason,
			outcome: result.outcome,
			planEntryStatusAfter: result.planEntryStatusAfter,
			collectionAttemptId,
			transferRequestId,
			attemptStatusAfter,
			reasonCode: result.reasonCode,
			reasonDetail: result.reasonDetail,
			idempotencyKey: result.idempotencyKey,
			executionRecordedAt: result.executionRecordedAt,
		},
	});
}

const stagePlanEntryExecution = convex
	.mutation()
	.input(executePlanEntryInputValidator)
	.handler(async (ctx, args): Promise<StagePlanEntryExecutionResult> => {
		const executionRecordedAt = Date.now();
		const normalizedIdempotencyKey = normalizeExecutionIdempotencyKey(
			args.idempotencyKey
		);

		if (!normalizedIdempotencyKey) {
			const result = buildRejectedResult({
				executionRecordedAt,
				idempotencyKey: args.idempotencyKey,
				planEntryId: args.planEntryId,
				planEntryStatusAfter: "planned",
				reasonCode: "invalid_idempotency_key",
				reasonDetail: "Execution idempotency key must be a non-empty string.",
			});
			await logPlanEntryExecutionAudit(ctx, args, result);
			return {
				result,
			};
		}

		const loaded = await loadExecutionPlanEntry(ctx, args.planEntryId);
		if (!loaded) {
			const result = buildRejectedResult({
				executionRecordedAt,
				idempotencyKey: normalizedIdempotencyKey,
				planEntryId: args.planEntryId,
				planEntryStatusAfter: "planned",
				reasonCode: "plan_entry_not_found",
				reasonDetail: `Collection plan entry ${args.planEntryId} was not found.`,
			});
			await logPlanEntryExecutionAudit(ctx, args, result);
			return {
				result,
			};
		}

		const { existingAttempt, obligations, planEntry } = loaded;
		if (existingAttempt) {
			const reconciledExecutionIdempotencyKey =
				existingAttempt.executionIdempotencyKey ?? normalizedIdempotencyKey;
			const reconciledExecutedAt =
				existingAttempt.executionRequestedAt ?? existingAttempt.initiatedAt;
			if (
				planEntry.collectionAttemptId !== existingAttempt._id ||
				planEntry.executedAt !== reconciledExecutedAt ||
				planEntry.executionIdempotencyKey !==
					reconciledExecutionIdempotencyKey ||
				planEntry.status !== "executing"
			) {
				await ctx.db.patch(planEntry._id, {
					collectionAttemptId: existingAttempt._id,
					executedAt: reconciledExecutedAt,
					executionIdempotencyKey: reconciledExecutionIdempotencyKey,
					status: "executing",
				});
			}

			const result = buildAlreadyExecutedResult({
				executionRecordedAt,
				idempotencyKey: normalizedIdempotencyKey,
				planEntryId: planEntry._id,
				planEntryStatusAfter: "executing",
				collectionAttemptId: existingAttempt._id,
				attemptStatusAfter: existingAttempt.status,
				transferRequestId: existingAttempt.transferRequestId,
				reasonCode: "plan_entry_already_executed",
				reasonDetail:
					"Collection plan entry already has a business collection attempt.",
			});
			if (existingAttempt.transferRequestId) {
				await logPlanEntryExecutionAudit(ctx, args, result);
				return {
					result,
				};
			}

			const handoffContext = prepareTransferHandoffContext({
				obligations,
				planEntry,
				triggerSource: args.triggerSource,
				requestedByActorId: args.requestedByActorId,
			});
			if ("reasonCode" in handoffContext) {
				const rejected = buildRejectedResult({
					executionRecordedAt,
					idempotencyKey: normalizedIdempotencyKey,
					planEntryId: planEntry._id,
					planEntryStatusAfter: "executing",
					reasonCode: handoffContext.reasonCode,
					reasonDetail: handoffContext.reasonDetail,
				});
				await logPlanEntryExecutionAudit(ctx, args, rejected);
				return {
					result: rejected,
				};
			}

			await logPlanEntryExecutionAudit(ctx, args, result);
			return {
				result,
				transferHandoffRequest: buildTransferHandoffRequest({
					context: handoffContext,
					collectionAttemptId: existingAttempt._id,
					idempotencyKey: reconciledExecutionIdempotencyKey,
					planEntry,
				}),
			};
		}

		const ineligibleResult = classifyExecutionEligibility({
			executionRecordedAt,
			idempotencyKey: normalizedIdempotencyKey,
			loaded,
			request: args,
		});
		if (ineligibleResult) {
			await logPlanEntryExecutionAudit(ctx, args, ineligibleResult);
			return { result: ineligibleResult };
		}

		if (args.dryRun) {
			const result = buildNoopResult({
				executionRecordedAt,
				idempotencyKey: normalizedIdempotencyKey,
				planEntryId: planEntry._id,
				planEntryStatusAfter: planEntry.status,
				reasonCode: "dry_run_requested",
				reasonDetail:
					"Dry-run execution is valid but does not create attempts in the initial implementation.",
			});
			await logPlanEntryExecutionAudit(ctx, args, result);
			return {
				result,
			};
		}

		const handoffContext = prepareTransferHandoffContext({
			obligations,
			planEntry,
			triggerSource: args.triggerSource,
			requestedByActorId: args.requestedByActorId,
		});
		if ("reasonCode" in handoffContext) {
			const result = buildRejectedResult({
				executionRecordedAt,
				idempotencyKey: normalizedIdempotencyKey,
				planEntryId: planEntry._id,
				planEntryStatusAfter: planEntry.status,
				reasonCode: handoffContext.reasonCode,
				reasonDetail: handoffContext.reasonDetail,
			});
			await logPlanEntryExecutionAudit(ctx, args, result);
			return {
				result,
			};
		}

		const attemptId = await ctx.db.insert("collectionAttempts", {
			status: "initiated",
			machineContext: {
				attemptId: "",
				retryCount: 0,
				maxRetries: 3,
			},
			planEntryId: planEntry._id,
			method: planEntry.method,
			amount: planEntry.amount,
			triggerSource: args.triggerSource,
			executionRequestedAt: args.requestedAt,
			executionIdempotencyKey: normalizedIdempotencyKey,
			requestedByActorType: args.requestedByActorType,
			requestedByActorId: args.requestedByActorId,
			executionReason: args.reason,
			initiatedAt: executionRecordedAt,
		});

		await ctx.db.patch(attemptId, {
			machineContext: {
				attemptId: `${attemptId}`,
				retryCount: 0,
				maxRetries: 3,
			},
		});

		await ctx.db.patch(planEntry._id, {
			status: "executing",
			collectionAttemptId: attemptId,
			executedAt: args.requestedAt,
			executionIdempotencyKey: normalizedIdempotencyKey,
		});

		const result = buildAttemptCreatedResult({
			executionRecordedAt,
			idempotencyKey: normalizedIdempotencyKey,
			planEntryId: planEntry._id,
			planEntryStatusAfter: "executing",
			collectionAttemptId: attemptId,
			attemptStatusAfter: "initiated",
		});
		await logPlanEntryExecutionAudit(ctx, args, result);

		return {
			result,
			transferHandoffRequest: buildTransferHandoffRequest({
				context: handoffContext,
				collectionAttemptId: attemptId,
				idempotencyKey: normalizedIdempotencyKey,
				planEntry,
			}),
		};
	});

export const stagePlanEntryExecutionMutation =
	stagePlanEntryExecution.internal();

export const recordTransferHandoffSuccess = convex
	.mutation()
	.input({
		attemptId: v.id("collectionAttempts"),
		transferRequestId: v.id("transferRequests"),
	})
	.handler(async (ctx, args) => {
		await ctx.db.patch(args.attemptId, {
			transferRequestId: args.transferRequestId,
			providerStatus: "transfer_requested",
		});

		await auditLog.log(ctx, {
			action: "collection_plan.transfer_handoff.succeeded",
			actorId: "system",
			resourceType: "collectionAttempts",
			resourceId: `${args.attemptId}`,
			severity: "info",
			metadata: {
				transferRequestId: `${args.transferRequestId}`,
			},
		});
	});
export const recordTransferHandoffSuccessMutation =
	recordTransferHandoffSuccess.internal();

export const recordTransferHandoffFailure = convex
	.mutation()
	.input({
		attemptId: v.id("collectionAttempts"),
		failureReason: v.string(),
	})
	.handler(async (ctx, args) => {
		await ctx.db.patch(args.attemptId, {
			failureReason: args.failureReason,
			providerStatus: "transfer_handoff_failed",
		});

		await auditLog.log(ctx, {
			action: "collection_plan.transfer_handoff.failed",
			actorId: "system",
			resourceType: "collectionAttempts",
			resourceId: `${args.attemptId}`,
			severity: "warning",
			metadata: {
				failureReason: args.failureReason,
			},
		});
	});
export const recordTransferHandoffFailureMutation =
	recordTransferHandoffFailure.internal();

export const executePlanEntry = convex
	.action()
	.input(executePlanEntryInputValidator)
	.handler(async (ctx, args): Promise<ExecutePlanEntryResult> => {
		const staged = await ctx.runMutation(
			internal.payments.collectionPlan.execution
				.stagePlanEntryExecutionMutation,
			args
		);
		const { result, transferHandoffRequest } = staged;
		if (
			result.outcome !== "attempt_created" &&
			result.outcome !== "already_executed"
		) {
			return result;
		}

		if (!transferHandoffRequest || result.transferRequestId) {
			return result;
		}

		try {
			const firstObligationId = transferHandoffRequest.obligationIds[0];
			const transferRequestId = await ctx.runMutation(
				internal.payments.transfers.mutations.createTransferRequestInternal,
				{
					direction: "inbound",
					transferType: obligationTypeToTransferType(
						transferHandoffRequest.primaryObligationType
					),
					amount: transferHandoffRequest.amount,
					counterpartyType: "borrower",
					counterpartyId: transferHandoffRequest.counterpartyId,
					mortgageId: transferHandoffRequest.mortgageId,
					obligationId: firstObligationId,
					planEntryId: transferHandoffRequest.planEntryId,
					collectionAttemptId: transferHandoffRequest.collectionAttemptId,
					borrowerId: transferHandoffRequest.borrowerId,
					providerCode: transferHandoffRequest.providerCode,
					idempotencyKey: buildTransferHandoffIdempotencyKey(
						transferHandoffRequest.planEntryId
					),
					metadata: buildTransferHandoffMetadata(
						transferHandoffRequest,
						transferHandoffRequest.primaryObligationType
					),
					source: transferHandoffRequest.source,
				}
			);

			await ctx.runMutation(
				internal.payments.collectionPlan.execution
					.recordTransferHandoffSuccessMutation,
				{
					attemptId: result.collectionAttemptId,
					transferRequestId,
				}
			);

			return {
				...result,
				transferRequestId,
			};
		} catch (error) {
			const reasonDetail =
				error instanceof Error ? error.message : String(error);

			await ctx.runMutation(
				internal.payments.collectionPlan.execution
					.recordTransferHandoffFailureMutation,
				{
					attemptId: result.collectionAttemptId,
					failureReason: reasonDetail,
				}
			);

			return {
				...result,
				reasonCode:
					"transfer_handoff_failed" satisfies ExecutePlanEntryReasonCode,
				reasonDetail,
			};
		}
	})
	.internal();
