import { v } from "convex/values";
import { documentQuery } from "../fluent";

export const listByTemplate = documentQuery
	.input({ templateId: v.id("documentTemplates") })
	.handler(async (ctx, args) => {
		return await ctx.db
			.query("documentTemplateVersions")
			.withIndex("by_template", (q) => q.eq("templateId", args.templateId))
			.order("desc")
			.collect();
	})
	.public();

export const get = documentQuery
	.input({
		templateId: v.id("documentTemplates"),
		version: v.number(),
	})
	.handler(async (ctx, args) => {
		return await ctx.db
			.query("documentTemplateVersions")
			.withIndex("by_template", (q) =>
				q.eq("templateId", args.templateId).eq("version", args.version)
			)
			.first();
	})
	.public();

export const getLatest = documentQuery
	.input({ templateId: v.id("documentTemplates") })
	.handler(async (ctx, args) => {
		return await ctx.db
			.query("documentTemplateVersions")
			.withIndex("by_template", (q) => q.eq("templateId", args.templateId))
			.order("desc")
			.first();
	})
	.public();
