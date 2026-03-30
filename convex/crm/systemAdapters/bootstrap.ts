import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { internalMutation } from "../../_generated/server";
import { auditLog } from "../../auditLog";
import { crmAdminMutation } from "../../fluent";
import { deriveCapabilities } from "../metadataCompiler";

// ── T-001: SystemObjectConfig type ───────────────────────────────────

type FieldType = Doc<"fieldDefs">["fieldType"];

interface SelectOption {
	value: string;
	label: string;
	color: string;
	order: number;
}

interface FieldConfig {
	name: string;
	label: string;
	fieldType: FieldType;
	nativeColumnPath: string;
	options?: SelectOption[];
}

export interface SystemObjectConfig {
	name: string;
	singularLabel: string;
	pluralLabel: string;
	icon: string;
	description: string;
	nativeTable: string;
	fields: FieldConfig[];
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
	colorMap: Record<string, string>,
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
		fields: [
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
					MORTGAGE_STATUS_COLORS,
				),
			},
			{
				name: "paymentAmount",
				label: "Payment Amount",
				fieldType: "currency",
				nativeColumnPath: "paymentAmount",
			},
			{
				name: "paymentFrequency",
				label: "Payment Frequency",
				fieldType: "select",
				nativeColumnPath: "paymentFrequency",
				options: opts(
					["monthly", "bi_weekly", "accelerated_bi_weekly", "weekly"],
					PAYMENT_FREQUENCY_COLORS,
				),
			},
			{
				name: "loanType",
				label: "Loan Type",
				fieldType: "select",
				nativeColumnPath: "loanType",
				options: opts(
					["conventional", "insured", "high_ratio"],
					LOAN_TYPE_COLORS,
				),
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
		fields: [
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
					IDV_STATUS_COLORS,
				),
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
				name: "accreditationStatus",
				label: "Accreditation Status",
				fieldType: "select",
				nativeColumnPath: "accreditationStatus",
				options: opts(
					["pending", "accredited", "exempt", "rejected"],
					ACCREDITATION_COLORS,
				),
			},
			{
				name: "status",
				label: "Status",
				fieldType: "select",
				nativeColumnPath: "status",
				options: opts(
					["active", "pending_activation"],
					LENDER_STATUS_COLORS,
				),
			},
			{
				name: "payoutFrequency",
				label: "Payout Frequency",
				fieldType: "select",
				nativeColumnPath: "payoutFrequency",
				options: opts(
					["monthly", "bi_weekly", "weekly", "on_demand"],
					PAYOUT_FREQUENCY_COLORS,
				),
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
				name: "brokerageName",
				label: "Brokerage Name",
				fieldType: "text",
				nativeColumnPath: "brokerageName",
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
					DEAL_STATUS_COLORS,
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
		fields: [
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
					OBLIGATION_TYPE_COLORS,
				),
			},
			{
				name: "amount",
				label: "Amount",
				fieldType: "currency",
				nativeColumnPath: "amount",
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
					OBLIGATION_STATUS_COLORS,
				),
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
	skipped: string[];
}

async function bootstrapForOrg(
	ctx: Pick<MutationCtx, "db">,
	orgId: string,
	createdBy: string,
): Promise<BootstrapResult> {
	const created: BootstrapResult["created"] = [];
	const skipped: string[] = [];
	const now = Date.now();

	// Count existing objectDefs for displayOrder offset
	const existingObjects = await ctx.db
		.query("objectDefs")
		.withIndex("by_org", (q) => q.eq("orgId", orgId))
		.collect();
	let displayOrderOffset = existingObjects.length;

	for (const config of SYSTEM_OBJECT_CONFIGS) {
		// Idempotency: skip if this object already exists for the org
		const existing = await ctx.db
			.query("objectDefs")
			.withIndex("by_org_name", (q) =>
				q.eq("orgId", orgId).eq("name", config.name),
			)
			.first();

		if (existing) {
			skipped.push(config.name);
			continue;
		}

		// Insert objectDef
		const objectDefId = await ctx.db.insert("objectDefs", {
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
		});
		displayOrderOffset += 1;

		// Create default table view
		const viewDefId = await ctx.db.insert("viewDefs", {
			orgId,
			objectDefId,
			name: `All ${config.pluralLabel}`,
			viewType: "table",
			isDefault: true,
			needsRepair: false,
			createdAt: now,
			updatedAt: now,
			createdBy,
		});

		// Create fields, capabilities, and viewFields
		for (let i = 0; i < config.fields.length; i++) {
			const field = config.fields[i];

			const fieldDefId = await ctx.db.insert("fieldDefs", {
				orgId,
				objectDefId,
				name: field.name,
				label: field.label,
				fieldType: field.fieldType,
				isRequired: false,
				isUnique: false,
				isActive: true,
				displayOrder: i,
				nativeColumnPath: field.nativeColumnPath,
				nativeReadOnly: true,
				options: field.options,
				createdAt: now,
				updatedAt: now,
			});

			// Derive and insert capabilities
			const capabilities = deriveCapabilities(field.fieldType);
			for (const capability of capabilities) {
				await ctx.db.insert("fieldCapabilities", {
					fieldDefId,
					objectDefId,
					capability,
				});
			}

			// Add field to default view
			await ctx.db.insert("viewFields", {
				viewDefId,
				fieldDefId,
				isVisible: true,
				displayOrder: i,
			});
		}

		created.push({ objectDefId, name: config.name });
	}

	return { created, skipped };
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
		if (!orgId || !authId) {
			throw new ConvexError(
				"Org context and authenticated user required for bootstrap",
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
