import type { Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { executeTransition } from "../../engine/transition";
import type { CommandSource } from "../../engine/types";

interface TransferAttemptLink {
	collectionAttemptId?: Id<"collectionAttempts">;
	direction?: string;
}

interface AttemptPostingHealth {
	attemptId?: Id<"collectionAttempts">;
	attemptStatus?: string;
	hasPostingEntry: boolean;
	isHealthy: boolean;
	reason?:
		| "missing_attempt"
		| "attempt_status_mismatch"
		| "missing_posting_entry";
}

type DbReader = Pick<QueryCtx, "db">;

export function isAttemptLinkedInboundTransfer(
	transfer: TransferAttemptLink
): transfer is {
	collectionAttemptId: Id<"collectionAttempts">;
	direction: "inbound";
} {
	return (
		transfer.direction === "inbound" &&
		transfer.collectionAttemptId !== undefined
	);
}

export function cashReceiptPostingGroupId(
	attemptId: Id<"collectionAttempts">
): string {
	return `cash-receipt:${attemptId}`;
}

export function reversalPostingGroupId(
	attemptId: Id<"collectionAttempts">
): string {
	return `reversal-group:${attemptId}`;
}

async function loadAttemptPostingHealth(
	ctx: DbReader,
	args: {
		transfer: TransferAttemptLink;
		expectedAttemptStatus: "confirmed" | "reversed";
		postingGroupId: string;
		entryType: "CASH_RECEIVED" | "REVERSAL";
	}
): Promise<AttemptPostingHealth> {
	if (!isAttemptLinkedInboundTransfer(args.transfer)) {
		return {
			hasPostingEntry: false,
			isHealthy: false,
		};
	}

	const attempt = await ctx.db.get(args.transfer.collectionAttemptId);
	if (!attempt) {
		return {
			attemptId: args.transfer.collectionAttemptId,
			hasPostingEntry: false,
			isHealthy: false,
			reason: "missing_attempt",
		};
	}

	const postingEntries = await ctx.db
		.query("cash_ledger_journal_entries")
		.withIndex("by_posting_group", (q) =>
			q.eq("postingGroupId", args.postingGroupId)
		)
		.collect();

	const hasPostingEntry = postingEntries.some(
		(entry) =>
			entry.entryType === args.entryType && entry.attemptId === attempt._id
	);
	const hasExpectedStatus = attempt.status === args.expectedAttemptStatus;
	let reason: AttemptPostingHealth["reason"];
	if (!hasExpectedStatus) {
		reason = "attempt_status_mismatch";
	} else if (!hasPostingEntry) {
		reason = "missing_posting_entry";
	}

	return {
		attemptId: attempt._id,
		attemptStatus: attempt.status,
		hasPostingEntry,
		isHealthy: hasExpectedStatus && hasPostingEntry,
		reason,
	};
}

export async function getAttemptLinkedInboundSettlementHealth(
	ctx: DbReader,
	transfer: TransferAttemptLink
): Promise<AttemptPostingHealth> {
	if (!isAttemptLinkedInboundTransfer(transfer)) {
		return {
			hasPostingEntry: false,
			isHealthy: false,
		};
	}

	return loadAttemptPostingHealth(ctx, {
		transfer,
		expectedAttemptStatus: "confirmed",
		postingGroupId: cashReceiptPostingGroupId(transfer.collectionAttemptId),
		entryType: "CASH_RECEIVED",
	});
}

export async function getAttemptLinkedInboundReversalHealth(
	ctx: DbReader,
	transfer: TransferAttemptLink
): Promise<AttemptPostingHealth> {
	if (!isAttemptLinkedInboundTransfer(transfer)) {
		return {
			hasPostingEntry: false,
			isHealthy: false,
		};
	}

	return loadAttemptPostingHealth(ctx, {
		transfer,
		expectedAttemptStatus: "reversed",
		postingGroupId: reversalPostingGroupId(transfer.collectionAttemptId),
		entryType: "REVERSAL",
	});
}

async function transitionAttempt(
	ctx: MutationCtx,
	args: {
		transfer: TransferAttemptLink;
		eventType:
			| "FUNDS_SETTLED"
			| "DRAW_FAILED"
			| "RETRY_ELIGIBLE"
			| "MAX_RETRIES_EXCEEDED"
			| "ATTEMPT_CANCELLED"
			| "PAYMENT_REVERSED";
		payload?: Record<string, unknown>;
		source: CommandSource;
	}
): Promise<boolean> {
	if (!isAttemptLinkedInboundTransfer(args.transfer)) {
		return false;
	}

	await executeTransition(ctx, {
		entityType: "collectionAttempt",
		entityId: args.transfer.collectionAttemptId,
		eventType: args.eventType,
		payload: args.payload,
		source: args.source,
	});
	return true;
}

export async function reconcileAttemptLinkedInboundSettlement(
	ctx: MutationCtx,
	args: {
		transfer: TransferAttemptLink;
		settledAt: number;
		source: CommandSource;
	}
): Promise<boolean> {
	return transitionAttempt(ctx, {
		transfer: args.transfer,
		eventType: "FUNDS_SETTLED",
		payload: { settledAt: args.settledAt },
		source: args.source,
	});
}

export async function reconcileAttemptLinkedInboundFailure(
	ctx: MutationCtx,
	args: {
		transfer: TransferAttemptLink;
		failureCode: string;
		failureReason: string;
		source: CommandSource;
	}
): Promise<boolean> {
	if (!isAttemptLinkedInboundTransfer(args.transfer)) {
		return false;
	}

	await ctx.db.patch(args.transfer.collectionAttemptId, {
		failureReason: args.failureReason,
		providerStatus: "transfer_failed",
	});

	await transitionAttempt(ctx, {
		transfer: args.transfer,
		eventType: "DRAW_FAILED",
		payload: {
			code: args.failureCode,
			reason: args.failureReason,
		},
		source: args.source,
	});

	const attempt = await ctx.db.get(args.transfer.collectionAttemptId);
	if (!attempt || attempt.status !== "failed") {
		return true;
	}

	const retryCount =
		typeof attempt.machineContext?.retryCount === "number"
			? attempt.machineContext.retryCount
			: 0;
	const maxRetries =
		typeof attempt.machineContext?.maxRetries === "number"
			? attempt.machineContext.maxRetries
			: 3;

	await transitionAttempt(ctx, {
		transfer: args.transfer,
		eventType:
			retryCount < maxRetries ? "RETRY_ELIGIBLE" : "MAX_RETRIES_EXCEEDED",
		source: args.source,
	});

	return true;
}

export async function reconcileAttemptLinkedInboundCancellation(
	ctx: MutationCtx,
	args: {
		transfer: TransferAttemptLink;
		reason: string;
		source: CommandSource;
	}
): Promise<boolean> {
	if (!isAttemptLinkedInboundTransfer(args.transfer)) {
		return false;
	}

	await ctx.db.patch(args.transfer.collectionAttemptId, {
		providerStatus: "transfer_cancelled",
	});

	await transitionAttempt(ctx, {
		transfer: args.transfer,
		eventType: "ATTEMPT_CANCELLED",
		payload: { reason: args.reason },
		source: args.source,
	});

	return true;
}

export async function reconcileAttemptLinkedInboundReversal(
	ctx: MutationCtx,
	args: {
		transfer: TransferAttemptLink;
		reason: string;
		effectiveDate: string;
		source: CommandSource;
	}
): Promise<boolean> {
	if (!isAttemptLinkedInboundTransfer(args.transfer)) {
		return false;
	}

	await ctx.db.patch(args.transfer.collectionAttemptId, {
		providerStatus: "transfer_reversed",
	});

	await transitionAttempt(ctx, {
		transfer: args.transfer,
		eventType: "PAYMENT_REVERSED",
		payload: {
			reason: args.reason,
			effectiveDate: args.effectiveDate,
		},
		source: args.source,
	});

	return true;
}
