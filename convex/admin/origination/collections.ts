import { makeFunctionReference } from "convex/server";
import { ConvexError, v } from "convex/values";
import { internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import {
	authedAction,
	authedQuery,
	convex,
	requirePermission,
	requirePermissionAction,
} from "../../fluent";
import { validateBankAccountRecord } from "../../payments/bankAccounts/validation";
import { hasRotessaCustomerReference } from "../../payments/recurringSchedules/rotessaCustomerReference";
import { normalizeEmail } from "../../seed/seedHelpers";
import { assertOriginationCaseAccess } from "./access";
import { normalizeOriginationCollectionsDraft } from "./validators";

const originationQuery = authedQuery.use(
	requirePermission("mortgage:originate")
);
const paymentManageAction = authedAction.use(
	requirePermissionAction("payment:manage")
);

const collectionsActivationStatusValidator = v.union(
	v.literal("pending"),
	v.literal("activating"),
	v.literal("active"),
	v.literal("failed")
);

type CollectionsActivationResult =
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

const activateCommittedCaseCollectionsRef = makeFunctionReference<
	"action",
	{
		caseId: Id<"adminOriginationCases">;
		viewerUserId: Id<"users">;
	},
	Promise<CollectionsActivationResult>
>("admin/origination/collections:activateCommittedCaseCollections");

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
			return "Primary borrower is eligible for immediate Rotessa setup.";
		case "identity_sync_pending":
			return "The staged primary borrower has not synced into the FairLend user/borrower graph yet.";
		case "borrower_profile_missing":
			return "Immediate provider-managed activation needs an existing primary borrower profile with bank accounts.";
		case "cross_org_conflict":
			return "The staged primary borrower resolves to a borrower in another organization.";
		case "borrower_profile_conflict":
			return "Multiple same-org borrower profiles exist for the staged primary borrower.";
		case "borrower_missing":
			return "The selected primary borrower record no longer exists.";
		case "missing_primary_borrower":
			return "Stage a primary borrower before choosing provider-managed now.";
		default:
			return "Resolve the staged primary borrower before choosing provider-managed now.";
	}
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
		const bankAccounts =
			primaryBorrower.borrowerId === null
				? []
				: await ctx.db
						.query("bankAccounts")
						.withIndex("by_owner", (query) =>
							query
								.eq("ownerType", "borrower")
								.eq("ownerId", String(primaryBorrower.borrowerId))
						)
						.collect();

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
			caseRecord.collectionsDraft?.selectedBankAccountId === undefined
				? null
				: String(caseRecord.collectionsDraft.selectedBankAccountId);
		const selectedBankAccount =
			bankAccountOptions.find(
				(bankAccount) => bankAccount.bankAccountId === selectedBankAccountId
			) ?? null;
		const preflightErrors: string[] = [];

		if (
			caseRecord.collectionsDraft?.mode === "provider_managed_now" &&
			selectedBankAccountId === null
		) {
			preflightErrors.push(
				"Select a primary borrower bank account for immediate Rotessa activation."
			);
		}
		if (
			caseRecord.collectionsDraft?.mode === "provider_managed_now" &&
			selectedBankAccount !== null
		) {
			preflightErrors.push(...selectedBankAccount.eligibilityErrors);
		}
		if (
			caseRecord.collectionsDraft?.mode === "provider_managed_now" &&
			selectedBankAccountId !== null &&
			selectedBankAccount === null
		) {
			preflightErrors.push(
				"The selected bank account is not owned by the staged primary borrower."
			);
		}

		return {
			activationStatus:
				caseRecord.collectionsDraft?.mode === "provider_managed_now"
					? (caseRecord.collectionsDraft.activationStatus ?? "pending")
					: null,
			bankAccounts: bankAccountOptions,
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
			providerCode: caseRecord.collectionsDraft?.providerCode ?? "pad_rotessa",
			selectedBankAccount,
		};
	})
	.public();

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

export const activateCommittedCaseCollections = convex
	.action()
	.input({
		caseId: v.id("adminOriginationCases"),
		viewerUserId: v.id("users"),
	})
	.handler(async (ctx, args): Promise<CollectionsActivationResult> => {
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
			collectionsDraft?.mode !== "provider_managed_now" ||
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
				internal.payments.recurringSchedules.activation
					.activateRecurringSchedule,
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
	})
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

		return ctx.runAction(activateCommittedCaseCollectionsRef, {
			caseId: args.caseId,
			viewerUserId: commitContext.viewerUserId,
		});
	})
	.public();
