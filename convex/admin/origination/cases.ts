import { ConvexError, v } from "convex/values";
import {
	buildOriginationCaseLabel,
	buildOriginationCaseShortId,
	INITIAL_ORIGINATION_STEP,
} from "../../../src/lib/admin-origination";
import type { Doc } from "../../_generated/dataModel";
import {
	assertOriginationCaseAccess,
	assertOriginationCaseAccessContext,
	ORIGINATION_CASE_ACCESS_REQUIRES_ORG_CONTEXT,
} from "../../authz/origination";
import { authedMutation, authedQuery, requirePermission } from "../../fluent";
import {
	adminOriginationCasePatchValidator,
	computeOriginationValidationSnapshot,
	determineRecommendedOriginationStep,
	listOriginationStepErrors,
	mergeOriginationCaseDraftValues,
	type OriginationCaseDraftState,
	resolveDraftOriginationCaseStatus,
} from "./validators";

const originationQuery = authedQuery.use(
	requirePermission("mortgage:originate")
);
const originationMutation = authedMutation.use(
	requirePermission("mortgage:originate")
);

function assertMutableOriginationCase(
	record: Pick<Doc<"adminOriginationCases">, "status">
) {
	if (record.status === "committed" || record.status === "committing") {
		throw new ConvexError(
			"Committed or in-flight origination cases are immutable. Open the canonical mortgage instead."
		);
	}
}

function requireViewerOrgId(viewer: { orgId?: string }) {
	if (!viewer.orgId) {
		throw new ConvexError(ORIGINATION_CASE_ACCESS_REQUIRES_ORG_CONTEXT);
	}

	return viewer.orgId;
}

function summarizeCase(
	record: Pick<
		Doc<"adminOriginationCases">,
		| "_id"
		| "collectionsDraft"
		| "createdAt"
		| "currentStep"
		| "listingOverrides"
		| "mortgageDraft"
		| "participantsDraft"
		| "propertyDraft"
		| "status"
		| "updatedAt"
		| "validationSnapshot"
		| "valuationDraft"
	>
) {
	const recommendedStep = determineRecommendedOriginationStep({
		currentStep: record.currentStep,
		participantsDraft: record.participantsDraft,
		propertyDraft: record.propertyDraft,
		valuationDraft: record.valuationDraft,
		mortgageDraft: record.mortgageDraft,
		collectionsDraft: record.collectionsDraft,
		listingOverrides: record.listingOverrides,
		validationSnapshot: record.validationSnapshot,
	});

	return {
		caseId: record._id,
		caseShortId: buildOriginationCaseShortId(record._id),
		label: buildOriginationCaseLabel({
			caseId: record._id,
			participantsDraft: record.participantsDraft,
			propertyDraft: record.propertyDraft,
		}),
		currentStep: record.currentStep ?? recommendedStep,
		primaryBorrowerName: record.participantsDraft?.primaryBorrower?.fullName,
		propertyAddress: record.propertyDraft?.create?.streetAddress,
		principal: record.mortgageDraft?.principal,
		status: record.status,
		createdAt: record.createdAt,
		updatedAt: record.updatedAt,
		hasValidationErrors: Object.values(
			record.validationSnapshot?.stepErrors ?? {}
		).some((errors) => errors.length > 0),
	};
}

export const createCase = originationMutation
	.input({
		bootstrapToken: v.optional(v.string()),
	})
	.handler(async (ctx, args) => {
		const now = Date.now();
		const orgId = ctx.viewer.isFairLendAdmin
			? ctx.viewer.orgId
			: requireViewerOrgId(ctx.viewer);
		const user = await ctx.db
			.query("users")
			.withIndex("authId", (query) => query.eq("authId", ctx.viewer.authId))
			.unique();
		if (!user) {
			throw new ConvexError("User not found in database");
		}

		if (args.bootstrapToken) {
			const existing = await ctx.db
				.query("adminOriginationCases")
				.withIndex("by_bootstrap_token", (query) =>
					query.eq("bootstrapToken", args.bootstrapToken)
				)
				.unique();

			if (existing) {
				assertOriginationCaseAccess(ctx.viewer, existing);
				return existing._id;
			}
		}

		const validationSnapshot = computeOriginationValidationSnapshot({});

		return await ctx.db.insert("adminOriginationCases", {
			bootstrapToken: args.bootstrapToken,
			createdByUserId: user._id,
			updatedByUserId: user._id,
			orgId,
			status: "draft",
			currentStep: INITIAL_ORIGINATION_STEP,
			validationSnapshot,
			createdAt: now,
			updatedAt: now,
		});
	})
	.public();

export const listCases = originationQuery
	.handler(async (ctx) => {
		let records: Doc<"adminOriginationCases">[];

		if (ctx.viewer.isFairLendAdmin) {
			records = await ctx.db
				.query("adminOriginationCases")
				.withIndex("by_updated_at")
				.order("desc")
				.collect();
		} else {
			const orgId = requireViewerOrgId(ctx.viewer);
			records = await ctx.db
				.query("adminOriginationCases")
				.withIndex("by_org_updated_at", (query) => query.eq("orgId", orgId))
				.order("desc")
				.collect();
		}

		return records.map(summarizeCase);
	})
	.public();

export const getCase = originationQuery
	.input({
		caseId: v.id("adminOriginationCases"),
	})
	.handler(async (ctx, args) => {
		assertOriginationCaseAccessContext(ctx.viewer);

		const record = await ctx.db.get(args.caseId);
		if (!record) {
			return null;
		}

		assertOriginationCaseAccess(ctx.viewer, record);

		const recommendedStep = determineRecommendedOriginationStep({
			currentStep: record.currentStep,
			participantsDraft: record.participantsDraft,
			propertyDraft: record.propertyDraft,
			valuationDraft: record.valuationDraft,
			mortgageDraft: record.mortgageDraft,
			collectionsDraft: record.collectionsDraft,
			listingOverrides: record.listingOverrides,
			validationSnapshot: record.validationSnapshot,
		});

		return {
			...record,
			currentStep: record.currentStep ?? recommendedStep,
			label: buildOriginationCaseLabel({
				caseId: record._id,
				participantsDraft: record.participantsDraft,
				propertyDraft: record.propertyDraft,
			}),
			recommendedStep,
		};
	})
	.public();

export const patchCase = originationMutation
	.input({
		caseId: v.id("adminOriginationCases"),
		patch: adminOriginationCasePatchValidator,
	})
	.handler(async (ctx, args) => {
		assertOriginationCaseAccessContext(ctx.viewer);

		const record = await ctx.db.get(args.caseId);
		if (!record) {
			throw new ConvexError("Origination case not found");
		}

		assertOriginationCaseAccess(ctx.viewer, record);
		assertMutableOriginationCase(record);

		const user = await ctx.db
			.query("users")
			.withIndex("authId", (query) => query.eq("authId", ctx.viewer.authId))
			.unique();
		if (!user) {
			throw new ConvexError("User not found in database");
		}
		const merged = mergeOriginationCaseDraftValues(
			record as OriginationCaseDraftState,
			args.patch
		);
		const validationSnapshot = computeOriginationValidationSnapshot(merged);
		const nextStatus = resolveDraftOriginationCaseStatus({
			currentStatus: record.status,
			validationSnapshot,
		});
		const now = Date.now();

		await ctx.db.patch(args.caseId, {
			failedAt: undefined,
			currentStep: merged.currentStep,
			lastCommitError: undefined,
			participantsDraft: merged.participantsDraft,
			propertyDraft: merged.propertyDraft,
			valuationDraft: merged.valuationDraft,
			mortgageDraft: merged.mortgageDraft,
			collectionsDraft: merged.collectionsDraft,
			listingOverrides: merged.listingOverrides,
			status: nextStatus,
			validationSnapshot,
			updatedByUserId: user._id,
			updatedAt: now,
		});

		const updated = await ctx.db.get(args.caseId);
		if (!updated) {
			throw new ConvexError("Origination case disappeared during update");
		}

		return {
			...updated,
			recommendedStep: determineRecommendedOriginationStep(updated),
			stepErrorsForCurrentStep: listOriginationStepErrors(
				validationSnapshot,
				(updated.currentStep ?? INITIAL_ORIGINATION_STEP) as Parameters<
					typeof listOriginationStepErrors
				>[1]
			),
		};
	})
	.public();

export const deleteCase = originationMutation
	.input({
		caseId: v.id("adminOriginationCases"),
	})
	.handler(async (ctx, args) => {
		assertOriginationCaseAccessContext(ctx.viewer);

		const record = await ctx.db.get(args.caseId);
		if (!record) {
			return null;
		}

		assertOriginationCaseAccess(ctx.viewer, record);
		assertMutableOriginationCase(record);

		const documentDrafts = await ctx.db
			.query("originationCaseDocumentDrafts")
			.withIndex("by_case", (query) => query.eq("caseId", args.caseId))
			.collect();

		await Promise.all(
			documentDrafts.map((documentDraft) => ctx.db.delete(documentDraft._id))
		);
		await ctx.db.delete(args.caseId);

		return null;
	})
	.public();
