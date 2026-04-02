import { v } from "convex/values";

export const listingStatusValidator = v.union(
	v.literal("draft"),
	v.literal("published"),
	v.literal("delisted")
);

export const listingDelistReasonValidator = v.union(
	v.literal("fully_sold"),
	v.literal("mortgage_discharged"),
	v.literal("admin_decision")
);

export const listingDataSourceValidator = v.union(
	v.literal("mortgage_pipeline"),
	v.literal("demo")
);

export const listingRateTypeValidator = v.union(
	v.literal("fixed"),
	v.literal("variable")
);

export const listingPaymentFrequencyValidator = v.union(
	v.literal("monthly"),
	v.literal("bi_weekly"),
	v.literal("accelerated_bi_weekly"),
	v.literal("weekly")
);

export const listingLoanTypeValidator = v.union(
	v.literal("conventional"),
	v.literal("insured"),
	v.literal("high_ratio")
);

export const listingPropertyTypeValidator = v.union(
	v.literal("residential"),
	v.literal("commercial"),
	v.literal("multi_unit"),
	v.literal("condo")
);

export const listingHeroImageValidator = v.object({
	storageId: v.id("_storage"),
	caption: v.optional(v.string()),
});

export const listingMarketplaceUpdateFields = {
	title: v.optional(v.string()),
	description: v.optional(v.string()),
	marketplaceCopy: v.optional(v.string()),
	heroImages: v.optional(v.array(listingHeroImageValidator)),
	featured: v.optional(v.boolean()),
	displayOrder: v.optional(v.number()),
	adminNotes: v.optional(v.string()),
	publicDocumentIds: v.optional(v.array(v.id("_storage"))),
	seoSlug: v.optional(v.string()),
};

export const listingDenormalizedUpdateFields = {
	principal: v.optional(v.number()),
	interestRate: v.optional(v.number()),
	ltvRatio: v.optional(v.number()),
	termMonths: v.optional(v.number()),
	maturityDate: v.optional(v.string()),
	monthlyPayment: v.optional(v.number()),
	rateType: v.optional(listingRateTypeValidator),
	paymentFrequency: v.optional(listingPaymentFrequencyValidator),
	loanType: v.optional(listingLoanTypeValidator),
	lienPosition: v.optional(v.number()),
	propertyType: v.optional(listingPropertyTypeValidator),
	city: v.optional(v.string()),
	province: v.optional(v.string()),
	approximateLatitude: v.optional(v.number()),
	approximateLongitude: v.optional(v.number()),
	latestAppraisalValueAsIs: v.optional(v.number()),
	latestAppraisalDate: v.optional(v.string()),
	borrowerSignal: v.optional(v.any()),
	paymentHistory: v.optional(v.any()),
};

export const listingUpdateInputValidator = v.object({
	...listingMarketplaceUpdateFields,
	...listingDenormalizedUpdateFields,
});
