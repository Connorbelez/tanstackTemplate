import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
	aggregatePresetValidator,
	aggregationEligibilityValidator,
	capabilityValidator,
	cardinalityValidator,
	computedFieldMetadataValidator,
	editabilityMetadataValidator,
	entityKindValidator,
	fieldRendererHintValidator,
	fieldTypeValidator,
	filterOperatorValidator,
	layoutEligibilityValidator,
	logicalOperatorValidator,
	normalizedFieldKindValidator,
	relationMetadataValidator,
	savedViewFilterValidator,
	selectOptionValidator,
	viewLayoutMessagesValidator,
	viewTypeValidator,
} from "./crm/validators";
import {
	calculationDetailsValidator,
	dispersalStatusValidator,
} from "./dispersal/validators";
import {
	draftStateValidator,
	entityFieldValidator,
	entitySourceValidator,
	formatOptionsValidator,
	pageDimensionValidator,
	signatoryConfigValidator,
	variableTypeValidator,
} from "./documentEngine/validators";
import {
	actorTypeValidator,
	channelValidator,
	entityTypeValidator,
	sourceValidator,
} from "./engine/validators";
import {
	feeCalculationParametersValidator,
	feeCalculationTypeValidator,
	feeCodeValidator,
	feeRevenueDestinationValidator,
	feeStatusValidator,
	feeSurfaceValidator,
} from "./fees/validators";
import {
	listingDataSourceValidator,
	listingDelistReasonValidator,
	listingHeroImageValidator,
	listingLoanTypeValidator,
	listingPaymentFrequencyValidator,
	listingPropertyTypeValidator,
	listingRateTypeValidator,
	listingStatusValidator,
} from "./listings/validators";
import {
	balancePreCheckDecisionValidator,
	balancePreCheckReasonCodeValidator,
	balancePreCheckSignalSourceValidator,
} from "./payments/collectionPlan/balancePreCheckContract";
import {
	collectionRuleConfigValidator,
	collectionRuleKindValidator,
	collectionRuleScopeValidator,
	collectionRuleStatusValidator,
} from "./payments/collectionPlan/ruleContract";
import {
	workoutPlanActorTypeValidator,
	workoutPlanStatusValidator,
	workoutPlanStrategyValidator,
} from "./payments/collectionPlan/workoutContract";
import { payoutFrequencyValidator } from "./payments/payout/validators";
import {
	collectionExecutionModeValidator,
	externalCollectionScheduleStatusValidator,
	externalOccurrenceChannelValidator,
} from "./payments/recurringSchedules/validators";
import {
	counterpartyTypeValidator,
	directionValidator,
	manualSettlementValidator,
	providerCodeValidator,
	transferTypeValidator,
} from "./payments/transfers/validators";
import { normalizedEventTypeValidator } from "./payments/webhooks/types";

export default defineSchema({
	// ══════════════════════════════════════════════════════════
	// AUTH & IDENTITY
	// ══════════════════════════════════════════════════════════

	users: defineTable({
		// ─── Auth (WorkOS synced) ───
		authId: v.string(),
		email: v.string(),
		firstName: v.string(),
		lastName: v.string(),

		// ─── Contact ───
		phoneNumber: v.optional(v.string()),
		address: v.optional(
			v.object({
				streetAddress: v.string(),
				unit: v.optional(v.string()),
				city: v.string(),
				province: v.string(),
				postalCode: v.string(),
			})
		),
		googlePlaceData: v.optional(v.any()),

		// ─── Identity ───
		dateOfBirth: v.optional(v.string()),
	}).index("authId", ["authId"]),

	organizations: defineTable({
		workosId: v.string(),
		name: v.string(),
		allowProfilesOutsideOrganization: v.boolean(),
		externalId: v.optional(v.string()),
		metadata: v.optional(v.record(v.string(), v.string())),
	}).index("workosId", ["workosId"]),

	organizationMemberships: defineTable({
		workosId: v.string(),
		organizationWorkosId: v.string(),
		organizationName: v.optional(v.string()),
		userWorkosId: v.string(),
		status: v.string(),
		roleSlug: v.string(),
		roleSlugs: v.optional(v.array(v.string())),
	})
		.index("workosId", ["workosId"])
		.index("byUser", ["userWorkosId"])
		.index("byOrganization", ["organizationWorkosId"]),

	roles: defineTable({
		slug: v.string(),
		permissions: v.array(v.string()),
	}).index("slug", ["slug"]),

	// ══════════════════════════════════════════════════════════
	// CORE ROLE PROFILES
	// ══════════════════════════════════════════════════════════

	brokers: defineTable({
		// ─── GT fields ───
		status: v.string(),
		lastTransitionAt: v.optional(v.number()),

		// ─── Auth link ───
		userId: v.id("users"),

		// ─── Domain: licensing & business ───
		licenseId: v.optional(v.string()),
		licenseProvince: v.optional(v.string()),
		brokerageName: v.optional(v.string()),
		/** WorkOS organization id for the broker's brokerage (canonical org scope). */
		orgId: v.optional(v.string()),

		// ─── Lifecycle ───
		onboardedAt: v.optional(v.number()),
		createdAt: v.number(),
	})
		.index("by_user", ["userId"])
		.index("by_license", ["licenseId"])
		.index("by_status", ["status"])
		.index("by_org", ["orgId"])
		.index("by_org_status", ["orgId", "status"]),

	borrowers: defineTable({
		// ─── GT fields ───
		status: v.string(),
		lastTransitionAt: v.optional(v.number()),

		/** WorkOS organization id — org scope for this borrower record. */
		orgId: v.optional(v.string()),

		// ─── Auth link ───
		userId: v.id("users"),

		// ─── Domain ───
		financialProfile: v.optional(v.any()),
		idvStatus: v.optional(v.string()),
		personaInquiryId: v.optional(v.string()),

		// ─── Lifecycle ───
		onboardedAt: v.optional(v.number()),
		createdAt: v.number(),
	})
		.index("by_user", ["userId"])
		.index("by_status", ["status"])
		.index("by_org", ["orgId"])
		.index("by_org_status", ["orgId", "status"]),

	lenders: defineTable({
		// ─── Auth link ───
		userId: v.id("users"),

		/** WorkOS organization id — denormalized from broker for indexing. */
		orgId: v.optional(v.string()),

		// ─── Broker relationship ───
		brokerId: v.id("brokers"),

		// ─── Compliance ───
		accreditationStatus: v.union(
			v.literal("pending"),
			v.literal("accredited"),
			v.literal("exempt"),
			v.literal("rejected")
		),
		idvStatus: v.optional(v.string()),
		kycStatus: v.optional(v.string()),
		personaInquiryId: v.optional(v.string()),

		// ─── Provenance ───
		onboardingEntryPath: v.string(),
		onboardingId: v.optional(v.id("onboardingRequests")),

		// ─── Lifecycle ───
		status: v.string(),
		activatedAt: v.optional(v.number()),
		createdAt: v.number(),

		// ─── Payout configuration (ENG-182) ───
		payoutFrequency: v.optional(payoutFrequencyValidator), // default: monthly (handled in code)
		lastPayoutDate: v.optional(v.string()), // YYYY-MM-DD: last payout execution date
		minimumPayoutCents: v.optional(v.number()), // per-lender override (default: global MINIMUM_PAYOUT_CENTS)
	})
		.index("by_user", ["userId"])
		.index("by_broker", ["brokerId"])
		.index("by_status", ["status"])
		.index("by_org", ["orgId"])
		.index("by_org_status", ["orgId", "status"]),

	// ══════════════════════════════════════════════════════════
	// LENDER ECOSYSTEM
	// ══════════════════════════════════════════════════════════

	lenderOnboardings: defineTable({
		// ─── GT fields ───
		status: v.string(),
		machineContext: v.optional(v.any()),
		lastTransitionAt: v.optional(v.number()),

		// ─── Entry path ───
		entryPath: v.string(),

		// ─── Resolved lender (set on approval) ───
		lenderId: v.optional(v.id("lenders")),
		brokerId: v.id("brokers"),

		// ─── Identity ───
		email: v.string(),
		inviteToken: v.optional(v.string()),
		adminInviteToken: v.optional(v.string()),
		invitedByAdminId: v.optional(v.string()),
		subdomain: v.optional(v.string()),

		// ─── Profile ───
		fullName: v.optional(v.string()),
		phone: v.optional(v.string()),
		address: v.optional(v.any()),
		accreditationStatus: v.optional(v.string()),

		// ─── IDV (Persona) ───
		personaInquiryId: v.optional(v.string()),
		idvResult: v.optional(v.any()),

		// ─── KYC ───
		kycDocumentIds: v.optional(v.array(v.string())),
		kycResult: v.optional(v.any()),
		verificationScore: v.optional(v.number()),

		// ─── Lifecycle ───
		startedAt: v.number(),
		lastActivityAt: v.number(),
		expiresAt: v.number(),
		createdAt: v.number(),
	})
		.index("by_email", ["email"])
		.index("by_broker", ["brokerId", "status"])
		.index("by_status", ["status"])
		.index("by_invite_token", ["inviteToken"])
		.index("by_admin_invite_token", ["adminInviteToken"]),

	lenderFilterConstraints: defineTable({
		// ─── Relationships ───
		lenderId: v.id("lenders"),
		brokerId: v.id("brokers"),
		setByOnboardingId: v.optional(v.id("lenderOnboardings")),

		// ─── Filter dimensions ───
		ltvRange: v.optional(v.object({ min: v.number(), max: v.number() })),
		interestRateRange: v.optional(
			v.object({ min: v.number(), max: v.number() })
		),
		loanAmountRange: v.optional(v.object({ min: v.number(), max: v.number() })),
		allowedMortgageTypes: v.optional(v.array(v.string())),
		allowedPropertyTypes: v.optional(v.array(v.string())),
		maturityDateMax: v.optional(v.string()),

		// ─── Audit ───
		lastUpdatedBy: v.string(),
		updatedAt: v.number(),
		createdAt: v.number(),
	})
		.index("by_lender", ["lenderId"])
		.index("by_broker", ["brokerId"]),

	lenderRenewalIntents: defineTable({
		// ─── GT fields ───
		status: v.string(),
		machineContext: v.optional(v.any()),
		lastTransitionAt: v.optional(v.number()),

		// ─── Relationships ───
		mortgageId: v.id("mortgages"),
		lenderId: v.id("lenders"),
		brokerId: v.id("brokers"),
		positionAccountId: v.string(),

		// ─── Intent ───
		fractionCount: v.number(),
		intent: v.union(
			v.literal("renew"),
			v.literal("exit"),
			v.literal("partial_exit")
		),
		partialExitFractions: v.optional(v.number()),
		notes: v.optional(v.string()),

		// ─── Broker acknowledgment ───
		brokerAcknowledgedAt: v.optional(v.number()),
		brokerNotes: v.optional(v.string()),
		borrowerRenewalIntentId: v.optional(v.string()),

		// ─── Lifecycle ───
		maturityDate: v.number(),
		signalDeadline: v.number(),
		signalledAt: v.optional(v.number()),
		createdAt: v.number(),
	})
		.index("by_mortgage", ["mortgageId"])
		.index("by_lender", ["lenderId", "status"])
		.index("by_broker", ["brokerId", "status"])
		.index("by_deadline", ["signalDeadline", "status"])
		.index("by_maturity", ["maturityDate", "status"]),

	portfolioSnapshots: defineTable({
		lenderId: v.id("lenders"),
		snapshotDate: v.string(),
		snapshotType: v.union(v.literal("monthly"), v.literal("year_end")),
		totalPositions: v.number(),
		totalFractions: v.number(),
		totalInvestedValue: v.number(),
		periodIncome: v.number(),
		cumulativeIncome: v.number(),
		positions: v.array(
			v.object({
				mortgageId: v.string(),
				accountId: v.string(),
				balance: v.number(),
				investedValue: v.number(),
				periodIncome: v.number(),
				cumulativeIncome: v.number(),
				mortgageStatus: v.string(),
			})
		),
		createdAt: v.number(),
	})
		.index("by_lender_date", ["lenderId", "snapshotDate"])
		.index("by_type", ["snapshotType", "snapshotDate"]),

	// ══════════════════════════════════════════════════════════
	// ONBOARDING & GT (Governed Transitions)
	// ══════════════════════════════════════════════════════════

	onboardingRequests: defineTable({
		userId: v.id("users"),
		requestedRole: v.union(
			v.literal("broker"),
			v.literal("lender"),
			v.literal("lawyer"),
			v.literal("admin"),
			v.literal("jr_underwriter"),
			v.literal("underwriter"),
			v.literal("sr_underwriter")
		),
		status: v.string(),
		// machineContext: unused — no guards, no accumulated state
		machineContext: v.optional(v.any()),
		lastTransitionAt: v.optional(v.number()),
		activeRoleAssignmentJournalId: v.optional(v.string()),
		processedRoleAssignmentJournalIds: v.optional(v.array(v.string())),
		referralSource: v.union(
			v.literal("self_signup"),
			v.literal("broker_invite")
		),
		invitedByBrokerId: v.optional(v.string()),
		targetOrganizationId: v.optional(v.string()),
		reviewedBy: v.optional(v.string()),
		reviewedAt: v.optional(v.number()),
		rejectionReason: v.optional(v.string()),
		createdAt: v.number(),
	})
		.index("by_user", ["userId"])
		.index("by_status", ["status"])
		.index("by_user_and_status", ["userId", "status"]),

	// ══════════════════════════════════════════════════════════
	// CORE FINANCIAL ENTITIES
	// ══════════════════════════════════════════════════════════

	properties: defineTable({
		// ─── Address (structured) ───
		streetAddress: v.string(),
		unit: v.optional(v.string()),
		city: v.string(),
		province: v.string(),
		postalCode: v.string(),

		// ─── Address (raw from Google Maps) ───
		googlePlaceData: v.optional(v.any()),
		latitude: v.optional(v.number()),
		longitude: v.optional(v.number()),

		// ─── Legal identity ───
		legalDescription: v.optional(v.string()),
		pin: v.optional(v.string()),
		lroNumber: v.optional(v.string()),

		// ─── Classification ───
		propertyType: v.union(
			v.literal("residential"),
			v.literal("commercial"),
			v.literal("multi_unit"),
			v.literal("condo")
		),

		createdAt: v.number(),
	})
		.index("by_pin", ["pin"])
		.index("by_postal_code", ["postalCode"]),

	appraisals: defineTable({
		propertyId: v.id("properties"),

		// ─── Type ───
		appraisalType: v.union(v.literal("as_is"), v.literal("as_if")),

		// ─── Valuation ───
		appraisedValue: v.number(),
		asIfValue: v.optional(v.number()),
		landValue: v.optional(v.number()),
		improvementValue: v.optional(v.number()),

		// ─── Appraiser ───
		appraiserName: v.string(),
		appraiserLicense: v.optional(v.string()),
		appraiserFirm: v.optional(v.string()),

		// ─── Dates ───
		effectiveDate: v.string(),
		reportDate: v.string(),

		// ─── Supporting data ───
		notes: v.optional(v.string()),
		reportFileRef: v.optional(v.id("_storage")),

		createdAt: v.number(),
	})
		.index("by_property", ["propertyId"])
		.index("by_property_and_date", ["propertyId", "effectiveDate"]),

	appraisalComparables: defineTable({
		appraisalId: v.id("appraisals"),

		// ─── The comparable property ───
		address: v.string(),
		googlePlaceData: v.optional(v.any()),
		latitude: v.optional(v.number()),
		longitude: v.optional(v.number()),

		// ─── Comparison data ───
		salePrice: v.optional(v.number()),
		saleDate: v.optional(v.string()),
		propertyType: v.optional(v.string()),
		squareFootage: v.optional(v.number()),
		lotSize: v.optional(v.string()),
		yearBuilt: v.optional(v.number()),

		// ─── Adjustments ───
		adjustments: v.optional(v.any()),
		adjustedValue: v.optional(v.number()),

		sortOrder: v.number(),
		createdAt: v.number(),
	}).index("by_appraisal", ["appraisalId"]),

	mortgages: defineTable({
		/** WorkOS organization id — denormalized from broker of record. */
		orgId: v.optional(v.string()),

		// ─── Governed Transitions fields ───
		status: v.string(),
		// machineContext: { missedPayments: number, lastPaymentAt: number } — guards read across transitions
		machineContext: v.optional(v.any()),
		lastTransitionAt: v.optional(v.number()),

		// ─── The collateral ───
		propertyId: v.id("properties"),

		// ─── Loan financials ───
		principal: v.number(),
		interestRate: v.number(),
		rateType: v.union(v.literal("fixed"), v.literal("variable")),
		termMonths: v.number(),
		amortizationMonths: v.number(),
		paymentAmount: v.number(),
		paymentFrequency: v.union(
			v.literal("monthly"),
			v.literal("bi_weekly"),
			v.literal("accelerated_bi_weekly"),
			v.literal("weekly")
		),
		loanType: v.union(
			v.literal("conventional"),
			v.literal("insured"),
			v.literal("high_ratio")
		),
		lienPosition: v.number(),

		// ─── Servicing ───
		annualServicingRate: v.optional(v.number()),

		// ─── Collection execution ownership ───
		collectionExecutionMode: v.optional(collectionExecutionModeValidator),
		collectionExecutionProviderCode: v.optional(providerCodeValidator),
		activeExternalCollectionScheduleId: v.optional(
			v.id("externalCollectionSchedules")
		),
		collectionExecutionUpdatedAt: v.optional(v.number()),

		// ─── Key dates ───
		interestAdjustmentDate: v.string(),
		termStartDate: v.string(),
		maturityDate: v.string(),
		firstPaymentDate: v.string(),

		// ─── Participants ───
		brokerOfRecordId: v.id("brokers"),
		assignedBrokerId: v.optional(v.id("brokers")),

		// ─── Renewal chain ───
		priorMortgageId: v.optional(v.id("mortgages")),
		isRenewal: v.optional(v.boolean()),

		// ─── Simulation ───
		simulationId: v.optional(v.string()),

		// ─── Lifecycle ───
		fundedAt: v.optional(v.number()),
		createdAt: v.number(),
	})
		.index("by_status", ["status"])
		.index("by_property", ["propertyId"])
		.index("by_broker_of_record", ["brokerOfRecordId"])
		.index("by_assigned_broker", ["assignedBrokerId"])
		.index("by_maturity", ["maturityDate"])
		.index("by_prior_mortgage", ["priorMortgageId"])
		.index("by_simulation", ["simulationId"])
		.index("by_org", ["orgId"])
		.index("by_org_status", ["orgId", "status"])
		.index("by_collection_execution_mode", [
			"collectionExecutionMode",
			"status",
		]),

	mortgageBorrowers: defineTable({
		mortgageId: v.id("mortgages"),
		borrowerId: v.id("borrowers"),
		role: v.union(
			v.literal("primary"),
			v.literal("co_borrower"),
			v.literal("guarantor")
		),
		addedAt: v.number(),
	})
		.index("by_mortgage", ["mortgageId"])
		.index("by_borrower", ["borrowerId"]),

	priorEncumbrances: defineTable({
		propertyId: v.id("properties"),

		// ─── Encumbrance details ───
		encumbranceType: v.union(
			v.literal("first_mortgage"),
			v.literal("second_mortgage"),
			v.literal("heloc"),
			v.literal("lien"),
			v.literal("other")
		),
		holder: v.string(),
		outstandingBalance: v.optional(v.number()),
		balanceAsOfDate: v.optional(v.string()),
		priority: v.number(),
		registrationNumber: v.optional(v.string()),
		notes: v.optional(v.string()),

		createdAt: v.number(),
	}).index("by_property", ["propertyId"]),

	listings: defineTable({
		// ─── Identity & provenance ───
		mortgageId: v.optional(v.id("mortgages")),
		propertyId: v.optional(v.id("properties")),
		dataSource: listingDataSourceValidator,

		// ─── GT fields ───
		status: listingStatusValidator,
		machineContext: v.optional(v.any()),
		lastTransitionAt: v.optional(v.number()),

		// ─── Denormalized mortgage / property fields ───
		principal: v.number(),
		interestRate: v.number(),
		ltvRatio: v.number(),
		termMonths: v.number(),
		maturityDate: v.string(),
		// Public listing contract keeps monthlyPayment naming even though
		// mortgage source data currently uses paymentAmount.
		monthlyPayment: v.number(),
		rateType: listingRateTypeValidator,
		paymentFrequency: listingPaymentFrequencyValidator,
		loanType: listingLoanTypeValidator,
		lienPosition: v.number(),
		propertyType: listingPropertyTypeValidator,
		city: v.string(),
		province: v.string(),
		approximateLatitude: v.optional(v.number()),
		approximateLongitude: v.optional(v.number()),

		// ─── Appraisal summary ───
		latestAppraisalValueAsIs: v.optional(v.number()),
		latestAppraisalDate: v.optional(v.string()),

		// ─── Flexible denormalized composites ───
		borrowerSignal: v.optional(v.any()),
		paymentHistory: v.optional(v.any()),

		// ─── Marketplace-owned fields ───
		title: v.optional(v.string()),
		description: v.optional(v.string()),
		marketplaceCopy: v.optional(v.string()),
		heroImages: v.array(listingHeroImageValidator),
		featured: v.boolean(),
		displayOrder: v.optional(v.number()),
		adminNotes: v.optional(v.string()),
		publicDocumentIds: v.array(v.id("_storage")),
		seoSlug: v.optional(v.string()),

		// ─── Engagement ───
		viewCount: v.number(),

		// ─── Lifecycle ───
		publishedAt: v.optional(v.number()),
		delistedAt: v.optional(v.number()),
		delistReason: v.optional(listingDelistReasonValidator),

		// ─── Timestamps ───
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_mortgage", ["mortgageId"])
		.index("by_status", ["status"])
		.index("by_status_and_featured", ["status", "featured"])
		.index("by_status_and_view_count", ["status", "viewCount"])
		.index("by_property_type_and_status", ["propertyType", "status"])
		.index("by_province_and_status", ["province", "status"])
		.index("by_city_and_status", ["city", "status"])
		.index("by_lien_position_and_status", ["lienPosition", "status"])
		.index("by_interest_rate", ["status", "interestRate"])
		.index("by_ltv", ["status", "ltvRatio"])
		.index("by_principal", ["status", "principal"])
		.index("by_published_at", ["status", "publishedAt"]),

	obligations: defineTable({
		/** WorkOS organization id — denormalized from mortgage. */
		orgId: v.optional(v.string()),

		// ─── GT fields ───
		status: v.string(),
		machineContext: v.optional(v.any()),
		lastTransitionAt: v.optional(v.number()), // system timestamp: Unix ms

		// ─── Relationships ───
		mortgageId: v.id("mortgages"),
		borrowerId: v.id("borrowers"),

		// ─── Payment identification ───
		paymentNumber: v.number(),

		// ─── Domain fields (all amounts in cents) ───
		type: v.union(
			v.literal("regular_interest"),
			v.literal("arrears_cure"),
			v.literal("late_fee"),
			v.literal("principal_repayment")
		),
		amount: v.number(),
		amountSettled: v.number(), // cumulative cents settled
		dueDate: v.number(), // legacy system timestamp: Unix ms, not a YYYY-MM-DD business date
		gracePeriodEnd: v.number(), // legacy system timestamp: Unix ms, not a YYYY-MM-DD business date
		sourceObligationId: v.optional(v.id("obligations")), // for late_fee type and correctives
		postingGroupId: v.optional(v.string()), // reversal identity for corrective obligations
		feeCode: v.optional(feeCodeValidator),
		mortgageFeeId: v.optional(v.id("mortgageFees")),
		settledAt: v.optional(v.number()), // legacy system timestamp: Unix ms, not a YYYY-MM-DD business date

		createdAt: v.number(), // system timestamp: Unix ms
	})
		.index("by_status", ["status"])
		.index("by_mortgage", ["mortgageId", "status"])
		.index("by_mortgage_and_date", ["mortgageId", "dueDate"])
		.index("by_due_date", ["status", "dueDate"])
		.index("by_type_and_source", ["type", "sourceObligationId"])
		.index("by_type_source_and_fee_code", [
			"type",
			"sourceObligationId",
			"feeCode",
		])
		.index("by_borrower", ["borrowerId"])
		.index("by_source_obligation", ["sourceObligationId"])
		.index("by_org", ["orgId"])
		.index("by_org_status", ["orgId", "status"]),

	obligationCronMonitoring: defineTable({
		jobName: v.string(),
		lastRunBusinessDate: v.string(), // business date: YYYY-MM-DD at UTC midnight semantics
		newlyDueOverflowStreak: v.number(),
		pastGraceOverflowStreak: v.number(),
		lastNewlyDueCount: v.number(),
		lastPastGraceCount: v.number(),
		updatedAt: v.number(), // system timestamp: Unix ms
	}).index("by_job_name", ["jobName"]),

	feeTemplates: defineTable({
		name: v.string(),
		description: v.optional(v.string()),
		code: feeCodeValidator,
		surface: feeSurfaceValidator,
		revenueDestination: feeRevenueDestinationValidator,
		calculationType: feeCalculationTypeValidator,
		parameters: feeCalculationParametersValidator,
		status: feeStatusValidator,
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_code_and_surface", ["code", "surface"])
		.index("by_status", ["status"]),

	feeSetTemplates: defineTable({
		name: v.string(),
		description: v.optional(v.string()),
		status: feeStatusValidator,
		createdAt: v.number(),
		updatedAt: v.number(),
	}).index("by_status", ["status"]),

	feeSetTemplateItems: defineTable({
		feeSetTemplateId: v.id("feeSetTemplates"),
		feeTemplateId: v.id("feeTemplates"),
		sortOrder: v.number(),
		createdAt: v.number(),
	})
		.index("by_fee_set_template", ["feeSetTemplateId", "sortOrder"])
		.index("by_fee_template", ["feeTemplateId"]),

	mortgageFees: defineTable({
		mortgageId: v.id("mortgages"),
		code: feeCodeValidator,
		surface: feeSurfaceValidator,
		revenueDestination: feeRevenueDestinationValidator,
		calculationType: feeCalculationTypeValidator,
		parameters: feeCalculationParametersValidator,
		effectiveFrom: v.string(),
		effectiveTo: v.optional(v.string()),
		status: feeStatusValidator,
		feeTemplateId: v.optional(v.id("feeTemplates")),
		feeSetTemplateId: v.optional(v.id("feeSetTemplates")),
		feeSetTemplateItemId: v.optional(v.id("feeSetTemplateItems")),
		createdAt: v.number(),
		deactivatedAt: v.optional(v.number()),
	})
		.index("by_mortgage", ["mortgageId", "createdAt"])
		.index("by_mortgage_surface_status", ["mortgageId", "surface", "status"])
		.index("by_mortgage_code_surface_status", [
			"mortgageId",
			"code",
			"surface",
			"status",
		])
		.index("by_fee_template", ["feeTemplateId"])
		.index("by_fee_set_template", ["feeSetTemplateId"]),

	// ══════════════════════════════════════════════════════════
	// PAYMENT RAILS (SPEC 1.5)
	// ══════════════════════════════════════════════════════════

	collectionPlanEntries: defineTable({
		mortgageId: v.id("mortgages"),
		obligationIds: v.array(v.id("obligations")),
		amount: v.number(), // cents
		method: v.string(), // "manual", "mock_pad", "rotessa_pad"
		scheduledDate: v.number(), // unix timestamp
		status: v.union(
			v.literal("planned"),
			v.literal("provider_scheduled"),
			v.literal("executing"),
			v.literal("completed"),
			v.literal("cancelled"),
			v.literal("rescheduled")
		),
		executionMode: v.optional(collectionExecutionModeValidator),
		externalCollectionScheduleId: v.optional(
			v.id("externalCollectionSchedules")
		),
		externalOccurrenceOrdinal: v.optional(v.number()),
		externalOccurrenceRef: v.optional(v.string()),
		externalProviderEventStatus: v.optional(v.string()),
		externalProviderReason: v.optional(v.string()),
		externallyManagedAt: v.optional(v.number()),
		externalLastReportedAt: v.optional(v.number()),
		externalLastIngestedVia: v.optional(externalOccurrenceChannelValidator),
		source: v.union(
			v.literal("default_schedule"),
			v.literal("retry_rule"),
			v.literal("late_fee_rule"),
			v.literal("admin"),
			v.literal("admin_reschedule"),
			v.literal("admin_workout")
		),
		createdByRuleId: v.optional(v.id("collectionRules")),
		retryOfId: v.optional(v.id("collectionPlanEntries")),
		workoutPlanId: v.optional(v.id("workoutPlans")),
		supersededByWorkoutPlanId: v.optional(v.id("workoutPlans")),
		supersededAt: v.optional(v.number()),
		rescheduledFromId: v.optional(v.id("collectionPlanEntries")),
		rescheduleReason: v.optional(v.string()),
		rescheduleRequestedAt: v.optional(v.number()),
		rescheduleRequestedByActorId: v.optional(v.string()),
		rescheduleRequestedByActorType: v.optional(
			v.union(
				v.literal("admin"),
				v.literal("borrower"),
				v.literal("broker"),
				v.literal("member"),
				v.literal("system")
			)
		),
		executedAt: v.optional(v.number()),
		cancelledAt: v.optional(v.number()),
		executionIdempotencyKey: v.optional(v.string()),
		collectionAttemptId: v.optional(v.id("collectionAttempts")),
		balancePreCheckDecision: v.optional(balancePreCheckDecisionValidator),
		balancePreCheckReasonCode: v.optional(balancePreCheckReasonCodeValidator),
		balancePreCheckReasonDetail: v.optional(v.string()),
		balancePreCheckSignalSource: v.optional(
			balancePreCheckSignalSourceValidator
		),
		balancePreCheckRuleId: v.optional(v.id("collectionRules")),
		balancePreCheckEvaluatedAt: v.optional(v.number()),
		balancePreCheckNextEvaluationAt: v.optional(v.number()),
		createdAt: v.number(),
	})
		.index("by_scheduled_date", ["scheduledDate", "status"])
		.index("by_status_scheduled_date", ["status", "scheduledDate"])
		.index("by_status", ["status"])
		.index("by_mortgage_status_scheduled", [
			"mortgageId",
			"status",
			"scheduledDate",
		])
		.index("by_rescheduled_from", ["rescheduledFromId", "source"])
		.index("by_retry_of", ["retryOfId", "source"])
		.index("by_created_by_rule", ["createdByRuleId", "source"])
		.index("by_execution_idempotency", ["executionIdempotencyKey"])
		.index("by_workout_plan", ["workoutPlanId", "createdAt"])
		.index("by_workout_supersession", [
			"supersededByWorkoutPlanId",
			"supersededAt",
		])
		.index("by_execution_mode_status_scheduled", [
			"executionMode",
			"status",
			"scheduledDate",
		])
		.index("by_external_occurrence_ref", ["externalOccurrenceRef"])
		.index("by_external_schedule_occurrence_ref", [
			"externalCollectionScheduleId",
			"externalOccurrenceRef",
		])
		.index("by_external_schedule_ordinal", [
			"externalCollectionScheduleId",
			"externalOccurrenceOrdinal",
		])
		.index("by_external_schedule_date", [
			"externalCollectionScheduleId",
			"scheduledDate",
		]),

	collectionRules: defineTable({
		kind: collectionRuleKindValidator,
		code: v.string(),
		displayName: v.string(),
		description: v.string(),
		trigger: v.union(v.literal("schedule"), v.literal("event")),
		status: collectionRuleStatusValidator,
		scope: collectionRuleScopeValidator,
		config: collectionRuleConfigValidator,
		version: v.number(),
		effectiveFrom: v.optional(v.number()),
		effectiveTo: v.optional(v.number()),
		createdByActorId: v.string(),
		updatedByActorId: v.string(),
		priority: v.number(),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_trigger", ["trigger", "status", "priority"])
		.index("by_code", ["code"]),

	workoutPlans: defineTable({
		mortgageId: v.id("mortgages"),
		name: v.string(),
		rationale: v.string(),
		status: workoutPlanStatusValidator,
		strategy: workoutPlanStrategyValidator,
		createdByActorId: v.string(),
		createdByActorType: workoutPlanActorTypeValidator,
		activatedAt: v.optional(v.number()),
		activatedByActorId: v.optional(v.string()),
		activatedByActorType: v.optional(workoutPlanActorTypeValidator),
		completedAt: v.optional(v.number()),
		cancelledAt: v.optional(v.number()),
		cancelledByActorId: v.optional(v.string()),
		cancelledByActorType: v.optional(workoutPlanActorTypeValidator),
		cancelReason: v.optional(v.string()),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_mortgage", ["mortgageId", "createdAt"])
		.index("by_mortgage_status", ["mortgageId", "status", "createdAt"])
		.index("by_status", ["status", "createdAt"]),

	collectionAttempts: defineTable({
		// ─── GT fields ───
		status: v.string(),
		machineContext: v.optional(v.any()),
		lastTransitionAt: v.optional(v.number()), // system timestamp: Unix ms
		// ─── Domain fields ───
		planEntryId: v.id("collectionPlanEntries"),
		mortgageId: v.id("mortgages"),
		obligationIds: v.array(v.id("obligations")),
		method: v.string(),
		amount: v.number(), // cents
		triggerSource: v.optional(
			v.union(
				v.literal("system_scheduler"),
				v.literal("admin_manual"),
				v.literal("workflow_replay"),
				v.literal("migration_backfill"),
				v.literal("provider_webhook"),
				v.literal("provider_poller")
			)
		),
		executionRequestedAt: v.optional(v.number()),
		executionIdempotencyKey: v.optional(v.string()),
		requestedByActorType: v.optional(
			v.union(v.literal("system"), v.literal("admin"), v.literal("workflow"))
		),
		requestedByActorId: v.optional(v.string()),
		executionReason: v.optional(v.string()),
		transferRequestId: v.optional(v.id("transferRequests")),
		initiatedAt: v.number(), // system timestamp: Unix ms
		confirmedAt: v.optional(v.number()), // business confirmation timestamp
		settledAt: v.optional(v.number()), // system timestamp: Unix ms
		failedAt: v.optional(v.number()), // system timestamp: Unix ms
		cancelledAt: v.optional(v.number()), // system timestamp: Unix ms
		reversedAt: v.optional(v.number()), // system timestamp: Unix ms
		failureReason: v.optional(v.string()),
		providerLifecycleStatus: v.optional(v.string()),
		providerLifecycleReason: v.optional(v.string()),
		providerLastReportedAt: v.optional(v.number()),
		providerLastReportedVia: v.optional(externalOccurrenceChannelValidator),
		providerOccurrenceKey: v.optional(v.string()),
	})
		.index("by_plan_entry", ["planEntryId"])
		.index("by_transfer_request", ["transferRequestId"])
		.index("by_mortgage_status", ["mortgageId", "status", "initiatedAt"])
		.index("by_status", ["status"])
		.index("by_provider_occurrence_key", ["providerOccurrenceKey"]),

	externalCollectionSchedules: defineTable({
		status: externalCollectionScheduleStatusValidator,
		machineContext: v.optional(v.any()),
		lastTransitionAt: v.optional(v.number()),
		mortgageId: v.id("mortgages"),
		borrowerId: v.id("borrowers"),
		providerCode: providerCodeValidator,
		bankAccountId: v.id("bankAccounts"),
		externalScheduleRef: v.optional(v.string()),
		activationIdempotencyKey: v.string(),
		startDate: v.number(),
		endDate: v.number(),
		cadence: v.string(),
		coveredFromPlanEntryId: v.id("collectionPlanEntries"),
		coveredToPlanEntryId: v.id("collectionPlanEntries"),
		activatedAt: v.optional(v.number()),
		cancelledAt: v.optional(v.number()),
		lastSyncedAt: v.optional(v.number()),
		lastSyncCursor: v.optional(v.string()),
		lastSyncAttemptAt: v.optional(v.number()),
		nextPollAt: v.optional(v.number()),
		syncLeaseOwner: v.optional(v.string()),
		syncLeaseExpiresAt: v.optional(v.number()),
		lastSyncErrorAt: v.optional(v.number()),
		lastSyncErrorMessage: v.optional(v.string()),
		consecutiveSyncFailures: v.number(),
		lastProviderScheduleStatus: v.optional(v.string()),
		providerData: v.optional(v.record(v.string(), v.any())),
		source: v.string(),
		createdAt: v.number(),
	})
		.index("by_mortgage", ["mortgageId", "createdAt"])
		.index("by_provider_ref", ["providerCode", "externalScheduleRef"])
		.index("by_activation_key", ["activationIdempotencyKey"])
		.index("by_status", ["status", "createdAt"])
		.index("by_status_and_next_poll", ["status", "nextPollAt"]),

	// ══════════════════════════════════════════════════════════
	// PROVISIONAL FLOW
	// ══════════════════════════════════════════════════════════

	provisionalApplications: defineTable({
		// ─── GT fields ───
		status: v.string(),
		lastTransitionAt: v.optional(v.number()),

		// ─── Domain fields ───
		brokerId: v.id("brokers"),
		borrowerId: v.id("borrowers"),
		normalizedData: v.any(),
		fileIds: v.array(v.id("_storage")),
		sourceType: v.union(v.literal("api"), v.literal("pdf"), v.literal("form")),
		triageResult: v.optional(
			v.object({
				decision: v.string(),
				details: v.any(),
				decidedAt: v.number(),
			})
		),
		createdAt: v.number(),
	})
		.index("by_status", ["status"])
		.index("by_broker", ["brokerId"]),

	provisionalOffers: defineTable({
		// ─── GT fields ───
		status: v.string(),
		machineContext: v.optional(v.any()),
		lastTransitionAt: v.optional(v.number()),

		// ─── Domain fields ───
		applicationId: v.id("provisionalApplications"),
		brokerId: v.id("brokers"),
		type: v.union(v.literal("pre_approval"), v.literal("conditional")),
		portalToken: v.string(),
		expiresAt: v.number(),
		followUpScheduledId: v.optional(v.id("_scheduled_functions")),
		commitmentDocRef: v.optional(v.id("_storage")),
		createdAt: v.number(),
	})
		.index("by_application", ["applicationId"])
		.index("by_broker", ["brokerId", "status"])
		.index("by_portal_token", ["portalToken"])
		.index("by_status", ["status"]),

	offerConditions: defineTable({
		// ─── GT fields ───
		status: v.string(),
		lastTransitionAt: v.optional(v.number()),

		// ─── Domain fields ───
		offerId: v.id("provisionalOffers"),
		label: v.string(),
		type: v.union(
			v.literal("document_upload"),
			v.literal("info_request"),
			v.literal("acknowledgment"),
			v.literal("commitment_signing")
		),
		gatedBy: v.optional(v.id("offerConditions")),
		fulfillmentMethod: v.optional(
			v.union(
				v.literal("documenso_email"),
				v.literal("physical_upload"),
				v.literal("portal_embedded")
			)
		),
		fileRef: v.optional(v.id("_storage")),
		documensoEnvelopeId: v.optional(v.string()),
		submittedAt: v.optional(v.number()),
		reviewedAt: v.optional(v.number()),
	})
		.index("by_offer", ["offerId"])
		.index("by_gated_by", ["gatedBy"]),

	// ══════════════════════════════════════════════════════════
	// APPLICATION & UNDERWRITING
	// ══════════════════════════════════════════════════════════

	applicationPackages: defineTable({
		// ─── GT fields ───
		status: v.string(),
		machineContext: v.optional(v.any()),
		lastTransitionAt: v.optional(v.number()),

		// ─── Lineage ───
		sourceApplicationId: v.id("provisionalApplications"),

		// ─── Domain fields ───
		currentVersion: v.number(),
		borrowerId: v.id("borrowers"),
		brokerId: v.id("brokers"),
		closingDate: v.optional(v.number()),
		createdAt: v.number(),
	})
		.index("by_status", ["status"])
		.index("by_source_application", ["sourceApplicationId"])
		.index("by_broker", ["brokerId"]),

	applicationPackageVersions: defineTable({
		packageId: v.id("applicationPackages"),
		versionNumber: v.number(),
		snapshotData: v.any(),
		diff: v.optional(v.any()),
		sourceWorkspaceId: v.optional(v.id("revisionWorkspaces")),
		createdAt: v.number(),
	}).index("by_package", ["packageId", "versionNumber"]),

	underwritingArtifacts: defineTable({
		packageId: v.id("applicationPackages"),
		section: v.string(),
		type: v.union(
			v.literal("property_appraisal"),
			v.literal("valuation_analysis"),
			v.literal("comparable_market_analysis"),
			v.literal("risk_notes"),
			v.literal("verification_confirmation"),
			v.literal("external_reference_check")
		),
		status: v.union(v.literal("current"), v.literal("superseded")),
		createdAtVersion: v.number(),
		supersededAtVersion: v.optional(v.number()),

		content: v.any(),
		fileRefs: v.optional(v.array(v.id("_storage"))),

		createdBy: v.string(),
		createdAt: v.number(),
		supersededAt: v.optional(v.number()),
	})
		.index("by_package", ["packageId"])
		.index("by_package_and_section", ["packageId", "section"])
		.index("by_package_and_status", ["packageId", "status"]),

	revisionWorkspaces: defineTable({
		status: v.union(
			v.literal("active"),
			v.literal("submitted"),
			v.literal("expired")
		),

		packageId: v.id("applicationPackages"),
		sourceVersionNumber: v.number(),

		revisionItems: v.optional(v.array(v.any())),
		data: v.any(),

		brokerNotes: v.optional(v.string()),
		portalToken: v.string(),

		createdAt: v.number(),
		createdBy: v.string(),
		submittedAt: v.optional(v.number()),
		submittedBy: v.optional(v.string()),
		expiresAt: v.number(),
	})
		.index("by_package", ["packageId"])
		.index("by_portal_token", ["portalToken"])
		.index("by_status", ["status"]),

	// ══════════════════════════════════════════════════════════
	// DEAL CLOSING
	// ══════════════════════════════════════════════════════════

	deals: defineTable({
		/** WorkOS organization id — denormalized from mortgage. */
		orgId: v.optional(v.string()),

		// ─── Governed Transitions fields ───
		status: v.string(),
		machineContext: v.optional(v.any()),
		lastTransitionAt: v.optional(v.number()),

		// ─── Domain fields ───
		mortgageId: v.id("mortgages"),
		buyerId: v.string(),
		sellerId: v.string(),
		fractionalShare: v.number(),
		closingDate: v.optional(v.number()),
		lockingFeeAmount: v.optional(v.number()),
		lawyerId: v.optional(v.string()),
		reservationId: v.optional(v.id("ledger_reservations")),
		lawyerType: v.optional(
			v.union(v.literal("platform_lawyer"), v.literal("guest_lawyer"))
		),

		// ─── Resolved lender (set on approval) ───
		lenderId: v.optional(v.id("lenders")),

		createdAt: v.number(),
		createdBy: v.string(),
	})
		.index("by_status", ["status"])
		.index("by_mortgage", ["mortgageId"])
		.index("by_buyer", ["buyerId"])
		.index("by_seller", ["sellerId"])
		.index("by_org", ["orgId"])
		.index("by_org_status", ["orgId", "status"]),

	dealAccess: defineTable({
		userId: v.string(),
		dealId: v.id("deals"),
		role: v.union(
			v.literal("platform_lawyer"),
			v.literal("guest_lawyer"),
			v.literal("lender"),
			v.literal("borrower")
		),
		grantedAt: v.number(),
		grantedBy: v.string(),
		revokedAt: v.optional(v.number()),
		status: v.union(v.literal("active"), v.literal("revoked")),
	})
		.index("by_user_and_deal", ["userId", "dealId"])
		.index("by_deal", ["dealId"])
		.index("by_user", ["userId"]),

	closingTeamAssignments: defineTable({
		mortgageId: v.id("mortgages"),
		userId: v.string(),
		role: v.union(
			v.literal("closing_lawyer"),
			v.literal("reviewing_lawyer"),
			v.literal("notary")
		),
		assignedBy: v.string(),
		assignedAt: v.number(),
	})
		.index("by_mortgage", ["mortgageId"])
		.index("by_user", ["userId"]),

	// ══════════════════════════════════════════════════════════
	// PRORATE ENGINE (Deal Closing — ENG-50)
	// ══════════════════════════════════════════════════════════

	prorateEntries: defineTable({
		mortgageId: v.id("mortgages"),
		dealId: v.id("deals"),
		ownerId: v.string(),
		ownerRole: v.union(v.literal("seller"), v.literal("buyer")),
		amount: v.number(),
		days: v.number(),
		dailyRate: v.number(),
		periodStart: v.string(),
		periodEnd: v.string(),
		closingDate: v.string(),
		entryType: v.literal("prorate_credit"),
		createdAt: v.number(),
	})
		.index("by_deal", ["dealId"])
		.index("by_mortgage", ["mortgageId"])
		.index("by_owner", ["ownerId"]),

	dealReroutes: defineTable({
		dealId: v.id("deals"),
		mortgageId: v.id("mortgages"),
		fromOwnerId: v.string(),
		toOwnerId: v.string(),
		fractionalShare: v.number(),
		effectiveAfterDate: v.string(),
		createdAt: v.number(),
	})
		.index("by_deal", ["dealId"])
		.index("by_mortgage", ["mortgageId"]),

	// ══════════════════════════════════════════════════════════
	// DISPERSAL ENGINE
	// ══════════════════════════════════════════════════════════

	dispersalEntries: defineTable({
		/** WorkOS organization id — denormalized from lender or mortgage. */
		orgId: v.optional(v.string()),

		mortgageId: v.id("mortgages"),
		lenderId: v.id("lenders"),
		lenderAccountId: v.id("ledger_accounts"),
		calculationRunId: v.optional(v.id("dispersalCalculationRuns")),
		transferRequestId: v.optional(v.id("transferRequests")),
		amount: v.number(),
		dispersalDate: v.string(), // business date: YYYY-MM-DD at UTC midnight semantics
		obligationId: v.id("obligations"),
		servicingFeeDeducted: v.number(),
		status: dispersalStatusValidator,
		idempotencyKey: v.string(),
		calculationDetails: calculationDetailsValidator,
		mortgageFeeId: v.optional(v.id("mortgageFees")),
		feeCode: v.optional(feeCodeValidator),
		payoutEligibleAfter: v.optional(v.string()), // YYYY-MM-DD: earliest payout date (hold period)
		paymentMethod: v.optional(v.string()), // resolved from collection attempt chain
		payoutDate: v.optional(v.string()), // YYYY-MM-DD: date payout was executed (ENG-182)
		processingAt: v.optional(v.number()),
		disbursedAt: v.optional(v.number()),
		reversedAt: v.optional(v.number()),
		createdAt: v.number(), // system timestamp: Unix ms
	})
		.index("by_lender", ["lenderId", "dispersalDate"])
		.index("by_mortgage", ["mortgageId", "dispersalDate"])
		.index("by_obligation", ["obligationId"])
		.index("by_calculation_run", ["calculationRunId"])
		.index("by_status", ["status", "lenderId"])
		.index("by_idempotency", ["idempotencyKey"])
		.index("by_transfer_request", ["transferRequestId"])
		.index("by_eligibility", ["status", "payoutEligibleAfter"])
		.index("by_org", ["orgId"])
		.index("by_org_status", ["orgId", "status"]),

	servicingFeeEntries: defineTable({
		calculationRunId: v.optional(v.id("dispersalCalculationRuns")),
		mortgageId: v.id("mortgages"),
		obligationId: v.id("obligations"),
		amount: v.number(),
		feeDue: v.optional(v.number()),
		feeCashApplied: v.optional(v.number()),
		feeReceivable: v.optional(v.number()),
		policyVersion: v.optional(v.number()),
		sourceObligationType: v.optional(v.string()),
		mortgageFeeId: v.optional(v.id("mortgageFees")),
		feeCode: v.optional(feeCodeValidator),
		annualRate: v.number(),
		principalBalance: v.number(),
		date: v.string(), // business date: YYYY-MM-DD at UTC midnight semantics
		createdAt: v.number(), // system timestamp: Unix ms
	})
		.index("by_mortgage", ["mortgageId", "date"])
		.index("by_obligation", ["obligationId"])
		.index("by_calculation_run", ["calculationRunId"]),

	dispersalCalculationRuns: defineTable({
		orgId: v.optional(v.string()),
		mortgageId: v.id("mortgages"),
		obligationId: v.id("obligations"),
		idempotencyKey: v.string(),
		settledAmount: v.number(),
		settledDate: v.string(),
		paymentMethod: v.string(),
		payoutEligibleAfter: v.string(),
		calculationVersion: v.string(),
		inputs: v.any(),
		outputs: v.any(),
		source: sourceValidator,
		createdAt: v.number(),
	})
		.index("by_obligation", ["obligationId"])
		.index("by_mortgage", ["mortgageId", "createdAt"])
		.index("by_idempotency", ["idempotencyKey"]),

	dispersalHealingAttempts: defineTable({
		obligationId: v.id("obligations"),
		attemptCount: v.number(),
		lastAttemptAt: v.number(), // Unix ms system timestamp
		escalatedAt: v.optional(v.number()), // Unix ms, set when escalated to SUSPENSE
		status: v.union(
			v.literal("retrying"),
			v.literal("escalated"),
			v.literal("resolved")
		),
		createdAt: v.number(), // Unix ms system timestamp
	})
		.index("by_obligation", ["obligationId"])
		.index("by_status", ["status"]),

	transferHealingAttempts: defineTable({
		transferRequestId: v.id("transferRequests"),
		attemptCount: v.number(),
		lastAttemptAt: v.number(),
		escalatedAt: v.optional(v.number()),
		resolvedAt: v.optional(v.number()),
		status: v.union(
			v.literal("retrying"),
			v.literal("escalated"),
			v.literal("resolved")
		),
		createdAt: v.number(),
	})
		.index("by_transfer_request", ["transferRequestId"])
		.index("by_status", ["status"]),

	cash_ledger_accounts: defineTable({
		family: v.union(
			v.literal("BORROWER_RECEIVABLE"),
			v.literal("CASH_CLEARING"),
			v.literal("TRUST_CASH"),
			v.literal("UNAPPLIED_CASH"),
			v.literal("LENDER_PAYABLE"),
			v.literal("SERVICING_REVENUE"),
			v.literal("WRITE_OFF"),
			v.literal("SUSPENSE"),
			v.literal("CONTROL")
		),
		mortgageId: v.optional(v.id("mortgages")),
		obligationId: v.optional(v.id("obligations")),
		lenderId: v.optional(v.id("lenders")),
		borrowerId: v.optional(v.id("borrowers")),
		subaccount: v.optional(
			v.union(
				v.literal("ACCRUAL"),
				v.literal("ALLOCATION"),
				v.literal("SETTLEMENT"),
				v.literal("WAIVER")
			)
		),
		cumulativeDebits: v.int64(),
		cumulativeCredits: v.int64(),
		createdAt: v.number(),
		metadata: v.optional(v.any()),
	})
		.index("by_family", ["family"])
		.index("by_mortgage", ["mortgageId"])
		.index("by_obligation", ["obligationId"])
		.index("by_lender", ["lenderId"])
		.index("by_borrower", ["borrowerId"])
		.index("by_family_and_mortgage", ["family", "mortgageId"])
		.index("by_family_and_obligation", ["family", "obligationId"])
		.index("by_family_and_lender", ["family", "lenderId"])
		.index("by_family_and_mortgage_and_lender", [
			"family",
			"mortgageId",
			"lenderId",
		])
		.index("by_family_and_subaccount", ["family", "subaccount"]),

	cash_ledger_journal_entries: defineTable({
		sequenceNumber: v.int64(),
		entryType: v.union(
			v.literal("OBLIGATION_ACCRUED"),
			v.literal("CASH_RECEIVED"),
			v.literal("CASH_APPLIED"),
			v.literal("LENDER_PAYABLE_CREATED"),
			v.literal("SERVICING_FEE_RECOGNIZED"),
			v.literal("LENDER_PAYOUT_SENT"),
			v.literal("OBLIGATION_WAIVED"),
			v.literal("OBLIGATION_WRITTEN_OFF"),
			v.literal("REVERSAL"),
			v.literal("CORRECTION"),
			v.literal("SUSPENSE_ESCALATED"),
			v.literal("SUSPENSE_ROUTED")
		),
		mortgageId: v.optional(v.id("mortgages")),
		obligationId: v.optional(v.id("obligations")),
		attemptId: v.optional(v.id("collectionAttempts")),
		dealId: v.optional(v.id("deals")),
		dispersalEntryId: v.optional(v.id("dispersalEntries")),
		transferRequestId: v.optional(v.id("transferRequests")),
		lenderId: v.optional(v.id("lenders")),
		borrowerId: v.optional(v.id("borrowers")),
		effectiveDate: v.string(),
		timestamp: v.number(),
		debitAccountId: v.id("cash_ledger_accounts"),
		creditAccountId: v.id("cash_ledger_accounts"),
		amount: v.int64(),
		idempotencyKey: v.string(),
		postingGroupId: v.optional(v.string()),
		causedBy: v.optional(v.id("cash_ledger_journal_entries")),
		source: sourceValidator,
		reason: v.optional(v.string()),
		metadata: v.optional(v.any()),
	})
		.index("by_sequence", ["sequenceNumber"])
		.index("by_idempotency", ["idempotencyKey"])
		.index("by_mortgage_and_sequence", ["mortgageId", "sequenceNumber"])
		.index("by_obligation_and_sequence", ["obligationId", "sequenceNumber"])
		.index("by_lender_and_sequence", ["lenderId", "sequenceNumber"])
		.index("by_debit_account_and_timestamp", ["debitAccountId", "timestamp"])
		.index("by_credit_account_and_timestamp", ["creditAccountId", "timestamp"])
		.index("by_posting_group", ["postingGroupId", "sequenceNumber"])
		.index("by_caused_by", ["causedBy"])
		.index("by_deal", ["dealId", "entryType"])
		.index("by_transfer_request", ["transferRequestId", "sequenceNumber"])
		.index("by_effective_date", ["effectiveDate", "sequenceNumber"]),

	cash_ledger_sequence_counters: defineTable({
		name: v.literal("cash_ledger_global"),
		currentValue: v.int64(),
	}).index("by_name", ["name"]),

	cash_ledger_cursors: defineTable({
		name: v.string(),
		lastProcessedSequence: v.int64(),
		lastProcessedAt: v.optional(v.number()),
	}).index("by_name", ["name"]),

	// ══════════════════════════════════════════════════════════
	// GT AUDIT JOURNAL
	// ══════════════════════════════════════════════════════════

	auditJournal: defineTable({
		/** WorkOS organization id for org-scoped audit queries (optional for legacy rows). */
		afterState: v.optional(v.any()),
		beforeState: v.optional(v.any()),
		organizationId: v.optional(v.string()),
		correlationId: v.optional(v.string()),
		delta: v.optional(v.any()),
		entityType: entityTypeValidator,
		entityId: v.string(),
		effectiveDate: v.string(),
		eventCategory: v.string(),
		eventId: v.string(),
		eventType: v.string(),
		idempotencyKey: v.optional(v.string()),
		legalEntityId: v.optional(v.string()),
		lenderId: v.optional(v.string()),
		linkedRecordIds: v.optional(v.any()),
		mortgageId: v.optional(v.string()),
		obligationId: v.optional(v.string()),
		originSystem: v.string(),
		payload: v.optional(v.any()),
		previousState: v.string(),
		newState: v.string(),
		outcome: v.union(v.literal("transitioned"), v.literal("rejected")),
		reason: v.optional(v.string()),
		requestId: v.optional(v.string()),
		sequenceNumber: v.int64(),
		actorId: v.string(),
		actorType: v.optional(actorTypeValidator),
		channel: channelValidator,
		ip: v.optional(v.string()),
		sessionId: v.optional(v.string()),
		machineVersion: v.optional(v.string()),
		effectsScheduled: v.optional(v.array(v.string())),
		timestamp: v.number(),
		transferRequestId: v.optional(v.string()),
	})
		.index("by_event_id", ["eventId"])
		.index("by_sequence", ["sequenceNumber"])
		.index("by_entity", ["entityType", "entityId", "timestamp"])
		.index("by_actor", ["actorId", "timestamp"])
		.index("by_lender", ["lenderId", "timestamp"])
		.index("by_mortgage", ["mortgageId", "timestamp"])
		.index("by_obligation", ["obligationId", "timestamp"])
		.index("by_transfer_request", ["transferRequestId", "timestamp"])
		.index("by_type_and_time", ["entityType", "timestamp"])
		.index("by_org_and_time", ["organizationId", "timestamp"]),

	auditJournalSequenceCounters: defineTable({
		name: v.string(),
		nextSequenceNumber: v.int64(),
		updatedAt: v.number(),
	}).index("by_name", ["name"]),

	auditEvidencePackages: defineTable({
		scope: v.any(),
		asOf: v.number(),
		format: v.union(v.literal("json"), v.literal("json_and_csv")),
		artifactManifest: v.array(
			v.object({
				byteLength: v.number(),
				checksum: v.string(),
				chunkCount: v.number(),
				contentType: v.string(),
				name: v.string(),
			})
		),
		verificationJson: v.optional(v.string()),
		createdAt: v.number(),
		createdBy: v.string(),
	}).index("by_created_at", ["createdAt"]),

	auditEvidencePackageArtifacts: defineTable({
		packageId: v.id("auditEvidencePackages"),
		artifactName: v.string(),
		byteLength: v.number(),
		checksum: v.string(),
		chunkIndex: v.number(),
		content: v.string(),
		contentType: v.string(),
		createdAt: v.number(),
	})
		.index("by_package", ["packageId"])
		.index("by_package_and_artifact", [
			"packageId",
			"artifactName",
			"chunkIndex",
		]),

	// ══════════════════════════════════════════════════════════
	// MORTGAGE OWNERSHIP LEDGER
	// ══════════════════════════════════════════════════════════

	ledger_accounts: defineTable({
		type: v.union(
			v.literal("WORLD"),
			v.literal("TREASURY"),
			v.literal("POSITION")
		),
		mortgageId: v.optional(v.string()),
		/** WorkOS auth ID string, not `Id<"lenders">` (see ENG-218 / Foot Gun 5). */
		lenderId: v.optional(v.string()),
		cumulativeDebits: v.int64(),
		cumulativeCredits: v.int64(),
		pendingDebits: v.optional(v.int64()),
		pendingCredits: v.optional(v.int64()),
		createdAt: v.number(),
		metadata: v.optional(v.any()),
	})
		.index("by_mortgage", ["mortgageId"])
		.index("by_lender", ["lenderId"])
		.index("by_mortgage_and_lender", ["mortgageId", "lenderId"])
		.index("by_type_and_mortgage", ["type", "mortgageId"]),

	ledger_journal_entries: defineTable({
		sequenceNumber: v.int64(),
		entryType: v.union(
			v.literal("MORTGAGE_MINTED"),
			v.literal("SHARES_ISSUED"),
			v.literal("SHARES_TRANSFERRED"),
			v.literal("SHARES_REDEEMED"),
			v.literal("MORTGAGE_BURNED"),
			v.literal("SHARES_RESERVED"),
			v.literal("SHARES_COMMITTED"),
			v.literal("SHARES_VOIDED"),
			v.literal("CORRECTION")
		),
		reservationId: v.optional(v.id("ledger_reservations")),
		mortgageId: v.string(),
		effectiveDate: v.string(), // business date: YYYY-MM-DD at UTC midnight semantics
		timestamp: v.number(), // system timestamp: Unix ms
		debitAccountId: v.id("ledger_accounts"),
		creditAccountId: v.id("ledger_accounts"),
		/** Amount as a finite integer in the smallest currency unit (e.g. cents). Suitable for conversion to bigint. */
		amount: v.union(v.number(), v.int64()),
		idempotencyKey: v.string(),
		causedBy: v.optional(v.id("ledger_journal_entries")),
		source: v.object({
			type: v.union(
				v.literal("user"),
				v.literal("system"),
				v.literal("webhook"),
				v.literal("cron")
			),
			actor: v.optional(v.string()),
			channel: v.optional(v.string()),
		}),
		reason: v.optional(v.string()),
		metadata: v.optional(v.any()),
	})
		.index("by_idempotency", ["idempotencyKey"])
		.index("by_mortgage_and_time", ["mortgageId", "timestamp"])
		.index("by_sequence", ["sequenceNumber"])
		.index("by_debit_account", ["debitAccountId", "timestamp"])
		.index("by_credit_account", ["creditAccountId", "timestamp"])
		.index("by_entry_type", ["entryType", "timestamp"]),

	ledger_cursors: defineTable({
		consumerId: v.string(),
		lastProcessedSequence: v.int64(),
		lastProcessedAt: v.number(),
	}).index("by_consumer", ["consumerId"]),

	ledger_reservations: defineTable({
		mortgageId: v.string(),
		sellerAccountId: v.id("ledger_accounts"),
		buyerAccountId: v.id("ledger_accounts"),
		amount: v.number(),
		status: v.union(
			v.literal("pending"),
			v.literal("committed"),
			v.literal("voided")
		),
		dealId: v.optional(v.string()),
		reserveJournalEntryId: v.id("ledger_journal_entries"),
		commitJournalEntryId: v.optional(v.id("ledger_journal_entries")),
		voidJournalEntryId: v.optional(v.id("ledger_journal_entries")),
		createdAt: v.number(),
		resolvedAt: v.optional(v.number()),
	})
		.index("by_mortgage", ["mortgageId", "status"])
		.index("by_seller", ["sellerAccountId", "status"])
		.index("by_deal", ["dealId"]),

	ledger_sequence_counters: defineTable({
		name: v.literal("ledger_sequence"),
		value: v.int64(),
	}).index("by_name", ["name"]),

	// ══════════════════════════════════════════════════════════
	// DOCUMENT ENGINE
	// ══════════════════════════════════════════════════════════

	documentBasePdfs: defineTable({
		name: v.string(),
		description: v.optional(v.string()),
		fileRef: v.id("_storage"),
		fileHash: v.string(),
		fileSize: v.number(),
		pageCount: v.number(),
		pageDimensions: v.array(pageDimensionValidator),
		uploadedBy: v.optional(v.string()),
		uploadedAt: v.number(),
	})
		.index("by_hash", ["fileHash"])
		.index("by_name", ["name"]),

	systemVariables: defineTable({
		key: v.string(),
		label: v.string(),
		type: variableTypeValidator,
		description: v.optional(v.string()),
		systemPath: v.optional(v.string()),
		formatOptions: formatOptionsValidator,
		createdBy: v.optional(v.string()),
		createdAt: v.number(),
	}).index("by_key", ["key"]),

	documentTemplates: defineTable({
		name: v.string(),
		description: v.optional(v.string()),
		basePdfId: v.id("documentBasePdfs"),
		basePdfHash: v.string(),
		draft: draftStateValidator,
		currentPublishedVersion: v.optional(v.number()),
		hasDraftChanges: v.boolean(),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_name", ["name"])
		.index("by_base_pdf", ["basePdfId"]),

	documentTemplateVersions: defineTable({
		templateId: v.id("documentTemplates"),
		version: v.number(),
		basePdfId: v.id("documentBasePdfs"),
		basePdfHash: v.string(),
		snapshot: draftStateValidator,
		publishedBy: v.optional(v.string()),
		publishedAt: v.number(),
	}).index("by_template", ["templateId", "version"]),

	dataModelEntities: defineTable({
		name: v.string(),
		label: v.string(),
		source: entitySourceValidator,
		hidden: v.boolean(),
		fields: v.array(entityFieldValidator),
		createdAt: v.number(),
		updatedAt: v.number(),
	}).index("by_name", ["name"]),

	documentTemplateGroups: defineTable({
		name: v.string(),
		description: v.optional(v.string()),
		templateRefs: v.array(
			v.object({
				templateId: v.id("documentTemplates"),
				order: v.number(),
				pinnedVersion: v.optional(v.number()),
			})
		),
		signatories: v.array(signatoryConfigValidator),
		createdAt: v.number(),
		updatedAt: v.number(),
	}).index("by_name", ["name"]),

	// ══════════════════════════════════════════════════════════
	// GENERATED DOCUMENTS (consumer-side document tracking)
	// ══════════════════════════════════════════════════════════

	generatedDocuments: defineTable({
		// ─── What was generated ───
		name: v.string(),
		templateId: v.id("documentTemplates"),
		templateVersionUsed: v.number(),
		groupId: v.optional(v.id("documentTemplateGroups")),

		// ─── Generated output ───
		pdfStorageId: v.id("_storage"),
		documensoEnvelopeId: v.optional(v.string()),

		// ─── Entity linkage (polymorphic) ───
		// Intentionally NOT reusing entityTypeValidator from engine/validators —
		// that covers all 12 GT-governed entity types. This union is scoped to the
		// 4 entity types that documents can actually be generated for.
		entityType: v.union(
			v.literal("mortgage"),
			v.literal("deal"),
			v.literal("applicationPackage"),
			v.literal("provisionalApplication")
		),
		// v.string() instead of v.id() because polymorphic FKs can't use typed IDs
		// across multiple tables. ENG-6's canAccessDocument() casts at runtime.
		entityId: v.string(),

		// ─── Access control ───
		sensitivityTier: v.union(
			v.literal("public"),
			v.literal("private"),
			v.literal("sensitive")
		),

		// ─── Signing status ───
		signingStatus: v.union(
			v.literal("not_applicable"),
			v.literal("draft"),
			v.literal("sent"),
			v.literal("partially_signed"),
			v.literal("completed"),
			v.literal("declined"),
			v.literal("voided")
		),

		// ─── Metadata ───
		generatedBy: v.string(),
		generatedAt: v.number(),
		updatedAt: v.number(),
		// Caller-specific context (deal phase, etc.) — v.any() is intentional
		// because metadata shape varies by entityType and consumer
		metadata: v.optional(v.any()),
	})
		.index("by_entity", ["entityType", "entityId"])
		.index("by_template", ["templateId"])
		.index("by_sensitivity", ["sensitivityTier", "entityType"])
		.index("by_signing_status", ["signingStatus"]),

	// ══════════════════════════════════════════════════════════
	// TRANSFER REQUESTS — Unified transfer domain (ENG-184)
	// Greenfield table — no legacy data. Required fields are enforced at schema level.
	// ══════════════════════════════════════════════════════════

	transferRequests: defineTable({
		/** WorkOS organization id — denormalized from mortgage/obligation/deal/lender graph. */
		orgId: v.optional(v.string()),

		status: v.union(
			v.literal("initiated"),
			v.literal("pending"),
			v.literal("processing"),
			v.literal("confirmed"),
			v.literal("reversed"),
			v.literal("failed"),
			v.literal("cancelled")
		),
		direction: directionValidator,
		transferType: transferTypeValidator,
		amount: v.number(),
		currency: v.literal("CAD"),
		counterpartyType: counterpartyTypeValidator,
		/** Domain counterparty identifier, never a WorkOS auth ID. */
		counterpartyId: v.string(),
		providerCode: providerCodeValidator,
		idempotencyKey: v.string(),
		source: sourceValidator,
		createdAt: v.number(),
		lastTransitionAt: v.number(),

		// ── Cross-reference IDs (optional — depend on transfer type) ─
		mortgageId: v.optional(v.id("mortgages")),
		obligationId: v.optional(v.id("obligations")),
		/** Domain lender entity ID (`Id<"lenders">`), not a WorkOS auth ID. */
		lenderId: v.optional(v.id("lenders")),
		borrowerId: v.optional(v.id("borrowers")),
		dispersalEntryId: v.optional(v.id("dispersalEntries")),
		dealId: v.optional(v.id("deals")),
		planEntryId: v.optional(v.id("collectionPlanEntries")),
		collectionAttemptId: v.optional(v.id("collectionAttempts")),

		// ── Governed-Transition fields ──────────────────────────────
		// Record type (not strict object) because the GT engine hydrates/persists
		// XState snapshot context which may vary during machine evolution.
		machineContext: v.optional(v.record(v.string(), v.any())),

		// ── Provider (ref set later by effect, not at creation) ─────
		providerRef: v.optional(v.string()),
		bankAccountRef: v.optional(v.string()),

		// ── Lifecycle timestamps (set during state transitions) ─────
		confirmedAt: v.optional(v.number()),
		reversedAt: v.optional(v.number()),
		settledAt: v.optional(v.number()),
		failedAt: v.optional(v.number()),
		failureReason: v.optional(v.string()),
		failureCode: v.optional(v.string()),
		reversalRef: v.optional(v.string()),
		manualSettlement: v.optional(manualSettlementValidator),
		cashJournalEntryIds: v.optional(
			v.array(v.id("cash_ledger_journal_entries"))
		),

		// ── Multi-leg pipeline ──────────────────────────────────────
		pipelineId: v.optional(v.string()),
		legNumber: v.optional(v.union(v.literal(1), v.literal(2))),

		// ── Metadata ────────────────────────────────────────────────
		metadata: v.optional(v.record(v.string(), v.any())),
	})
		.index("by_status", ["status"])
		.index("by_status_and_direction", ["status", "direction"])
		.index("by_mortgage", ["mortgageId", "status"])
		.index("by_obligation", ["obligationId"])
		.index("by_dispersal_entry", ["dispersalEntryId"])
		.index("by_lender_and_status", ["lenderId", "status"])
		.index("by_idempotency", ["idempotencyKey"])
		.index("by_direction_and_type", ["direction", "transferType", "status"])
		.index("by_counterparty", [
			"counterpartyType",
			"counterpartyId",
			"createdAt",
		])
		.index("by_counterparty_status", [
			"counterpartyType",
			"counterpartyId",
			"status",
			"createdAt",
		])
		.index("by_deal", ["dealId", "createdAt"])
		.index("by_deal_status", ["dealId", "status", "createdAt"])
		.index("by_collection_attempt", ["collectionAttemptId"])
		.index("by_pipeline", ["pipelineId", "legNumber"])
		.index("by_provider_ref", ["providerCode", "providerRef"])
		.index("by_org", ["orgId"])
		.index("by_org_status", ["orgId", "status"]),

	/** Durable store for raw webhook payloads — persist before ACKing the provider. */
	webhookEvents: defineTable({
		/** Which payment provider sent this event (e.g., "pad_vopay", "stripe", "rotessa") */
		provider: v.string(),
		/** Provider-assigned event/transaction identifier for idempotency */
		providerEventId: v.string(),
		/** Raw JSON body as received */
		rawBody: v.string(),
		/** Processing status */
		status: v.union(
			v.literal("pending"),
			v.literal("processed"),
			v.literal("failed")
		),
		/** When the event was received */
		receivedAt: v.number(),
		/** When processing completed (or last failed) */
		processedAt: v.optional(v.number()),
		/** Error message if processing failed */
		error: v.optional(v.string()),
		/** Number of processing attempts */
		attempts: v.number(),
		/** Whether the inbound webhook signature was successfully verified */
		signatureVerified: v.optional(v.boolean()),
		/** Normalized transfer event type (e.g. FUNDS_SETTLED) derived inside the provider boundary */
		normalizedEventType: v.optional(normalizedEventTypeValidator),
		/** Linked transfer request, if the webhook could be resolved to one */
		transferRequestId: v.optional(v.id("transferRequests")),
	})
		.index("by_provider_event", ["provider", "providerEventId"])
		.index("by_status", ["status"])
		.index("by_transfer_request", ["transferRequestId"]),

	// ══════════════════════════════════════════════════════════
	// BANK ACCOUNTS — Pre-transfer validation (ENG-205)
	// ══════════════════════════════════════════════════════════

	bankAccounts: defineTable({
		ownerType: v.union(
			v.literal("borrower"),
			v.literal("lender"),
			v.literal("investor"),
			v.literal("trust")
		),
		ownerId: v.string(),
		institutionNumber: v.optional(v.string()),
		transitNumber: v.optional(v.string()),
		accountNumber: v.optional(v.string()),
		accountLast4: v.optional(v.string()),
		country: v.optional(v.literal("CA")),
		currency: v.optional(v.literal("CAD")),
		status: v.union(
			v.literal("pending_validation"),
			v.literal("validated"),
			v.literal("revoked"),
			v.literal("rejected")
		),
		validationMethod: v.optional(
			v.union(
				v.literal("manual"),
				v.literal("micro_deposit"),
				v.literal("provider_verified")
			)
		),
		mandateStatus: v.union(
			v.literal("not_required"),
			v.literal("pending"),
			v.literal("active"),
			v.literal("revoked")
		),
		isDefaultInbound: v.optional(v.boolean()),
		isDefaultOutbound: v.optional(v.boolean()),
		createdAt: v.number(),
		updatedAt: v.optional(v.number()),
		metadata: v.optional(v.record(v.string(), v.any())),
	})
		.index("by_owner", ["ownerType", "ownerId"])
		.index("by_status", ["status"]),

	// ══════════════════════════════════════════════════════════
	// DEMO TABLES
	// ══════════════════════════════════════════════════════════

	demo_collection_execution_workspaces: defineTable({
		ownerAuthId: v.string(),
		workspaceKey: v.string(),
		executionMode: collectionExecutionModeValidator,
		paymentRail: providerCodeValidator,
		mortgageId: v.id("mortgages"),
		borrowerId: v.id("borrowers"),
		brokerId: v.id("brokers"),
		propertyId: v.id("properties"),
		bankAccountId: v.id("bankAccounts"),
		externalCollectionScheduleId: v.optional(
			v.id("externalCollectionSchedules")
		),
		currentMonthIndex: v.number(),
		currentDate: v.string(),
		startDate: v.string(),
		createdAt: v.number(),
		updatedAt: v.number(),
		lastAdvancedAt: v.optional(v.number()),
	})
		.index("by_owner_workspace", ["ownerAuthId", "workspaceKey"])
		.index("by_mortgage", ["mortgageId"]),

	demo_collection_external_occurrences: defineTable({
		workspaceId: v.id("demo_collection_execution_workspaces"),
		planEntryId: v.id("collectionPlanEntries"),
		externalCollectionScheduleId: v.id("externalCollectionSchedules"),
		monthIndex: v.number(),
		externalScheduleRef: v.string(),
		externalOccurrenceRef: v.string(),
		providerRef: v.string(),
		scheduledDate: v.string(),
		status: v.union(
			v.literal("Future"),
			v.literal("Pending"),
			v.literal("Approved"),
			v.literal("Declined"),
			v.literal("Chargeback")
		),
		statusReason: v.optional(v.string()),
		lastDeliveredVia: v.optional(externalOccurrenceChannelValidator),
		lastDeliveredAt: v.optional(v.number()),
		history: v.array(
			v.object({
				status: v.union(
					v.literal("Future"),
					v.literal("Pending"),
					v.literal("Approved"),
					v.literal("Declined"),
					v.literal("Chargeback")
				),
				deliveredVia: externalOccurrenceChannelValidator,
				occurredAt: v.number(),
				reason: v.optional(v.string()),
			})
		),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_workspace_month", ["workspaceId", "monthIndex"])
		.index("by_plan_entry", ["planEntryId"])
		.index("by_external_schedule", [
			"externalCollectionScheduleId",
			"monthIndex",
		]),

	products: defineTable({
		title: v.string(),
		imageId: v.string(),
		price: v.number(),
	}),
	todos: defineTable({
		text: v.string(),
		completed: v.boolean(),
	}),
	numbers: defineTable({
		value: v.number(),
	}),

	demo_auth_action_logs: defineTable({
		actionType: v.string(),
		email: v.string(),
		verdict: v.string(),
		message: v.optional(v.string()),
		timestamp: v.number(),
	}),
	demo_presence_messages: defineTable({
		room: v.string(),
		author: v.string(),
		text: v.string(),
	}).index("by_room", ["room"]),

	demo_aggregate_scores: defineTable({
		player: v.string(),
		score: v.number(),
	})
		.index("by_player", ["player"])
		.index("by_score", ["score"]),

	demo_geospatial_places: defineTable({
		name: v.string(),
		latitude: v.number(),
		longitude: v.number(),
		category: v.string(),
	}),

	demo_timeline_notes: defineTable({
		title: v.string(),
		content: v.string(),
		scope: v.string(),
	}),

	demo_audit_documents: defineTable({
		title: v.string(),
		body: v.string(),
		status: v.string(),
	}),

	demo_crons_log: defineTable({
		jobName: v.string(),
		message: v.string(),
		ranAt: v.number(),
	}).index("by_job", ["jobName"]),

	demo_workflow_orders: defineTable({
		amount: v.number(),
		status: v.string(),
		currentStep: v.string(),
	}),

	demo_cascade_authors: defineTable({
		name: v.string(),
	}),
	demo_cascade_posts: defineTable({
		authorId: v.id("demo_cascade_authors"),
		title: v.string(),
	}).index("by_author", ["authorId"]),
	demo_cascade_comments: defineTable({
		postId: v.id("demo_cascade_posts"),
		text: v.string(),
	}).index("by_post", ["postId"]),

	demo_migrations_items: defineTable({
		value: v.string(),
		migrated: v.optional(v.boolean()),
	}),

	demo_api_resources: defineTable({
		name: v.string(),
		isProtected: v.boolean(),
	}),

	demo_files_metadata: defineTable({
		fileName: v.string(),
		path: v.string(),
		storageId: v.optional(v.id("_storage")),
	}),

	demo_triggers_contacts: defineTable({
		firstName: v.string(),
		lastName: v.string(),
		email: v.string(),
		fullName: v.string(),
		category: v.string(),
	}).index("by_email", ["email"]),

	demo_triggers_stats: defineTable({
		category: v.string(),
		count: v.number(),
	}).index("by_category", ["category"]),

	demo_triggers_log: defineTable({
		contactId: v.id("demo_triggers_contacts"),
		operation: v.string(),
		summary: v.string(),
		timestamp: v.number(),
	}),

	demo_fluent_widgets: defineTable({
		name: v.string(),
		createdBy: v.string(),
		createdAt: v.number(),
	}),
	demo_fluent_widget_users: defineTable({
		widgetId: v.id("demo_fluent_widgets"),
		userId: v.string(),
		role: v.string(),
	}).index("by_widget", ["widgetId"]),

	demo_audit_mortgages: defineTable({
		label: v.string(),
		currentOwnerId: v.string(),
		newOwnerId: v.optional(v.string()),
		ownershipPercentage: v.number(),
		status: v.union(
			v.literal("active"),
			v.literal("transfer_initiated"),
			v.literal("transfer_approved"),
			v.literal("transfer_completed"),
			v.literal("transfer_rejected")
		),
		borrowerEmail: v.optional(v.string()),
		borrowerPhone: v.optional(v.string()),
		borrowerSsn: v.optional(v.string()),
		propertyAddress: v.optional(v.string()),
		loanAmount: v.number(),
		updatedBy: v.string(),
		createdAt: v.number(),
		updatedAt: v.number(),
	}).index("by_status", ["status"]),

	// ── Demo Governed Transitions ───────────────────────────────────
	demo_gt_entities: defineTable({
		entityType: v.string(),
		label: v.string(),
		status: v.string(),
		machineContext: v.optional(v.any()),
		lastTransitionAt: v.optional(v.number()),
		data: v.optional(v.any()),
		createdAt: v.number(),
	})
		.index("by_status", ["status"])
		.index("by_type", ["entityType"])
		.index("by_created", ["createdAt"]),

	demo_gt_journal: defineTable({
		entityType: v.string(),
		entityId: v.id("demo_gt_entities"),
		eventType: v.string(),
		payload: v.optional(v.any()),
		previousState: v.string(),
		newState: v.string(),
		outcome: v.union(v.literal("transitioned"), v.literal("rejected")),
		reason: v.optional(v.string()),
		source: v.object({
			channel: v.string(),
			actorId: v.optional(v.string()),
			actorType: v.optional(v.string()),
			sessionId: v.optional(v.string()),
			ip: v.optional(v.string()),
		}),
		machineVersion: v.optional(v.string()),
		timestamp: v.number(),
		effectsScheduled: v.optional(v.array(v.string())),
	})
		.index("by_entity", ["entityId", "timestamp"])
		.index("by_entity_outcome", ["entityId", "outcome", "timestamp"])
		.index("by_outcome", ["outcome", "timestamp"])
		.index("by_actor", ["source.actorId", "timestamp"])
		.index("by_type_and_time", ["entityType", "timestamp"]),

	demo_gt_effects_log: defineTable({
		entityId: v.id("demo_gt_entities"),
		journalEntryId: v.id("demo_gt_journal"),
		effectName: v.string(),
		status: v.union(
			v.literal("scheduled"),
			v.literal("completed"),
			v.literal("failed")
		),
		scheduledAt: v.number(),
		completedAt: v.optional(v.number()),
	})
		.index("by_entity", ["entityId"])
		.index("by_journal", ["journalEntryId"]),

	// ══════════════════════════════════════════════════════════
	// SIMULATION DEMO
	// ══════════════════════════════════════════════════════════

	simulation_clock: defineTable({
		clockId: v.string(), // singleton key, e.g. "simulation"
		currentDate: v.string(), // YYYY-MM-DD
		startedAt: v.number(), // unix timestamp
	}).index("by_clockId", ["clockId"]),

	// ══════════════════════════════════════════════════════════
	// EAV-CRM CONTROL PLANE
	// ══════════════════════════════════════════════════════════

	objectDefs: defineTable({
		orgId: v.string(),
		name: v.string(),
		singularLabel: v.string(),
		pluralLabel: v.string(),
		icon: v.string(),
		description: v.optional(v.string()),
		isSystem: v.boolean(),
		nativeTable: v.optional(v.string()),
		isActive: v.boolean(),
		displayOrder: v.number(),
		createdAt: v.number(),
		updatedAt: v.number(),
		createdBy: v.string(),
	})
		.index("by_org", ["orgId"])
		.index("by_org_name", ["orgId", "name"]),

	fieldDefs: defineTable({
		orgId: v.string(),
		objectDefId: v.id("objectDefs"),
		name: v.string(),
		label: v.string(),
		fieldType: fieldTypeValidator,
		normalizedFieldKind: v.optional(normalizedFieldKindValidator),
		description: v.optional(v.string()),
		isRequired: v.boolean(),
		isUnique: v.boolean(),
		isActive: v.boolean(),
		displayOrder: v.number(),
		defaultValue: v.optional(v.string()),
		options: v.optional(v.array(selectOptionValidator)),
		rendererHint: v.optional(fieldRendererHintValidator),
		relation: v.optional(relationMetadataValidator),
		computed: v.optional(computedFieldMetadataValidator),
		layoutEligibility: v.optional(layoutEligibilityValidator),
		aggregation: v.optional(aggregationEligibilityValidator),
		editability: v.optional(editabilityMetadataValidator),
		isVisibleByDefault: v.optional(v.boolean()),
		nativeColumnPath: v.optional(v.string()),
		nativeReadOnly: v.boolean(),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_object", ["objectDefId"])
		.index("by_object_name", ["objectDefId", "name"])
		.index("by_org", ["orgId"]),

	fieldCapabilities: defineTable({
		fieldDefId: v.id("fieldDefs"),
		objectDefId: v.id("objectDefs"),
		capability: capabilityValidator,
	})
		.index("by_field", ["fieldDefId"])
		.index("by_object_capability", ["objectDefId", "capability"]),

	linkTypeDefs: defineTable({
		orgId: v.string(),
		name: v.string(),
		sourceObjectDefId: v.id("objectDefs"),
		targetObjectDefId: v.id("objectDefs"),
		cardinality: cardinalityValidator,
		isActive: v.boolean(),
		createdAt: v.number(),
	})
		.index("by_org", ["orgId"])
		.index("by_source_object", ["sourceObjectDefId"])
		.index("by_target_object", ["targetObjectDefId"])
		.index("by_org_source_object", ["orgId", "sourceObjectDefId"])
		.index("by_org_target_object", ["orgId", "targetObjectDefId"]),

	viewDefs: defineTable({
		orgId: v.string(),
		objectDefId: v.id("objectDefs"),
		name: v.string(),
		viewType: viewTypeValidator,
		boundFieldId: v.optional(v.id("fieldDefs")),
		groupByFieldId: v.optional(v.id("fieldDefs")),
		aggregatePresets: v.optional(v.array(aggregatePresetValidator)),
		disabledLayoutMessages: v.optional(viewLayoutMessagesValidator),
		isDefault: v.boolean(),
		needsRepair: v.boolean(),
		createdAt: v.number(),
		updatedAt: v.number(),
		createdBy: v.string(),
	})
		.index("by_object", ["objectDefId"])
		.index("by_org", ["orgId"]),

	viewFields: defineTable({
		viewDefId: v.id("viewDefs"),
		fieldDefId: v.id("fieldDefs"),
		isVisible: v.boolean(),
		displayOrder: v.number(),
		width: v.optional(v.number()),
	})
		.index("by_view", ["viewDefId"])
		.index("by_field", ["fieldDefId"]),

	viewFilters: defineTable({
		viewDefId: v.id("viewDefs"),
		fieldDefId: v.id("fieldDefs"),
		operator: filterOperatorValidator,
		value: v.optional(v.string()),
		logicalOperator: v.optional(logicalOperatorValidator),
	})
		.index("by_view", ["viewDefId"])
		.index("by_field", ["fieldDefId"]),

	viewKanbanGroups: defineTable({
		viewDefId: v.id("viewDefs"),
		fieldDefId: v.id("fieldDefs"),
		optionValue: v.string(),
		displayOrder: v.number(),
		isCollapsed: v.boolean(),
	})
		.index("by_view", ["viewDefId"])
		.index("by_field", ["fieldDefId"]),

	userSavedViews: defineTable({
		orgId: v.string(),
		objectDefId: v.id("objectDefs"),
		ownerAuthId: v.string(),
		sourceViewDefId: v.optional(v.id("viewDefs")),
		name: v.string(),
		viewType: viewTypeValidator,
		visibleFieldIds: v.array(v.id("fieldDefs")),
		fieldOrder: v.array(v.id("fieldDefs")),
		filters: v.optional(v.array(savedViewFilterValidator)),
		filtersJson: v.optional(v.string()),
		groupByFieldId: v.optional(v.id("fieldDefs")),
		aggregatePresets: v.optional(v.array(aggregatePresetValidator)),
		isDefault: v.boolean(),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_org_owner_object", ["orgId", "ownerAuthId", "objectDefId"])
		.index("by_owner_object", ["ownerAuthId", "objectDefId"])
		.index("by_org_owner_object_default", [
			"orgId",
			"ownerAuthId",
			"objectDefId",
			"isDefault",
		])
		.index("by_owner_object_default", [
			"ownerAuthId",
			"objectDefId",
			"isDefault",
		])
		.index("by_org", ["orgId"])
		.index("by_source_view", ["sourceViewDefId"]),

	// ══════════════════════════════════════════════════════════
	// EAV-CRM DATA PLANE
	// ══════════════════════════════════════════════════════════

	records: defineTable({
		orgId: v.string(),
		objectDefId: v.id("objectDefs"),
		labelValue: v.optional(v.string()),
		isDeleted: v.boolean(),
		createdAt: v.number(),
		updatedAt: v.number(),
		createdBy: v.string(),
	})
		.index("by_object", ["objectDefId"])
		.index("by_org_object", ["orgId", "objectDefId"])
		.index("by_org_label", ["orgId", "labelValue"])
		.searchIndex("search_label", {
			searchField: "labelValue",
			filterFields: ["orgId", "objectDefId", "isDeleted"],
		}),

	recordValuesText: defineTable({
		recordId: v.id("records"),
		fieldDefId: v.id("fieldDefs"),
		objectDefId: v.id("objectDefs"),
		value: v.string(),
	})
		.index("by_record", ["recordId"])
		.index("by_record_field", ["recordId", "fieldDefId"])
		.index("by_object_field_value", ["objectDefId", "fieldDefId", "value"]),

	recordValuesNumber: defineTable({
		recordId: v.id("records"),
		fieldDefId: v.id("fieldDefs"),
		objectDefId: v.id("objectDefs"),
		value: v.number(),
	})
		.index("by_record", ["recordId"])
		.index("by_record_field", ["recordId", "fieldDefId"])
		.index("by_object_field_value", ["objectDefId", "fieldDefId", "value"]),

	recordValuesBoolean: defineTable({
		recordId: v.id("records"),
		fieldDefId: v.id("fieldDefs"),
		objectDefId: v.id("objectDefs"),
		value: v.boolean(),
	})
		.index("by_record", ["recordId"])
		.index("by_record_field", ["recordId", "fieldDefId"])
		.index("by_object_field_value", ["objectDefId", "fieldDefId", "value"]),

	recordValuesDate: defineTable({
		recordId: v.id("records"),
		fieldDefId: v.id("fieldDefs"),
		objectDefId: v.id("objectDefs"),
		value: v.number(),
	})
		.index("by_record", ["recordId"])
		.index("by_record_field", ["recordId", "fieldDefId"])
		.index("by_object_field_value", ["objectDefId", "fieldDefId", "value"]),

	recordValuesSelect: defineTable({
		recordId: v.id("records"),
		fieldDefId: v.id("fieldDefs"),
		objectDefId: v.id("objectDefs"),
		value: v.string(),
	})
		.index("by_record", ["recordId"])
		.index("by_record_field", ["recordId", "fieldDefId"])
		.index("by_object_field_value", ["objectDefId", "fieldDefId", "value"]),

	// EXCEPTION: No by_object_field_value — Convex arrays aren't indexable
	recordValuesMultiSelect: defineTable({
		recordId: v.id("records"),
		fieldDefId: v.id("fieldDefs"),
		objectDefId: v.id("objectDefs"),
		value: v.array(v.string()),
	})
		.index("by_record", ["recordId"])
		.index("by_record_field", ["recordId", "fieldDefId"]),

	recordValuesRichText: defineTable({
		recordId: v.id("records"),
		fieldDefId: v.id("fieldDefs"),
		objectDefId: v.id("objectDefs"),
		value: v.string(),
	})
		.index("by_record", ["recordId"])
		.index("by_record_field", ["recordId", "fieldDefId"])
		.index("by_object_field_value", ["objectDefId", "fieldDefId", "value"]),

	recordValuesUserRef: defineTable({
		recordId: v.id("records"),
		fieldDefId: v.id("fieldDefs"),
		objectDefId: v.id("objectDefs"),
		value: v.string(),
	})
		.index("by_record", ["recordId"])
		.index("by_record_field", ["recordId", "fieldDefId"])
		.index("by_object_field_value", ["objectDefId", "fieldDefId", "value"]),

	recordLinks: defineTable({
		orgId: v.string(),
		linkTypeDefId: v.id("linkTypeDefs"),
		sourceObjectDefId: v.id("objectDefs"),
		sourceKind: entityKindValidator,
		sourceId: v.string(),
		targetObjectDefId: v.id("objectDefs"),
		targetKind: entityKindValidator,
		targetId: v.string(),
		isDeleted: v.boolean(),
		createdAt: v.number(),
		createdBy: v.string(),
	})
		.index("by_source", ["sourceKind", "sourceId"])
		.index("by_target", ["targetKind", "targetId"])
		.index("by_link_type", ["linkTypeDefId"])
		.index("by_org_source", ["orgId", "sourceKind", "sourceId"])
		.index("by_org_target", ["orgId", "targetKind", "targetId"])
		.index("by_org", ["orgId"]),
});
