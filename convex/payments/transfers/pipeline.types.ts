/**
 * Pipeline types — multi-leg transfer orchestration for deal closing.
 *
 * Pipeline status is derived from transfer leg statuses, not stored separately.
 * This avoids a separate `pipelines` table and two-phase write concerns.
 */

// ── Pipeline Leg Input ──────────────────────────────────────────────
/**
 * Minimal interface for pipeline status computation. Decoupled from the
 * Convex Doc type so the function is easily testable with plain objects.
 */
export interface PipelineLegInput {
	legNumber?: number;
	status: string;
}

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
	if (!Number.isInteger(metadata.leg2Amount) || metadata.leg2Amount <= 0) {
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

const TERMINAL_FAILURE_STATUSES = new Set(["failed", "cancelled", "reversed"]);

/**
 * Picks the representative transfer for a given leg number.
 *
 * When retries create duplicate records for the same (pipelineId, legNumber),
 * we prefer the non-terminal (active) transfer. If all copies are terminal,
 * we fall back to the first match.
 */
function pickActiveLeg(
	legs: PipelineLegInput[],
	legNum: number
): PipelineLegInput | undefined {
	const matching = legs.filter((l) => l.legNumber === legNum);
	if (matching.length === 0) {
		return undefined;
	}
	if (matching.length === 1) {
		return matching[0];
	}
	// Prefer a non-terminal (active) transfer over failed/cancelled/reversed
	return (
		matching.find((l) => !TERMINAL_FAILURE_STATUSES.has(l.status)) ??
		matching[0]
	);
}


/**
 * Derives pipeline status from the statuses of its constituent legs.
 *
 * Rules:
 * - All legs confirmed → completed
 * - Leg 1 confirmed, Leg 2 failed → partial_failure
 * - Any leg failed (no other leg confirmed) → failed
 * - Leg 1 confirmed, Leg 2 not yet terminal → leg1_confirmed
 * - Otherwise → pending
 *
 * When retries exist (duplicate leg numbers), prefers active over terminal transfers.
 */

export function computePipelineStatus(
	legs: PipelineLegInput[]
): PipelineStatus {
	const leg1 = pickActiveLeg(legs, 1);
	const leg2 = pickActiveLeg(legs, 2);

	// No legs at all — data anomaly. Log a warning so callers can investigate.
	if (!leg1) {
		if (legs.length > 0) {
			console.warn(
				`[computePipelineStatus] ${legs.length} legs found but none with legNumber=1. ` +
					"This may indicate data corruption."
			);
		}
		return "pending";
	}

	const leg1Confirmed = leg1.status === "confirmed";
	const leg1Failed = TERMINAL_FAILURE_STATUSES.has(leg1.status);

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
	const leg2Failed = TERMINAL_FAILURE_STATUSES.has(leg2.status);

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
