import { ConvexError } from "convex/values";
import { internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import type { ActionCtx } from "../../_generated/server";
import type { ManualSettlementDetails } from "../transfers/interface";
import type {
	ExecutePlanEntryArgs,
	ExecutePlanEntryResult,
} from "./executionContract";

const SETTLEABLE_OBLIGATION_STATUSES = new Set<Doc<"obligations">["status"]>([
	"due",
	"overdue",
	"partially_settled",
]);

type ManualCollectionRequestedByActorType = Extract<
	ExecutePlanEntryArgs["requestedByActorType"],
	"admin" | "system"
>;

type ManualCollectionActionCtx = Pick<
	ActionCtx,
	"runAction" | "runMutation" | "runQuery"
>;

interface ManualCollectionObligation {
	_id: Id<"obligations">;
	amount: number;
	amountSettled: number;
	mortgageId: Id<"mortgages">;
	status: Doc<"obligations">["status"];
}

export interface ManualInboundCollectionResult {
	collectionAttemptId: Id<"collectionAttempts">;
	message: string;
	obligationStatusAfter: Doc<"obligations">["status"];
	planEntryId: Id<"collectionPlanEntries">;
	transferId?: Id<"transferRequests">;
	transferStatus?: string;
}

export function buildManualCollectionIdempotencyKey(args: {
	actorId: string;
	amount: number;
	obligationId: Id<"obligations">;
	settlementOccurredAt: number;
}) {
	return [
		"manual-collection",
		args.obligationId,
		args.amount,
		args.settlementOccurredAt,
		args.actorId,
	].join(":");
}

async function loadManualCollectionObligation(
	ctx: ManualCollectionActionCtx,
	obligationId: Id<"obligations">
): Promise<ManualCollectionObligation> {
	const loaded = (await ctx.runQuery(
		internal.payments.obligations.queries.getObligationWithCorrectives,
		{ obligationId }
	)) as {
		obligation: ManualCollectionObligation;
	} | null;

	if (!loaded?.obligation) {
		throw new ConvexError(`Obligation not found: ${obligationId}`);
	}

	return loaded.obligation;
}

function getSuccessMessage(
	obligationStatusAfter: Doc<"obligations">["status"],
	transferStatus?: string
) {
	if (obligationStatusAfter === "settled") {
		return "Payment applied. Dispersal scheduled.";
	}
	if (transferStatus === "confirmed") {
		return "Partial payment applied. Obligation remains open.";
	}
	return "Payment initiated.";
}

export async function runManualInboundCollectionForObligation(
	ctx: ManualCollectionActionCtx,
	args: {
		amount: number;
		manualSettlement: ManualSettlementDetails;
		obligationId: Id<"obligations">;
		reason?: string;
		requestedAt: number;
		requestedByActorId: string;
		requestedByActorType: ManualCollectionRequestedByActorType;
		triggerSource: Extract<
			ExecutePlanEntryArgs["triggerSource"],
			"admin_manual" | "workflow_replay"
		>;
	}
): Promise<ManualInboundCollectionResult> {
	const obligation = await loadManualCollectionObligation(
		ctx,
		args.obligationId
	);

	if (!SETTLEABLE_OBLIGATION_STATUSES.has(obligation.status)) {
		throw new ConvexError(
			`Obligation ${args.obligationId} is ${obligation.status}. Only due, overdue, or partially settled obligations can be paid.`
		);
	}
	if (!Number.isSafeInteger(args.amount) || args.amount <= 0) {
		throw new ConvexError("settledAmount must be a positive integer amount.");
	}

	const remainingAmount = obligation.amount - obligation.amountSettled;
	if (args.amount > remainingAmount) {
		throw new ConvexError(
			`settledAmount ${args.amount} exceeds remaining balance ${remainingAmount}.`
		);
	}

	const executionIdempotencyKey = buildManualCollectionIdempotencyKey({
		actorId: args.requestedByActorId,
		amount: args.amount,
		obligationId: args.obligationId,
		settlementOccurredAt: args.manualSettlement.settlementOccurredAt,
	});

	const planEntryId = (await ctx.runMutation(
		internal.payments.collectionPlan.mutations.createEntry,
		{
			amount: args.amount,
			executionIdempotencyKey,
			method: "manual",
			obligationIds: [args.obligationId],
			scheduledDate: args.manualSettlement.settlementOccurredAt,
			source: "admin",
			status: "planned",
		}
	)) as Id<"collectionPlanEntries">;

	const executionResult = (await ctx.runAction(
		internal.payments.collectionPlan.execution.executePlanEntry,
		{
			idempotencyKey: executionIdempotencyKey,
			manualSettlement: args.manualSettlement,
			planEntryId,
			reason: args.reason,
			requestedAt: args.requestedAt,
			requestedByActorId: args.requestedByActorId,
			requestedByActorType: args.requestedByActorType,
			triggerSource: args.triggerSource,
		}
	)) as ExecutePlanEntryResult;

	if (
		executionResult.outcome !== "attempt_created" &&
		executionResult.outcome !== "already_executed"
	) {
		throw new ConvexError(
			executionResult.reasonDetail ??
				"Manual collection could not be executed through the payment rails."
		);
	}

	const obligationAfter = await loadManualCollectionObligation(
		ctx,
		args.obligationId
	);
	const transfer = executionResult.transferRequestId
		? ((await ctx.runQuery(
				internal.payments.transfers.queries.getTransferInternal,
				{ transferId: executionResult.transferRequestId }
			)) as { status?: string } | null)
		: null;

	return {
		collectionAttemptId: executionResult.collectionAttemptId,
		message: getSuccessMessage(obligationAfter.status, transfer?.status),
		obligationStatusAfter: obligationAfter.status,
		planEntryId,
		transferId: executionResult.transferRequestId,
		transferStatus: transfer?.status,
	};
}
