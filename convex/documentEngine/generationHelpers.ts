import type { GenericQueryCtx } from "convex/server";
import { v } from "convex/values";
import type { DataModel, Id } from "../_generated/dataModel";
import { internalQuery } from "../_generated/server";

// Shared implementation for loading template + version snapshot
async function getTemplateWithVersionImpl(
	ctx: GenericQueryCtx<DataModel>,
	args: {
		templateId: Id<"documentTemplates">;
		pinnedVersion?: number;
	}
) {
	const template = await ctx.db.get(args.templateId);
	if (!template) {
		return null;
	}

	const basePdf = await ctx.db.get(template.basePdfId);
	if (!basePdf) {
		return null;
	}

	let snapshot: typeof template.draft;
	let version: number;
	let basePdfHash: string;

	if (args.pinnedVersion !== undefined) {
		const versionDoc = await ctx.db
			.query("documentTemplateVersions")
			.withIndex("by_template", (q) =>
				q
					.eq("templateId", args.templateId)
					.eq("version", args.pinnedVersion as number)
			)
			.first();
		if (!versionDoc) {
			return null;
		}
		snapshot = versionDoc.snapshot;
		version = versionDoc.version;
		basePdfHash = versionDoc.basePdfHash;
	} else {
		const latest = await ctx.db
			.query("documentTemplateVersions")
			.withIndex("by_template", (q) => q.eq("templateId", args.templateId))
			.order("desc")
			.first();
		if (!latest) {
			return null;
		}
		snapshot = latest.snapshot;
		version = latest.version;
		basePdfHash = latest.basePdfHash;
	}

	return { template, basePdf, snapshot, version, basePdfHash };
}

export const getTemplateWithVersion = internalQuery({
	args: {
		templateId: v.id("documentTemplates"),
		pinnedVersion: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		return getTemplateWithVersionImpl(ctx, args);
	},
});

export const getAllVariables = internalQuery({
	args: {},
	handler: async (ctx) => {
		return await ctx.db.query("systemVariables").collect();
	},
});

export const getGroup = internalQuery({
	args: { groupId: v.id("documentTemplateGroups") },
	handler: async (ctx, args) => {
		return await ctx.db.get(args.groupId);
	},
});

// Returns all data needed for client-side generation preparation:
// template + version snapshot, base PDF URL, and system variables.
export const prepareGenerationData = internalQuery({
	args: {
		templateId: v.id("documentTemplates"),
		pinnedVersion: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const templateData = await getTemplateWithVersionImpl(ctx, args);
		if (!templateData) {
			return null;
		}

		const basePdfUrl = await ctx.storage.getUrl(templateData.basePdf.fileRef);
		if (!basePdfUrl) {
			return null;
		}

		const allVariables = await ctx.db.query("systemVariables").collect();

		return {
			...templateData,
			basePdfUrl,
			allVariables,
		};
	},
});

// Pre-validate all templates in a group have published versions (REQ-98)
export const validateGroupTemplates = internalQuery({
	args: {
		templateRefs: v.array(
			v.object({
				templateId: v.id("documentTemplates"),
				order: v.number(),
				pinnedVersion: v.optional(v.number()),
			})
		),
	},
	handler: async (ctx, args) => {
		const failures: Array<{ templateId: string; reason: string }> = [];

		for (const ref of args.templateRefs) {
			const template = await ctx.db.get(ref.templateId);
			if (!template) {
				failures.push({
					templateId: ref.templateId,
					reason: "template not found",
				});
				continue;
			}

			if (ref.pinnedVersion !== undefined) {
				const versionDoc = await ctx.db
					.query("documentTemplateVersions")
					.withIndex("by_template", (q) =>
						q
							.eq("templateId", ref.templateId)
							.eq("version", ref.pinnedVersion as number)
					)
					.first();
				if (!versionDoc) {
					failures.push({
						templateId: ref.templateId,
						reason: `pinned version ${ref.pinnedVersion} not found for "${template.name}"`,
					});
				}
			} else {
				const latest = await ctx.db
					.query("documentTemplateVersions")
					.withIndex("by_template", (q) => q.eq("templateId", ref.templateId))
					.order("desc")
					.first();
				if (!latest) {
					failures.push({
						templateId: ref.templateId,
						reason: `"${template.name}" has no published versions`,
					});
				}
			}
		}

		return failures;
	},
});
