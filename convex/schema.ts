import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
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
		brokerageOrgId: v.optional(v.string()),

		// ─── Lifecycle ───
		onboardedAt: v.optional(v.number()),
		createdAt: v.number(),
	})
		.index("by_user", ["userId"])
		.index("by_license", ["licenseId"])
		.index("by_status", ["status"]),

	borrowers: defineTable({
		// ─── GT fields ───
		status: v.string(),
		lastTransitionAt: v.optional(v.number()),

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
		.index("by_status", ["status"]),

	lenders: defineTable({
		// ─── Auth link ───
		userId: v.id("users"),

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
	})
		.index("by_user", ["userId"])
		.index("by_broker", ["brokerId"])
		.index("by_status", ["status"]),

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
		.index("by_simulation", ["simulationId"]),

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

	obligations: defineTable({
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
		sourceObligationId: v.optional(v.id("obligations")), // for late_fee type
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
		.index("by_borrower", ["borrowerId"]),

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
		obligationIds: v.array(v.id("obligations")),
		amount: v.number(), // cents
		method: v.string(), // "manual", "mock_pad", "rotessa_pad"
		scheduledDate: v.number(), // unix timestamp
		status: v.union(
			v.literal("planned"),
			v.literal("executing"),
			v.literal("completed"),
			v.literal("cancelled"),
			v.literal("rescheduled")
		),
		source: v.union(
			v.literal("default_schedule"),
			v.literal("retry_rule"),
			v.literal("late_fee_rule"),
			v.literal("admin")
		),
		ruleId: v.optional(v.id("collectionRules")),
		rescheduledFromId: v.optional(v.id("collectionPlanEntries")),
		createdAt: v.number(),
	})
		.index("by_scheduled_date", ["scheduledDate", "status"])
		.index("by_status", ["status"])
		.index("by_rescheduled_from", ["rescheduledFromId", "source"]),

	collectionRules: defineTable({
		name: v.string(),
		trigger: v.union(v.literal("schedule"), v.literal("event")),
		condition: v.optional(v.any()),
		action: v.string(),
		parameters: v.optional(v.any()), // rule-specific config
		priority: v.number(),
		enabled: v.boolean(),
		createdAt: v.number(),
		updatedAt: v.number(),
	}).index("by_trigger", ["trigger", "enabled", "priority"]),

	collectionAttempts: defineTable({
		// ─── GT fields ───
		status: v.string(),
		machineContext: v.optional(v.any()),
		lastTransitionAt: v.optional(v.number()), // system timestamp: Unix ms
		// ─── Domain fields ───
		planEntryId: v.id("collectionPlanEntries"),
		method: v.string(),
		amount: v.number(), // cents
		providerRef: v.optional(v.string()),
		providerStatus: v.optional(v.string()),
		providerData: v.optional(v.any()),
		initiatedAt: v.number(), // system timestamp: Unix ms
		settledAt: v.optional(v.number()), // system timestamp: Unix ms
		failedAt: v.optional(v.number()), // system timestamp: Unix ms
		failureReason: v.optional(v.string()),
	})
		.index("by_plan_entry", ["planEntryId"])
		.index("by_status", ["status"])
		.index("by_provider_ref", ["providerRef"]),

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
		lawyerId: v.optional(v.string()),
		reservationId: v.optional(v.id("ledger_reservations")),
		lawyerType: v.optional(
			v.union(v.literal("platform_lawyer"), v.literal("guest_lawyer"))
		),
		createdAt: v.number(),
		createdBy: v.string(),
	})
		.index("by_status", ["status"])
		.index("by_mortgage", ["mortgageId"])
		.index("by_buyer", ["buyerId"])
		.index("by_seller", ["sellerId"]),

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
		mortgageId: v.id("mortgages"),
		lenderId: v.id("lenders"),
		lenderAccountId: v.id("ledger_accounts"),
		amount: v.number(),
		dispersalDate: v.string(), // business date: YYYY-MM-DD at UTC midnight semantics
		obligationId: v.id("obligations"),
		servicingFeeDeducted: v.number(),
		status: dispersalStatusValidator,
		idempotencyKey: v.string(),
		calculationDetails: calculationDetailsValidator,
		mortgageFeeId: v.optional(v.id("mortgageFees")),
		feeCode: v.optional(feeCodeValidator),
		createdAt: v.number(), // system timestamp: Unix ms
	})
		.index("by_lender", ["lenderId", "dispersalDate"])
		.index("by_mortgage", ["mortgageId", "dispersalDate"])
		.index("by_obligation", ["obligationId"])
		.index("by_status", ["status", "lenderId"])
		.index("by_idempotency", ["idempotencyKey"]),

	servicingFeeEntries: defineTable({
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
		.index("by_obligation", ["obligationId"]),

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
		entityType: entityTypeValidator,
		entityId: v.string(),
		eventType: v.string(),
		payload: v.optional(v.any()),
		previousState: v.string(),
		newState: v.string(),
		outcome: v.union(v.literal("transitioned"), v.literal("rejected")),
		reason: v.optional(v.string()),
		actorId: v.string(),
		actorType: v.optional(actorTypeValidator),
		channel: channelValidator,
		ip: v.optional(v.string()),
		sessionId: v.optional(v.string()),
		machineVersion: v.optional(v.string()),
		effectsScheduled: v.optional(v.array(v.string())),
		timestamp: v.number(),
	})
		.index("by_entity", ["entityType", "entityId", "timestamp"])
		.index("by_actor", ["actorId", "timestamp"])
		.index("by_type_and_time", ["entityType", "timestamp"]),

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
	// TRANSFER REQUESTS (stub — populated by ENG-190)
	// ══════════════════════════════════════════════════════════

	transferRequests: defineTable({
		status: v.union(
			v.literal("pending"),
			v.literal("approved"),
			v.literal("processing"),
			v.literal("completed"),
			v.literal("confirmed"),
			v.literal("reversed"),
			v.literal("failed"),
			v.literal("cancelled")
		),
		direction: v.optional(v.union(v.literal("inbound"), v.literal("outbound"))),
		transferType: v.optional(v.string()),
		amount: v.optional(v.number()),
		currency: v.optional(v.string()),
		mortgageId: v.optional(v.id("mortgages")),
		obligationId: v.optional(v.id("obligations")),
		lenderId: v.optional(v.id("lenders")),
		borrowerId: v.optional(v.id("borrowers")),
		dispersalEntryId: v.optional(v.id("dispersalEntries")),
		confirmedAt: v.optional(v.number()),
		reversedAt: v.optional(v.number()),
		createdAt: v.number(),
	})
		.index("by_status", ["status"])
		.index("by_status_and_direction", ["status", "direction"])
		.index("by_mortgage", ["mortgageId", "status"])
		.index("by_obligation", ["obligationId"])
		.index("by_dispersal_entry", ["dispersalEntryId"]),

	// ══════════════════════════════════════════════════════════
	// DEMO TABLES
	// ══════════════════════════════════════════════════════════

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
});
