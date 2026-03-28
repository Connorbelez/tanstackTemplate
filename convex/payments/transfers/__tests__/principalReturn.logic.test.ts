/**
 * Pure unit tests for investor principal return logic functions.
 *
 * Covers computeProrationAdjustedAmount and buildPrincipalReturnIdempotencyKey
 * from principalReturn.logic.ts — no Convex runtime required.
 */

import { describe, expect, it } from "vitest";
import {
	buildPrincipalReturnIdempotencyKey,
	computeProrationAdjustedAmount,
} from "../principalReturn.logic";

// ── Top-level regex constants (biome/useTopLevelRegex) ──────────────
const PRINCIPAL_RETURN_KEY_RE = /^principal-return:.+:.+$/;
const INVALID_PRORATED_AMOUNT_RE = /Invalid prorated amount/;
const INVALID_PRINCIPAL_RE = /principalAmount must be a positive integer/;
const INVALID_ADJUSTMENT_RE = /prorationAdjustment must be an integer/;
const PRINCIPAL_AND_ADJUSTMENT_RE = /principal: 100000, adjustment: -200000/;

// ── computeProrationAdjustedAmount ──────────────────────────────────

describe("computeProrationAdjustedAmount", () => {
	it("applies a negative adjustment (seller owes buyer)", () => {
		expect(computeProrationAdjustedAmount(100_000, -500)).toBe(99_500);
	});

	it("applies a positive adjustment (buyer owes seller)", () => {
		expect(computeProrationAdjustedAmount(100_000, 2500)).toBe(102_500);
	});

	it("returns the principal unchanged with zero adjustment", () => {
		expect(computeProrationAdjustedAmount(100_000, 0)).toBe(100_000);
	});

	it("throws when adjusted amount is zero (non-positive)", () => {
		expect(() => computeProrationAdjustedAmount(100_000, -100_000)).toThrow(
			INVALID_PRORATED_AMOUNT_RE
		);
	});

	it("throws when adjusted amount is negative", () => {
		expect(() => computeProrationAdjustedAmount(100_000, -200_000)).toThrow(
			INVALID_PRORATED_AMOUNT_RE
		);
	});

	it("throws when prorationAdjustment is not an integer", () => {
		expect(() => computeProrationAdjustedAmount(100_000, 0.5)).toThrow(
			INVALID_ADJUSTMENT_RE
		);
	});

	it("throws when principalAmount is not a positive integer", () => {
		expect(() => computeProrationAdjustedAmount(0, 100)).toThrow(
			INVALID_PRINCIPAL_RE
		);
		expect(() => computeProrationAdjustedAmount(-100, 200)).toThrow(
			INVALID_PRINCIPAL_RE
		);
		expect(() => computeProrationAdjustedAmount(100.5, 0)).toThrow(
			INVALID_PRINCIPAL_RE
		);
	});

	it("rejects non-integer inputs even when the sum would be a valid integer", () => {
		// 100_000.5 + (-0.5) = 100_000 — passes postcondition but violates input invariant
		expect(() => computeProrationAdjustedAmount(100_000.5, -0.5)).toThrow(
			INVALID_PRINCIPAL_RE
		);
	});

	it("includes both principal and adjustment in the error message", () => {
		expect(() => computeProrationAdjustedAmount(100_000, -200_000)).toThrow(
			PRINCIPAL_AND_ADJUSTMENT_RE
		);
	});

	it("accepts the smallest valid result (1 cent)", () => {
		expect(computeProrationAdjustedAmount(1, 0)).toBe(1);
	});

	it("handles large amounts without precision loss", () => {
		// 10 million dollars in cents
		expect(computeProrationAdjustedAmount(1_000_000_000, -1)).toBe(999_999_999);
	});
});

// ── buildPrincipalReturnIdempotencyKey ──────────────────────────────

describe("buildPrincipalReturnIdempotencyKey", () => {
	it("is deterministic for the same inputs", () => {
		const key1 = buildPrincipalReturnIdempotencyKey("deal_abc", "seller_xyz");
		const key2 = buildPrincipalReturnIdempotencyKey("deal_abc", "seller_xyz");
		expect(key1).toBe(key2);
	});

	it("produces different keys for different dealIds", () => {
		const key1 = buildPrincipalReturnIdempotencyKey("deal_abc", "seller_xyz");
		const key2 = buildPrincipalReturnIdempotencyKey("deal_def", "seller_xyz");
		expect(key1).not.toBe(key2);
	});

	it("produces different keys for different sellerIds", () => {
		const key1 = buildPrincipalReturnIdempotencyKey("deal_abc", "seller_xyz");
		const key2 = buildPrincipalReturnIdempotencyKey("deal_abc", "seller_uvw");
		expect(key1).not.toBe(key2);
	});

	it("follows the principal-return:{dealId}:{sellerId} format", () => {
		const key = buildPrincipalReturnIdempotencyKey("deal_abc", "seller_xyz");
		expect(key).toBe("principal-return:deal_abc:seller_xyz");
	});

	it("matches the expected regex pattern", () => {
		const key = buildPrincipalReturnIdempotencyKey("deal_abc", "seller_xyz");
		expect(key).toMatch(PRINCIPAL_RETURN_KEY_RE);
	});

	it("embeds both identifiers for auditability", () => {
		const key = buildPrincipalReturnIdempotencyKey("deal_123", "seller_456");
		expect(key).toContain("deal_123");
		expect(key).toContain("seller_456");
	});
});
