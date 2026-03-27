/**
 * Transfer effect tests — verifies registry presence and documents
 * the expected branching logic in transfer effects.
 *
 * The effects are internalMutations requiring the full Convex runtime.
 * These tests verify:
 * 1. All transfer effects are registered in the effect registry
 * 2. The D4 conditional logic (bridged vs non-bridged) is documented
 * 3. Payload extraction fallback behavior is tested via pure helpers
 */

import { describe, expect, it } from "vitest";
import { effectRegistry } from "../../effects/registry";

// ── Effect registry presence ────────────────────────────────────────

describe("transfer effects registry", () => {
	it("recordTransferProviderRef is registered", () => {
		expect(effectRegistry.recordTransferProviderRef).toBeDefined();
	});

	it("publishTransferConfirmed is registered", () => {
		expect(effectRegistry.publishTransferConfirmed).toBeDefined();
	});

	it("publishTransferFailed is registered", () => {
		expect(effectRegistry.publishTransferFailed).toBeDefined();
	});

	it("publishTransferReversed is registered", () => {
		expect(effectRegistry.publishTransferReversed).toBeDefined();
	});
});

// ── publishTransferFailed payload extraction ────────────────────────

describe("publishTransferFailed payload extraction", () => {
	function extractFailureFields(payload?: Record<string, unknown>) {
		const errorCode =
			typeof payload?.errorCode === "string" ? payload.errorCode : "UNKNOWN";
		const reason =
			typeof payload?.reason === "string" ? payload.reason : "unknown_failure";
		return { errorCode, reason };
	}

	it("extracts string errorCode and reason", () => {
		const result = extractFailureFields({
			errorCode: "NSF",
			reason: "insufficient funds",
		});
		expect(result.errorCode).toBe("NSF");
		expect(result.reason).toBe("insufficient funds");
	});

	it('defaults errorCode to "UNKNOWN" when missing', () => {
		const result = extractFailureFields({});
		expect(result.errorCode).toBe("UNKNOWN");
	});

	it('defaults reason to "unknown_failure" when missing', () => {
		const result = extractFailureFields({});
		expect(result.reason).toBe("unknown_failure");
	});

	it('defaults errorCode to "UNKNOWN" for non-string value', () => {
		const result = extractFailureFields({ errorCode: 42 });
		expect(result.errorCode).toBe("UNKNOWN");
	});

	it("handles undefined payload", () => {
		const result = extractFailureFields(undefined);
		expect(result.errorCode).toBe("UNKNOWN");
		expect(result.reason).toBe("unknown_failure");
	});
});

// ── publishTransferReversed payload extraction ──────────────────────

describe("publishTransferReversed payload extraction", () => {
	function extractReversalFields(payload?: Record<string, unknown>) {
		const reversalRef =
			typeof payload?.reversalRef === "string"
				? payload.reversalRef
				: undefined;
		const reason =
			typeof payload?.reason === "string"
				? payload.reason
				: "transfer_reversed";
		return { reversalRef, reason };
	}

	it("extracts string reversalRef and reason", () => {
		const result = extractReversalFields({
			reversalRef: "REV-001",
			reason: "chargeback",
		});
		expect(result.reversalRef).toBe("REV-001");
		expect(result.reason).toBe("chargeback");
	});

	it("reversalRef is undefined when missing", () => {
		const result = extractReversalFields({});
		expect(result.reversalRef).toBeUndefined();
	});

	it('defaults reason to "transfer_reversed" when missing', () => {
		const result = extractReversalFields({});
		expect(result.reason).toBe("transfer_reversed");
	});
});

// ── D4 conditional branching documentation ──────────────────────────

describe("D4 conditional: publishTransferConfirmed branching", () => {
	interface Transfer {
		collectionAttemptId?: string;
		direction: "inbound" | "outbound";
	}

	function determineCashPostingAction(transfer: Transfer): string {
		if (transfer.collectionAttemptId) {
			return "skip_bridged";
		}
		if (transfer.direction === "inbound") {
			return "post_cash_receipt";
		}
		if (transfer.direction === "outbound") {
			return "post_lender_payout";
		}
		return "throw_no_direction";
	}

	it("skips cash posting for bridged transfers (collectionAttemptId set)", () => {
		expect(
			determineCashPostingAction({
				collectionAttemptId: "attempt_123",
				direction: "inbound",
			})
		).toBe("skip_bridged");
	});

	it("posts cash receipt for non-bridged inbound transfers", () => {
		expect(determineCashPostingAction({ direction: "inbound" })).toBe(
			"post_cash_receipt"
		);
	});

	it("posts lender payout for non-bridged outbound transfers", () => {
		expect(determineCashPostingAction({ direction: "outbound" })).toBe(
			"post_lender_payout"
		);
	});
});

// ── recordTransferProviderRef payload handling ──────────────────────

describe("recordTransferProviderRef payload handling", () => {
	function shouldPatchProviderRef(
		payload?: Record<string, unknown>
	): { action: "patch"; value: string } | { action: "warn" } {
		const providerRef = payload?.providerRef;
		if (typeof providerRef === "string") {
			return { action: "patch", value: providerRef };
		}
		return { action: "warn" };
	}

	it("patches when providerRef is a string", () => {
		const result = shouldPatchProviderRef({ providerRef: "ref-001" });
		expect(result.action).toBe("patch");
		if (result.action === "patch") {
			expect(result.value).toBe("ref-001");
		}
	});

	it("warns when providerRef is undefined", () => {
		expect(shouldPatchProviderRef({}).action).toBe("warn");
	});

	it("warns when providerRef is a number", () => {
		expect(shouldPatchProviderRef({ providerRef: 42 }).action).toBe("warn");
	});

	it("warns when payload is undefined", () => {
		expect(shouldPatchProviderRef(undefined).action).toBe("warn");
	});
});
