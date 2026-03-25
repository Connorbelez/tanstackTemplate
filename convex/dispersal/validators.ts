import { v } from "convex/values";
import { feeCodeValidator } from "../fees/validators";

// ── Dispersal entry status ──────────────────────────────────────
// Phase 1: always "pending". Phase 2 will add "disbursed" | "failed".
export const dispersalStatusValidator = v.literal("pending");

// ── Calculation audit trail ─────────────────────────────────────
// Every input to the pro-rata computation is preserved for
// independent verification (SPEC §5.3).
export const calculationDetailsValidator = v.object({
	settledAmount: v.number(),
	servicingFee: v.number(),
	feeDue: v.optional(v.number()),
	feeCashApplied: v.optional(v.number()),
	feeReceivable: v.optional(v.number()),
	policyVersion: v.optional(v.number()),
	sourceObligationType: v.optional(v.string()),
	mortgageFeeId: v.optional(v.id("mortgageFees")),
	feeCode: v.optional(feeCodeValidator),
	distributableAmount: v.number(),
	ownershipUnits: v.number(),
	totalUnits: v.number(),
	ownershipFraction: v.number(),
	rawAmount: v.number(),
	roundedAmount: v.number(),
});
