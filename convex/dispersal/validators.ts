import { v } from "convex/values";

// ── Dispersal entry status ──────────────────────────────────────
// Phase 1: always "pending". Phase 2 will add "disbursed" | "failed".
export const dispersalStatusValidator = v.literal("pending");

// ── Calculation audit trail ─────────────────────────────────────
// Every input to the pro-rata computation is preserved for
// independent verification (SPEC §5.3).
export const calculationDetailsValidator = v.object({
	settledAmount: v.number(),
	servicingFee: v.number(),
	distributableAmount: v.number(),
	ownershipUnits: v.number(),
	totalUnits: v.number(),
	ownershipFraction: v.number(),
	rawAmount: v.number(),
	roundedAmount: v.number(),
});
