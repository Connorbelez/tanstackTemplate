import type { Id } from "../../_generated/dataModel";

/** Normalized payload from any payment provider's reversal webhook. */
export interface ReversalWebhookPayload {
	/** Original amount in cents */
	originalAmount: number;
	provider: "rotessa" | "stripe";
	/** For idempotency dedup */
	providerEventId: string;
	/** Maps to collectionAttempts.providerRef */
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
}
