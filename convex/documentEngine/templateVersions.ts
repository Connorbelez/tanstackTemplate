import { v } from "convex/values";
import { authedQuery } from "../fluent";

// TODO: Read queries (listByTemplate, get, getLatest) use authedQuery (authentication only).
// Add permission gate (e.g. requirePermission("document:view")) when moving to production.

export const listByTemplate = authedQuery
	.input({ templateId: v.id("documentTemplates") })
	.handler(async (ctx, args) => {
		return await ctx.db
			.query("documentTemplateVersions")
			.withIndex("by_template", (q) => q.eq("templateId", args.templateId))
			.order("desc")
			.collect();
	})
	.public();

export const get = authedQuery
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

export const getLatest = authedQuery
	.input({ templateId: v.id("documentTemplates") })
	.handler(async (ctx, args) => {
		return await ctx.db
			.query("documentTemplateVersions")
			.withIndex("by_template", (q) => q.eq("templateId", args.templateId))
			.order("desc")
			.first();
	})
	.public();
