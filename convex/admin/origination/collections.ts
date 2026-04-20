import { makeFunctionReference } from "convex/server";
import { ConvexError, v } from "convex/values";
import { internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import type { ActionCtx, MutationCtx, QueryCtx } from "../../_generated/server";
import { assertOriginationCaseAccess } from "../../authz/origination";
import {
	ensureCanonicalBorrowerForOrigination,
	provisionableParticipantName,
} from "../../borrowers/resolveOrProvisionForOrigination";
import { getWorkosProvisioning } from "../../engine/effects/workosProvisioning";
import {
	authedAction,
	authedMutation,
	authedQuery,
	convex,
	requirePermission,
	requirePermissionAction,
} from "../../fluent";
import { validateBankAccountRecord } from "../../payments/bankAccounts/validation";
import { hasRotessaCustomerReference } from "../../payments/recurringSchedules/rotessaCustomerReference";
import { createRotessaClient } from "../../payments/rotessa/client";
import {
	computeScheduledInstallmentCount,
	logRotessaReconciliationAction,
	mapRotessaFrequencyToOriginationPaymentFrequency,
	type NormalizedRotessaCustomerSnapshot,
	type NormalizedRotessaScheduleSnapshot,
	parseRotessaAmountToCents,
	resolveBorrowerMatchForRotessaCustomer,
	upsertExternalCustomerProfile,
	upsertExternalProviderSchedulesForCustomer,
} from "../../payments/rotessa/readModel";
import type { RotessaCustomerDetail } from "../../payments/rotessa/types";
import { normalizeEmail } from "../../seed/seedHelpers";
import { normalizeOriginationCollectionsDraft } from "./validators";

const originationQuery = authedQuery.use(
	requirePermission("mortgage:originate")
);
const originationAction = authedAction.use(
	requirePermissionAction("mortgage:originate")
);
const paymentManageMutation = authedMutation.use(
	requirePermission("payment:manage")
);
const paymentManageQuery = authedQuery.use(requirePermission("payment:manage"));
const paymentManageAction = authedAction.use(
	requirePermissionAction("payment:manage")
);

const collectionsActivationStatusValidator = v.union(
	v.literal("pending"),
	v.literal("activating"),
	v.literal("active"),
	v.literal("failed")
);

export type CollectionsActivationResult =
	| { status: "skipped" }
	| { message: string; status: "failed" }
	| { scheduleId: string; status: "active" };

function sortPlanEntriesForProviderActivation(
	left: Pick<Doc<"collectionPlanEntries">, "_id" | "amount" | "scheduledDate">,
	right: Pick<Doc<"collectionPlanEntries">, "_id" | "amount" | "scheduledDate">
) {
	if (left.scheduledDate !== right.scheduledDate) {
		return left.scheduledDate - right.scheduledDate;
	}
	if (left.amount !== right.amount) {
		return left.amount - right.amount;
	}
	return String(left._id).localeCompare(String(right._id));
}

const getCommittedCollectionsActivationContextRef = makeFunctionReference<
	"query",
	{
		caseId: Id<"adminOriginationCases">;
	},
	Promise<{
		activationPlanEntryIds: Id<"collectionPlanEntries">[];
		collectionsDraft: Doc<"adminOriginationCases">["collectionsDraft"];
		committedMortgageId: Id<"mortgages"> | null;
	} | null>
>("admin/origination/collections:getCommittedCollectionsActivationContext");

const patchCollectionsActivationStateRef = makeFunctionReference<
	"mutation",
	{
		caseId: Id<"adminOriginationCases">;
		activationStatus: "active" | "activating" | "failed" | "pending";
		clearError?: boolean;
		clearExternalCollectionScheduleId?: boolean;
		errorMessage?: string;
		externalCollectionScheduleId?: Id<"externalCollectionSchedules">;
		incrementRetryCount?: boolean;
		lastAttemptAt?: number;
		viewerUserId: Id<"users">;
	},
	Promise<Doc<"adminOriginationCases"> | null>
>("admin/origination/collections:patchCollectionsActivationState");

type CollectionsActivationRuntimeCtx = Pick<
	ActionCtx,
	"runAction" | "runMutation" | "runQuery"
>;

interface CanonicalBorrowerProfileResult {
	bankAccountId?: Id<"bankAccounts">;
	borrowerId: Id<"borrowers">;
	email: string;
	fullName: string;
}

interface RotessaScheduleCreationContext {
	bankAccount: {
		_id: Id<"bankAccounts">;
		accountNumber: string | null;
		institutionNumber: string | null;
		mandateStatus: Doc<"bankAccounts">["mandateStatus"];
		metadata?: Record<string, unknown>;
		status: Doc<"bankAccounts">["status"];
		transitNumber: string | null;
	};
	borrower: {
		_id: Id<"borrowers">;
		email: string;
		fullName: string;
		orgId: string | undefined;
		phone: string | null;
	};
	existingCustomerProfile: {
		accountNumber: string | null;
		accountLast4: string | null;
		bankAccountId: Id<"bankAccounts"> | null;
		customerProfileId: Id<"externalCustomerProfiles">;
		externalCustomerCustomIdentifier: string | null;
		externalCustomerRef: string;
		fullName: string;
	} | null;
	mortgageDraft: Doc<"adminOriginationCases">["mortgageDraft"] | null;
	viewerUserId: Id<"users"> | null | undefined;
}

interface CreatedRotessaScheduleForCaseResult {
	customerProfileId: Id<"externalCustomerProfiles">;
	providerScheduleId: Id<"externalProviderSchedules">;
}

interface PlanEntryWindow {
	coveredFromPlanEntryId: Id<"collectionPlanEntries">;
	coveredToPlanEntryId: Id<"collectionPlanEntries">;
	endDate: number;
	startDate: number;
}

interface RotessaSyncStats {
	availableScheduleCount: number;
	conflictCustomerCount: number;
	conflictScheduleCount: number;
	customerCount: number;
	linkedScheduleCount: number;
	matchedCustomerCount: number;
	scheduleCount: number;
	unmatchedCustomerCount: number;
}

interface RotessaCustomerUpsertResult {
	customerMatchStatus: Doc<"externalCustomerProfiles">["matchStatus"];
	customerProfileId: Id<"externalCustomerProfiles">;
	scheduleCount: number;
}

interface RotessaBorrowerOption {
	borrowerId: string;
	email: string | null;
	fullName: string;
}

interface RotessaReconciliationSnapshot {
	borrowerOptions: RotessaBorrowerOption[];
	brokenLinks: Array<{
		externalScheduleRef: string;
		linkedMortgageId: string;
		providerScheduleId: string;
		reason: string;
	}>;
	conflicts: Array<{
		detail: string;
		entityId: string;
		entityType: "customer" | "schedule";
		title: string;
	}>;
	generatedAt: number;
	lastSyncRun: {
		customerCount: number;
		errorMessage: string | null;
		finishedAt: number | null;
		scheduleCount: number;
		startedAt: number;
		status: Doc<"rotessaSyncRuns">["status"];
		trigger: Doc<"rotessaSyncRuns">["trigger"];
	} | null;
	padAuthorizationExceptions: Array<{
		caseId: string;
		label: string;
		padAuthorizationSource: "admin_override" | "uploaded" | null;
		selectedBorrowerId: string | null;
		selectedProviderScheduleId: string | null;
		updatedAt: number;
	}>;
	summary: {
		availableSchedules: number;
		conflictCustomers: number;
		conflictSchedules: number;
		linkedCustomers: number;
		linkedSchedules: number;
		unmatchedCustomers: number;
		unmatchedSchedules: number;
	};
	unmatchedCustomers: Array<{
		accountSummary: string;
		customerProfileId: string;
		email: string | null;
		externalCustomerRef: string;
		fullName: string;
		scheduleCount: number;
	}>;
	unmatchedSchedules: Array<{
		amountCents: number | null;
		externalScheduleRef: string;
		frequency: string;
		nextProcessDate: string | null;
		processDate: string;
		providerScheduleId: string;
		providerStatus: string | null;
		sourceCustomer: string;
	}>;
}

const commitCanonicalBorrowerProfileRef = makeFunctionReference<
	"mutation",
	{
		accountNumber?: string;
		authId: string;
		email: string;
		firstName?: string;
		fullName: string;
		institutionNumber?: string;
		lastName?: string;
		orgId?: string;
		phone?: string;
		sourceLabel: string;
		transitNumber?: string;
	},
	Promise<CanonicalBorrowerProfileResult>
>("admin/origination/collections:commitCanonicalBorrowerProfile");

const createCanonicalBorrowerProfileRef = makeFunctionReference<
	"action",
	{
		accountNumber?: string;
		email: string;
		fullName: string;
		institutionNumber?: string;
		orgId?: string;
		phone?: string;
		sourceLabel: string;
		transitNumber?: string;
	},
	Promise<CanonicalBorrowerProfileResult>
>("admin/origination/collections:createCanonicalBorrowerProfile");

const getRotessaScheduleCreationContextInternalRef = makeFunctionReference<
	"query",
	{
		bankAccountId: Id<"bankAccounts">;
		borrowerId: Id<"borrowers">;
		caseId: Id<"adminOriginationCases">;
		viewerAuthId: string;
		viewerIsFairLendAdmin: boolean;
		viewerOrgId?: string;
	},
	Promise<RotessaScheduleCreationContext>
>("admin/origination/collections:getRotessaScheduleCreationContextInternal");

const recordCreatedRotessaScheduleForCaseRef = makeFunctionReference<
	"mutation",
	{
		actorUserId?: Id<"users">;
		bankAccountId: Id<"bankAccounts">;
		borrowerId: Id<"borrowers">;
		caseId: Id<"adminOriginationCases">;
		customer: {
			accountLast4?: string;
			accountNumber?: string;
			authorizationType?: string;
			bankAccountType?: string;
			bankName?: string;
			customerType?: string;
			email: string;
			externalCustomerCustomIdentifier?: string;
			externalCustomerRef: string;
			fullName: string;
			institutionNumber?: string;
			phone?: string;
			transitNumber?: string;
		};
		schedule: {
			amountCents: number;
			comment: string;
			externalScheduleRef: string;
			frequency: string;
			installments: number;
			nextProcessDate?: string;
			processDate: string;
		};
	},
	Promise<CreatedRotessaScheduleForCaseResult>
>("admin/origination/collections:recordCreatedRotessaScheduleForCase");

const getImportedProviderScheduleInternalRef = makeFunctionReference<
	"query",
	{
		providerScheduleId: Id<"externalProviderSchedules">;
	},
	Promise<Doc<"externalProviderSchedules"> | null>
>("admin/origination/collections:getImportedProviderScheduleInternal");

const getPlanEntryWindowInternalRef = makeFunctionReference<
	"query",
	{
		planEntryIds: Id<"collectionPlanEntries">[];
	},
	Promise<PlanEntryWindow>
>("admin/origination/collections:getPlanEntryWindowInternal");

const markImportedProviderScheduleLinkedRef = makeFunctionReference<
	"mutation",
	{
		actorUserId?: Id<"users">;
		externalCollectionScheduleId: Id<"externalCollectionSchedules">;
		mortgageId: Id<"mortgages">;
		providerScheduleId: Id<"externalProviderSchedules">;
	},
	Promise<void>
>("admin/origination/collections:markImportedProviderScheduleLinked");

const adoptImportedRotessaScheduleForCommittedCaseRef = makeFunctionReference<
	"action",
	{
		mortgageId: Id<"mortgages">;
		planEntryIds: Id<"collectionPlanEntries">[];
		providerScheduleId: Id<"externalProviderSchedules">;
		viewerUserId?: Id<"users">;
	},
	Promise<{ scheduleId: string }>
>("admin/origination/collections:adoptImportedRotessaScheduleForCommittedCase");

const getRotessaCustomerProfileInternalRef = makeFunctionReference<
	"query",
	{
		customerProfileId: Id<"externalCustomerProfiles">;
	},
	Promise<Doc<"externalCustomerProfiles"> | null>
>("admin/origination/collections:getRotessaCustomerProfileInternal");

const upsertRotessaCustomerSnapshotRef = makeFunctionReference<
	"mutation",
	{
		customer: NormalizedRotessaCustomerSnapshot;
		source: "admin_link" | "origination_create" | "sync";
	},
	Promise<RotessaCustomerUpsertResult>
>("admin/origination/collections:upsertRotessaCustomerSnapshot");

const startRotessaSyncRunRef = makeFunctionReference<
	"mutation",
	{
		trigger: "cron" | "manual";
	},
	Promise<Id<"rotessaSyncRuns">>
>("admin/origination/collections:startRotessaSyncRun");

const finishRotessaSyncRunRef = makeFunctionReference<
	"mutation",
	{
		availableScheduleCount: number;
		conflictCustomerCount: number;
		conflictScheduleCount: number;
		customerCount: number;
		errorMessage?: string;
		linkedScheduleCount: number;
		matchedCustomerCount: number;
		runId: Id<"rotessaSyncRuns">;
		scheduleCount: number;
		status: "failed" | "success";
		unmatchedCustomerCount: number;
	},
	Promise<Doc<"rotessaSyncRuns"> | null>
>("admin/origination/collections:finishRotessaSyncRun");

const runRotessaReadModelSyncRef = makeFunctionReference<
	"action",
	{
		trigger: "cron" | "manual";
	},
	Promise<RotessaSyncStats>
>("admin/origination/collections:runRotessaReadModelSync");

const getRotessaReconciliationSnapshotRef = makeFunctionReference<
	"query",
	Record<never, never>,
	Promise<RotessaReconciliationSnapshot>
>("admin/origination/collections:getRotessaReconciliationSnapshot");

const linkRotessaCustomerToBorrowerInternalRef = makeFunctionReference<
	"mutation",
	{
		actorUserId?: Id<"users">;
		borrowerId: Id<"borrowers">;
		customerProfileId: Id<"externalCustomerProfiles">;
		note?: string;
	},
	Promise<{
		bankAccountId: string | null;
		borrowerId: string;
		customerProfileId: string;
	}>
>("admin/origination/collections:linkRotessaCustomerToBorrowerInternal");

type PrimaryBorrowerDraft = NonNullable<
	Doc<"adminOriginationCases">["participantsDraft"]
>["primaryBorrower"];

function hasPrimaryBorrowerIdentity(primaryBorrower: PrimaryBorrowerDraft) {
	return Boolean(
		primaryBorrower?.existingBorrowerId ||
			primaryBorrower?.email?.trim() ||
			primaryBorrower?.fullName?.trim()
	);
}

function buildBankAccountEligibilityErrors(
	bankAccount: Pick<
		Doc<"bankAccounts">,
		| "institutionNumber"
		| "mandateStatus"
		| "metadata"
		| "status"
		| "transitNumber"
	>
) {
	const errors: string[] = [];
	const validationResult = validateBankAccountRecord(
		bankAccount,
		"pad_rotessa"
	);
	if (validationResult.valid === false) {
		errors.push(validationResult.errorMessage);
	}
	if (!hasRotessaCustomerReference(bankAccount.metadata)) {
		errors.push("Rotessa customer metadata is missing from this bank account.");
	}
	return errors;
}

async function resolvePrimaryBorrowerContext(
	ctx: Pick<QueryCtx, "db">,
	caseRecord: Pick<Doc<"adminOriginationCases">, "orgId" | "participantsDraft">
) {
	const primaryBorrower = caseRecord.participantsDraft?.primaryBorrower;
	if (!hasPrimaryBorrowerIdentity(primaryBorrower)) {
		return {
			borrowerId: null,
			email: primaryBorrower?.email?.trim() || null,
			fullName: primaryBorrower?.fullName?.trim() || null,
			state: "missing_primary_borrower" as const,
		};
	}

	if (primaryBorrower?.existingBorrowerId) {
		const borrower = await ctx.db.get(primaryBorrower.existingBorrowerId);
		if (!borrower) {
			return {
				borrowerId: null,
				email: primaryBorrower.email?.trim() || null,
				fullName: primaryBorrower.fullName?.trim() || null,
				state: "borrower_missing" as const,
			};
		}
		if (
			caseRecord.orgId &&
			borrower.orgId &&
			borrower.orgId !== caseRecord.orgId
		) {
			return {
				borrowerId: null,
				email: primaryBorrower.email?.trim() || null,
				fullName: primaryBorrower.fullName?.trim() || null,
				state: "cross_org_conflict" as const,
			};
		}
		return {
			borrowerId: borrower._id,
			email: primaryBorrower.email?.trim() || null,
			fullName: primaryBorrower.fullName?.trim() || null,
			state: "ready" as const,
		};
	}

	if (!primaryBorrower?.email?.trim()) {
		return {
			borrowerId: null,
			email: null,
			fullName: primaryBorrower?.fullName?.trim() || null,
			state: "missing_primary_borrower" as const,
		};
	}

	const normalizedEmail = normalizeEmail(primaryBorrower.email);
	const user = await ctx.db
		.query("users")
		.filter((query) => query.eq(query.field("email"), normalizedEmail))
		.first();
	if (!user) {
		return {
			borrowerId: null,
			email: normalizedEmail,
			fullName: primaryBorrower.fullName?.trim() || null,
			state: "identity_sync_pending" as const,
		};
	}

	const borrowers = await ctx.db
		.query("borrowers")
		.withIndex("by_user", (query) => query.eq("userId", user._id))
		.collect();
	const sameOrgBorrowers = borrowers.filter(
		(borrower) => borrower.orgId === caseRecord.orgId
	);
	if (sameOrgBorrowers.length === 1) {
		return {
			borrowerId: sameOrgBorrowers[0]._id,
			email: normalizedEmail,
			fullName: primaryBorrower.fullName?.trim() || null,
			state: "ready" as const,
		};
	}
	if (sameOrgBorrowers.length > 1) {
		return {
			borrowerId: null,
			email: normalizedEmail,
			fullName: primaryBorrower.fullName?.trim() || null,
			state: "borrower_profile_conflict" as const,
		};
	}
	if (
		borrowers.some(
			(borrower) =>
				borrower.orgId !== undefined && borrower.orgId !== caseRecord.orgId
		)
	) {
		return {
			borrowerId: null,
			email: normalizedEmail,
			fullName: primaryBorrower.fullName?.trim() || null,
			state: "cross_org_conflict" as const,
		};
	}
	return {
		borrowerId: null,
		email: normalizedEmail,
		fullName: primaryBorrower.fullName?.trim() || null,
		state: "borrower_profile_missing" as const,
	};
}

function buildPrimaryBorrowerMessage(
	state: Awaited<ReturnType<typeof resolvePrimaryBorrowerContext>>["state"]
) {
	switch (state) {
		case "ready":
			return "Primary borrower is ready to reuse. Select it in the borrower autocomplete to unlock Rotessa schedule setup.";
		case "identity_sync_pending":
			return "The staged primary borrower has not synced into the FairLend user and borrower graph yet, so it cannot be selected for Rotessa setup.";
		case "borrower_profile_missing":
			return "The staged primary borrower does not have a canonical borrower profile yet. Create or select a canonical borrower before using the Rotessa rail.";
		case "cross_org_conflict":
			return "The staged primary borrower resolves to a borrower in another organization.";
		case "borrower_profile_conflict":
			return "Multiple same-org borrower profiles exist for the staged primary borrower.";
		case "borrower_missing":
			return "The selected primary borrower record no longer exists.";
		case "missing_primary_borrower":
			return "Stage a primary borrower first, or create a new borrower directly from the Rotessa collections flow.";
		default:
			return "Resolve the staged primary borrower before using the provider-managed Rotessa flow.";
	}
}

const WHITESPACE_PATTERN = /\s+/;

function splitFullName(fullName: string) {
	const trimmed = fullName.trim();
	const [firstName, ...rest] = trimmed.split(WHITESPACE_PATTERN);
	return {
		firstName,
		lastName: rest.join(" ") || undefined,
	};
}

async function ensureCollectionsUserRow(args: {
	authId: string;
	ctx: Pick<MutationCtx, "db">;
	email: string;
	firstName?: string;
	lastName?: string;
	phoneNumber?: string;
}) {
	const existing = await args.ctx.db
		.query("users")
		.withIndex("authId", (query) => query.eq("authId", args.authId))
		.unique();
	if (existing) {
		return existing._id;
	}

	return args.ctx.db.insert("users", {
		authId: args.authId,
		email: normalizeEmail(args.email),
		firstName: args.firstName ?? "",
		lastName: args.lastName ?? "",
		phoneNumber: args.phoneNumber,
	});
}

function buildCollectionsWorkflowSourceKey(args: {
	email: string;
	sourceLabel: string;
}) {
	return `${args.sourceLabel}:${normalizeEmail(args.email)}`;
}

function mapOriginationFrequencyToRotessaFrequency(
	paymentFrequency: Doc<"mortgages">["paymentFrequency"]
) {
	switch (paymentFrequency) {
		case "monthly":
			return "Monthly" as const;
		case "bi_weekly":
		case "accelerated_bi_weekly":
			return "Every Other Week" as const;
		case "weekly":
			return "Weekly" as const;
		default:
			throw new ConvexError(
				"Mortgage payment frequency is not supported for Rotessa recurring schedules."
			);
	}
}

function buildNormalizedScheduleSnapshot(args: {
	amountCents: number;
	comment: string;
	externalScheduleRef: string;
	frequency: string;
	installments: number;
	nextProcessDate?: string;
	processDate: string;
}) {
	return {
		amountCents: args.amountCents,
		comment: args.comment,
		externalScheduleRef: args.externalScheduleRef,
		frequency: args.frequency,
		installments: args.installments,
		nextProcessDate: args.nextProcessDate,
		originationPaymentFrequency:
			mapRotessaFrequencyToOriginationPaymentFrequency(args.frequency),
		processDate: args.processDate,
		providerScheduleStatus: args.nextProcessDate ? "active" : "completed",
	} satisfies NormalizedRotessaScheduleSnapshot;
}

function formatStatusLabel(value: string) {
	return value
		.split("_")
		.map((segment) =>
			segment.length > 0
				? `${segment.slice(0, 1).toUpperCase()}${segment.slice(1)}`
				: segment
		)
		.join(" ");
}

function accountLast4(value: string | null | undefined) {
	const normalized = value?.replace(/\s+/g, "");
	return normalized && normalized.length >= 4
		? normalized.slice(-4)
		: undefined;
}

function normalizeRotessaCustomerDetail(
	detail: RotessaCustomerDetail
): NormalizedRotessaCustomerSnapshot {
	return {
		accountLast4: accountLast4(detail.account_number),
		accountNumber: detail.account_number ?? undefined,
		authorizationType: detail.authorization_type ?? undefined,
		bankAccountType: detail.bank_account_type ?? undefined,
		bankName: detail.bank_name ?? undefined,
		customerType: detail.customer_type ?? undefined,
		email: detail.email ?? undefined,
		externalCustomerCustomIdentifier: detail.custom_identifier ?? undefined,
		externalCustomerRef: String(detail.id),
		fullName: detail.name,
		institutionNumber:
			detail.institution_number === null
				? undefined
				: String(detail.institution_number),
		phone: detail.phone ?? detail.home_phone ?? undefined,
		providerData: {
			active: detail.active,
			address: detail.address ?? null,
			identifier: detail.identifier ?? null,
			updatedAt: detail.updated_at,
		},
		schedules: detail.transaction_schedules.map(
			(schedule): NormalizedRotessaScheduleSnapshot => ({
				amountCents: parseRotessaAmountToCents(schedule.amount),
				comment: schedule.comment ?? undefined,
				externalScheduleRef: String(schedule.id),
				frequency: schedule.frequency,
				installments: schedule.installments ?? undefined,
				nextProcessDate: schedule.next_process_date ?? undefined,
				originationPaymentFrequency:
					mapRotessaFrequencyToOriginationPaymentFrequency(schedule.frequency),
				processDate: schedule.process_date,
				providerData: {
					createdAt: schedule.created_at,
					updatedAt: schedule.updated_at,
				},
				providerScheduleStatus: schedule.next_process_date
					? "active"
					: "completed",
			})
		),
		transitNumber:
			detail.transit_number === null
				? undefined
				: String(detail.transit_number),
	};
}

function buildCustomerSnapshotFromProfile(
	profile: Doc<"externalCustomerProfiles">
): NormalizedRotessaCustomerSnapshot {
	return {
		accountLast4: profile.accountLast4,
		accountNumber: profile.accountNumber,
		authorizationType: profile.authorizationType,
		bankAccountType: profile.bankAccountType,
		bankName: profile.bankName,
		customerType: profile.customerType,
		email: profile.email,
		externalCustomerCustomIdentifier: profile.externalCustomerCustomIdentifier,
		externalCustomerRef: profile.externalCustomerRef,
		fullName: profile.fullName,
		institutionNumber: profile.institutionNumber,
		phone: profile.phone,
		providerData:
			(profile.providerData as Record<string, unknown> | undefined) ??
			undefined,
		schedules: [],
		transitNumber: profile.transitNumber,
	};
}

function buildOriginationCaseSummaryLabel(
	caseRecord: Pick<
		Doc<"adminOriginationCases">,
		"_id" | "participantsDraft" | "propertyDraft"
	>
) {
	const borrower =
		caseRecord.participantsDraft?.primaryBorrower?.fullName ??
		caseRecord.participantsDraft?.primaryBorrower?.email;
	if (borrower) {
		return borrower;
	}

	const property = caseRecord.propertyDraft?.create;
	if (property?.streetAddress) {
		return property.streetAddress;
	}

	return `Case ${String(caseRecord._id).slice(-6).toUpperCase()}`;
}

async function resolveViewerUserId(
	ctx: Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">,
	viewerAuthId: string
) {
	const user = await ctx.db
		.query("users")
		.withIndex("authId", (query) => query.eq("authId", viewerAuthId))
		.unique();
	if (!user) {
		throw new ConvexError("Viewer user record not found");
	}
	return user._id;
}

async function listBorrowerSearchResults(
	ctx: Pick<QueryCtx, "db">,
	caseRecord: Pick<Doc<"adminOriginationCases">, "orgId">
) {
	const borrowers = caseRecord.orgId
		? await ctx.db
				.query("borrowers")
				.withIndex("by_org", (query) => query.eq("orgId", caseRecord.orgId))
				.take(50)
		: await ctx.db.query("borrowers").take(50);

	const searchResults = await Promise.all(
		borrowers.map(async (borrower) => {
			const user = await ctx.db.get(borrower.userId);
			const fullName =
				user && (user.firstName || user.lastName)
					? `${user.firstName} ${user.lastName}`.trim()
					: null;

			return {
				borrowerId: String(borrower._id),
				email: user?.email ?? null,
				fullName,
			};
		})
	);

	return searchResults.sort((left, right) =>
		(left.fullName ?? left.email ?? left.borrowerId).localeCompare(
			right.fullName ?? right.email ?? right.borrowerId
		)
	);
}

function resolveAvailableScheduleDisabledReason(args: {
	caseId: Id<"adminOriginationCases">;
	schedule: Doc<"externalProviderSchedules">;
}) {
	if (args.schedule.linkStatus === "linked") {
		return "Already assigned to a mortgage";
	}

	if (args.schedule.linkStatus === "conflict") {
		return "Conflict requires reconciliation";
	}

	if (
		args.schedule.linkStatus === "reserved" &&
		args.schedule.reservedForCaseId !== args.caseId
	) {
		return "Reserved by another origination case";
	}

	return null;
}

function resolveImportedScheduleLinkStatus(
	schedule: Pick<
		Doc<"externalProviderSchedules">,
		"linkStatus" | "linkedMortgageId" | "reservedForCaseId"
	>
) {
	if (
		schedule.linkStatus === "suppressed" ||
		schedule.linkStatus === "conflict" ||
		schedule.linkedMortgageId
	) {
		return schedule.linkStatus;
	}

	return schedule.reservedForCaseId ? "reserved" : "available";
}

async function listAvailableSchedulesForBorrower(
	ctx: Pick<QueryCtx, "db">,
	args: {
		borrowerId: Id<"borrowers">;
		caseId: Id<"adminOriginationCases">;
	}
) {
	const schedules: Doc<"externalProviderSchedules">[] = await ctx.db
		.query("externalProviderSchedules")
		.withIndex("by_borrower", (query) =>
			query.eq("borrowerId", args.borrowerId)
		)
		.collect();

	return Promise.all(
		schedules.map(async (schedule) => {
			const customerProfile: Doc<"externalCustomerProfiles"> | null =
				await ctx.db.get(schedule.externalCustomerProfileId);
			const disabledReason = resolveAvailableScheduleDisabledReason({
				caseId: args.caseId,
				schedule,
			});
			const frequencySummaryParts = [
				schedule.frequency ? formatStatusLabel(schedule.frequency) : null,
				schedule.amountCents
					? `${(schedule.amountCents / 100).toFixed(2)} CAD`
					: null,
			].filter(Boolean);

			return {
				bankAccountSummary:
					customerProfile?.accountLast4 &&
					customerProfile.institutionNumber &&
					customerProfile.transitNumber
						? `•••• ${customerProfile.accountLast4} • ${customerProfile.institutionNumber}-${customerProfile.transitNumber}`
						: null,
				disabledReason,
				firstPaymentDate: schedule.nextProcessDate ?? schedule.processDate,
				frequencySummary:
					frequencySummaryParts.join(" • ") || "Schedule details unavailable",
				isAssignedToMortgage: schedule.linkStatus === "linked",
				isReservedForCurrentCase:
					schedule.linkStatus === "reserved" &&
					schedule.reservedForCaseId === args.caseId,
				label: schedule.externalScheduleRef
					? `Rotessa ${schedule.externalScheduleRef}`
					: `Schedule ${String(schedule._id).slice(-6).toUpperCase()}`,
				nextProcessDate:
					schedule.nextProcessDate ?? schedule.processDate ?? null,
				originationPaymentFrequency:
					schedule.originationPaymentFrequency ?? null,
				paymentAmountCents: schedule.amountCents ?? null,
				scheduleId: String(schedule._id),
				status: schedule.providerScheduleStatus ?? schedule.linkStatus,
			};
		})
	);
}

export const getCollectionsSetupContext = originationQuery
	.input({
		caseId: v.id("adminOriginationCases"),
	})
	.handler(async (ctx, args) => {
		const caseRecord = await ctx.db.get(args.caseId);
		if (!caseRecord) {
			return null;
		}

		assertOriginationCaseAccess(ctx.viewer, caseRecord);

		const primaryBorrower = await resolvePrimaryBorrowerContext(
			ctx,
			caseRecord
		);
		const normalizedCollectionsDraft = normalizeOriginationCollectionsDraft(
			caseRecord.collectionsDraft
		);
		const selectedBorrowerId =
			normalizedCollectionsDraft?.selectedBorrowerId ?? null;
		const bankAccounts =
			selectedBorrowerId === null
				? []
				: await ctx.db
						.query("bankAccounts")
						.withIndex("by_owner", (query) =>
							query
								.eq("ownerType", "borrower")
								.eq("ownerId", String(selectedBorrowerId))
						)
						.collect();
		const searchResults = await listBorrowerSearchResults(ctx, caseRecord);
		const availableSchedules =
			selectedBorrowerId === null
				? []
				: await listAvailableSchedulesForBorrower(ctx, {
						borrowerId: selectedBorrowerId,
						caseId: args.caseId,
					});

		const bankAccountOptions = bankAccounts.map((bankAccount) => {
			const eligibilityErrors = buildBankAccountEligibilityErrors(bankAccount);
			return {
				accountLast4: bankAccount.accountLast4 ?? null,
				bankAccountId: String(bankAccount._id),
				eligibilityErrors,
				hasRotessaCustomerReference: hasRotessaCustomerReference(
					bankAccount.metadata
				),
				institutionNumber: bankAccount.institutionNumber ?? null,
				isDefaultInbound: bankAccount.isDefaultInbound ?? false,
				mandateStatus: bankAccount.mandateStatus,
				status: bankAccount.status,
				transitNumber: bankAccount.transitNumber ?? null,
				validationMethod: bankAccount.validationMethod ?? null,
			};
		});

		const selectedBankAccountId =
			normalizedCollectionsDraft?.selectedBankAccountId === undefined
				? null
				: String(normalizedCollectionsDraft.selectedBankAccountId);
		const selectedBankAccount =
			bankAccountOptions.find(
				(bankAccount) => bankAccount.bankAccountId === selectedBankAccountId
			) ?? null;
		const preflightErrors: string[] = [];
		const executionIntent =
			normalizedCollectionsDraft?.executionIntent ??
			(normalizedCollectionsDraft?.mode === "app_owned_only"
				? "app_owned"
				: normalizedCollectionsDraft?.mode);

		if (
			executionIntent === "provider_managed_now" &&
			normalizedCollectionsDraft?.scheduleSource === "create" &&
			selectedBankAccountId === null
		) {
			preflightErrors.push(
				"Select a borrower bank account for immediate Rotessa activation."
			);
		}
		if (
			executionIntent === "provider_managed_now" &&
			selectedBankAccount !== null
		) {
			preflightErrors.push(...selectedBankAccount.eligibilityErrors);
		}
		if (
			executionIntent === "provider_managed_now" &&
			selectedBankAccountId !== null &&
			selectedBankAccount === null
		) {
			preflightErrors.push(
				"The selected bank account is not owned by the selected borrower."
			);
		}

		return {
			activationStatus:
				executionIntent === "provider_managed_now"
					? (normalizedCollectionsDraft?.providerManagedActivationStatus ??
						normalizedCollectionsDraft?.activationStatus ??
						"pending")
					: null,
			availableSchedules,
			bankAccounts: bankAccountOptions,
			mortgageTerms: caseRecord.mortgageDraft
				? {
						firstPaymentDate: caseRecord.mortgageDraft.firstPaymentDate ?? null,
						paymentAmount: caseRecord.mortgageDraft.paymentAmount ?? null,
						paymentFrequency: caseRecord.mortgageDraft.paymentFrequency ?? null,
					}
				: null,
			preflightErrors,
			primaryBorrower: {
				borrowerId:
					primaryBorrower.borrowerId === null
						? null
						: String(primaryBorrower.borrowerId),
				email: primaryBorrower.email,
				fullName: primaryBorrower.fullName,
				message: buildPrimaryBorrowerMessage(primaryBorrower.state),
				state: primaryBorrower.state,
			},
			providerCode: normalizedCollectionsDraft?.providerCode ?? "pad_rotessa",
			searchResults,
			selectedBankAccount,
		};
	})
	.public();

export const commitCanonicalBorrowerProfile = convex
	.mutation()
	.input({
		accountNumber: v.optional(v.string()),
		authId: v.string(),
		email: v.string(),
		firstName: v.optional(v.string()),
		fullName: v.string(),
		institutionNumber: v.optional(v.string()),
		lastName: v.optional(v.string()),
		orgId: v.optional(v.string()),
		phone: v.optional(v.string()),
		sourceLabel: v.string(),
		transitNumber: v.optional(v.string()),
	})
	.handler(async (ctx, args) => {
		const now = Date.now();
		const userId = await ensureCollectionsUserRow({
			authId: args.authId,
			ctx,
			email: args.email,
			firstName: args.firstName,
			lastName: args.lastName,
			phoneNumber: args.phone,
		});
		const workflowSourceKey = buildCollectionsWorkflowSourceKey({
			email: args.email,
			sourceLabel: args.sourceLabel,
		});
		const borrowerResult = await ensureCanonicalBorrowerForOrigination(ctx, {
			creationSource: args.sourceLabel,
			now,
			orgId: args.orgId,
			originatingWorkflowId: args.sourceLabel,
			originatingWorkflowType: "admin_origination_collections",
			userId,
			workflowSourceId: args.sourceLabel,
			workflowSourceKey,
		});

		const existingAccounts = await ctx.db
			.query("bankAccounts")
			.withIndex("by_owner", (query) =>
				query
					.eq("ownerType", "borrower")
					.eq("ownerId", String(borrowerResult.borrowerId))
			)
			.collect();
		const matchingBankAccount =
			existingAccounts.find(
				(account) =>
					account.accountNumber &&
					args.accountNumber &&
					account.accountNumber === args.accountNumber
			) ??
			existingAccounts.find(
				(account) =>
					account.accountLast4 ===
						(args.accountNumber && args.accountNumber.length >= 4
							? args.accountNumber.slice(-4)
							: undefined) &&
					account.institutionNumber === args.institutionNumber &&
					account.transitNumber === args.transitNumber
			);

		let bankAccountId = matchingBankAccount?._id;
		if (
			!bankAccountId &&
			args.accountNumber &&
			args.institutionNumber &&
			args.transitNumber
		) {
			bankAccountId = await ctx.db.insert("bankAccounts", {
				accountLast4: args.accountNumber.slice(-4),
				accountNumber: args.accountNumber,
				country: "CA",
				createdAt: now,
				currency: "CAD",
				institutionNumber: args.institutionNumber,
				isDefaultInbound: !existingAccounts.some(
					(account) => account.isDefaultInbound
				),
				mandateStatus: "pending",
				ownerId: String(borrowerResult.borrowerId),
				ownerType: "borrower",
				status: "validated",
				transitNumber: args.transitNumber,
				updatedAt: now,
				validationMethod: "manual",
			});
		}

		return {
			bankAccountId,
			borrowerId: borrowerResult.borrowerId,
			email: normalizeEmail(args.email),
			fullName: args.fullName,
		};
	})
	.internal();

export const createCanonicalBorrowerProfile = convex
	.action()
	.input({
		accountNumber: v.optional(v.string()),
		email: v.string(),
		fullName: v.string(),
		institutionNumber: v.optional(v.string()),
		orgId: v.optional(v.string()),
		phone: v.optional(v.string()),
		sourceLabel: v.string(),
		transitNumber: v.optional(v.string()),
	})
	.handler(async (ctx, args) => {
		const provisioning = getWorkosProvisioning();
		const normalizedEmail = normalizeEmail(args.email);
		const existingUsers = await provisioning.listUsers({
			email: normalizedEmail,
		});
		const existingUser = existingUsers.find(
			(user) => normalizeEmail(user.email) === normalizedEmail
		);
		const workosUser =
			existingUser ??
			(await provisioning.createUser({
				email: normalizedEmail,
				...provisionableParticipantName({
					fullName: args.fullName,
				}),
			}));

		const { firstName, lastName } = splitFullName(args.fullName);
		return ctx.runMutation(commitCanonicalBorrowerProfileRef, {
			accountNumber: args.accountNumber,
			authId: workosUser.id,
			email: normalizedEmail,
			firstName: firstName || undefined,
			fullName: args.fullName,
			institutionNumber: args.institutionNumber,
			lastName,
			orgId: args.orgId,
			phone: args.phone,
			sourceLabel: args.sourceLabel,
			transitNumber: args.transitNumber,
		});
	})
	.internal();

export const createBorrowerForCollections = originationAction
	.input({
		accountNumber: v.string(),
		caseId: v.id("adminOriginationCases"),
		email: v.string(),
		fullName: v.string(),
		institutionNumber: v.string(),
		phone: v.optional(v.string()),
		transitNumber: v.string(),
	})
	.handler(async (ctx, args) => {
		const commitContext = await ctx.runQuery(
			internal.admin.origination.commit.getCommitContext,
			{
				caseId: args.caseId,
				viewerAuthId: ctx.viewer.authId,
				viewerIsFairLendAdmin: ctx.viewer.isFairLendAdmin,
				viewerOrgId: ctx.viewer.orgId,
			}
		);
		if (!commitContext) {
			throw new ConvexError("Origination case not found");
		}

		return ctx.runAction(createCanonicalBorrowerProfileRef, {
			accountNumber: args.accountNumber,
			email: args.email,
			fullName: args.fullName,
			institutionNumber: args.institutionNumber,
			orgId: ctx.viewer.orgId,
			phone: args.phone,
			sourceLabel: `origination_case:${args.caseId}`,
			transitNumber: args.transitNumber,
		});
	})
	.public();

export const getRotessaScheduleCreationContextInternal = convex
	.query()
	.input({
		bankAccountId: v.id("bankAccounts"),
		borrowerId: v.id("borrowers"),
		caseId: v.id("adminOriginationCases"),
		viewerAuthId: v.string(),
		viewerIsFairLendAdmin: v.boolean(),
		viewerOrgId: v.optional(v.string()),
	})
	.handler(async (ctx, args) => {
		const caseRecord = await ctx.db.get(args.caseId);
		if (!caseRecord) {
			throw new ConvexError("Origination case not found");
		}
		assertOriginationCaseAccess(
			{
				isFairLendAdmin: args.viewerIsFairLendAdmin,
				orgId: args.viewerOrgId,
			},
			caseRecord
		);

		const borrower = await ctx.db.get(args.borrowerId);
		if (!borrower) {
			throw new ConvexError("Borrower not found");
		}
		if (
			caseRecord.orgId &&
			borrower.orgId &&
			caseRecord.orgId !== borrower.orgId
		) {
			throw new ConvexError(
				"Selected borrower belongs to a different organization"
			);
		}
		const borrowerUser = await ctx.db.get(borrower.userId);
		if (!borrowerUser) {
			throw new ConvexError("Borrower user record not found");
		}

		const bankAccount = await ctx.db.get(args.bankAccountId);
		if (!bankAccount) {
			throw new ConvexError("Bank account not found");
		}
		if (
			bankAccount.ownerType !== "borrower" ||
			bankAccount.ownerId !== String(args.borrowerId)
		) {
			throw new ConvexError(
				"Selected bank account is not owned by the selected borrower"
			);
		}

		const existingCustomerProfiles = await ctx.db
			.query("externalCustomerProfiles")
			.withIndex("by_borrower", (query) =>
				query.eq("borrowerId", args.borrowerId)
			)
			.collect();
		const linkedCustomerProfile =
			existingCustomerProfiles.find(
				(profile) =>
					profile.bankAccountId === args.bankAccountId &&
					profile.matchStatus === "linked"
			) ??
			existingCustomerProfiles.find(
				(profile) => profile.matchStatus === "linked"
			) ??
			null;

		return {
			bankAccount: {
				_id: bankAccount._id,
				accountNumber: bankAccount.accountNumber ?? null,
				institutionNumber: bankAccount.institutionNumber ?? null,
				mandateStatus: bankAccount.mandateStatus,
				metadata:
					(bankAccount.metadata as Record<string, unknown> | undefined) ??
					undefined,
				status: bankAccount.status,
				transitNumber: bankAccount.transitNumber ?? null,
			},
			borrower: {
				_id: borrower._id,
				email: borrowerUser.email,
				fullName:
					`${borrowerUser.firstName} ${borrowerUser.lastName}`.trim() ||
					borrowerUser.email,
				orgId: borrower.orgId,
				phone: borrowerUser.phoneNumber ?? null,
			},
			existingCustomerProfile:
				linkedCustomerProfile === null
					? null
					: {
							accountNumber: linkedCustomerProfile.accountNumber ?? null,
							accountLast4: linkedCustomerProfile.accountLast4 ?? null,
							bankAccountId: linkedCustomerProfile.bankAccountId ?? null,
							customerProfileId: linkedCustomerProfile._id,
							externalCustomerCustomIdentifier:
								linkedCustomerProfile.externalCustomerCustomIdentifier ?? null,
							externalCustomerRef: linkedCustomerProfile.externalCustomerRef,
							fullName: linkedCustomerProfile.fullName,
						},
			mortgageDraft: caseRecord.mortgageDraft ?? null,
			viewerUserId: (
				await ctx.db
					.query("users")
					.withIndex("authId", (query) => query.eq("authId", args.viewerAuthId))
					.unique()
			)?._id,
		};
	})
	.internal();

export const recordCreatedRotessaScheduleForCase = convex
	.mutation()
	.input({
		actorUserId: v.optional(v.id("users")),
		bankAccountId: v.id("bankAccounts"),
		borrowerId: v.id("borrowers"),
		caseId: v.id("adminOriginationCases"),
		customer: v.object({
			accountLast4: v.optional(v.string()),
			accountNumber: v.optional(v.string()),
			authorizationType: v.optional(v.string()),
			bankAccountType: v.optional(v.string()),
			bankName: v.optional(v.string()),
			customerType: v.optional(v.string()),
			email: v.string(),
			externalCustomerCustomIdentifier: v.optional(v.string()),
			externalCustomerRef: v.string(),
			fullName: v.string(),
			institutionNumber: v.optional(v.string()),
			phone: v.optional(v.string()),
			transitNumber: v.optional(v.string()),
		}),
		schedule: v.object({
			amountCents: v.number(),
			comment: v.string(),
			externalScheduleRef: v.string(),
			frequency: v.string(),
			installments: v.number(),
			nextProcessDate: v.optional(v.string()),
			processDate: v.string(),
		}),
	})
	.handler(async (ctx, args) => {
		const borrower = await ctx.db.get(args.borrowerId);
		if (!borrower) {
			throw new ConvexError("Borrower not found");
		}
		const now = Date.now();
		const customerProfile = await upsertExternalCustomerProfile(ctx, {
			customer: {
				...args.customer,
				schedules: [],
			},
			match: {
				borrowerId: args.borrowerId,
				matchStatus: "linked",
				orgId: borrower.orgId,
			},
			now,
			source: "origination_create",
		});
		const [providerScheduleId] =
			await upsertExternalProviderSchedulesForCustomer(ctx, {
				bankAccountId: args.bankAccountId,
				borrowerId: args.borrowerId,
				customerProfileId: customerProfile.customerProfileId,
				now,
				reservedForCaseId: args.caseId,
				schedules: [buildNormalizedScheduleSnapshot(args.schedule)],
				source: "origination_create",
			});

		await ctx.db.patch(args.bankAccountId, {
			mandateStatus: "active",
			updatedAt: now,
		});

		await logRotessaReconciliationAction(ctx, {
			actionType: "create_origination_schedule",
			actorUserId: args.actorUserId,
			entityId: String(providerScheduleId),
			entityType: "schedule",
			metadata: {
				bankAccountId: String(args.bankAccountId),
				borrowerId: String(args.borrowerId),
				caseId: String(args.caseId),
				customerProfileId: String(customerProfile.customerProfileId),
			},
			now,
		});

		return {
			customerProfileId: customerProfile.customerProfileId,
			providerScheduleId,
		};
	})
	.internal();

export const createRotessaScheduleForCase = originationAction
	.input({
		bankAccountId: v.id("bankAccounts"),
		borrowerId: v.id("borrowers"),
		caseId: v.id("adminOriginationCases"),
		padAuthorizationAssetId: v.optional(v.id("documentAssets")),
		padAuthorizationOverrideReason: v.optional(v.string()),
		padAuthorizationSource: v.union(
			v.literal("uploaded"),
			v.literal("admin_override")
		),
	})
	.handler(async (ctx, args) => {
		const creationContext = await ctx.runQuery(
			getRotessaScheduleCreationContextInternalRef,
			{
				bankAccountId: args.bankAccountId,
				borrowerId: args.borrowerId,
				caseId: args.caseId,
				viewerAuthId: ctx.viewer.authId,
				viewerIsFairLendAdmin: ctx.viewer.isFairLendAdmin,
				viewerOrgId: ctx.viewer.orgId,
			}
		);
		const mortgageDraft = creationContext.mortgageDraft;
		if (
			!(
				mortgageDraft?.paymentAmount &&
				mortgageDraft.paymentFrequency &&
				mortgageDraft.firstPaymentDate &&
				mortgageDraft.maturityDate
			)
		) {
			throw new ConvexError(
				"Core Economics must stage payment amount, frequency, first payment date, and maturity date before creating a Rotessa schedule."
			);
		}
		if (
			args.padAuthorizationSource === "uploaded" &&
			!args.padAuthorizationAssetId
		) {
			throw new ConvexError(
				"Upload a signed PAD document before creating the Rotessa payment schedule."
			);
		}
		if (
			args.padAuthorizationSource === "admin_override" &&
			!args.padAuthorizationOverrideReason?.trim()
		) {
			throw new ConvexError(
				"Enter an admin override reason before creating the Rotessa payment schedule."
			);
		}
		if (
			!(
				creationContext.bankAccount.accountNumber &&
				creationContext.bankAccount.institutionNumber &&
				creationContext.bankAccount.transitNumber
			)
		) {
			throw new ConvexError(
				"Selected bank account is missing the information required to create a Rotessa customer."
			);
		}

		const client = createRotessaClient();
		let customerSnapshot: NormalizedRotessaCustomerSnapshot | null = null;
		let customerId: number | undefined;

		if (creationContext.existingCustomerProfile) {
			customerId = Number.parseInt(
				creationContext.existingCustomerProfile.externalCustomerRef,
				10
			);
			customerSnapshot = {
				accountLast4:
					creationContext.existingCustomerProfile.accountLast4 ?? undefined,
				accountNumber:
					creationContext.existingCustomerProfile.accountNumber ?? undefined,
				email: creationContext.borrower.email,
				externalCustomerCustomIdentifier:
					creationContext.existingCustomerProfile
						.externalCustomerCustomIdentifier ?? undefined,
				externalCustomerRef:
					creationContext.existingCustomerProfile.externalCustomerRef,
				fullName: creationContext.borrower.fullName,
				institutionNumber:
					creationContext.bankAccount.institutionNumber ?? undefined,
				phone: creationContext.borrower.phone ?? undefined,
				schedules: [],
				transitNumber: creationContext.bankAccount.transitNumber ?? undefined,
			};
		} else {
			const createdCustomer = await client.customers.create({
				account_number: creationContext.bankAccount.accountNumber,
				authorization_type:
					args.padAuthorizationSource === "uploaded" ? "Online" : "In Person",
				bank_account_type: "Checking",
				custom_identifier: `borrower:${args.borrowerId}:bank:${args.bankAccountId}`,
				email: creationContext.borrower.email,
				institution_number: creationContext.bankAccount.institutionNumber,
				name: creationContext.borrower.fullName,
				phone: creationContext.borrower.phone ?? undefined,
				transit_number: creationContext.bankAccount.transitNumber,
			});
			customerId = createdCustomer.id;
			customerSnapshot = {
				accountLast4:
					createdCustomer.account_number?.slice(-4) ??
					creationContext.bankAccount.accountNumber.slice(-4),
				accountNumber: createdCustomer.account_number ?? undefined,
				authorizationType: createdCustomer.authorization_type ?? undefined,
				bankAccountType: createdCustomer.bank_account_type ?? undefined,
				bankName: createdCustomer.bank_name ?? undefined,
				customerType: createdCustomer.customer_type ?? undefined,
				email: createdCustomer.email,
				externalCustomerCustomIdentifier:
					createdCustomer.custom_identifier ?? undefined,
				externalCustomerRef: String(createdCustomer.id),
				fullName: createdCustomer.name,
				institutionNumber: createdCustomer.institution_number ?? undefined,
				phone: createdCustomer.phone ?? createdCustomer.home_phone ?? undefined,
				schedules: [],
				transitNumber: createdCustomer.transit_number ?? undefined,
			};
		}

		if (!(customerId && Number.isFinite(customerId))) {
			throw new ConvexError(
				"Unable to resolve a Rotessa customer for schedule creation."
			);
		}

		const installments = computeScheduledInstallmentCount({
			firstPaymentDate: mortgageDraft.firstPaymentDate,
			maturityDate: mortgageDraft.maturityDate,
			paymentFrequency: mortgageDraft.paymentFrequency,
		});
		const frequency = mapOriginationFrequencyToRotessaFrequency(
			mortgageDraft.paymentFrequency
		);
		const scheduleComment = `origination_case:${args.caseId};borrower:${args.borrowerId}`;
		const createdSchedule = await client.transactionSchedules.create({
			amount: Number((mortgageDraft.paymentAmount / 100).toFixed(2)),
			comment: scheduleComment,
			customer_id: customerId,
			frequency,
			installments,
			process_date: mortgageDraft.firstPaymentDate,
		});

		try {
			const committed = await ctx.runMutation(
				recordCreatedRotessaScheduleForCaseRef,
				{
					actorUserId: creationContext.viewerUserId ?? undefined,
					bankAccountId: args.bankAccountId,
					borrowerId: args.borrowerId,
					caseId: args.caseId,
					customer: {
						accountLast4:
							customerSnapshot.accountLast4 ??
							creationContext.bankAccount.accountNumber?.slice(-4),
						accountNumber: customerSnapshot.accountNumber,
						authorizationType: customerSnapshot.authorizationType,
						bankAccountType: customerSnapshot.bankAccountType,
						bankName: customerSnapshot.bankName,
						customerType: customerSnapshot.customerType,
						email: customerSnapshot.email ?? creationContext.borrower.email,
						externalCustomerCustomIdentifier:
							customerSnapshot.externalCustomerCustomIdentifier,
						externalCustomerRef: customerSnapshot.externalCustomerRef,
						fullName: customerSnapshot.fullName,
						institutionNumber:
							customerSnapshot.institutionNumber ??
							creationContext.bankAccount.institutionNumber ??
							undefined,
						phone: customerSnapshot.phone,
						transitNumber:
							customerSnapshot.transitNumber ??
							creationContext.bankAccount.transitNumber ??
							undefined,
					},
					schedule: {
						amountCents: mortgageDraft.paymentAmount,
						comment: createdSchedule.comment ?? scheduleComment,
						externalScheduleRef: String(createdSchedule.id),
						frequency: createdSchedule.frequency,
						installments: createdSchedule.installments ?? installments,
						nextProcessDate: createdSchedule.next_process_date ?? undefined,
						processDate: createdSchedule.process_date,
					},
				}
			);

			return {
				borrower: creationContext.borrower,
				firstPaymentDate:
					createdSchedule.next_process_date ?? createdSchedule.process_date,
				paymentAmountCents: mortgageDraft.paymentAmount,
				paymentFrequency: mapRotessaFrequencyToOriginationPaymentFrequency(
					createdSchedule.frequency
				),
				providerScheduleId: String(committed.providerScheduleId),
			};
		} catch (error) {
			await client.transactionSchedules.delete(createdSchedule.id);
			throw error;
		}
	})
	.public();

const normalizedRotessaScheduleSnapshotValidator = v.object({
	amountCents: v.optional(v.number()),
	comment: v.optional(v.string()),
	externalScheduleRef: v.string(),
	frequency: v.string(),
	installments: v.optional(v.number()),
	nextProcessDate: v.optional(v.string()),
	originationPaymentFrequency: v.optional(
		v.union(
			v.literal("monthly"),
			v.literal("bi_weekly"),
			v.literal("accelerated_bi_weekly"),
			v.literal("weekly")
		)
	),
	processDate: v.string(),
	providerData: v.optional(v.record(v.string(), v.any())),
	providerScheduleStatus: v.optional(v.string()),
});

const normalizedRotessaCustomerSnapshotValidator = v.object({
	accountLast4: v.optional(v.string()),
	accountNumber: v.optional(v.string()),
	authorizationType: v.optional(v.string()),
	bankAccountType: v.optional(v.string()),
	bankName: v.optional(v.string()),
	customerType: v.optional(v.string()),
	email: v.optional(v.string()),
	externalCustomerCustomIdentifier: v.optional(v.string()),
	externalCustomerRef: v.string(),
	fullName: v.string(),
	institutionNumber: v.optional(v.string()),
	phone: v.optional(v.string()),
	providerData: v.optional(v.record(v.string(), v.any())),
	schedules: v.array(normalizedRotessaScheduleSnapshotValidator),
	transitNumber: v.optional(v.string()),
});

export const getRotessaCustomerProfileInternal = convex
	.query()
	.input({
		customerProfileId: v.id("externalCustomerProfiles"),
	})
	.handler(async (ctx, args) => ctx.db.get(args.customerProfileId))
	.internal();

export const upsertRotessaCustomerSnapshot = convex
	.mutation()
	.input({
		customer: normalizedRotessaCustomerSnapshotValidator,
		source: v.union(
			v.literal("sync"),
			v.literal("origination_create"),
			v.literal("admin_link")
		),
	})
	.handler(async (ctx, args): Promise<RotessaCustomerUpsertResult> => {
		const now = Date.now();
		const match = await resolveBorrowerMatchForRotessaCustomer(
			ctx,
			args.customer
		);
		const customerProfile = await upsertExternalCustomerProfile(ctx, {
			customer: args.customer,
			match,
			now,
			source: args.source,
		});
		await upsertExternalProviderSchedulesForCustomer(ctx, {
			bankAccountId: customerProfile.bankAccountId,
			borrowerId: match.borrowerId,
			customerProfileId: customerProfile.customerProfileId,
			now,
			schedules: args.customer.schedules,
			source: args.source === "admin_link" ? "sync" : args.source,
		});

		return {
			customerMatchStatus: customerProfile.matchStatus,
			customerProfileId: customerProfile.customerProfileId,
			scheduleCount: args.customer.schedules.length,
		};
	})
	.internal();

export const startRotessaSyncRun = convex
	.mutation()
	.input({
		trigger: v.union(v.literal("cron"), v.literal("manual")),
	})
	.handler(async (ctx, args) =>
		ctx.db.insert("rotessaSyncRuns", {
			availableScheduleCount: 0,
			conflictCustomerCount: 0,
			conflictScheduleCount: 0,
			customerCount: 0,
			linkedScheduleCount: 0,
			matchedCustomerCount: 0,
			scheduleCount: 0,
			startedAt: Date.now(),
			status: "running",
			trigger: args.trigger,
			unmatchedCustomerCount: 0,
		})
	)
	.internal();

export const finishRotessaSyncRun = convex
	.mutation()
	.input({
		availableScheduleCount: v.number(),
		conflictCustomerCount: v.number(),
		conflictScheduleCount: v.number(),
		customerCount: v.number(),
		errorMessage: v.optional(v.string()),
		linkedScheduleCount: v.number(),
		matchedCustomerCount: v.number(),
		runId: v.id("rotessaSyncRuns"),
		scheduleCount: v.number(),
		status: v.union(v.literal("success"), v.literal("failed")),
		unmatchedCustomerCount: v.number(),
	})
	.handler(async (ctx, args) => {
		await ctx.db.patch(args.runId, {
			availableScheduleCount: args.availableScheduleCount,
			conflictCustomerCount: args.conflictCustomerCount,
			conflictScheduleCount: args.conflictScheduleCount,
			customerCount: args.customerCount,
			errorMessage: args.errorMessage,
			finishedAt: Date.now(),
			linkedScheduleCount: args.linkedScheduleCount,
			matchedCustomerCount: args.matchedCustomerCount,
			scheduleCount: args.scheduleCount,
			status: args.status,
			unmatchedCustomerCount: args.unmatchedCustomerCount,
		});
		return ctx.db.get(args.runId);
	})
	.internal();

export const runRotessaReadModelSync = convex
	.action()
	.input({
		trigger: v.union(v.literal("cron"), v.literal("manual")),
	})
	.handler(async (ctx, args): Promise<RotessaSyncStats> => {
		const runId = await ctx.runMutation(startRotessaSyncRunRef, {
			trigger: args.trigger,
		});
		const client = createRotessaClient();
		const stats: RotessaSyncStats = {
			availableScheduleCount: 0,
			conflictCustomerCount: 0,
			conflictScheduleCount: 0,
			customerCount: 0,
			linkedScheduleCount: 0,
			matchedCustomerCount: 0,
			scheduleCount: 0,
			unmatchedCustomerCount: 0,
		};

		try {
			const customers = await client.customers.list();
			for (const customer of customers) {
				const detail = await client.customers.get(customer.id);
				const normalized = normalizeRotessaCustomerDetail(detail);
				const result = await ctx.runMutation(upsertRotessaCustomerSnapshotRef, {
					customer: normalized,
					source: "sync",
				});

				stats.customerCount += 1;
				stats.scheduleCount += normalized.schedules.length;
				if (result.customerMatchStatus === "linked") {
					stats.matchedCustomerCount += 1;
				} else if (result.customerMatchStatus === "conflict") {
					stats.conflictCustomerCount += 1;
				} else if (result.customerMatchStatus === "unmatched") {
					stats.unmatchedCustomerCount += 1;
				}
			}

			const snapshot = await ctx.runQuery(
				getRotessaReconciliationSnapshotRef,
				{}
			);
			stats.availableScheduleCount = snapshot.summary.availableSchedules;
			stats.linkedScheduleCount = snapshot.summary.linkedSchedules;
			stats.conflictScheduleCount = snapshot.summary.conflictSchedules;

			await ctx.runMutation(finishRotessaSyncRunRef, {
				...stats,
				runId,
				status: "success",
			});

			return stats;
		} catch (error) {
			await ctx.runMutation(finishRotessaSyncRunRef, {
				...stats,
				errorMessage:
					error instanceof Error ? error.message : "Rotessa sync failed",
				runId,
				status: "failed",
			});
			throw error;
		}
	})
	.internal();

export const syncRotessaReadModelNow = paymentManageAction
	.input({})
	.handler(async (ctx) =>
		ctx.runAction(runRotessaReadModelSyncRef, {
			trigger: "manual",
		})
	)
	.public();

export const getRotessaReconciliationSnapshot = paymentManageQuery
	.input({})
	.handler(async (ctx): Promise<RotessaReconciliationSnapshot> => {
		const now = Date.now();
		const customerProfiles: Doc<"externalCustomerProfiles">[] = await ctx.db
			.query("externalCustomerProfiles")
			.collect();
		const providerSchedules: Doc<"externalProviderSchedules">[] = await ctx.db
			.query("externalProviderSchedules")
			.collect();
		const latestSyncRun = await ctx.db
			.query("rotessaSyncRuns")
			.withIndex("by_started_at")
			.order("desc")
			.first();
		const borrowers: Doc<"borrowers">[] = await ctx.db
			.query("borrowers")
			.collect();
		const borrowerOptions: RotessaBorrowerOption[] = [];

		for (const borrower of borrowers) {
			const user = await ctx.db.get(borrower.userId);
			if (!user) {
				continue;
			}
			const fullName =
				`${user.firstName} ${user.lastName}`.trim() || user.email;
			borrowerOptions.push({
				borrowerId: String(borrower._id),
				email: user.email ?? null,
				fullName,
			});
		}
		borrowerOptions.sort((left, right) =>
			left.fullName.localeCompare(right.fullName)
		);

		const unmatchedCustomers = customerProfiles
			.filter((profile) => profile.matchStatus === "unmatched")
			.map((profile) => ({
				accountSummary: [
					profile.accountLast4 ? `•••• ${profile.accountLast4}` : undefined,
					profile.institutionNumber && profile.transitNumber
						? `${profile.institutionNumber}-${profile.transitNumber}`
						: undefined,
				]
					.filter(Boolean)
					.join(" • "),
				customerProfileId: String(profile._id),
				email: profile.email ?? null,
				externalCustomerRef: profile.externalCustomerRef,
				fullName: profile.fullName,
				scheduleCount: providerSchedules.filter(
					(schedule) => schedule.externalCustomerProfileId === profile._id
				).length,
			}))
			.sort((left, right) => left.fullName.localeCompare(right.fullName));

		const unmatchedSchedules = providerSchedules
			.filter(
				(schedule) =>
					schedule.linkStatus === "available" &&
					schedule.borrowerId === undefined
			)
			.map((schedule) => {
				const profile = customerProfiles.find(
					(customer) => customer._id === schedule.externalCustomerProfileId
				);
				return {
					amountCents: schedule.amountCents ?? null,
					externalScheduleRef: schedule.externalScheduleRef,
					frequency: schedule.frequency,
					nextProcessDate: schedule.nextProcessDate ?? null,
					processDate: schedule.processDate,
					providerScheduleId: String(schedule._id),
					providerStatus: schedule.providerScheduleStatus ?? null,
					sourceCustomer:
						profile?.fullName ?? profile?.email ?? schedule.externalScheduleRef,
				};
			});

		const conflicts = [
			...customerProfiles
				.filter((profile) => profile.matchStatus === "conflict")
				.map((profile) => ({
					detail:
						"Multiple canonical borrower matches exist for this Rotessa customer email.",
					entityId: String(profile._id),
					entityType: "customer" as const,
					title: profile.fullName,
				})),
			...providerSchedules
				.filter((schedule) => schedule.linkStatus === "conflict")
				.map((schedule) => ({
					detail:
						"This imported Rotessa schedule is in a conflict state and cannot be attached automatically.",
					entityId: String(schedule._id),
					entityType: "schedule" as const,
					title: schedule.externalScheduleRef,
				})),
		];

		const brokenLinks = (
			await Promise.all(
				providerSchedules.map(async (schedule) => {
					if (
						schedule.linkStatus !== "linked" ||
						!schedule.linkedMortgageId ||
						!schedule.linkedExternalCollectionScheduleId
					) {
						return null;
					}
					const linkedExternalSchedule = await ctx.db.get(
						schedule.linkedExternalCollectionScheduleId
					);
					if (!linkedExternalSchedule) {
						return {
							externalScheduleRef: schedule.externalScheduleRef,
							linkedMortgageId: String(schedule.linkedMortgageId),
							providerScheduleId: String(schedule._id),
							reason:
								"Linked imported schedule points at a missing mortgage-side external collection schedule.",
						};
					}
					if (linkedExternalSchedule.mortgageId !== schedule.linkedMortgageId) {
						return {
							externalScheduleRef: schedule.externalScheduleRef,
							linkedMortgageId: String(schedule.linkedMortgageId),
							providerScheduleId: String(schedule._id),
							reason:
								"Imported schedule and mortgage-side schedule disagree on the linked mortgage.",
						};
					}
					return null;
				})
			)
		).filter(
			(item): item is RotessaReconciliationSnapshot["brokenLinks"][number] =>
				item !== null
		);

		const cases: Doc<"adminOriginationCases">[] = await ctx.db
			.query("adminOriginationCases")
			.collect();
		const padAuthorizationExceptions = cases
			.filter((caseRecord) => {
				const collectionsDraft = caseRecord.collectionsDraft;
				const executionIntent =
					collectionsDraft?.executionIntent ??
					(collectionsDraft?.mode === "app_owned_only"
						? "app_owned"
						: collectionsDraft?.mode);
				if (executionIntent !== "provider_managed_now") {
					return false;
				}

				const hasPadEvidence =
					(collectionsDraft?.padAuthorizationSource === "uploaded" &&
						collectionsDraft.padAuthorizationAssetId) ||
					(collectionsDraft?.padAuthorizationSource === "admin_override" &&
						collectionsDraft.padAuthorizationOverrideReason);
				return !hasPadEvidence;
			})
			.map((caseRecord) => ({
				caseId: String(caseRecord._id),
				label: buildOriginationCaseSummaryLabel(caseRecord),
				padAuthorizationSource:
					caseRecord.collectionsDraft?.padAuthorizationSource ?? null,
				selectedBorrowerId:
					caseRecord.collectionsDraft?.selectedBorrowerId !== undefined
						? String(caseRecord.collectionsDraft.selectedBorrowerId)
						: null,
				selectedProviderScheduleId:
					caseRecord.collectionsDraft?.selectedProviderScheduleId !== undefined
						? String(caseRecord.collectionsDraft.selectedProviderScheduleId)
						: null,
				updatedAt: caseRecord.updatedAt,
			}));

		return {
			borrowerOptions,
			brokenLinks,
			conflicts,
			generatedAt: now,
			lastSyncRun:
				latestSyncRun === null
					? null
					: {
							customerCount: latestSyncRun.customerCount,
							errorMessage: latestSyncRun.errorMessage ?? null,
							finishedAt: latestSyncRun.finishedAt ?? null,
							scheduleCount: latestSyncRun.scheduleCount,
							startedAt: latestSyncRun.startedAt,
							status: latestSyncRun.status,
							trigger: latestSyncRun.trigger,
						},
			padAuthorizationExceptions,
			summary: {
				availableSchedules: providerSchedules.filter(
					(schedule) => schedule.linkStatus === "available"
				).length,
				conflictCustomers: customerProfiles.filter(
					(profile) => profile.matchStatus === "conflict"
				).length,
				conflictSchedules: providerSchedules.filter(
					(schedule) => schedule.linkStatus === "conflict"
				).length,
				linkedCustomers: customerProfiles.filter(
					(profile) => profile.matchStatus === "linked"
				).length,
				linkedSchedules: providerSchedules.filter(
					(schedule) => schedule.linkStatus === "linked"
				).length,
				unmatchedCustomers: unmatchedCustomers.length,
				unmatchedSchedules: unmatchedSchedules.length,
			},
			unmatchedCustomers,
			unmatchedSchedules,
		};
	})
	.public();

export const linkRotessaCustomerToBorrowerInternal = convex
	.mutation()
	.input({
		actorUserId: v.optional(v.id("users")),
		borrowerId: v.id("borrowers"),
		customerProfileId: v.id("externalCustomerProfiles"),
		note: v.optional(v.string()),
	})
	.handler(async (ctx, args) => {
		const now = Date.now();
		const profile = await ctx.db.get(args.customerProfileId);
		if (!profile) {
			throw new ConvexError("Rotessa customer profile not found");
		}
		const borrower = await ctx.db.get(args.borrowerId);
		if (!borrower) {
			throw new ConvexError("Borrower not found");
		}

		const match = {
			borrowerId: borrower._id,
			matchStatus: "linked" as const,
			orgId: borrower.orgId,
		};
		const customerProfile = await upsertExternalCustomerProfile(ctx, {
			customer: buildCustomerSnapshotFromProfile(profile),
			match,
			now,
			source: "admin_link",
		});

		const schedules: Doc<"externalProviderSchedules">[] = await ctx.db
			.query("externalProviderSchedules")
			.withIndex("by_customer", (query) =>
				query.eq("externalCustomerProfileId", args.customerProfileId)
			)
			.collect();
		for (const schedule of schedules) {
			await ctx.db.patch(schedule._id, {
				bankAccountId: customerProfile.bankAccountId,
				borrowerId: borrower._id,
				linkStatus: resolveImportedScheduleLinkStatus(schedule),
				updatedAt: now,
			});
		}

		await logRotessaReconciliationAction(ctx, {
			actionType: "link_customer_to_borrower",
			actorUserId: args.actorUserId,
			entityId: String(args.customerProfileId),
			entityType: "customer",
			metadata: {
				borrowerId: String(args.borrowerId),
				bankAccountId: customerProfile.bankAccountId
					? String(customerProfile.bankAccountId)
					: null,
			},
			note: args.note,
			now,
		});

		return {
			bankAccountId: customerProfile.bankAccountId
				? String(customerProfile.bankAccountId)
				: null,
			borrowerId: String(args.borrowerId),
			customerProfileId: String(args.customerProfileId),
		};
	})
	.internal();

export const linkRotessaCustomerToBorrower = paymentManageMutation
	.input({
		borrowerId: v.id("borrowers"),
		customerProfileId: v.id("externalCustomerProfiles"),
		note: v.optional(v.string()),
	})
	.handler(async (ctx, args) => {
		const actorUserId = await resolveViewerUserId(ctx, ctx.viewer.authId);
		return ctx.runMutation(linkRotessaCustomerToBorrowerInternalRef, {
			...args,
			actorUserId,
		});
	})
	.public();

export const createBorrowerFromRotessaCustomer = paymentManageAction
	.input({
		customerProfileId: v.id("externalCustomerProfiles"),
	})
	.handler(async (ctx, args) => {
		const profile = await ctx.runQuery(getRotessaCustomerProfileInternalRef, {
			customerProfileId: args.customerProfileId,
		});
		if (!profile) {
			throw new ConvexError("Rotessa customer profile not found");
		}
		if (!profile.email) {
			throw new ConvexError(
				"Rotessa customer is missing an email address and cannot provision a canonical borrower."
			);
		}

		const createdBorrower = await ctx.runAction(
			createCanonicalBorrowerProfileRef,
			{
				accountNumber: profile.accountNumber,
				email: profile.email,
				fullName: profile.fullName,
				institutionNumber: profile.institutionNumber,
				orgId: profile.orgId ?? ctx.viewer.orgId,
				phone: profile.phone,
				sourceLabel: "rotessa_reconciliation",
				transitNumber: profile.transitNumber,
			}
		);
		return ctx.runMutation(linkRotessaCustomerToBorrowerInternalRef, {
			borrowerId: createdBorrower.borrowerId,
			customerProfileId: args.customerProfileId,
			note: "Created borrower from Rotessa reconciliation surface",
		});
	})
	.public();

export const suppressRotessaReconciliationItem = paymentManageMutation
	.input({
		entityId: v.string(),
		entityType: v.union(v.literal("customer"), v.literal("schedule")),
		reason: v.string(),
	})
	.handler(async (ctx, args) => {
		const now = Date.now();
		const actorUserId = await resolveViewerUserId(ctx, ctx.viewer.authId);

		if (args.entityType === "customer") {
			await ctx.db.patch(args.entityId as Id<"externalCustomerProfiles">, {
				matchStatus: "suppressed",
				suppressionReason: args.reason,
				updatedAt: now,
			});
		} else {
			await ctx.db.patch(args.entityId as Id<"externalProviderSchedules">, {
				linkStatus: "suppressed",
				suppressionReason: args.reason,
				updatedAt: now,
			});
		}

		await logRotessaReconciliationAction(ctx, {
			actionType: "suppress_reconciliation_item",
			actorUserId,
			entityId: args.entityId,
			entityType: args.entityType,
			note: args.reason,
			now,
		});

		return { suppressed: true };
	})
	.public();

export const getImportedProviderScheduleInternal = convex
	.query()
	.input({
		providerScheduleId: v.id("externalProviderSchedules"),
	})
	.handler(async (ctx, args) => ctx.db.get(args.providerScheduleId))
	.internal();

export const getPlanEntryWindowInternal = convex
	.query()
	.input({
		planEntryIds: v.array(v.id("collectionPlanEntries")),
	})
	.handler(async (ctx, args) => {
		const planEntries = await Promise.all(
			args.planEntryIds.map(async (planEntryId) => {
				const planEntry = await ctx.db.get(planEntryId);
				if (!planEntry) {
					throw new ConvexError(
						`Collection plan entry not found: ${planEntryId}`
					);
				}
				return planEntry;
			})
		);
		const ordered = [...planEntries].sort(sortPlanEntriesForProviderActivation);
		const first = ordered[0];
		const last = ordered.at(-1);
		if (!(first && last)) {
			throw new ConvexError(
				"At least one collection plan entry is required to adopt an imported Rotessa schedule."
			);
		}

		return {
			coveredFromPlanEntryId: first._id,
			coveredToPlanEntryId: last._id,
			endDate: last.scheduledDate,
			startDate: first.scheduledDate,
		};
	})
	.internal();

export const markImportedProviderScheduleLinked = convex
	.mutation()
	.input({
		actorUserId: v.optional(v.id("users")),
		externalCollectionScheduleId: v.id("externalCollectionSchedules"),
		mortgageId: v.id("mortgages"),
		providerScheduleId: v.id("externalProviderSchedules"),
	})
	.handler(async (ctx, args) => {
		const now = Date.now();
		await ctx.db.patch(args.providerScheduleId, {
			linkedExternalCollectionScheduleId: args.externalCollectionScheduleId,
			linkedMortgageId: args.mortgageId,
			linkStatus: "linked",
			reservedForCaseId: undefined,
			updatedAt: now,
		});

		await logRotessaReconciliationAction(ctx, {
			actionType: "link_imported_schedule_to_mortgage",
			actorUserId: args.actorUserId,
			entityId: String(args.providerScheduleId),
			entityType: "schedule",
			metadata: {
				externalCollectionScheduleId: String(args.externalCollectionScheduleId),
				mortgageId: String(args.mortgageId),
			},
			now,
		});
	})
	.internal();

export const adoptImportedRotessaScheduleForCommittedCase = convex
	.action()
	.input({
		mortgageId: v.id("mortgages"),
		planEntryIds: v.array(v.id("collectionPlanEntries")),
		providerScheduleId: v.id("externalProviderSchedules"),
		viewerUserId: v.optional(v.id("users")),
	})
	.handler(async (ctx, args): Promise<{ scheduleId: string }> => {
		const importedSchedule = await ctx.runQuery(
			getImportedProviderScheduleInternalRef,
			{
				providerScheduleId: args.providerScheduleId,
			}
		);
		if (!importedSchedule) {
			throw new ConvexError("Imported Rotessa schedule not found");
		}
		if (!(importedSchedule.bankAccountId && importedSchedule.borrowerId)) {
			throw new ConvexError(
				"Imported Rotessa schedule is missing the canonical borrower/bank account link required for mortgage adoption."
			);
		}
		if (
			importedSchedule.linkedMortgageId &&
			importedSchedule.linkedMortgageId !== args.mortgageId
		) {
			throw new ConvexError(
				"Imported Rotessa schedule is already linked to another mortgage."
			);
		}

		const planEntryWindow = await ctx.runQuery(getPlanEntryWindowInternalRef, {
			planEntryIds: args.planEntryIds,
		});
		const activationIdempotencyKey = [
			"imported-provider-schedule",
			args.providerScheduleId,
			args.mortgageId,
		].join(":");
		const beginResult: { scheduleId: Id<"externalCollectionSchedules"> } =
			await ctx.runMutation(
				internal.payments.recurringSchedules.activation
					.beginRecurringScheduleActivation,
				{
					activationIdempotencyKey,
					bankAccountId: importedSchedule.bankAccountId,
					borrowerId: importedSchedule.borrowerId,
					cadence: importedSchedule.frequency,
					coveredFromPlanEntryId: planEntryWindow.coveredFromPlanEntryId,
					coveredToPlanEntryId: planEntryWindow.coveredToPlanEntryId,
					endDate: planEntryWindow.endDate,
					mortgageId: args.mortgageId,
					providerCode: "pad_rotessa",
					source: "origination_imported_schedule",
					startDate: planEntryWindow.startDate,
				}
			);

		const activatedAt = Date.now();
		await ctx.runMutation(
			internal.payments.recurringSchedules.activation
				.recordRecurringScheduleProviderActivation,
			{
				activatedAt,
				externalScheduleRef: importedSchedule.externalScheduleRef,
				nextPollAt: activatedAt,
				providerData:
					(importedSchedule.providerData as
						| Record<string, unknown>
						| undefined) ?? undefined,
				providerStatus:
					importedSchedule.providerScheduleStatus === "active"
						? "active"
						: "pending",
				scheduleId: beginResult.scheduleId,
			}
		);

		await ctx.runMutation(
			internal.payments.recurringSchedules.activation
				.commitRecurringScheduleActivation,
			{
				planEntryIds: args.planEntryIds,
				scheduleId: beginResult.scheduleId,
			}
		);
		await ctx.runMutation(markImportedProviderScheduleLinkedRef, {
			actorUserId: args.viewerUserId,
			externalCollectionScheduleId: beginResult.scheduleId,
			mortgageId: args.mortgageId,
			providerScheduleId: args.providerScheduleId,
		});

		return { scheduleId: String(beginResult.scheduleId) };
	})
	.internal();

export const getCommittedCollectionsActivationContext = convex
	.query()
	.input({
		caseId: v.id("adminOriginationCases"),
	})
	.handler(async (ctx, args) => {
		const caseRecord = await ctx.db.get(args.caseId);
		if (!caseRecord) {
			return null;
		}

		const committedMortgageId = caseRecord.committedMortgageId ?? null;
		const activationPlanEntryIds: Id<"collectionPlanEntries">[] = [];

		if (committedMortgageId) {
			const mortgage = await ctx.db.get(committedMortgageId);
			if (mortgage) {
				const eligiblePlanEntries = (
					await ctx.db
						.query("collectionPlanEntries")
						.withIndex("by_mortgage_status_scheduled", (query) =>
							query
								.eq("mortgageId", committedMortgageId)
								.eq("status", "planned")
								.gte("scheduledDate", Date.now())
						)
						.collect()
				)
					.filter(
						(entry) =>
							entry.executionMode === undefined ||
							entry.executionMode === "app_owned"
					)
					.sort(sortPlanEntriesForProviderActivation);

				const regularInterestEntryIds = new Set(
					(
						await Promise.all(
							eligiblePlanEntries.map(async (entry) => {
								const obligations = await Promise.all(
									entry.obligationIds.map((obligationId) =>
										ctx.db.get(obligationId)
									)
								);
								if (
									obligations.length === 0 ||
									obligations.some((obligation) => obligation === null) ||
									obligations.some(
										(obligation) => obligation?.type !== "regular_interest"
									) ||
									entry.amount !== mortgage.paymentAmount
								) {
									return null;
								}
								return entry._id;
							})
						)
					).filter(
						(entryId): entryId is Id<"collectionPlanEntries"> =>
							entryId !== null
					)
				);

				for (const entry of eligiblePlanEntries) {
					if (!regularInterestEntryIds.has(entry._id)) {
						if (activationPlanEntryIds.length > 0) {
							break;
						}
						continue;
					}
					activationPlanEntryIds.push(entry._id);
				}
			}
		}

		return {
			activationPlanEntryIds,
			collectionsDraft: caseRecord.collectionsDraft,
			committedMortgageId,
		};
	})
	.internal();

export const patchCollectionsActivationState = convex
	.mutation()
	.input({
		caseId: v.id("adminOriginationCases"),
		activationStatus: collectionsActivationStatusValidator,
		clearError: v.optional(v.boolean()),
		clearExternalCollectionScheduleId: v.optional(v.boolean()),
		errorMessage: v.optional(v.string()),
		externalCollectionScheduleId: v.optional(
			v.id("externalCollectionSchedules")
		),
		incrementRetryCount: v.optional(v.boolean()),
		lastAttemptAt: v.optional(v.number()),
		viewerUserId: v.id("users"),
	})
	.handler(async (ctx, args) => {
		const caseRecord = await ctx.db.get(args.caseId);
		if (!caseRecord?.collectionsDraft) {
			return caseRecord;
		}

		const nextCollectionsDraft = normalizeOriginationCollectionsDraft({
			...caseRecord.collectionsDraft,
			activationStatus: args.activationStatus,
			providerManagedActivationStatus: args.activationStatus,
			externalCollectionScheduleId: args.clearExternalCollectionScheduleId
				? undefined
				: (args.externalCollectionScheduleId ??
					caseRecord.collectionsDraft.externalCollectionScheduleId),
			lastAttemptAt:
				args.lastAttemptAt ?? caseRecord.collectionsDraft.lastAttemptAt,
			lastError: args.clearError
				? undefined
				: (args.errorMessage ?? caseRecord.collectionsDraft.lastError),
			retryCount: args.incrementRetryCount
				? (caseRecord.collectionsDraft.retryCount ?? 0) + 1
				: caseRecord.collectionsDraft.retryCount,
		});

		const now = Date.now();
		await ctx.db.patch(args.caseId, {
			collectionsDraft: nextCollectionsDraft,
			updatedAt: now,
			updatedByUserId: args.viewerUserId,
		});

		return ctx.db.get(args.caseId);
	})
	.internal();

export async function activateCommittedCaseCollectionsRuntime(
	ctx: CollectionsActivationRuntimeCtx,
	args: {
		caseId: Id<"adminOriginationCases">;
		viewerUserId: Id<"users">;
	}
): Promise<CollectionsActivationResult> {
	const activationContext = await ctx.runQuery(
		getCommittedCollectionsActivationContextRef,
		{
			caseId: args.caseId,
		}
	);
	if (!activationContext) {
		throw new ConvexError("Origination case not found");
	}

	const collectionsDraft = activationContext.collectionsDraft;
	if (
		!collectionsDraft ||
		(collectionsDraft?.executionIntent ?? collectionsDraft?.mode) !==
			"provider_managed_now" ||
		!activationContext.committedMortgageId
	) {
		return { status: "skipped" as const };
	}

	const providerCode = collectionsDraft.providerCode ?? "pad_rotessa";
	const isRetryActivation = collectionsDraft.activationStatus === "failed";
	const lastAttemptAt = Date.now();
	await ctx.runMutation(patchCollectionsActivationStateRef, {
		caseId: args.caseId,
		activationStatus: "activating",
		clearError: true,
		clearExternalCollectionScheduleId: true,
		incrementRetryCount: isRetryActivation,
		lastAttemptAt,
		viewerUserId: args.viewerUserId,
	});

	if (collectionsDraft.selectedProviderScheduleId) {
		try {
			const activationResult = await ctx.runAction(
				adoptImportedRotessaScheduleForCommittedCaseRef,
				{
					mortgageId: activationContext.committedMortgageId,
					planEntryIds: activationContext.activationPlanEntryIds,
					providerScheduleId: collectionsDraft.selectedProviderScheduleId,
					viewerUserId: args.viewerUserId,
				}
			);

			await ctx.runMutation(patchCollectionsActivationStateRef, {
				caseId: args.caseId,
				activationStatus: "active",
				clearError: true,
				externalCollectionScheduleId:
					activationResult.scheduleId as Id<"externalCollectionSchedules">,
				lastAttemptAt,
				viewerUserId: args.viewerUserId,
			});

			return {
				scheduleId: activationResult.scheduleId,
				status: "active" as const,
			};
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: "Unable to adopt imported Rotessa schedule";
			await ctx.runMutation(patchCollectionsActivationStateRef, {
				caseId: args.caseId,
				activationStatus: "failed",
				errorMessage: message,
				lastAttemptAt,
				viewerUserId: args.viewerUserId,
			});
			return { message, status: "failed" as const };
		}
	}

	if (!collectionsDraft.selectedBankAccountId) {
		const message =
			"Select a primary borrower bank account before retrying immediate Rotessa activation.";
		await ctx.runMutation(patchCollectionsActivationStateRef, {
			caseId: args.caseId,
			activationStatus: "failed",
			errorMessage: message,
			lastAttemptAt,
			viewerUserId: args.viewerUserId,
		});
		return { message, status: "failed" as const };
	}

	if (activationContext.activationPlanEntryIds.length === 0) {
		const message =
			"Immediate Rotessa activation requires at least one future recurring installment plan entry.";
		await ctx.runMutation(patchCollectionsActivationStateRef, {
			caseId: args.caseId,
			activationStatus: "failed",
			errorMessage: message,
			lastAttemptAt,
			viewerUserId: args.viewerUserId,
		});
		return { message, status: "failed" as const };
	}

	try {
		const activationResult = (await ctx.runAction(
			internal.payments.recurringSchedules.activation.activateRecurringSchedule,
			{
				planEntryIds: activationContext.activationPlanEntryIds,
				bankAccountId: collectionsDraft.selectedBankAccountId,
				mortgageId: activationContext.committedMortgageId,
				providerCode,
			}
		)) as { scheduleId: Id<"externalCollectionSchedules"> };

		await ctx.runMutation(patchCollectionsActivationStateRef, {
			caseId: args.caseId,
			activationStatus: "active",
			clearError: true,
			externalCollectionScheduleId:
				activationResult.scheduleId as Id<"externalCollectionSchedules">,
			lastAttemptAt,
			viewerUserId: args.viewerUserId,
		});

		return {
			scheduleId: String(activationResult.scheduleId),
			status: "active" as const,
		};
	} catch (error) {
		const message =
			error instanceof Error
				? error.message
				: "Unable to activate provider-managed collections";
		await ctx.runMutation(patchCollectionsActivationStateRef, {
			caseId: args.caseId,
			activationStatus: "failed",
			errorMessage: message,
			lastAttemptAt,
			viewerUserId: args.viewerUserId,
		});
		return { message, status: "failed" as const };
	}
}

export const activateCommittedCaseCollections = convex
	.action()
	.input({
		caseId: v.id("adminOriginationCases"),
		viewerUserId: v.id("users"),
	})
	.handler(
		async (ctx, args): Promise<CollectionsActivationResult> =>
			activateCommittedCaseCollectionsRuntime(ctx, args)
	)
	.internal();

export const retryCollectionsActivation = paymentManageAction
	.input({
		caseId: v.id("adminOriginationCases"),
	})
	.handler(async (ctx, args): Promise<CollectionsActivationResult> => {
		const commitContext = (await ctx.runQuery(
			internal.admin.origination.commit.getCommitContext,
			{
				caseId: args.caseId,
				viewerAuthId: ctx.viewer.authId,
				viewerIsFairLendAdmin: ctx.viewer.isFairLendAdmin,
				viewerOrgId: ctx.viewer.orgId,
			}
		)) as { viewerUserId: Id<"users"> } | null;
		if (!commitContext) {
			throw new ConvexError("Origination case not found");
		}

		return activateCommittedCaseCollectionsRuntime(ctx, {
			caseId: args.caseId,
			viewerUserId: commitContext.viewerUserId,
		});
	})
	.public();
