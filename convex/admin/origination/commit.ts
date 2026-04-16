import { ConvexError, v } from "convex/values";
import { ORIGINATION_COMMIT_BLOCKING_STEP_KEYS } from "../../../src/lib/admin-origination";
import { internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import {
	ensureCanonicalBorrowerForOrigination,
	type OriginationBorrowerParticipantInput,
	type OriginationParticipantResolution,
	provisionableParticipantName,
	resolveOriginationBorrowerParticipants,
} from "../../borrowers/resolveOrProvisionForOrigination";
import { getWorkosProvisioning } from "../../engine/effects/workosProvisioning";
import { authedAction, convex, requirePermissionAction } from "../../fluent";
import { activateMortgageAggregate } from "../../mortgages/activateMortgageAggregate";
import { buildAdminDirectMortgageActivationSource } from "../../mortgages/provenance";
import { assertOriginationCaseAccess } from "./access";

function collectOriginationParticipants(
	record: Pick<Doc<"adminOriginationCases">, "participantsDraft">
) {
	const participants: OriginationBorrowerParticipantInput[] = [];
	const primaryBorrower = record.participantsDraft?.primaryBorrower;
	if (
		primaryBorrower?.existingBorrowerId ||
		primaryBorrower?.email?.trim() ||
		primaryBorrower?.fullName?.trim()
	) {
		participants.push({
			draftId: primaryBorrower.draftId,
			email: primaryBorrower.email,
			existingBorrowerId: primaryBorrower.existingBorrowerId,
			fullName: primaryBorrower.fullName,
			role: "primary",
		});
	}
	for (const participant of record.participantsDraft?.coBorrowers ?? []) {
		if (
			participant.existingBorrowerId ||
			participant.email?.trim() ||
			participant.fullName?.trim()
		) {
			participants.push({
				draftId: participant.draftId,
				email: participant.email,
				existingBorrowerId: participant.existingBorrowerId,
				fullName: participant.fullName,
				role: "co_borrower",
			});
		}
	}
	for (const participant of record.participantsDraft?.guarantors ?? []) {
		if (
			participant.existingBorrowerId ||
			participant.email?.trim() ||
			participant.fullName?.trim()
		) {
			participants.push({
				draftId: participant.draftId,
				email: participant.email,
				existingBorrowerId: participant.existingBorrowerId,
				fullName: participant.fullName,
				role: "guarantor",
			});
		}
	}
	return participants;
}

function dedupeStrings(values: string[]) {
	return [...new Set(values)];
}

interface OriginationCommitContext {
	caseId: Id<"adminOriginationCases">;
	caseStatus: Doc<"adminOriginationCases">["status"];
	caseUpdatedAt: number;
	committedAt: number | null;
	committedMortgageId: Id<"mortgages"> | null;
	committedValuationSnapshotId: Id<"mortgageValuationSnapshots"> | null;
	participantResolutions: OriginationParticipantResolution[];
	validationErrors: string[];
	viewerUserId: Id<"users">;
}

interface CommittedOriginationResult {
	borrowerIds: string[];
	caseId: string;
	committedAt: number;
	committedMortgageId: string;
	propertyId: string | null;
	status: "committed";
	valuationSnapshotId: string | null;
	wasAlreadyCommitted: boolean;
}

interface AwaitingIdentitySyncOriginationResult {
	caseId: string;
	pendingIdentities: Array<{
		email: string;
		fullName?: string;
		role: Doc<"mortgageBorrowers">["role"];
		workosUserId: string;
	}>;
	status: "awaiting_identity_sync";
}

type OriginationCommitResult =
	| AwaitingIdentitySyncOriginationResult
	| CommittedOriginationResult;

function listCommitBlockingValidationErrors(
	record: Pick<Doc<"adminOriginationCases">, "validationSnapshot">
) {
	return dedupeStrings(
		ORIGINATION_COMMIT_BLOCKING_STEP_KEYS.flatMap(
			(step) => record.validationSnapshot?.stepErrors?.[step] ?? []
		)
	);
}

function listCanonicalMortgageReadinessErrors(
	record: Pick<
		Doc<"adminOriginationCases">,
		"mortgageDraft" | "participantsDraft" | "propertyDraft"
	>
) {
	const errors: string[] = [];

	if (!record.participantsDraft?.brokerOfRecordId) {
		errors.push("Broker of record is required.");
	}
	if (!(record.propertyDraft?.propertyId || record.propertyDraft?.create)) {
		errors.push("Property is required.");
	}
	if (!record.mortgageDraft) {
		errors.push("Mortgage terms are required.");
	}

	return errors;
}

function collectCommitBlockingErrors(
	record: Pick<
		Doc<"adminOriginationCases">,
		| "mortgageDraft"
		| "participantsDraft"
		| "propertyDraft"
		| "validationSnapshot"
	>
) {
	return dedupeStrings([
		...listCommitBlockingValidationErrors(record),
		...listCanonicalMortgageReadinessErrors(record),
	]);
}

async function readCommittedMortgageLinks(
	ctx: Pick<MutationCtx, "db">,
	args: {
		mortgageId: Id<"mortgages">;
		valuationSnapshotId?: Id<"mortgageValuationSnapshots"> | null;
	}
) {
	const [borrowerLinks, mortgage, latestValuationSnapshot] = await Promise.all([
		ctx.db
			.query("mortgageBorrowers")
			.withIndex("by_mortgage", (query) =>
				query.eq("mortgageId", args.mortgageId)
			)
			.collect(),
		ctx.db.get(args.mortgageId),
		args.valuationSnapshotId
			? ctx.db.get(args.valuationSnapshotId)
			: ctx.db
					.query("mortgageValuationSnapshots")
					.withIndex("by_mortgage_created_at", (query) =>
						query.eq("mortgageId", args.mortgageId)
					)
					.order("desc")
					.first(),
	]);

	return {
		borrowerIds: dedupeStrings(
			borrowerLinks.map((link) => String(link.borrowerId))
		),
		propertyId: mortgage ? String(mortgage.propertyId) : null,
		valuationSnapshotId: latestValuationSnapshot
			? String(latestValuationSnapshot._id)
			: null,
	};
}

async function resolveCommitReadyParticipants(
	ctx: Pick<MutationCtx, "db">,
	caseRecord: Pick<
		Doc<"adminOriginationCases">,
		"_id" | "orgId" | "participantsDraft"
	>
) {
	const participantResolutions = await resolveOriginationBorrowerParticipants(
		ctx,
		{
			caseId: caseRecord._id,
			orgId: caseRecord.orgId,
			participants: collectOriginationParticipants(caseRecord),
		}
	);
	const missingIdentity = participantResolutions.find(
		(participant) => participant.kind === "missing_identity"
	);
	if (missingIdentity) {
		throw new ConvexError(
			`Identity sync is still pending for ${missingIdentity.email}`
		);
	}

	return participantResolutions;
}

async function resolveBrokerAssignmentsForCommit(
	ctx: Pick<MutationCtx, "db">,
	caseRecord: Pick<Doc<"adminOriginationCases">, "orgId" | "participantsDraft">
) {
	if (!caseRecord.participantsDraft?.brokerOfRecordId) {
		throw new ConvexError("Broker of record is required.");
	}

	const brokerOfRecord = await ctx.db.get(
		caseRecord.participantsDraft.brokerOfRecordId
	);
	if (!brokerOfRecord) {
		throw new ConvexError("Broker of record no longer exists");
	}
	if (
		caseRecord.orgId &&
		brokerOfRecord.orgId &&
		brokerOfRecord.orgId !== caseRecord.orgId
	) {
		throw new ConvexError(
			"Broker of record belongs to a different organization"
		);
	}

	const assignedBrokerId = caseRecord.participantsDraft.assignedBrokerId;
	if (assignedBrokerId) {
		const assignedBroker = await ctx.db.get(assignedBrokerId);
		if (!assignedBroker) {
			throw new ConvexError("Assigned broker no longer exists");
		}
		if (
			caseRecord.orgId &&
			assignedBroker.orgId &&
			assignedBroker.orgId !== caseRecord.orgId
		) {
			throw new ConvexError(
				"Assigned broker belongs to a different organization"
			);
		}
	}

	return {
		assignedBrokerId,
		brokerOfRecordId: brokerOfRecord._id,
	};
}

async function buildBorrowerLinksForCommit(
	ctx: Pick<MutationCtx, "db">,
	args: {
		caseId: Id<"adminOriginationCases">;
		creationSource: string;
		now: number;
		orgId?: string;
		originatingWorkflowId: string;
		originatingWorkflowType: string;
		participantResolutions: OriginationParticipantResolution[];
	}
) {
	const borrowerLinks: Array<{
		borrowerId: Id<"borrowers">;
		role: Doc<"mortgageBorrowers">["role"];
	}> = [];

	for (const participant of args.participantResolutions) {
		if (participant.kind !== "ready") {
			continue;
		}

		if (participant.borrowerId) {
			borrowerLinks.push({
				borrowerId: participant.borrowerId,
				role: participant.role,
			});
			continue;
		}

		const ensuredBorrower = await ensureCanonicalBorrowerForOrigination(ctx, {
			creationSource: args.creationSource,
			now: args.now,
			orgId: args.orgId,
			originatingWorkflowId: args.originatingWorkflowId,
			originatingWorkflowType: args.originatingWorkflowType,
			userId: participant.userId,
			workflowSourceId: String(args.caseId),
			workflowSourceKey: participant.workflowSourceKey,
		});
		borrowerLinks.push({
			borrowerId: ensuredBorrower.borrowerId,
			role: participant.role,
		});
	}

	return borrowerLinks;
}

async function buildCommittedOriginationResult(
	ctx: Pick<MutationCtx, "db">,
	caseRecord: Pick<
		Doc<"adminOriginationCases">,
		| "_id"
		| "committedAt"
		| "committedMortgageId"
		| "committedValuationSnapshotId"
	>
) {
	if (!(caseRecord.committedAt && caseRecord.committedMortgageId)) {
		throw new ConvexError(
			"Committed origination case is missing canonical links"
		);
	}

	const linkedRecords = await readCommittedMortgageLinks(ctx, {
		mortgageId: caseRecord.committedMortgageId,
		valuationSnapshotId: caseRecord.committedValuationSnapshotId ?? null,
	});

	return {
		...linkedRecords,
		caseId: String(caseRecord._id),
		committedAt: caseRecord.committedAt,
		committedMortgageId: String(caseRecord.committedMortgageId),
		status: "committed" as const,
		wasAlreadyCommitted: true,
	};
}

export const getCommitContext = convex
	.query()
	.input({
		caseId: v.id("adminOriginationCases"),
		viewerAuthId: v.string(),
		viewerIsFairLendAdmin: v.boolean(),
		viewerOrgId: v.optional(v.string()),
	})
	.handler(async (ctx, args): Promise<OriginationCommitContext | null> => {
		const caseRecord = await ctx.db.get(args.caseId);
		if (!caseRecord) {
			return null;
		}

		assertOriginationCaseAccess(
			{
				isFairLendAdmin: args.viewerIsFairLendAdmin,
				orgId: args.viewerOrgId,
			},
			caseRecord
		);

		const viewerUser = await ctx.db
			.query("users")
			.withIndex("authId", (query) => query.eq("authId", args.viewerAuthId))
			.unique();
		if (!viewerUser) {
			throw new ConvexError("User not found in database");
		}

		const participantResolutions = await resolveOriginationBorrowerParticipants(
			ctx,
			{
				caseId: caseRecord._id,
				orgId: caseRecord.orgId,
				participants: collectOriginationParticipants(caseRecord),
			}
		);

		return {
			caseId: caseRecord._id,
			caseStatus: caseRecord.status,
			caseUpdatedAt: caseRecord.updatedAt,
			committedAt: caseRecord.committedAt ?? null,
			committedMortgageId: caseRecord.committedMortgageId ?? null,
			committedValuationSnapshotId:
				caseRecord.committedValuationSnapshotId ?? null,
			participantResolutions,
			validationErrors: collectCommitBlockingErrors(caseRecord),
			viewerUserId: viewerUser._id,
		};
	})
	.internal();

export const markCaseAwaitingIdentitySync = convex
	.mutation()
	.input({
		caseId: v.id("adminOriginationCases"),
		viewerUserId: v.id("users"),
	})
	.handler(async (ctx, args) => {
		const caseRecord = await ctx.db.get(args.caseId);
		if (!caseRecord || caseRecord.status === "committed") {
			return caseRecord;
		}

		const now = Date.now();
		await ctx.db.patch(args.caseId, {
			failedAt: undefined,
			lastCommitError: undefined,
			status: "awaiting_identity_sync",
			updatedAt: now,
			updatedByUserId: args.viewerUserId,
		});

		return ctx.db.get(args.caseId);
	})
	.internal();

export const markCaseCommitting = convex
	.mutation()
	.input({
		caseId: v.id("adminOriginationCases"),
		expectedUpdatedAt: v.number(),
		viewerUserId: v.id("users"),
	})
	.handler(async (ctx, args) => {
		const caseRecord = await ctx.db.get(args.caseId);
		if (!caseRecord) {
			throw new ConvexError("Origination case not found");
		}
		if (caseRecord.status === "committed") {
			return caseRecord;
		}
		if (caseRecord.updatedAt !== args.expectedUpdatedAt) {
			throw new ConvexError(
				"Origination draft changed during commit preparation. Refresh and retry."
			);
		}

		const validationErrors = collectCommitBlockingErrors(caseRecord);
		if (validationErrors.length > 0) {
			throw new ConvexError(
				`Origination case is not ready to commit: ${validationErrors.join(" ")}`
			);
		}

		const now = Date.now();
		await ctx.db.patch(args.caseId, {
			failedAt: undefined,
			lastCommitError: undefined,
			status: "committing",
			updatedAt: now,
			updatedByUserId: args.viewerUserId,
		});

		return ctx.db.get(args.caseId);
	})
	.internal();

export const markCaseFailed = convex
	.mutation()
	.input({
		caseId: v.id("adminOriginationCases"),
		message: v.string(),
		viewerUserId: v.id("users"),
	})
	.handler(async (ctx, args) => {
		const caseRecord = await ctx.db.get(args.caseId);
		if (!caseRecord || caseRecord.status === "committed") {
			return caseRecord;
		}

		const now = Date.now();
		await ctx.db.patch(args.caseId, {
			failedAt: now,
			lastCommitError: args.message,
			status: "failed",
			updatedAt: now,
			updatedByUserId: args.viewerUserId,
		});

		return ctx.db.get(args.caseId);
	})
	.internal();

export const finalizeCommit = convex
	.mutation()
	.input({
		caseId: v.id("adminOriginationCases"),
		stagedCaseStatus: v.optional(v.string()),
		viewerAuthId: v.string(),
		viewerIsFairLendAdmin: v.boolean(),
		viewerOrgId: v.optional(v.string()),
		viewerUserId: v.id("users"),
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

		if (
			caseRecord.status === "committed" &&
			caseRecord.committedMortgageId &&
			caseRecord.committedAt
		) {
			return buildCommittedOriginationResult(ctx, caseRecord);
		}
		if (caseRecord.status !== "committing") {
			throw new ConvexError(
				"Origination case is not in a committable state. Refresh and retry."
			);
		}

		const validationErrors = collectCommitBlockingErrors(caseRecord);
		if (validationErrors.length > 0) {
			throw new ConvexError(
				`Origination case is not ready to commit: ${validationErrors.join(" ")}`
			);
		}

		if (
			!(
				caseRecord.propertyDraft &&
				caseRecord.mortgageDraft &&
				caseRecord.participantsDraft?.brokerOfRecordId
			)
		) {
			throw new ConvexError(
				"Origination case is missing canonical commit inputs"
			);
		}

		const now = Date.now();
		const activationSource = buildAdminDirectMortgageActivationSource({
			caseId: caseRecord._id,
			viewerUserId: args.viewerUserId,
		});
		const participantResolutions = await resolveCommitReadyParticipants(
			ctx,
			caseRecord
		);
		const { assignedBrokerId, brokerOfRecordId } =
			await resolveBrokerAssignmentsForCommit(ctx, caseRecord);
		const borrowerLinks = await buildBorrowerLinksForCommit(ctx, {
			caseId: caseRecord._id,
			creationSource: activationSource.creationSource,
			now,
			orgId: caseRecord.orgId,
			originatingWorkflowId: activationSource.originatingWorkflowId,
			originatingWorkflowType: activationSource.originatingWorkflowType,
			participantResolutions,
		});

		const activatedMortgage = await activateMortgageAggregate(ctx, {
			actorAuthId: args.viewerAuthId,
			actorType: args.viewerIsFairLendAdmin ? "admin" : "member",
			assignedBrokerId,
			borrowerLinks,
			brokerOfRecordId,
			collectionsDraft: caseRecord.collectionsDraft,
			mortgageDraft: caseRecord.mortgageDraft,
			now,
			orgId: caseRecord.orgId,
			propertyDraft: caseRecord.propertyDraft,
			source: activationSource,
			stagedCaseStatus:
				(args.stagedCaseStatus as Doc<"adminOriginationCases">["status"]) ??
				caseRecord.status,
			valuationDraft: caseRecord.valuationDraft,
			viewerUserId: args.viewerUserId,
		});

		const committedAt = caseRecord.committedAt ?? now;
		await ctx.db.patch(args.caseId, {
			committedAt,
			committedMortgageId: activatedMortgage.mortgageId,
			committedValuationSnapshotId:
				activatedMortgage.valuationSnapshotId ?? undefined,
			failedAt: undefined,
			lastCommitError: undefined,
			status: "committed",
			updatedAt: now,
			updatedByUserId: args.viewerUserId,
		});

		return {
			borrowerIds: dedupeStrings(
				borrowerLinks.map((link) => String(link.borrowerId))
			),
			caseId: String(caseRecord._id),
			committedAt,
			committedMortgageId: String(activatedMortgage.mortgageId),
			propertyId: String(activatedMortgage.propertyId),
			status: "committed" as const,
			valuationSnapshotId: activatedMortgage.valuationSnapshotId
				? String(activatedMortgage.valuationSnapshotId)
				: null,
			wasAlreadyCommitted: activatedMortgage.wasAlreadyCommitted,
		};
	})
	.internal();

const originationAction = authedAction.use(
	requirePermissionAction("mortgage:originate")
);

export const commitCase = originationAction
	.input({
		caseId: v.id("adminOriginationCases"),
	})
	.handler(async (ctx, args): Promise<OriginationCommitResult> => {
		const loadCommitContext = async (): Promise<OriginationCommitContext> => {
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
			return commitContext;
		};

		const commitContext = await loadCommitContext();

		if (
			commitContext.caseStatus === "committed" &&
			commitContext.committedMortgageId &&
			commitContext.committedAt
		) {
			return ctx.runMutation(internal.admin.origination.commit.finalizeCommit, {
				caseId: args.caseId,
				stagedCaseStatus: commitContext.caseStatus,
				viewerAuthId: ctx.viewer.authId,
				viewerIsFairLendAdmin: ctx.viewer.isFairLendAdmin,
				viewerOrgId: ctx.viewer.orgId,
				viewerUserId: commitContext.viewerUserId,
			});
		}

		if (commitContext.validationErrors.length > 0) {
			throw new ConvexError(
				`Origination case is not ready to commit: ${commitContext.validationErrors.join(
					" "
				)}`
			);
		}

		const provisioning = getWorkosProvisioning();
		const pendingIdentities: Array<{
			email: string;
			fullName?: string;
			role: Doc<"mortgageBorrowers">["role"];
			workosUserId: string;
		}> = [];

		for (const participant of commitContext.participantResolutions) {
			if (participant.kind !== "missing_identity") {
				continue;
			}

			const existingUsers = await provisioning.listUsers({
				email: participant.email,
			});
			const existingUser = existingUsers.find(
				(user) => user.email.toLowerCase() === participant.email.toLowerCase()
			);
			const workosUser =
				existingUser ??
				(await provisioning.createUser({
					email: participant.email,
					...provisionableParticipantName(participant),
				}));

			pendingIdentities.push({
				email: participant.email,
				fullName: participant.fullName,
				role: participant.role,
				workosUserId: workosUser.id,
			});
		}

		if (pendingIdentities.length > 0) {
			const refreshedContext = await loadCommitContext();
			const stillMissingIdentities =
				refreshedContext.participantResolutions.filter(
					(
						participant
					): participant is Extract<
						OriginationParticipantResolution,
						{ kind: "missing_identity" }
					> => participant.kind === "missing_identity"
				);

			if (stillMissingIdentities.length > 0) {
				await ctx.runMutation(
					internal.admin.origination.commit.markCaseAwaitingIdentitySync,
					{
						caseId: args.caseId,
						viewerUserId: refreshedContext.viewerUserId,
					}
				);

				return {
					caseId: String(args.caseId),
					pendingIdentities,
					status: "awaiting_identity_sync" as const,
				};
			}

			await ctx.runMutation(
				internal.admin.origination.commit.markCaseCommitting,
				{
					caseId: args.caseId,
					expectedUpdatedAt: refreshedContext.caseUpdatedAt,
					viewerUserId: refreshedContext.viewerUserId,
				}
			);

			try {
				return await ctx.runMutation(
					internal.admin.origination.commit.finalizeCommit,
					{
						caseId: args.caseId,
						stagedCaseStatus: refreshedContext.caseStatus,
						viewerAuthId: ctx.viewer.authId,
						viewerIsFairLendAdmin: ctx.viewer.isFairLendAdmin,
						viewerOrgId: ctx.viewer.orgId,
						viewerUserId: refreshedContext.viewerUserId,
					}
				);
			} catch (error) {
				const message =
					error instanceof Error
						? error.message
						: "Unable to commit origination case";
				await ctx.runMutation(
					internal.admin.origination.commit.markCaseFailed,
					{
						caseId: args.caseId,
						message,
						viewerUserId: refreshedContext.viewerUserId,
					}
				);
				throw error;
			}
		}

		await ctx.runMutation(
			internal.admin.origination.commit.markCaseCommitting,
			{
				caseId: args.caseId,
				expectedUpdatedAt: commitContext.caseUpdatedAt,
				viewerUserId: commitContext.viewerUserId,
			}
		);

		try {
			return await ctx.runMutation(
				internal.admin.origination.commit.finalizeCommit,
				{
					caseId: args.caseId,
					stagedCaseStatus: commitContext.caseStatus,
					viewerAuthId: ctx.viewer.authId,
					viewerIsFairLendAdmin: ctx.viewer.isFairLendAdmin,
					viewerOrgId: ctx.viewer.orgId,
					viewerUserId: commitContext.viewerUserId,
				}
			);
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: "Unable to commit origination case";
			await ctx.runMutation(internal.admin.origination.commit.markCaseFailed, {
				caseId: args.caseId,
				message,
				viewerUserId: commitContext.viewerUserId,
			});
			throw error;
		}
	})
	.public();
