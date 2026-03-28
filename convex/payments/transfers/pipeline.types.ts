/**
 * Pipeline types — multi-leg transfer orchestration for deal closing.
 *
 * Pipeline status is derived from transfer leg statuses, not stored separately.
 * This avoids a separate `pipelines` table and two-phase write concerns.
 */

import type { Doc } from "../../_generated/dataModel";

// ── Pipeline Status ──────────────────────────────────────────────────
export type PipelineStatus =
	| "pending" // Leg 1 created, not yet confirmed
	| "leg1_confirmed" // Leg 1 confirmed, Leg 2 in progress
	| "completed" // All legs confirmed
	| "failed" // Any leg failed (check individual legs)
	| "partial_failure"; // Leg 1 confirmed but Leg 2 failed

// ── Leg 1 Metadata ──────────────────────────────────────────────────
/**
 * Typed metadata stored on Leg 1 that carries Leg 2 configuration.
 * Set during createDealClosingPipeline, extracted in handlePipelineLegConfirmed.
 *
 * This is the compile-time contract for the metadata blob. The schema uses
 * `v.record(v.string(), v.any())` (Convex limitation), but TypeScript
 * enforces the shape at creation and extraction points.
 */
export interface DealClosingLeg1Metadata {
	leg2Amount: number;
	pipelineType: "deal_closing";
	sellerId: string;
}

/**
 * Extracts and validates Leg 1 metadata, returning null if the shape is invalid.
 * Used by handlePipelineLegConfirmed to safely read Leg 2 configuration.
 */
export function extractLeg1Metadata(
	metadata: Record<string, unknown> | undefined
): DealClosingLeg1Metadata | null {
	if (!metadata) {
		return null;
	}
	if (metadata.pipelineType !== "deal_closing") {
		return null;
	}
	if (typeof metadata.sellerId !== "string") {
		return null;
	}
	if (typeof metadata.leg2Amount !== "number") {
		return null;
	}
	return {
		pipelineType: "deal_closing",
		sellerId: metadata.sellerId,
		leg2Amount: metadata.leg2Amount,
	};
}

// ── Pipeline Field Validation ───────────────────────────────────────
/**
 * Validates that pipelineId and legNumber are co-required:
 * either both present or both absent. Returns an error message or null.
 */
export function validatePipelineFields(
	pipelineId: string | undefined,
	legNumber: number | undefined
): string | null {
	const hasPipeline = pipelineId != null;
	const hasLeg = legNumber != null;
	if (hasPipeline !== hasLeg) {
		return `pipelineId and legNumber must both be set or both be absent. Got pipelineId=${pipelineId}, legNumber=${legNumber}`;
	}
	return null;
}

// ── Pipeline Status Computation ─────────────────────────────────────

/**
 * Derives pipeline status from the statuses of its constituent legs.
 *
 * Rules:
 * - All legs confirmed → completed
 * - Leg 1 confirmed, Leg 2 failed → partial_failure
 * - Any leg failed (no other leg confirmed) → failed
 * - Leg 1 confirmed, Leg 2 not yet terminal → leg1_confirmed
 * - Otherwise → pending
 */

const TERMINAL_STATUSES = new Set(["failed", "cancelled", "reversed"]);

/**
 * Finds the preferred leg record for a given leg number.
 * After a retry, there may be multiple records (e.g., cancelled original + pending retry).
 * Prefers active (non-terminal) records; falls back to the last terminal record.
 */
function findPreferredLeg(
	legs: Pick<Doc<"transferRequests">, "legNumber" | "status">[],
	legNumber: number
): Pick<Doc<"transferRequests">, "legNumber" | "status"> | undefined {
	const matching = legs.filter((l) => l.legNumber === legNumber);
	if (matching.length === 0) {
		return undefined;
	}
	if (matching.length === 1) {
		return matching[0];
	}
	// Prefer any active (non-terminal) record over terminal ones
	const active = matching.find((l) => !TERMINAL_STATUSES.has(l.status));
	return active ?? matching.at(-1);
}

export function computePipelineStatus(
	legs: Pick<Doc<"transferRequests">, "legNumber" | "status">[]
): PipelineStatus {
	// After a retry, there may be multiple records per leg number (e.g., the
	// cancelled original + the re-initiated retry). Prefer the active (non-terminal)
	// record for each leg; fall back to the last terminal record if none is active.
	const leg1 = findPreferredLeg(legs, 1);
	const leg2 = findPreferredLeg(legs, 2);

	// No legs at all — shouldn't happen, but be safe
	if (!leg1) {
		return "pending";
	}

	const leg1Confirmed = leg1.status === "confirmed";
	const leg1Failed =
		leg1.status === "failed" ||
		leg1.status === "cancelled" ||
		leg1.status === "reversed";

	// Leg 1 failed — pipeline failed, no Leg 2 should exist
	if (leg1Failed) {
		return "failed";
	}

	// Leg 1 not yet confirmed — still pending
	if (!leg1Confirmed) {
		return "pending";
	}

	// Leg 1 confirmed, no Leg 2 yet — transitional state
	if (!leg2) {
		return "leg1_confirmed";
	}

	const leg2Confirmed = leg2.status === "confirmed";
	const leg2Failed =
		leg2.status === "failed" ||
		leg2.status === "cancelled" ||
		leg2.status === "reversed";

	// Both confirmed — pipeline complete
	if (leg2Confirmed) {
		return "completed";
	}

	// Leg 1 confirmed but Leg 2 failed — partial failure (funds in trust)
	if (leg2Failed) {
		return "partial_failure";
	}

	// Leg 1 confirmed, Leg 2 in progress
	return "leg1_confirmed";
}
