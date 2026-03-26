import { type Infer, v } from "convex/values";

// ── Payout frequency (ENG-182) ──────────────────────────────────
// monthly: every 28 days | bi_weekly: every 14 days
// weekly: every 7 days | on_demand: manual trigger only
export const payoutFrequencyValidator = v.union(
	v.literal("monthly"),
	v.literal("bi_weekly"),
	v.literal("weekly"),
	v.literal("on_demand")
);

/** Derived from payoutFrequencyValidator — single source of truth. */
export type PayoutFrequency = Infer<typeof payoutFrequencyValidator>;
