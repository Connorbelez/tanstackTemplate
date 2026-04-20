import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { assertOriginationCaseAccess } from "../../authz/origination";
import {
	isStaticMortgageDocumentClass,
	isTemplatedMortgageDocumentClass,
	type MortgageDocumentBlueprintClass,
	type MortgageDocumentValidationSummary,
	mortgageDocumentBlueprintClassValidator,
} from "../../documents/contracts";
import {
	buildMortgageDocumentValidationSummary,
	loadPinnedTemplateSnapshot,
} from "../../documents/templateValidation";
import { authedMutation, authedQuery, requirePermission } from "../../fluent";

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

async function requireViewerUserId(ctx: {
	db: Pick<QueryCtx["db"] | MutationCtx["db"], "query">;
	viewer: { authId: string };
}) {
	const user = await ctx.db
		.query("users")
		.withIndex("authId", (query) => query.eq("authId", ctx.viewer.authId))
		.unique();
	if (!user) {
		throw new ConvexError("User not found in database");
	}

	return user._id;
}

async function requireAccessibleMutableCase(
	ctx: Pick<QueryCtx | MutationCtx, "db"> & {
		viewer: { isFairLendAdmin: boolean; orgId?: string };
	},
	caseId: Id<"adminOriginationCases">
) {
	const caseRecord = await ctx.db.get(caseId);
	if (!caseRecord) {
		throw new ConvexError("Origination case not found");
	}

	assertOriginationCaseAccess(ctx.viewer, caseRecord);
	assertMutableOriginationCase(caseRecord);
	return caseRecord;
}

async function touchOriginationCase(
	ctx: Pick<MutationCtx, "db">,
	args: {
		caseId: Id<"adminOriginationCases">;
		userId: Id<"users">;
	}
) {
	await ctx.db.patch(args.caseId, {
		updatedAt: Date.now(),
		updatedByUserId: args.userId,
	});
}

async function listPublishedTemplates(ctx: Pick<QueryCtx | MutationCtx, "db">) {
	const templates = await ctx.db
		.query("documentTemplates")
		.order("desc")
		.collect();

	return templates.filter(
		(template) => typeof template.currentPublishedVersion === "number"
	);
}

async function listTemplateGroups(ctx: Pick<QueryCtx | MutationCtx, "db">) {
	return ctx.db.query("documentTemplateGroups").order("desc").collect();
}

async function nextDisplayOrder(
	ctx: Pick<QueryCtx | MutationCtx, "db">,
	caseId: Id<"adminOriginationCases">
) {
	const activeDrafts = await listActiveDraftsForCase(ctx, caseId);

	return (
		activeDrafts.reduce(
			(maxDisplayOrder, draft) => Math.max(maxDisplayOrder, draft.displayOrder),
			-1
		) + 1
	);
}

function normalizeText(value: string | undefined) {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}

async function listActiveDraftsForCase(
	ctx: Pick<QueryCtx | MutationCtx, "db">,
	caseId: Id<"adminOriginationCases">
) {
	return ctx.db
		.query("originationCaseDocumentDrafts")
		.withIndex("by_case_status_display_order", (query) =>
			query.eq("caseId", caseId).eq("status", "active")
		)
		.collect();
}

function findMatchingStaticDraft(
	drafts: readonly Doc<"originationCaseDocumentDrafts">[],
	args: {
		assetId: Id<"documentAssets">;
		documentClass: MortgageDocumentBlueprintClass;
	}
) {
	return drafts.find(
		(draft) =>
			draft.sourceKind === "asset" &&
			draft.class === args.documentClass &&
			draft.assetId === args.assetId
	);
}

function findMatchingTemplatedDraft(
	drafts: readonly Doc<"originationCaseDocumentDrafts">[],
	args: {
		documentClass: MortgageDocumentBlueprintClass;
		selectedFromGroupId?: Id<"documentTemplateGroups">;
		templateId: Id<"documentTemplates">;
		templateVersion: number;
	}
) {
	return drafts.find(
		(draft) =>
			draft.sourceKind === "template_version" &&
			draft.class === args.documentClass &&
			draft.templateId === args.templateId &&
			draft.templateVersion === args.templateVersion &&
			draft.selectedFromGroupId === args.selectedFromGroupId
	);
}

async function updateExistingDraft(
	ctx: Pick<MutationCtx, "db">,
	args: {
		category?: string;
		description?: string;
		displayName: string;
		draftId: Id<"originationCaseDocumentDrafts">;
		packageKey?: string;
		packageLabel?: string;
		updatedAt: number;
		updatedByUserId: Id<"users">;
		validationSummary: MortgageDocumentValidationSummary;
	}
) {
	await ctx.db.patch(args.draftId, {
		category: args.category,
		description: args.description,
		displayName: args.displayName,
		packageKey: args.packageKey,
		packageLabel: args.packageLabel,
		updatedAt: args.updatedAt,
		updatedByUserId: args.updatedByUserId,
		validationSummary: args.validationSummary,
	});
}

async function buildDraftListItem(
	ctx: Pick<QueryCtx | MutationCtx, "db">,
	draft: Doc<"originationCaseDocumentDrafts">
) {
	const [asset, template, selectedGroup] = await Promise.all([
		draft.assetId ? ctx.db.get(draft.assetId) : Promise.resolve(null),
		draft.templateId ? ctx.db.get(draft.templateId) : Promise.resolve(null),
		draft.selectedFromGroupId
			? ctx.db.get(draft.selectedFromGroupId)
			: Promise.resolve(null),
	]);

	return {
		...draft,
		asset:
			asset && "fileRef" in asset
				? {
						assetId: asset._id,
						fileRef: asset.fileRef,
						name: asset.name,
						originalFilename: asset.originalFilename,
					}
				: null,
		selectedGroup:
			selectedGroup && "templateRefs" in selectedGroup
				? {
						groupId: selectedGroup._id,
						name: selectedGroup.name,
					}
				: null,
		template:
			template && "draft" in template
				? {
						templateId: template._id,
						name: template.name,
					}
				: null,
	};
}

export const listCaseDocumentDrafts = originationQuery
	.input({
		caseId: v.id("adminOriginationCases"),
		includeArchived: v.optional(v.boolean()),
	})
	.handler(async (ctx, args) => {
		const caseRecord = await ctx.db.get(args.caseId);
		if (!caseRecord) {
			return [];
		}

		assertOriginationCaseAccess(ctx.viewer, caseRecord);
		const drafts = args.includeArchived
			? await ctx.db
					.query("originationCaseDocumentDrafts")
					.withIndex("by_case", (query) => query.eq("caseId", args.caseId))
					.collect()
			: await ctx.db
					.query("originationCaseDocumentDrafts")
					.withIndex("by_case_status_display_order", (query) =>
						query.eq("caseId", args.caseId).eq("status", "active")
					)
					.collect();

		return Promise.all(
			drafts
				.sort((left, right) => left.displayOrder - right.displayOrder)
				.map((draft) => buildDraftListItem(ctx, draft))
		);
	})
	.public();

export const listAttachableTemplates = originationQuery
	.input({})
	.handler(async (ctx) => {
		const templates = await listPublishedTemplates(ctx);

		return templates.map((template) => ({
			currentPublishedVersion: template.currentPublishedVersion ?? null,
			description: template.description ?? null,
			name: template.name,
			templateId: template._id,
		}));
	})
	.public();

export const listAttachableTemplateGroups = originationQuery
	.input({})
	.handler(async (ctx) => {
		const groups = await listTemplateGroups(ctx);

		return groups.map((group) => ({
			description: group.description ?? null,
			groupId: group._id,
			name: group.name,
			signatoryCount: group.signatories.length,
			templateCount: group.templateRefs.length,
		}));
	})
	.public();

export const createStaticDraft = originationMutation
	.input({
		assetId: v.id("documentAssets"),
		caseId: v.id("adminOriginationCases"),
		category: v.optional(v.string()),
		description: v.optional(v.string()),
		displayName: v.optional(v.string()),
		documentClass: mortgageDocumentBlueprintClassValidator,
		packageKey: v.optional(v.string()),
		packageLabel: v.optional(v.string()),
	})
	.handler(async (ctx, args) => {
		if (!isStaticMortgageDocumentClass(args.documentClass)) {
			throw new ConvexError(
				"Only static document classes accept uploaded assets."
			);
		}

		const [caseRecord, asset, viewerUserId] = await Promise.all([
			requireAccessibleMutableCase(ctx, args.caseId),
			ctx.db.get(args.assetId),
			requireViewerUserId(ctx),
		]);
		if (!asset) {
			throw new ConvexError("Document asset not found");
		}

		const now = Date.now();
		const activeDrafts = await listActiveDraftsForCase(ctx, caseRecord._id);
		const existingDraft = findMatchingStaticDraft(activeDrafts, {
			assetId: asset._id,
			documentClass: args.documentClass,
		});
		const draftValidationSummary = {
			containsSignableFields: false,
			requiredPlatformRoles: [],
			requiredVariableKeys: [],
			unsupportedPlatformRoles: [],
			unsupportedVariableKeys: [],
		} satisfies MortgageDocumentValidationSummary;
		const resolvedDisplayName = normalizeText(args.displayName) ?? asset.name;
		const resolvedCategory = normalizeText(args.category);
		const resolvedDescription = normalizeText(args.description);
		const resolvedPackageKey = normalizeText(args.packageKey);
		const resolvedPackageLabel = normalizeText(args.packageLabel);

		let draftId = existingDraft?._id;
		if (draftId) {
			await updateExistingDraft(ctx, {
				category: resolvedCategory,
				description: resolvedDescription,
				displayName: resolvedDisplayName,
				draftId,
				packageKey: resolvedPackageKey,
				packageLabel: resolvedPackageLabel,
				updatedAt: now,
				updatedByUserId: viewerUserId,
				validationSummary: draftValidationSummary,
			});
		} else {
			const displayOrder = await nextDisplayOrder(ctx, caseRecord._id);
			draftId = await ctx.db.insert("originationCaseDocumentDrafts", {
				archivedAt: undefined,
				archivedByUserId: undefined,
				assetId: asset._id,
				caseId: caseRecord._id,
				category: resolvedCategory,
				class: args.documentClass,
				createdAt: now,
				createdByUserId: viewerUserId,
				description: resolvedDescription,
				displayName: resolvedDisplayName,
				displayOrder,
				packageKey: resolvedPackageKey,
				packageLabel: resolvedPackageLabel,
				selectedFromGroupId: undefined,
				sourceKind: "asset",
				status: "active",
				supersededByDraftId: undefined,
				templateId: undefined,
				templateVersion: undefined,
				updatedAt: now,
				updatedByUserId: viewerUserId,
				validationSummary: draftValidationSummary,
			});
		}

		await touchOriginationCase(ctx, {
			caseId: caseRecord._id,
			userId: viewerUserId,
		});
		const draft = await ctx.db.get(draftId);
		if (!draft) {
			throw new ConvexError("Draft disappeared after creation");
		}

		return buildDraftListItem(ctx, draft);
	})
	.public();

export const attachTemplateVersion = originationMutation
	.input({
		caseId: v.id("adminOriginationCases"),
		category: v.optional(v.string()),
		description: v.optional(v.string()),
		displayName: v.optional(v.string()),
		documentClass: mortgageDocumentBlueprintClassValidator,
		packageKey: v.optional(v.string()),
		packageLabel: v.optional(v.string()),
		selectedFromGroupId: v.optional(v.id("documentTemplateGroups")),
		templateId: v.id("documentTemplates"),
		templateVersion: v.optional(v.number()),
	})
	.handler(async (ctx, args) => {
		if (!isTemplatedMortgageDocumentClass(args.documentClass)) {
			throw new ConvexError(
				"Only templated document classes accept template versions."
			);
		}

		const [caseRecord, viewerUserId, templateSnapshot] = await Promise.all([
			requireAccessibleMutableCase(ctx, args.caseId),
			requireViewerUserId(ctx),
			loadPinnedTemplateSnapshot(ctx, {
				templateId: args.templateId,
				templateVersion: args.templateVersion,
			}),
		]);
		const validationSummary = buildMortgageDocumentValidationSummary({
			documentClass: args.documentClass,
			snapshot: templateSnapshot.snapshot,
		});
		const now = Date.now();
		const activeDrafts = await listActiveDraftsForCase(ctx, caseRecord._id);
		const existingDraft = findMatchingTemplatedDraft(activeDrafts, {
			documentClass: args.documentClass,
			selectedFromGroupId: args.selectedFromGroupId,
			templateId: templateSnapshot.template._id,
			templateVersion: templateSnapshot.templateVersion,
		});
		const resolvedCategory = normalizeText(args.category);
		const resolvedDescription = normalizeText(args.description);
		const resolvedDisplayName =
			normalizeText(args.displayName) ?? templateSnapshot.template.name;
		const resolvedPackageKey = normalizeText(args.packageKey);
		const resolvedPackageLabel = normalizeText(args.packageLabel);

		let draftId = existingDraft?._id;
		if (draftId) {
			await updateExistingDraft(ctx, {
				category: resolvedCategory,
				description: resolvedDescription,
				displayName: resolvedDisplayName,
				draftId,
				packageKey: resolvedPackageKey,
				packageLabel: resolvedPackageLabel,
				updatedAt: now,
				updatedByUserId: viewerUserId,
				validationSummary,
			});
		} else {
			const displayOrder = await nextDisplayOrder(ctx, caseRecord._id);
			draftId = await ctx.db.insert("originationCaseDocumentDrafts", {
				archivedAt: undefined,
				archivedByUserId: undefined,
				assetId: undefined,
				caseId: caseRecord._id,
				category: resolvedCategory,
				class: args.documentClass,
				createdAt: now,
				createdByUserId: viewerUserId,
				description: resolvedDescription,
				displayName: resolvedDisplayName,
				displayOrder,
				packageKey: resolvedPackageKey,
				packageLabel: resolvedPackageLabel,
				selectedFromGroupId: args.selectedFromGroupId,
				sourceKind: "template_version",
				status: "active",
				supersededByDraftId: undefined,
				templateId: templateSnapshot.template._id,
				templateVersion: templateSnapshot.templateVersion,
				updatedAt: now,
				updatedByUserId: viewerUserId,
				validationSummary,
			});
		}

		await touchOriginationCase(ctx, {
			caseId: caseRecord._id,
			userId: viewerUserId,
		});
		const draft = await ctx.db.get(draftId);
		if (!draft) {
			throw new ConvexError("Draft disappeared after creation");
		}

		return buildDraftListItem(ctx, draft);
	})
	.public();

export const attachTemplateGroup = originationMutation
	.input({
		caseId: v.id("adminOriginationCases"),
		documentClass: mortgageDocumentBlueprintClassValidator,
		groupId: v.id("documentTemplateGroups"),
		packageKey: v.optional(v.string()),
		packageLabel: v.optional(v.string()),
	})
	.handler(async (ctx, args) => {
		if (!isTemplatedMortgageDocumentClass(args.documentClass)) {
			throw new ConvexError(
				"Only templated document classes accept template groups."
			);
		}

		const [caseRecord, viewerUserId, group] = await Promise.all([
			requireAccessibleMutableCase(ctx, args.caseId),
			requireViewerUserId(ctx),
			ctx.db.get(args.groupId),
		]);
		if (!(group && "templateRefs" in group)) {
			throw new ConvexError("Template group not found");
		}

		const orderedRefs = [...group.templateRefs].sort(
			(left, right) => left.order - right.order
		);
		const activeDrafts = await listActiveDraftsForCase(ctx, caseRecord._id);
		const now = Date.now();
		const createdDraftIds: Id<"originationCaseDocumentDrafts">[] = [];
		let nextInsertOrder =
			activeDrafts.reduce(
				(maxDisplayOrder, draft) =>
					Math.max(maxDisplayOrder, draft.displayOrder),
				-1
			) + 1;

		for (const templateRef of orderedRefs) {
			const templateSnapshot = await loadPinnedTemplateSnapshot(ctx, {
				templateId: templateRef.templateId,
				templateVersion: templateRef.pinnedVersion,
			});
			const validationSummary = buildMortgageDocumentValidationSummary({
				documentClass: args.documentClass,
				snapshot: templateSnapshot.snapshot,
			});
			const resolvedPackageKey =
				normalizeText(args.packageKey) ?? `group:${String(group._id)}`;
			const resolvedPackageLabel =
				normalizeText(args.packageLabel) ?? group.name;
			const existingDraft = findMatchingTemplatedDraft(activeDrafts, {
				documentClass: args.documentClass,
				selectedFromGroupId: group._id,
				templateId: templateSnapshot.template._id,
				templateVersion: templateSnapshot.templateVersion,
			});

			let draftId = existingDraft?._id;
			if (draftId) {
				await updateExistingDraft(ctx, {
					category: undefined,
					description: group.description,
					displayName: templateSnapshot.template.name,
					draftId,
					packageKey: resolvedPackageKey,
					packageLabel: resolvedPackageLabel,
					updatedAt: now,
					updatedByUserId: viewerUserId,
					validationSummary,
				});
			} else {
				draftId = await ctx.db.insert("originationCaseDocumentDrafts", {
					archivedAt: undefined,
					archivedByUserId: undefined,
					assetId: undefined,
					caseId: caseRecord._id,
					category: undefined,
					class: args.documentClass,
					createdAt: now,
					createdByUserId: viewerUserId,
					description: group.description,
					displayName: templateSnapshot.template.name,
					displayOrder: nextInsertOrder,
					packageKey: resolvedPackageKey,
					packageLabel: resolvedPackageLabel,
					selectedFromGroupId: group._id,
					sourceKind: "template_version",
					status: "active",
					supersededByDraftId: undefined,
					templateId: templateSnapshot.template._id,
					templateVersion: templateSnapshot.templateVersion,
					updatedAt: now,
					updatedByUserId: viewerUserId,
					validationSummary,
				});
				nextInsertOrder += 1;
			}
			createdDraftIds.push(draftId);
		}

		await touchOriginationCase(ctx, {
			caseId: caseRecord._id,
			userId: viewerUserId,
		});
		const drafts = await Promise.all(
			createdDraftIds.map(async (draftId) => {
				const draft = await ctx.db.get(draftId);
				if (!draft) {
					throw new ConvexError("Draft disappeared after creation");
				}
				return buildDraftListItem(ctx, draft);
			})
		);
		return drafts;
	})
	.public();

export const archiveDraft = originationMutation
	.input({
		draftId: v.id("originationCaseDocumentDrafts"),
	})
	.handler(async (ctx, args) => {
		const draft = await ctx.db.get(args.draftId);
		if (!draft) {
			throw new ConvexError("Document draft not found");
		}

		const [caseRecord, viewerUserId] = await Promise.all([
			requireAccessibleMutableCase(ctx, draft.caseId),
			requireViewerUserId(ctx),
		]);
		const now = Date.now();
		await ctx.db.patch(draft._id, {
			archivedAt: now,
			archivedByUserId: viewerUserId,
			status: "archived",
			updatedAt: now,
			updatedByUserId: viewerUserId,
		});
		await touchOriginationCase(ctx, {
			caseId: caseRecord._id,
			userId: viewerUserId,
		});

		return { archived: true, draftId: draft._id };
	})
	.public();
