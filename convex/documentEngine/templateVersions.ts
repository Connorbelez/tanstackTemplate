import { v } from "convex/values";
import { query } from "../_generated/server";

export const listByTemplate = query({
	args: { templateId: v.id("documentTemplates") },
	handler: async (ctx, args) => {
		return await ctx.db
			.query("documentTemplateVersions")
			.withIndex("by_template", (q) => q.eq("templateId", args.templateId))
			.order("desc")
			.collect();
	},
});

export const get = query({
	args: {
		templateId: v.id("documentTemplates"),
		version: v.number(),
	},
	handler: async (ctx, args) => {
		return await ctx.db
			.query("documentTemplateVersions")
			.withIndex("by_template", (q) =>
				q.eq("templateId", args.templateId).eq("version", args.version)
			)
			.first();
	},
});

export const getLatest = query({
	args: { templateId: v.id("documentTemplates") },
	handler: async (ctx, args) => {
		return await ctx.db
			.query("documentTemplateVersions")
			.withIndex("by_template", (q) => q.eq("templateId", args.templateId))
			.order("desc")
			.first();
	},
});
