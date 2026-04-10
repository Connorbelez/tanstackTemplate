import { describe, expect, it, vi } from "vitest";
import type { Id } from "../../../_generated/dataModel";
import type { ActionCtx } from "../../../_generated/server";
import { handlePaymentReversal } from "../handleReversal";
import type { ReversalWebhookPayload } from "../types";

const payload: ReversalWebhookPayload = {
	originalAmount: 15_000,
	provider: "rotessa",
	providerEventId: "evt_reversal_001",
	providerRef: "txn_reversal_001",
	reversalDate: "2026-03-15",
	reversalReason: "NSF",
};

function createActionCtx(args: {
	mutationResult?: { success: boolean };
	queryResult: {
		_id: Id<"transferRequests">;
		collectionAttemptId?: Id<"collectionAttempts">;
		status:
			| "approved"
			| "cancelled"
			| "completed"
			| "confirmed"
			| "failed"
			| "initiated"
			| "pending"
			| "processing"
			| "reversed";
	} | null;
}) {
	const runQuery = vi.fn().mockResolvedValue(args.queryResult);
	const runMutation = vi
		.fn()
		.mockResolvedValue(args.mutationResult ?? { success: true });

	return {
		ctx: {
			runMutation,
			runQuery,
		} as unknown as ActionCtx,
		runMutation,
		runQuery,
	};
}

describe("handlePaymentReversal", () => {
	it("treats legacy completed transfers as confirmed-like", async () => {
		const transferId = "transfer_legacy_completed" as Id<"transferRequests">;
		const attemptId = "attempt_legacy_completed" as Id<"collectionAttempts">;
		const { ctx, runMutation } = createActionCtx({
			queryResult: {
				_id: transferId,
				collectionAttemptId: attemptId,
				status: "completed",
			},
		});

		const result = await handlePaymentReversal(ctx, payload);

		expect(result).toEqual({
			success: true,
			attemptId,
			transferId,
		});
		expect(runMutation).toHaveBeenCalledOnce();
	});

	it("still rejects legacy approved transfers", async () => {
		const transferId = "transfer_legacy_approved" as Id<"transferRequests">;
		const attemptId = "attempt_legacy_approved" as Id<"collectionAttempts">;
		const { ctx, runMutation } = createActionCtx({
			queryResult: {
				_id: transferId,
				collectionAttemptId: attemptId,
				status: "approved",
			},
		});

		const result = await handlePaymentReversal(ctx, payload);

		expect(result).toEqual({
			success: false,
			reason: "invalid_state",
			attemptId,
			transferId,
		});
		expect(runMutation).not.toHaveBeenCalled();
	});
});
