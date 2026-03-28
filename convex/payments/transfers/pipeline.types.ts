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
	if (hasLeg && (!Number.isInteger(legNumber) || legNumber <= 0)) {
		return `legNumber must be a positive integer. Got legNumber=${legNumber}`;
	}
	return null;
}

// ── Status Progression ──────────────────────────────────────────────
/**
 * Defines a status progression ranking where higher numbers represent
 * more-progressed states.  When multiple transfers exist for the same
 * pipeline leg (e.g. after a retry), we pick the most-progressed
 * attempt so that a successful retry overrides a prior failed attempt.
 *
 * Terminal-success statuses ("confirmed") rank highest, followed by
 * active in-flight statuses, then terminal-failure statuses, then the
 * initial state.
 */
const STATUS_PROGRESSION: Record<string, number> = {
	initiated: 0,
	pending: 1,
	processing: 2,
	failed: 3,
	cancelled: 4,
	reversed: 5,
	confirmed: 6,
	// Legacy statuses
	approved: 2,
	completed: 6,
};

function statusProgression(status: string): number {
	return STATUS_PROGRESSION[status] ?? -1;
}

// ── Leg Normalization ───────────────────────────────────────────────
/**
 * Reduces a list of pipeline legs to one effective attempt per leg
 * number by picking the most-progressed transfer for each leg.
 *
 * After retries, multiple transfers share the same pipelineId and
 * legNumber. Using `.find()` (first-match) would return a stale failed
 * attempt if it appeared before the retry row.  This helper sorts by
 * status progression descending so the most-progressed attempt wins.
 */
export function normalizePipelineLegs<
	T extends Pick<Doc<"transferRequests">, "legNumber" | "status">,
>(legs: T[]): Map<number, T> {
	const bestByLeg = new Map<number, T>();

	for (const leg of legs) {
		if (leg.legNumber == null) continue;

		const existing = bestByLeg.get(leg.legNumber);
		if (
			!existing ||
			statusProgression(leg.status) > statusProgression(existing.status)
		) {
			bestByLeg.set(leg.legNumber, leg);
		}
	}

	return bestByLeg;
}

// ── Pipeline Status Computation ─────────────────────────────────────

/**
 * Derives pipeline status from the statuses of its constituent legs.
 *
 * When multiple transfers exist per leg (after retries), normalizes to
 * the most-progressed attempt per leg before deriving status.
 *
 * Rules:
 * - All legs confirmed → completed
 * - Leg 1 confirmed, Leg 2 failed → partial_failure
 * - Any leg failed (no other leg confirmed) → failed
 * - Leg 1 confirmed, Leg 2 not yet terminal → leg1_confirmed
 * - Otherwise → pending
 */
export function computePipelineStatus(
	legs: Pick<Doc<"transferRequests">, "legNumber" | "status">[]
): PipelineStatus {
	const normalized = normalizePipelineLegs(legs);
	const leg1 = normalized.get(1);
	const leg2 = normalized.get(2);

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
