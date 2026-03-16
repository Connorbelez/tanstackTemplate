import { ConvexError, v } from "convex/values";
import { authedMutation, authedQuery, requirePermission } from "../fluent";
import { draftStateValidator } from "./validators";

const docGenMutation = authedMutation.use(
	requirePermission("document:generate")
);

export const create = docGenMutation
	.input({
		name: v.string(),
		description: v.optional(v.string()),
		basePdfId: v.id("documentBasePdfs"),
	})
	.handler(async (ctx, args) => {
		const basePdf = await ctx.db.get(args.basePdfId);
		if (!basePdf) {
			throw new ConvexError("Base PDF not found");
		}

		const now = Date.now();
		return await ctx.db.insert("documentTemplates", {
			name: args.name,
			description: args.description,
			basePdfId: args.basePdfId,
			basePdfHash: basePdf.fileHash,
			draft: { fields: [], signatories: [], pdfmeSchema: [] },
			hasDraftChanges: false,
			createdAt: now,
			updatedAt: now,
		});
	})
	.public();

export const get = authedQuery
	.input({ id: v.id("documentTemplates") })
	.handler(async (ctx, args) => {
		const template = await ctx.db.get(args.id);
		if (!template) {
			return null;
		}

		const basePdf = await ctx.db.get(template.basePdfId);
		return { ...template, basePdf };
	})
	.public();

export const list = authedQuery
	.input({})
	.handler(async (ctx) => {
		return await ctx.db.query("documentTemplates").order("desc").collect();
	})
	.public();

export const saveDraft = docGenMutation
	.input({
		id: v.id("documentTemplates"),
		draft: draftStateValidator,
	})
	.handler(async (ctx, args) => {
		const template = await ctx.db.get(args.id);
		if (!template) {
			throw new ConvexError("Template not found");
		}

		// Validate: every signable field must reference a role in the signatory list
		const signatoryRoles = new Set(
			args.draft.signatories.map((s) => s.platformRole)
		);
		for (const field of args.draft.fields) {
			if (
				field.type === "signable" &&
				field.signatoryPlatformRole &&
				!signatoryRoles.has(field.signatoryPlatformRole)
			) {
				throw new ConvexError(
					`Field "${field.label ?? field.id}" references role "${field.signatoryPlatformRole}" which is not in the signatory list`
				);
			}
		}

		// Validate: every interpolable field's variableKey must exist in systemVariables
		const interpolableKeys = args.draft.fields
			.filter((f) => f.type === "interpolable" && f.variableKey)
			.map((f) => f.variableKey as string);

		if (interpolableKeys.length > 0) {
			const missingKeys: string[] = [];
			for (const key of interpolableKeys) {
				const variable = await ctx.db
					.query("systemVariables")
					.withIndex("by_key", (q) => q.eq("key", key))
					.first();
				if (!variable) {
					missingKeys.push(key);
				}
			}
			if (missingKeys.length > 0) {
				throw new ConvexError(
					`Unknown variable keys: ${missingKeys.join(", ")}. Define them in System Variables first.`
				);
			}
		}

		await ctx.db.patch(args.id, {
			draft: args.draft,
			hasDraftChanges: true,
			updatedAt: Date.now(),
		});
	})
	.public();

export const updateMetadata = docGenMutation
	.input({
		id: v.id("documentTemplates"),
		name: v.optional(v.string()),
		description: v.optional(v.string()),
	})
	.handler(async (ctx, args) => {
		const template = await ctx.db.get(args.id);
		if (!template) {
			throw new ConvexError("Template not found");
		}

		const updates: Record<string, unknown> = { updatedAt: Date.now() };
		if (args.name !== undefined) {
			updates.name = args.name;
		}
		if (args.description !== undefined) {
			updates.description = args.description;
		}

		await ctx.db.patch(args.id, updates);
	})
	.public();

export const publish = docGenMutation
	.input({
		id: v.id("documentTemplates"),
		publishedBy: v.optional(v.string()),
	})
	.handler(async (ctx, args) => {
		const template = await ctx.db.get(args.id);
		if (!template) {
			throw new ConvexError("Template not found");
		}

		const basePdf = await ctx.db.get(template.basePdfId);
		if (!basePdf) {
			throw new ConvexError("Base PDF no longer exists");
		}

		if (template.draft.fields.length === 0) {
			throw new ConvexError("Cannot publish a template with no fields");
		}

		// Validate: PDF hash still matches (detect if base PDF was swapped)
		if (template.basePdfHash !== basePdf.fileHash) {
			throw new ConvexError(
				"Base PDF has changed since this template was created. Re-associate the correct PDF or create a new template."
			);
		}

		// Validate signatory consistency with containing groups
		const allGroups = await ctx.db.query("documentTemplateGroups").collect();
		const templateRoles = new Set(
			template.draft.signatories.map((s) => s.platformRole)
		);
		for (const group of allGroups) {
			const inGroup = group.templateRefs.some((r) => r.templateId === args.id);
			if (!inGroup || group.signatories.length === 0) {
				continue;
			}

			const groupRoles = new Set(group.signatories.map((s) => s.platformRole));
			const missing = [...groupRoles].filter((r) => !templateRoles.has(r));
			const extra = [...templateRoles].filter((r) => !groupRoles.has(r));

			if (missing.length > 0 || extra.length > 0) {
				const parts: string[] = [];
				if (missing.length > 0) {
					parts.push(`missing: ${missing.join(", ")}`);
				}
				if (extra.length > 0) {
					parts.push(`extra: ${extra.join(", ")}`);
				}
				throw new ConvexError(
					`Signatory mismatch with group "${group.name}": ${parts.join("; ")}. Update the template signatories to match the group before publishing.`
				);
			}
		}

		// Determine version number
		const version = (template.currentPublishedVersion ?? 0) + 1;

		// Create immutable version snapshot
		await ctx.db.insert("documentTemplateVersions", {
			templateId: args.id,
			version,
			basePdfId: template.basePdfId,
			basePdfHash: basePdf.fileHash,
			snapshot: template.draft,
			publishedBy: args.publishedBy,
			publishedAt: Date.now(),
		});

		// Update template
		await ctx.db.patch(args.id, {
			currentPublishedVersion: version,
			hasDraftChanges: false,
			updatedAt: Date.now(),
		});

		return version;
	})
	.public();

export const remove = docGenMutation
	.input({ id: v.id("documentTemplates") })
	.handler(async (ctx, args) => {
		// Check if template is in any group
		const groups = await ctx.db.query("documentTemplateGroups").collect();
		for (const group of groups) {
			if (group.templateRefs.some((ref) => ref.templateId === args.id)) {
				throw new ConvexError(
					`Cannot delete: template is in group "${group.name}"`
				);
			}
		}

		// Delete all versions
		const versions = await ctx.db
			.query("documentTemplateVersions")
			.withIndex("by_template", (q) => q.eq("templateId", args.id))
			.collect();
		for (const version of versions) {
			await ctx.db.delete(version._id);
		}

		await ctx.db.delete(args.id);
	})
	.public();
