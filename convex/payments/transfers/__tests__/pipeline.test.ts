/**
 * Pipeline tests — multi-leg deal closing transfer pipeline.
 *
 * Tests computePipelineStatus (pure function) and validates pipeline
 * idempotency key generation and type structures.
 */

import { describe, expect, it } from "vitest";
import { buildPipelineIdempotencyKey } from "../pipeline";
import type { PipelineStatus } from "../pipeline.types";
import {
	computePipelineStatus,
	extractLeg1Metadata,
	validatePipelineFields,
} from "../pipeline.types";

// ── computePipelineStatus ─────────────────────────────────────────────

describe("computePipelineStatus", () => {
	it("returns 'pending' when no legs exist", () => {
		expect(computePipelineStatus([])).toBe("pending");
	});

	it("returns 'pending' when Leg 1 is initiated", () => {
		const legs = [{ legNumber: 1, status: "initiated" }] as const;
		expect(computePipelineStatus(legs)).toBe("pending");
	});

	it("returns 'pending' when Leg 1 is pending", () => {
		const legs = [{ legNumber: 1, status: "pending" }] as const;
		expect(computePipelineStatus(legs)).toBe("pending");
	});

	it("returns 'pending' when Leg 1 is processing", () => {
		const legs = [{ legNumber: 1, status: "processing" }] as const;
		expect(computePipelineStatus(legs)).toBe("pending");
	});

	it("returns 'failed' when Leg 1 fails", () => {
		const legs = [{ legNumber: 1, status: "failed" }] as const;
		expect(computePipelineStatus(legs)).toBe("failed");
	});

	it("returns 'failed' when Leg 1 is cancelled", () => {
		const legs = [{ legNumber: 1, status: "cancelled" }] as const;
		expect(computePipelineStatus(legs)).toBe("failed");
	});

	it("returns 'failed' when Leg 1 is reversed", () => {
		const legs = [{ legNumber: 1, status: "reversed" }] as const;
		expect(computePipelineStatus(legs)).toBe("failed");
	});

	it("returns 'leg1_confirmed' when Leg 1 confirmed but no Leg 2 yet", () => {
		const legs = [{ legNumber: 1, status: "confirmed" }] as const;
		expect(computePipelineStatus(legs)).toBe("leg1_confirmed");
	});

	it("returns 'leg1_confirmed' when Leg 1 confirmed and Leg 2 is initiated", () => {
		const legs = [
			{ legNumber: 1, status: "confirmed" },
			{ legNumber: 2, status: "initiated" },
		] as const;
		expect(computePipelineStatus(legs)).toBe("leg1_confirmed");
	});

	it("returns 'leg1_confirmed' when Leg 1 confirmed and Leg 2 is pending", () => {
		const legs = [
			{ legNumber: 1, status: "confirmed" },
			{ legNumber: 2, status: "pending" },
		] as const;
		expect(computePipelineStatus(legs)).toBe("leg1_confirmed");
	});

	it("returns 'leg1_confirmed' when Leg 1 confirmed and Leg 2 is processing", () => {
		const legs = [
			{ legNumber: 1, status: "confirmed" },
			{ legNumber: 2, status: "processing" },
		] as const;
		expect(computePipelineStatus(legs)).toBe("leg1_confirmed");
	});

	it("returns 'completed' when both legs confirmed", () => {
		const legs = [
			{ legNumber: 1, status: "confirmed" },
			{ legNumber: 2, status: "confirmed" },
		] as const;
		expect(computePipelineStatus(legs)).toBe("completed");
	});

	it("returns 'partial_failure' when Leg 1 confirmed but Leg 2 failed", () => {
		const legs = [
			{ legNumber: 1, status: "confirmed" },
			{ legNumber: 2, status: "failed" },
		] as const;
		expect(computePipelineStatus(legs)).toBe("partial_failure");
	});

	it("returns 'partial_failure' when Leg 1 confirmed but Leg 2 cancelled", () => {
		const legs = [
			{ legNumber: 1, status: "confirmed" },
			{ legNumber: 2, status: "cancelled" },
		] as const;
		expect(computePipelineStatus(legs)).toBe("partial_failure");
	});

	it("returns 'partial_failure' when Leg 1 confirmed but Leg 2 reversed", () => {
		const legs = [
			{ legNumber: 1, status: "confirmed" },
			{ legNumber: 2, status: "reversed" },
		] as const;
		expect(computePipelineStatus(legs)).toBe("partial_failure");
	});

	// ── Invariant: Leg 2 NEVER initiates unless Leg 1 is confirmed ──
	it("Leg 2 presence with Leg 1 failed is treated as pipeline failed", () => {
		// This scenario should never happen in production, but if it does
		// (e.g., data corruption), the pipeline should report failure
		const legs = [
			{ legNumber: 1, status: "failed" },
			{ legNumber: 2, status: "initiated" },
		] as const;
		expect(computePipelineStatus(legs)).toBe("failed");
	});

	// ── Edge: legs in any order ─────────────────────────────────────
	it("handles legs in reversed order", () => {
		const legs = [
			{ legNumber: 2, status: "confirmed" },
			{ legNumber: 1, status: "confirmed" },
		] as const;
		expect(computePipelineStatus(legs)).toBe("completed");
	});
});

// ── Pipeline status type exhaustiveness ──────────────────────────────

describe("PipelineStatus type", () => {
	it("all statuses are covered by computePipelineStatus", () => {
		// This test documents all valid pipeline statuses
		const allStatuses: PipelineStatus[] = [
			"pending",
			"leg1_confirmed",
			"completed",
			"failed",
			"partial_failure",
		];

		// Each status must be reachable
		const reachedStatuses = new Set<PipelineStatus>();

		// pending: no legs
		reachedStatuses.add(computePipelineStatus([]));

		// failed: Leg 1 failed
		reachedStatuses.add(
			computePipelineStatus([{ legNumber: 1, status: "failed" }])
		);

		// leg1_confirmed: Leg 1 confirmed, no Leg 2
		reachedStatuses.add(
			computePipelineStatus([{ legNumber: 1, status: "confirmed" }])
		);

		// completed: both confirmed
		reachedStatuses.add(
			computePipelineStatus([
				{ legNumber: 1, status: "confirmed" },
				{ legNumber: 2, status: "confirmed" },
			])
		);

		// partial_failure: Leg 1 confirmed, Leg 2 failed
		reachedStatuses.add(
			computePipelineStatus([
				{ legNumber: 1, status: "confirmed" },
				{ legNumber: 2, status: "failed" },
			])
		);

		for (const status of allStatuses) {
			expect(reachedStatuses, `Status "${status}" is unreachable`).toContain(
				status
			);
		}
	});
});

// ── Edge: duplicate leg numbers (retry scenarios) ──────────────────

describe("computePipelineStatus with duplicate legs (retries)", () => {
	it("prefers active leg over terminal after retry (cancelled + pending)", () => {
		// Retry scenario: cancelled original + pending retry for Leg 1
		const legs = [
			{ legNumber: 1, status: "cancelled" },
			{ legNumber: 1, status: "pending" },
			{ legNumber: 2, status: "confirmed" },
		];
		// Active Leg 1 ("pending") is preferred over cancelled
		expect(computePipelineStatus(legs)).toBe("pending");
	});

	it("prefers active leg over failed when retry exists (failed + initiated)", () => {
		// Retry scenario: original Leg 1 failed, retry Leg 1 is initiated
		const legs = [
			{ legNumber: 1, status: "failed" },
			{ legNumber: 1, status: "initiated" },
		];
		// Active Leg 1 ("initiated") is preferred over failed → pending
		expect(computePipelineStatus(legs)).toBe("pending");
	});

	it("prefers confirmed retry over failed original", () => {
		const legs = [
			{ legNumber: 1, status: "failed" },
			{ legNumber: 1, status: "confirmed" },
			{ legNumber: 2, status: "confirmed" },
		];
		// Active Leg 1 ("confirmed") is preferred over failed
		expect(computePipelineStatus(legs)).toBe("completed");
	});

	it("falls back to first terminal if all are terminal", () => {
		const legs = [
			{ legNumber: 1, status: "cancelled" },
			{ legNumber: 1, status: "failed" },
		];
		// No active records — both are terminal failures → failed
		expect(computePipelineStatus(legs)).toBe("failed");
	});

	it("prefers active Leg 2 over failed Leg 2 when retry exists", () => {
		const legs = [
			{ legNumber: 1, status: "confirmed" },
			{ legNumber: 2, status: "failed" },
			{ legNumber: 2, status: "initiated" },
		];
		// Leg 2 retry is in progress → leg1_confirmed
		expect(computePipelineStatus(legs)).toBe("leg1_confirmed");
	});

	it("falls back to first when all copies are terminal", () => {
		const legs = [
			{ legNumber: 1, status: "confirmed" },
			{ legNumber: 2, status: "failed" },
			{ legNumber: 2, status: "cancelled" },
		];
		// All Leg 2 copies terminal, first is "failed" → partial_failure
		expect(computePipelineStatus(legs)).toBe("partial_failure");
	});
});

// ── buildPipelineIdempotencyKey ─────────────────────────────────────

describe("buildPipelineIdempotencyKey", () => {
	it("produces deterministic keys for Leg 1", () => {
		const key = buildPipelineIdempotencyKey("deal-closing:deals:abc", 1);
		expect(key).toBe("pipeline:deal-closing:deals:abc:leg1");
	});

	it("produces deterministic keys for Leg 2", () => {
		const key = buildPipelineIdempotencyKey("deal-closing:deals:abc", 2);
		expect(key).toBe("pipeline:deal-closing:deals:abc:leg2");
	});

	it("produces distinct keys for different legs", () => {
		const key1 = buildPipelineIdempotencyKey("pipeline-1", 1);
		const key2 = buildPipelineIdempotencyKey("pipeline-1", 2);
		expect(key1).not.toBe(key2);
	});

	it("produces distinct keys for different pipelines", () => {
		const keyA = buildPipelineIdempotencyKey("pipeline-A", 1);
		const keyB = buildPipelineIdempotencyKey("pipeline-B", 1);
		expect(keyA).not.toBe(keyB);
	});
});

// ── extractLeg1Metadata ─────────────────────────────────────────────

describe("extractLeg1Metadata", () => {
	it("returns metadata for valid DealClosingLeg1Metadata shape (without lenderId)", () => {
		const result = extractLeg1Metadata({
			pipelineType: "deal_closing",
			sellerId: "seller-123",
			leg2Amount: 50_000,
		});
		expect(result).toEqual({
			pipelineType: "deal_closing",
			sellerId: "seller-123",
			leg2Amount: 50_000,
			lenderId: undefined,
		});
	});

	it("returns metadata with lenderId when present", () => {
		const result = extractLeg1Metadata({
			pipelineType: "deal_closing",
			sellerId: "seller-123",
			leg2Amount: 50_000,
			lenderId: "lender_abc123",
		});
		expect(result).toEqual({
			pipelineType: "deal_closing",
			sellerId: "seller-123",
			leg2Amount: 50_000,
			lenderId: "lender_abc123",
		});
	});

	it("accepts undefined lenderId", () => {
		const result = extractLeg1Metadata({
			pipelineType: "deal_closing",
			sellerId: "seller-123",
			leg2Amount: 50_000,
			lenderId: undefined,
		});
		expect(result).not.toBeNull();
		expect(result?.lenderId).toBeUndefined();
	});

	it("returns null for non-string lenderId", () => {
		expect(
			extractLeg1Metadata({
				pipelineType: "deal_closing",
				sellerId: "seller-123",
				leg2Amount: 50_000,
				lenderId: 12_345,
			})
		).toBeNull();
	});

	it("returns null for undefined metadata", () => {
		expect(extractLeg1Metadata(undefined)).toBeNull();
	});

	it("returns null for wrong pipelineType", () => {
		expect(
			extractLeg1Metadata({
				pipelineType: "investor_return",
				sellerId: "seller-123",
				leg2Amount: 50_000,
			})
		).toBeNull();
	});

	it("returns null for missing sellerId", () => {
		expect(
			extractLeg1Metadata({
				pipelineType: "deal_closing",
				leg2Amount: 50_000,
			})
		).toBeNull();
	});

	it("returns null for non-string sellerId", () => {
		expect(
			extractLeg1Metadata({
				pipelineType: "deal_closing",
				sellerId: 123,
				leg2Amount: 50_000,
			})
		).toBeNull();
	});

	it("returns null for missing leg2Amount", () => {
		expect(
			extractLeg1Metadata({
				pipelineType: "deal_closing",
				sellerId: "seller-123",
			})
		).toBeNull();
	});

	it("returns null for non-number leg2Amount", () => {
		expect(
			extractLeg1Metadata({
				pipelineType: "deal_closing",
				sellerId: "seller-123",
				leg2Amount: "50000",
			})
		).toBeNull();
	});

	it("returns null for zero leg2Amount", () => {
		expect(
			extractLeg1Metadata({
				pipelineType: "deal_closing",
				sellerId: "seller-123",
				leg2Amount: 0,
			})
		).toBeNull();
	});

	it("returns null for negative leg2Amount", () => {
		expect(
			extractLeg1Metadata({
				pipelineType: "deal_closing",
				sellerId: "seller-123",
				leg2Amount: -100,
			})
		).toBeNull();
	});

	it("returns null for non-integer leg2Amount", () => {
		expect(
			extractLeg1Metadata({
				pipelineType: "deal_closing",
				sellerId: "seller-123",
				leg2Amount: 50.5,
			})
		).toBeNull();
	});
});

// ── validatePipelineFields ──────────────────────────────────────────

describe("validatePipelineFields", () => {
	it("returns null when both fields are present", () => {
		expect(validatePipelineFields("pipeline-123", 1)).toBeNull();
	});

	it("returns null when both fields are absent", () => {
		expect(validatePipelineFields(undefined, undefined)).toBeNull();
	});

	it("returns error when pipelineId is set but legNumber is not", () => {
		const result = validatePipelineFields("pipeline-123", undefined);
		expect(result).toContain("pipelineId and legNumber must both be set");
	});

	it("returns error when legNumber is set but pipelineId is not", () => {
		const result = validatePipelineFields(undefined, 1);
		expect(result).toContain("pipelineId and legNumber must both be set");
	});
});
