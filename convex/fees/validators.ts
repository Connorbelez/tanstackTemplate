import { v } from "convex/values";

export const feeCodeValidator = v.union(
	v.literal("servicing"),
	v.literal("late_fee"),
	v.literal("nsf")
);

export const feeSurfaceValidator = v.union(
	v.literal("waterfall_deduction"),
	v.literal("borrower_charge")
);

export const feeRevenueDestinationValidator = v.union(
	v.literal("platform_revenue"),
	v.literal("investor_distribution"),
	v.literal("outside_dispersal")
);

export const feeCalculationTypeValidator = v.union(
	v.literal("annual_rate_principal"),
	v.literal("fixed_amount_cents")
);

export const feeStatusValidator = v.union(
	v.literal("active"),
	v.literal("inactive")
);

export const feeCalculationParametersValidator = v.object({
	annualRate: v.optional(v.number()),
	fixedAmountCents: v.optional(v.number()),
	dueDays: v.optional(v.number()),
	graceDays: v.optional(v.number()),
});
