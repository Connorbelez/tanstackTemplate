import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { internalMutation } from "../../_generated/server";
import { auditLog } from "../../auditLog";
import { crmAdminMutation } from "../../fluent";
import {
	deriveCapabilities,
	deriveFieldContractMetadata,
} from "../metadataCompiler";

// ── T-001: SystemObjectConfig type ───────────────────────────────────

type FieldType = Doc<"fieldDefs">["fieldType"];

interface SelectOption {
	color: string;
	label: string;
	order: number;
	value: string;
}

interface FieldConfig {
	fieldType: FieldType;
	isVisibleByDefault?: boolean;
	label: string;
	name: string;
	nativeColumnPath: string;
	options?: SelectOption[];
}

export interface SystemObjectConfig {
	defaultAggregatePresetFieldNames?: readonly string[];
	defaultVisibleFieldNames?: readonly string[];
	description: string;
	fields: FieldConfig[];
	icon: string;
	name: string;
	nativeTable: string;
	pluralLabel: string;
	singularLabel: string;
}

// ── Helpers ──────────────────────────────────────────────────────────

/** Title-case a snake_case value: "bi_weekly" → "Bi-Weekly" */
function titleCase(value: string): string {
	return value
		.split("_")
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join("-");
}

/** Build select options from string values with a color map. */
function opts(
	values: string[],
	colorMap: Record<string, string>
): SelectOption[] {
	return values.map((value, index) => ({
		value,
		label: titleCase(value),
		color: colorMap[value] ?? "#6b7280",
		order: index,
	}));
}

// ── Color Palettes ───────────────────────────────────────────────────
// Traffic-light for status fields; neutrals for non-status selects.

const MORTGAGE_STATUS_COLORS: Record<string, string> = {
	active: "#22c55e",
	delinquent: "#eab308",
	defaulted: "#ef4444",
	collections: "#f97316",
	written_off: "#6b7280",
	matured: "#3b82f6",
};

const MOST_RECENT_PAYMENT_STATUS_COLORS: Record<string, string> = {
	settled: "#22c55e",
	processing: "#3b82f6",
	failed: "#ef4444",
	reversed: "#f97316",
	cancelled: "#6b7280",
	none: "#94a3b8",
};

const NEXT_UPCOMING_PAYMENT_STATUS_COLORS: Record<string, string> = {
	planned: "#3b82f6",
	provider_scheduled: "#0ea5e9",
	executing: "#8b5cf6",
	due: "#f59e0b",
	overdue: "#ef4444",
	none: "#94a3b8",
};

const PAYMENT_FREQUENCY_COLORS: Record<string, string> = {
	monthly: "#3b82f6",
	bi_weekly: "#8b5cf6",
	accelerated_bi_weekly: "#a855f7",
	weekly: "#6366f1",
};

const LOAN_TYPE_COLORS: Record<string, string> = {
	conventional: "#3b82f6",
	insured: "#8b5cf6",
	high_ratio: "#f97316",
};

const BORROWER_STATUS_COLORS: Record<string, string> = {
	active: "#22c55e",
};

const IDV_STATUS_COLORS: Record<string, string> = {
	verified: "#22c55e",
	pending_review: "#eab308",
	manual_review_required: "#f97316",
};

const ACCREDITATION_COLORS: Record<string, string> = {
	pending: "#eab308",
	accredited: "#22c55e",
	exempt: "#3b82f6",
	rejected: "#ef4444",
};

const LENDER_STATUS_COLORS: Record<string, string> = {
	active: "#22c55e",
	pending_activation: "#eab308",
};

const PAYOUT_FREQUENCY_COLORS: Record<string, string> = {
	monthly: "#3b82f6",
	bi_weekly: "#8b5cf6",
	weekly: "#6366f1",
	on_demand: "#f97316",
};

const BROKER_STATUS_COLORS: Record<string, string> = {
	active: "#22c55e",
};

const LISTING_STATUS_COLORS: Record<string, string> = {
	draft: "#6b7280",
	published: "#22c55e",
	delisted: "#ef4444",
};

const PROPERTY_TYPE_COLORS: Record<string, string> = {
	residential: "#3b82f6",
	commercial: "#8b5cf6",
	multi_unit: "#f97316",
	condo: "#0ea5e9",
};

const DEAL_STATUS_COLORS: Record<string, string> = {
	initiated: "#6b7280",
	lawyerOnboarding: "#3b82f6",
	documentReview: "#8b5cf6",
	fundsTransfer: "#eab308",
	confirmed: "#22c55e",
	failed: "#ef4444",
};

const OBLIGATION_TYPE_COLORS: Record<string, string> = {
	regular_interest: "#3b82f6",
	arrears_cure: "#f97316",
	late_fee: "#ef4444",
	principal_repayment: "#8b5cf6",
};

const OBLIGATION_STATUS_COLORS: Record<string, string> = {
	upcoming: "#6b7280",
	due: "#eab308",
	overdue: "#ef4444",
	partially_settled: "#f97316",
	settled: "#22c55e",
	waived: "#3b82f6",
};

// ── T-002: SYSTEM_OBJECT_CONFIGS ─────────────────────────────────────

export const SYSTEM_OBJECT_CONFIGS: readonly SystemObjectConfig[] = [
	{
		name: "mortgage",
		singularLabel: "Mortgage",
		pluralLabel: "Mortgages",
		icon: "building-2",
		description:
			"Mortgage instruments with terms, rates, and payment schedules",
		nativeTable: "mortgages",
		defaultVisibleFieldNames: [
			"principal",
			"interestRate",
			"mostRecentPaymentStatus",
			"nextUpcomingPaymentDate",
			"loanType",
			"maturityDate",
			"status",
		],
		defaultAggregatePresetFieldNames: ["principal", "paymentAmount"],
		fields: [
			{
				name: "propertyId",
				label: "Property ID",
				fieldType: "text",
				nativeColumnPath: "propertyId",
			},
			{
				name: "principal",
				label: "Principal",
				fieldType: "currency",
				nativeColumnPath: "principal",
			},
			{
				name: "interestRate",
				label: "Interest Rate",
				fieldType: "percentage",
				nativeColumnPath: "interestRate",
			},
			{
				name: "termMonths",
				label: "Term (Months)",
				fieldType: "number",
				nativeColumnPath: "termMonths",
			},
			{
				name: "maturityDate",
				label: "Maturity Date",
				fieldType: "date",
				nativeColumnPath: "maturityDate",
			},
			{
				name: "status",
				label: "Status",
				fieldType: "select",
				nativeColumnPath: "status",
				options: opts(
					[
						"active",
						"delinquent",
						"defaulted",
						"collections",
						"written_off",
						"matured",
					],
					MORTGAGE_STATUS_COLORS
				),
			},
			{
				name: "paymentAmount",
				label: "Payment Amount",
				fieldType: "currency",
				nativeColumnPath: "paymentAmount",
			},
			{
				name: "rateType",
				label: "Rate Type",
				fieldType: "text",
				nativeColumnPath: "rateType",
			},
			{
				name: "paymentFrequency",
				label: "Payment Frequency",
				fieldType: "select",
				nativeColumnPath: "paymentFrequency",
				options: opts(
					["monthly", "bi_weekly", "accelerated_bi_weekly", "weekly"],
					PAYMENT_FREQUENCY_COLORS
				),
			},
			{
				name: "mostRecentPaymentStatus",
				label: "Most Recent Payment",
				fieldType: "select",
				nativeColumnPath: "__snapshot__.mostRecentPaymentStatus",
				options: opts(
					["settled", "processing", "failed", "reversed", "cancelled", "none"],
					MOST_RECENT_PAYMENT_STATUS_COLORS
				),
			},
			{
				name: "mostRecentPaymentDate",
				label: "Most Recent Payment Date",
				fieldType: "datetime",
				nativeColumnPath: "__snapshot__.mostRecentPaymentDate",
			},
			{
				name: "mostRecentPaymentAmount",
				label: "Most Recent Payment Amount",
				fieldType: "currency",
				nativeColumnPath: "__snapshot__.mostRecentPaymentAmount",
			},
			{
				name: "nextUpcomingPaymentDate",
				label: "Next Upcoming Payment",
				fieldType: "date",
				nativeColumnPath: "__snapshot__.nextUpcomingPaymentDate",
			},
			{
				name: "nextUpcomingPaymentAmount",
				label: "Next Upcoming Payment Amount",
				fieldType: "currency",
				nativeColumnPath: "__snapshot__.nextUpcomingPaymentAmount",
			},
			{
				name: "nextUpcomingPaymentStatus",
				label: "Next Upcoming Payment Status",
				fieldType: "select",
				nativeColumnPath: "__snapshot__.nextUpcomingPaymentStatus",
				options: opts(
					[
						"planned",
						"provider_scheduled",
						"executing",
						"due",
						"overdue",
						"none",
					],
					NEXT_UPCOMING_PAYMENT_STATUS_COLORS
				),
			},
			{
				name: "loanType",
				label: "Loan Type",
				fieldType: "select",
				nativeColumnPath: "loanType",
				options: opts(
					["conventional", "insured", "high_ratio"],
					LOAN_TYPE_COLORS
				),
			},
			{
				name: "lienPosition",
				label: "Lien Position",
				fieldType: "number",
				nativeColumnPath: "lienPosition",
			},
			{
				name: "firstPaymentDate",
				label: "First Payment Date",
				fieldType: "date",
				nativeColumnPath: "firstPaymentDate",
			},
		],
	},
	{
		name: "borrower",
		singularLabel: "Borrower",
		pluralLabel: "Borrowers",
		icon: "user",
		description: "Borrowers with identity verification and status tracking",
		nativeTable: "borrowers",
		defaultVisibleFieldNames: ["status", "idvStatus"],
		fields: [
			{
				name: "userId",
				label: "User ID",
				fieldType: "text",
				nativeColumnPath: "userId",
			},
			{
				name: "status",
				label: "Status",
				fieldType: "select",
				nativeColumnPath: "status",
				options: opts(["active"], BORROWER_STATUS_COLORS),
			},
			{
				name: "idvStatus",
				label: "IDV Status",
				fieldType: "select",
				nativeColumnPath: "idvStatus",
				options: opts(
					["verified", "pending_review", "manual_review_required"],
					IDV_STATUS_COLORS
				),
			},
			{
				name: "onboardedAt",
				label: "Onboarded At",
				fieldType: "datetime",
				nativeColumnPath: "onboardedAt",
			},
		],
	},
	{
		name: "lender",
		singularLabel: "Lender",
		pluralLabel: "Lenders",
		icon: "landmark",
		description: "Lenders with accreditation and payout configuration",
		nativeTable: "lenders",
		fields: [
			{
				name: "userId",
				label: "User ID",
				fieldType: "text",
				nativeColumnPath: "userId",
			},
			{
				name: "brokerId",
				label: "Broker ID",
				fieldType: "text",
				nativeColumnPath: "brokerId",
			},
			{
				name: "orgId",
				label: "Organization ID",
				fieldType: "text",
				nativeColumnPath: "orgId",
			},
			{
				name: "accreditationStatus",
				label: "Accreditation Status",
				fieldType: "select",
				nativeColumnPath: "accreditationStatus",
				options: opts(
					["pending", "accredited", "exempt", "rejected"],
					ACCREDITATION_COLORS
				),
			},
			{
				name: "idvStatus",
				label: "IDV Status",
				fieldType: "select",
				nativeColumnPath: "idvStatus",
				options: opts(
					["verified", "pending_review", "manual_review_required"],
					IDV_STATUS_COLORS
				),
			},
			{
				name: "kycStatus",
				label: "KYC Status",
				fieldType: "text",
				nativeColumnPath: "kycStatus",
			},
			{
				name: "onboardingEntryPath",
				label: "Onboarding Path",
				fieldType: "text",
				nativeColumnPath: "onboardingEntryPath",
			},
			{
				name: "onboardingId",
				label: "Onboarding Request ID",
				fieldType: "text",
				nativeColumnPath: "onboardingId",
			},
			{
				name: "personaInquiryId",
				label: "Persona Inquiry ID",
				fieldType: "text",
				nativeColumnPath: "personaInquiryId",
			},
			{
				name: "status",
				label: "Status",
				fieldType: "select",
				nativeColumnPath: "status",
				options: opts(["active", "pending_activation"], LENDER_STATUS_COLORS),
			},
			{
				name: "activatedAt",
				label: "Activated At",
				fieldType: "datetime",
				nativeColumnPath: "activatedAt",
			},
			{
				name: "createdAt",
				label: "Created At",
				fieldType: "datetime",
				nativeColumnPath: "createdAt",
			},
			{
				name: "payoutFrequency",
				label: "Payout Frequency",
				fieldType: "select",
				nativeColumnPath: "payoutFrequency",
				options: opts(
					["monthly", "bi_weekly", "weekly", "on_demand"],
					PAYOUT_FREQUENCY_COLORS
				),
			},
			{
				name: "lastPayoutDate",
				label: "Last Payout Date",
				fieldType: "date",
				nativeColumnPath: "lastPayoutDate",
			},
			{
				name: "minimumPayoutCents",
				label: "Minimum Payout",
				fieldType: "currency",
				nativeColumnPath: "minimumPayoutCents",
			},
		],
	},
	{
		name: "broker",
		singularLabel: "Broker",
		pluralLabel: "Brokers",
		icon: "briefcase",
		description: "Mortgage brokers with licensing and brokerage details",
		nativeTable: "brokers",
		fields: [
			{
				name: "userId",
				label: "User ID",
				fieldType: "text",
				nativeColumnPath: "userId",
			},
			{
				name: "orgId",
				label: "Organization ID",
				fieldType: "text",
				nativeColumnPath: "orgId",
			},
			{
				name: "status",
				label: "Status",
				fieldType: "select",
				nativeColumnPath: "status",
				options: opts(["active"], BROKER_STATUS_COLORS),
			},
			{
				name: "licenseId",
				label: "License ID",
				fieldType: "text",
				nativeColumnPath: "licenseId",
			},
			{
				name: "licenseProvince",
				label: "License Province",
				fieldType: "text",
				nativeColumnPath: "licenseProvince",
			},
			{
				name: "brokerageName",
				label: "Brokerage Name",
				fieldType: "text",
				nativeColumnPath: "brokerageName",
			},
			{
				name: "lastTransitionAt",
				label: "Last Transition At",
				fieldType: "datetime",
				nativeColumnPath: "lastTransitionAt",
			},
			{
				name: "onboardedAt",
				label: "Onboarded At",
				fieldType: "datetime",
				nativeColumnPath: "onboardedAt",
			},
			{
				name: "createdAt",
				label: "Created At",
				fieldType: "datetime",
				nativeColumnPath: "createdAt",
			},
		],
	},
	{
		name: "listing",
		singularLabel: "Listing",
		pluralLabel: "Listings",
		icon: "box",
		description:
			"Marketplace listings with denormalized economics, publication state, and property context",
		nativeTable: "listings",
		defaultVisibleFieldNames: [
			"title",
			"status",
			"propertyType",
			"city",
			"province",
			"principal",
			"interestRate",
			"ltvRatio",
			"monthlyPayment",
			"latestAppraisalValueAsIs",
			"maturityDate",
		],
		defaultAggregatePresetFieldNames: ["principal", "latestAppraisalValueAsIs"],
		fields: [
			{
				name: "mortgageId",
				label: "Mortgage ID",
				fieldType: "text",
				nativeColumnPath: "mortgageId",
			},
			{
				name: "propertyId",
				label: "Property ID",
				fieldType: "text",
				nativeColumnPath: "propertyId",
			},
			{
				name: "title",
				label: "Title",
				fieldType: "text",
				nativeColumnPath: "title",
			},
			{
				name: "status",
				label: "Status",
				fieldType: "select",
				nativeColumnPath: "status",
				options: opts(
					["draft", "published", "delisted"],
					LISTING_STATUS_COLORS
				),
			},
			{
				name: "propertyType",
				label: "Property Type",
				fieldType: "select",
				nativeColumnPath: "propertyType",
				options: opts(["residential", "commercial", "multi_unit", "condo"], {
					residential: "#3b82f6",
					commercial: "#8b5cf6",
					multi_unit: "#f97316",
					condo: "#0ea5e9",
				}),
			},
			{
				name: "city",
				label: "City",
				fieldType: "text",
				nativeColumnPath: "city",
			},
			{
				name: "province",
				label: "Province",
				fieldType: "text",
				nativeColumnPath: "province",
			},
			{
				name: "principal",
				label: "Principal",
				fieldType: "currency",
				nativeColumnPath: "principal",
			},
			{
				name: "interestRate",
				label: "Interest Rate",
				fieldType: "percentage",
				nativeColumnPath: "interestRate",
			},
			{
				name: "ltvRatio",
				label: "LTV",
				fieldType: "percentage",
				nativeColumnPath: "ltvRatio",
			},
			{
				name: "monthlyPayment",
				label: "Monthly Payment",
				fieldType: "currency",
				nativeColumnPath: "monthlyPayment",
			},
			{
				name: "maturityDate",
				label: "Maturity Date",
				fieldType: "date",
				nativeColumnPath: "maturityDate",
			},
			{
				name: "loanType",
				label: "Loan Type",
				fieldType: "select",
				nativeColumnPath: "loanType",
				options: opts(
					["conventional", "insured", "high_ratio"],
					LOAN_TYPE_COLORS
				),
			},
			{
				name: "lienPosition",
				label: "Lien Position",
				fieldType: "number",
				nativeColumnPath: "lienPosition",
			},
			{
				name: "latestAppraisalValueAsIs",
				label: "Latest Appraisal",
				fieldType: "currency",
				nativeColumnPath: "latestAppraisalValueAsIs",
			},
			{
				name: "latestAppraisalDate",
				label: "Appraisal Date",
				fieldType: "date",
				nativeColumnPath: "latestAppraisalDate",
			},
			{
				name: "featured",
				label: "Featured",
				fieldType: "boolean",
				nativeColumnPath: "featured",
			},
			{
				name: "publishedAt",
				label: "Published At",
				fieldType: "datetime",
				nativeColumnPath: "publishedAt",
			},
		],
	},
	{
		name: "deal",
		singularLabel: "Deal",
		pluralLabel: "Deals",
		icon: "handshake",
		description:
			"Fractional mortgage deals from initiation through confirmation",
		nativeTable: "deals",
		fields: [
			{
				name: "fractionalShare",
				label: "Fractional Share",
				fieldType: "percentage",
				nativeColumnPath: "fractionalShare",
			},
			{
				name: "closingDate",
				label: "Closing Date",
				fieldType: "date",
				nativeColumnPath: "closingDate",
			},
			{
				name: "status",
				label: "Status",
				fieldType: "select",
				nativeColumnPath: "status",
				options: opts(
					[
						"initiated",
						"lawyerOnboarding",
						"documentReview",
						"fundsTransfer",
						"confirmed",
						"failed",
					],
					DEAL_STATUS_COLORS
				),
			},
			{
				name: "lockingFeeAmount",
				label: "Locking Fee Amount",
				fieldType: "currency",
				nativeColumnPath: "lockingFeeAmount",
			},
		],
	},
	{
		name: "obligation",
		singularLabel: "Obligation",
		pluralLabel: "Obligations",
		icon: "calendar-clock",
		description: "Payment obligations including interest, fees, and principal",
		nativeTable: "obligations",
		defaultVisibleFieldNames: [
			"paymentNumber",
			"type",
			"amount",
			"dueDate",
			"status",
		],
		defaultAggregatePresetFieldNames: ["amount", "amountSettled"],
		fields: [
			{
				name: "mortgageId",
				label: "Mortgage ID",
				fieldType: "text",
				nativeColumnPath: "mortgageId",
			},
			{
				name: "borrowerId",
				label: "Borrower ID",
				fieldType: "text",
				nativeColumnPath: "borrowerId",
			},
			{
				name: "paymentNumber",
				label: "Payment Number",
				fieldType: "number",
				nativeColumnPath: "paymentNumber",
			},
			{
				name: "type",
				label: "Type",
				fieldType: "select",
				nativeColumnPath: "type",
				options: opts(
					[
						"regular_interest",
						"arrears_cure",
						"late_fee",
						"principal_repayment",
					],
					OBLIGATION_TYPE_COLORS
				),
			},
			{
				name: "amount",
				label: "Amount",
				fieldType: "currency",
				nativeColumnPath: "amount",
			},
			{
				name: "amountSettled",
				label: "Amount Settled",
				fieldType: "currency",
				nativeColumnPath: "amountSettled",
			},
			{
				name: "dueDate",
				label: "Due Date",
				fieldType: "date",
				nativeColumnPath: "dueDate",
			},
			{
				name: "status",
				label: "Status",
				fieldType: "select",
				nativeColumnPath: "status",
				options: opts(
					[
						"upcoming",
						"due",
						"overdue",
						"partially_settled",
						"settled",
						"waived",
					],
					OBLIGATION_STATUS_COLORS
				),
			},
			{
				name: "gracePeriodEnd",
				label: "Grace Period End",
				fieldType: "date",
				nativeColumnPath: "gracePeriodEnd",
			},
			{
				name: "settledAt",
				label: "Settled At",
				fieldType: "datetime",
				nativeColumnPath: "settledAt",
			},
		],
	},
	{
		name: "property",
		singularLabel: "Property",
		pluralLabel: "Properties",
		icon: "building-2",
		description:
			"Real-estate collateral — structured addresses, legal identifiers, and classification shared across the FairLend marketplace",
		nativeTable: "properties",
		defaultVisibleFieldNames: [
			"streetAddress",
			"city",
			"province",
			"postalCode",
			"propertyType",
		],
		fields: [
			{
				name: "streetAddress",
				label: "Street Address",
				fieldType: "text",
				nativeColumnPath: "streetAddress",
			},
			{
				name: "unit",
				label: "Unit",
				fieldType: "text",
				nativeColumnPath: "unit",
			},
			{
				name: "city",
				label: "City",
				fieldType: "text",
				nativeColumnPath: "city",
			},
			{
				name: "province",
				label: "Province",
				fieldType: "text",
				nativeColumnPath: "province",
			},
			{
				name: "postalCode",
				label: "Postal Code",
				fieldType: "text",
				nativeColumnPath: "postalCode",
			},
			{
				name: "propertyType",
				label: "Property Type",
				fieldType: "select",
				nativeColumnPath: "propertyType",
				options: opts(
					["residential", "commercial", "multi_unit", "condo"],
					PROPERTY_TYPE_COLORS
				),
			},
			{
				name: "pin",
				label: "PIN",
				fieldType: "text",
				nativeColumnPath: "pin",
			},
			{
				name: "lroNumber",
				label: "LRO Number",
				fieldType: "text",
				nativeColumnPath: "lroNumber",
			},
			{
				name: "legalDescription",
				label: "Legal Description",
				fieldType: "text",
				nativeColumnPath: "legalDescription",
			},
			{
				name: "createdAt",
				label: "Created At",
				fieldType: "datetime",
				nativeColumnPath: "createdAt",
			},
		],
	},
] as const;

// ── Shared Bootstrap Logic ───────────────────────────────────────────
// Uses MutationCtx directly — both internalMutation and crmAdminMutation
// handlers provide a compatible ctx.db.

interface BootstrapResult {
	created: Array<{
		objectDefId: Id<"objectDefs">;
		name: string;
	}>;
	repaired: string[];
}

async function ensureFieldCapabilities(args: {
	ctx: Pick<MutationCtx, "db">;
	fieldDefId: Id<"fieldDefs">;
	fieldType: FieldType;
	objectDefId: Id<"objectDefs">;
}) {
	const existingCapabilities = await args.ctx.db
		.query("fieldCapabilities")
		.withIndex("by_field", (q) => q.eq("fieldDefId", args.fieldDefId))
		.collect();
	const existingCapabilitySet = new Set(
		existingCapabilities.map((capability) => capability.capability)
	);

	for (const capability of deriveCapabilities(args.fieldType)) {
		if (existingCapabilitySet.has(capability)) {
			continue;
		}

		await args.ctx.db.insert("fieldCapabilities", {
			fieldDefId: args.fieldDefId,
			objectDefId: args.objectDefId,
			capability,
		});
	}
}

async function bootstrapForOrg(
	ctx: Pick<MutationCtx, "db">,
	orgId: string,
	createdBy: string
): Promise<BootstrapResult> {
	const created: BootstrapResult["created"] = [];
	const repaired: string[] = [];
	const now = Date.now();

	// Count existing objectDefs for displayOrder offset
	const existingObjects = await ctx.db
		.query("objectDefs")
		.withIndex("by_org", (q) => q.eq("orgId", orgId))
		.collect();
	let displayOrderOffset = existingObjects.length;

	for (const config of SYSTEM_OBJECT_CONFIGS) {
		const existingObjectDef = await ctx.db
			.query("objectDefs")
			.withIndex("by_org_name", (q) =>
				q.eq("orgId", orgId).eq("name", config.name)
			)
			.first();

		const objectDefId =
			existingObjectDef?._id ??
			(await ctx.db.insert("objectDefs", {
				orgId,
				name: config.name,
				singularLabel: config.singularLabel,
				pluralLabel: config.pluralLabel,
				icon: config.icon,
				description: config.description,
				isSystem: true,
				nativeTable: config.nativeTable,
				isActive: true,
				displayOrder: displayOrderOffset,
				createdAt: now,
				updatedAt: now,
				createdBy,
			}));

		if (existingObjectDef) {
			await ctx.db.patch(existingObjectDef._id, {
				singularLabel: config.singularLabel,
				pluralLabel: config.pluralLabel,
				icon: config.icon,
				description: config.description,
				isSystem: true,
				nativeTable: config.nativeTable,
				isActive: true,
				updatedAt: now,
			});
			repaired.push(config.name);
		} else {
			displayOrderOffset += 1;
			created.push({ objectDefId, name: config.name });
		}

		const existingViews = await ctx.db
			.query("viewDefs")
			.withIndex("by_object", (q) => q.eq("objectDefId", objectDefId))
			.collect();
		const existingDefaultTableView =
			existingViews.find(
				(viewDef) => viewDef.isDefault && viewDef.viewType === "table"
			) ?? null;
		const viewDefId =
			existingDefaultTableView?._id ??
			(await ctx.db.insert("viewDefs", {
				orgId,
				objectDefId,
				name: `All ${config.pluralLabel}`,
				viewType: "table",
				isDefault: true,
				needsRepair: false,
				aggregatePresets: [],
				createdAt: now,
				updatedAt: now,
				createdBy,
			}));

		const existingFieldDefs = await ctx.db
			.query("fieldDefs")
			.withIndex("by_object", (q) => q.eq("objectDefId", objectDefId))
			.collect();
		const fieldDefsByName = new Map(
			existingFieldDefs.map((fieldDef) => [fieldDef.name, fieldDef] as const)
		);
		const fieldDefIdByName = new Map<string, Id<"fieldDefs">>();

		for (let i = 0; i < config.fields.length; i++) {
			const field = config.fields[i];
			const fieldContract = deriveFieldContractMetadata({
				fieldType: field.fieldType,
				nativeReadOnly: true,
			});
			const existingFieldDef = fieldDefsByName.get(field.name);
			const fieldDefId =
				existingFieldDef?._id ??
				(await ctx.db.insert("fieldDefs", {
					orgId,
					objectDefId,
					name: field.name,
					label: field.label,
					fieldType: field.fieldType,
					normalizedFieldKind: fieldContract.normalizedFieldKind,
					isRequired: false,
					isUnique: false,
					isActive: true,
					displayOrder: i,
					rendererHint: fieldContract.rendererHint,
					layoutEligibility: fieldContract.layoutEligibility,
					aggregation: fieldContract.aggregation,
					editability: fieldContract.editability,
					isVisibleByDefault: fieldContract.isVisibleByDefault,
					nativeColumnPath: field.nativeColumnPath,
					nativeReadOnly: true,
					options: field.options,
					createdAt: now,
					updatedAt: now,
				}));

			if (existingFieldDef) {
				await ctx.db.patch(existingFieldDef._id, {
					label: field.label,
					fieldType: field.fieldType,
					normalizedFieldKind: fieldContract.normalizedFieldKind,
					isActive: true,
					displayOrder: i,
					rendererHint: fieldContract.rendererHint,
					layoutEligibility: fieldContract.layoutEligibility,
					aggregation: fieldContract.aggregation,
					editability: fieldContract.editability,
					isVisibleByDefault: fieldContract.isVisibleByDefault,
					nativeColumnPath: field.nativeColumnPath,
					nativeReadOnly: true,
					options: field.options,
					updatedAt: now,
				});
			}

			fieldDefIdByName.set(field.name, fieldDefId);
			await ensureFieldCapabilities({
				ctx,
				fieldDefId,
				fieldType: field.fieldType,
				objectDefId,
			});
		}

		const aggregatePresets = (
			config.defaultAggregatePresetFieldNames ?? []
		).flatMap((fieldName) => {
			const fieldDefId = fieldDefIdByName.get(fieldName);
			if (!fieldDefId) {
				return [];
			}

			return [
				{
					fieldDefId,
					fn: "sum" as const,
					label:
						config.fields.find((field) => field.name === fieldName)?.label ??
						fieldName,
				},
			];
		});

		if (existingDefaultTableView) {
			await ctx.db.patch(existingDefaultTableView._id, {
				name: `All ${config.pluralLabel}`,
				aggregatePresets,
				needsRepair: false,
				updatedAt: now,
			});
		}

		const existingViewFields = await ctx.db
			.query("viewFields")
			.withIndex("by_view", (q) => q.eq("viewDefId", viewDefId))
			.collect();
		const viewFieldsByFieldId = new Map(
			existingViewFields.map(
				(viewField) => [viewField.fieldDefId.toString(), viewField] as const
			)
		);
		const defaultVisibleFieldNames = new Set(
			config.defaultVisibleFieldNames ?? []
		);

		for (let i = 0; i < config.fields.length; i++) {
			const field = config.fields[i];
			const fieldDefId = fieldDefIdByName.get(field.name);
			if (!fieldDefId) {
				continue;
			}

			const existingViewField = viewFieldsByFieldId.get(fieldDefId.toString());
			const isVisible =
				field.isVisibleByDefault ??
				(defaultVisibleFieldNames.size === 0
					? true
					: defaultVisibleFieldNames.has(field.name));

			if (existingViewField) {
				await ctx.db.patch(existingViewField._id, {
					displayOrder: i,
					isVisible,
				});
				continue;
			}

			await ctx.db.insert("viewFields", {
				viewDefId,
				fieldDefId,
				isVisible,
				displayOrder: i,
			});
		}
	}

	return { created, repaired };
}

// ── T-003: bootstrapSystemObjects (internalMutation) ─────────────────
// Called from org creation webhook — no fluent-convex middleware available.
// Accepts raw orgId, uses "system" as createdBy.
export const bootstrapSystemObjects = internalMutation({
	args: { orgId: v.string() },
	handler: async (ctx, args) => {
		const result = await bootstrapForOrg(ctx, args.orgId, "system");

		for (const createdObject of result.created) {
			await auditLog.log(ctx, {
				action: "crm.bootstrap.object_created",
				actorId: "system",
				resourceType: "objectDefs",
				resourceId: createdObject.objectDefId,
				severity: "info",
				metadata: {
					name: createdObject.name,
					orgId: args.orgId,
					trigger: "internal",
				},
			});
		}

		return result;
	},
});

// ── T-004: adminBootstrap (public mutation) ──────────────────────────
// Admin-facing re-bootstrap for orgs that missed the webhook or need repair.
export const adminBootstrap = crmAdminMutation
	.input({})
	.handler(async (ctx, _args) => {
		const orgId = ctx.viewer.orgId;
		const authId = ctx.viewer.authId;
		if (!(orgId && authId)) {
			throw new ConvexError(
				"Org context and authenticated user required for bootstrap"
			);
		}

		const result = await bootstrapForOrg(ctx, orgId, authId);

		for (const createdObject of result.created) {
			await auditLog.log(ctx, {
				action: "crm.bootstrap.object_created",
				actorId: authId,
				resourceType: "objectDefs",
				resourceId: createdObject.objectDefId,
				severity: "info",
				metadata: {
					name: createdObject.name,
					orgId,
					trigger: "admin",
				},
			});
		}

		return result;
	})
	.public();
