import { ConvexError, v } from "convex/values";
import { authedMutation, authedQuery, requirePermission } from "../fluent";

// TODO: Read queries (get, list) use authedQuery (authentication only).
// Add permission gate (e.g. requirePermission("document:view")) when moving to production.

const docGenMutation = authedMutation.use(
	requirePermission("document:generate")
);

export const create = docGenMutation
	.input({
		name: v.string(),
		description: v.optional(v.string()),
	})
	.handler(async (ctx, args) => {
		const now = Date.now();
		return await ctx.db.insert("documentTemplateGroups", {
			name: args.name,
			description: args.description,
			templateRefs: [],
			signatories: [],
			createdAt: now,
			updatedAt: now,
		});
	})
	.public();

export const get = authedQuery
	.input({ id: v.id("documentTemplateGroups") })
	.handler(async (ctx, args) => {
		const group = await ctx.db.get(args.id);
		if (!group) {
			return null;
		}

		// Join template data, filtering out deleted templates
		const templatesWithNulls = await Promise.all(
			group.templateRefs.map(async (ref) => {
				const template = await ctx.db.get(ref.templateId);
				return { ...ref, template };
			})
		);
		const templates = templatesWithNulls.filter((t) => t.template !== null);

		return { ...group, templates };
	})
	.public();

export const list = authedQuery
	.input({})
	.handler(async (ctx) => {
		return await ctx.db.query("documentTemplateGroups").order("desc").collect();
	})
	.public();

export const addTemplate = docGenMutation
	.input({
		groupId: v.id("documentTemplateGroups"),
		templateId: v.id("documentTemplates"),
	})
	.handler(async (ctx, args) => {
		const group = await ctx.db.get(args.groupId);
		if (!group) {
			throw new ConvexError("Group not found");
		}

		const template = await ctx.db.get(args.templateId);
		if (!template) {
			throw new ConvexError("Template not found");
		}

		// Check template isn't already in group
		if (group.templateRefs.some((r) => r.templateId === args.templateId)) {
			throw new ConvexError("Template is already in this group");
		}

		const templateSignatories = template.draft.signatories;

		if (group.templateRefs.length === 0) {
			// First template: auto-populate group signatories
			await ctx.db.patch(args.groupId, {
				templateRefs: [
					{
						templateId: args.templateId,
						order: 0,
						pinnedVersion: undefined,
					},
				],
				signatories: templateSignatories.map((s) => ({
					platformRole: s.platformRole,
					role: s.role,
					order: s.order,
				})),
				updatedAt: Date.now(),
			});
		} else {
			// Subsequent templates: enforce signatory homogeneity
			const groupRoles = new Set(group.signatories.map((s) => s.platformRole));
			const templateRoles = new Set(
				templateSignatories.map((s) => s.platformRole)
			);

			// Check that the template has the same platform roles
			const missingInTemplate = [...groupRoles].filter(
				(r) => !templateRoles.has(r)
			);
			const extraInTemplate = [...templateRoles].filter(
				(r) => !groupRoles.has(r)
			);

			if (missingInTemplate.length > 0 || extraInTemplate.length > 0) {
				const parts: string[] = [];
				if (missingInTemplate.length > 0) {
					parts.push(`missing roles: ${missingInTemplate.join(", ")}`);
				}
				if (extraInTemplate.length > 0) {
					parts.push(`extra roles: ${extraInTemplate.join(", ")}`);
				}
				throw new ConvexError(
					`Signatory mismatch: ${parts.join("; ")}. All templates in a group must have the same signatories.`
				);
			}

			const nextOrder = Math.max(...group.templateRefs.map((r) => r.order)) + 1;
			await ctx.db.patch(args.groupId, {
				templateRefs: [
					...group.templateRefs,
					{
						templateId: args.templateId,
						order: nextOrder,
						pinnedVersion: undefined,
					},
				],
				updatedAt: Date.now(),
			});
		}
	})
	.public();

export const removeTemplate = docGenMutation
	.input({
		groupId: v.id("documentTemplateGroups"),
		templateId: v.id("documentTemplates"),
	})
	.handler(async (ctx, args) => {
		const group = await ctx.db.get(args.groupId);
		if (!group) {
			throw new ConvexError("Group not found");
		}

		const newRefs = group.templateRefs.filter(
			(r) => r.templateId !== args.templateId
		);

		const updates: Record<string, unknown> = {
			templateRefs: newRefs,
			updatedAt: Date.now(),
		};

		// If no templates left, clear signatories
		if (newRefs.length === 0) {
			updates.signatories = [];
		}

		await ctx.db.patch(args.groupId, updates);
	})
	.public();

export const reorderTemplates = docGenMutation
	.input({
		groupId: v.id("documentTemplateGroups"),
		templateRefs: v.array(
			v.object({
				templateId: v.id("documentTemplates"),
				order: v.number(),
				pinnedVersion: v.optional(v.number()),
			})
		),
	})
	.handler(async (ctx, args) => {
		const group = await ctx.db.get(args.groupId);
		if (!group) {
			throw new ConvexError("Group not found");
		}

		// Validate: same set of templates, no duplicates
		const existingIds = new Set(group.templateRefs.map((r) => r.templateId));
		const newIds = new Set(args.templateRefs.map((r) => r.templateId));
		if (
			existingIds.size !== newIds.size ||
			![...existingIds].every((id) => newIds.has(id))
		) {
			throw new ConvexError(
				"Provided templateRefs must contain exactly the same templates as the group"
			);
		}

		await ctx.db.patch(args.groupId, {
			templateRefs: args.templateRefs,
			updatedAt: Date.now(),
		});
	})
	.public();

export const updateMetadata = docGenMutation
	.input({
		id: v.id("documentTemplateGroups"),
		name: v.optional(v.string()),
		description: v.optional(v.string()),
	})
	.handler(async (ctx, args) => {
		const group = await ctx.db.get(args.id);
		if (!group) {
			throw new ConvexError("Group not found");
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

export const pinVersion = docGenMutation
	.input({
		groupId: v.id("documentTemplateGroups"),
		templateId: v.id("documentTemplates"),
		pinnedVersion: v.optional(v.number()),
	})
	.handler(async (ctx, args) => {
		const group = await ctx.db.get(args.groupId);
		if (!group) {
			throw new ConvexError("Group not found");
		}

		const refIndex = group.templateRefs.findIndex(
			(r) => r.templateId === args.templateId
		);
		if (refIndex === -1) {
			throw new ConvexError("Template is not in this group");
		}

		const updatedRefs = group.templateRefs.map((r) =>
			r.templateId === args.templateId
				? { ...r, pinnedVersion: args.pinnedVersion }
				: r
		);

		await ctx.db.patch(args.groupId, {
			templateRefs: updatedRefs,
			updatedAt: Date.now(),
		});
	})
	.public();

export const remove = docGenMutation
	.input({ id: v.id("documentTemplateGroups") })
	.handler(async (ctx, args) => {
		await ctx.db.delete(args.id);
	})
	.public();
