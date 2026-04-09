import { v } from "convex/values";
import type { Id } from "../../_generated/dataModel";

export type NormalizedTransferWebhookEventType =
	| "FUNDS_SETTLED"
	| "TRANSFER_FAILED"
	| "TRANSFER_REVERSED"
	| "PROCESSING_UPDATE";

/** Runtime validator matching NormalizedTransferWebhookEventType. */
export const normalizedEventTypeValidator = v.union(
	v.literal("FUNDS_SETTLED"),
	v.literal("TRANSFER_FAILED"),
	v.literal("TRANSFER_REVERSED"),
	v.literal("PROCESSING_UPDATE")
);

export type TransferWebhookProcessingStatus =
	| "pending"
	| "processed"
	| "failed";

export interface TransferWebhookMetadataPatch {
	normalizedEventType?: NormalizedTransferWebhookEventType;
	transferRequestId?: Id<"transferRequests">;
}

/** Normalized payload from any payment provider's reversal webhook. */
export interface ReversalWebhookPayload {
	/** Original amount in cents */
	originalAmount: number;
	provider: "rotessa" | "pad_vopay";
	/** For idempotency dedup */
	providerEventId: string;
	/** Maps to transferRequests.providerRef */
	providerRef: string;
	/** Provider-specific code (e.g., "NSF", "R01") */
	reversalCode?: string;
	/** YYYY-MM-DD */
	reversalDate: string;
	/** Human-readable reason */
	reversalReason: string;
}

/** Result from processing a reversal. */
export interface ReversalResult {
	attemptId?: Id<"collectionAttempts">;
	clawbackRequired?: boolean;
	postingGroupId?: string;
	/** If not successful, why */
	reason?: string;
	success: boolean;
	transferId?: Id<"transferRequests">;
}
