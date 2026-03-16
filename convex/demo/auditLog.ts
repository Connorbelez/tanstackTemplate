import { v } from "convex/values";
import { AuditLog } from "convex-audit-log";
import { components } from "../_generated/api";
import { authedMutation, authedQuery } from "../fluent";

const auditLog = new AuditLog(components.auditLog);

export const createDocument = authedMutation
	.input({ title: v.string(), body: v.string() })
	.handler(async (ctx, args) => {
		const id = await ctx.db.insert("demo_audit_documents", {
			title: args.title,
			body: args.body,
			status: "draft",
		});
		await auditLog.log(ctx, {
			action: "document.created",
			actorId: "demo-user",
			resourceType: "demo_audit_documents",
			resourceId: id,
			severity: "info",
			metadata: { title: args.title },
		});
		return id;
	})
	.public();

export const updateDocument = authedMutation
	.input({
		id: v.id("demo_audit_documents"),
		title: v.string(),
		body: v.string(),
		status: v.string(),
	})
	.handler(async (ctx, args) => {
		const before = await ctx.db.get(args.id);
		if (!before) {
			throw new Error("Document not found");
		}
		await ctx.db.patch(args.id, {
			title: args.title,
			body: args.body,
			status: args.status,
		});
		const after = await ctx.db.get(args.id);
		await auditLog.logChange(ctx, {
			action: "document.updated",
			actorId: "demo-user",
			resourceType: "demo_audit_documents",
			resourceId: args.id,
			before,
			after,
			generateDiff: true,
			severity: "info",
		});
	})
	.public();

export const deleteDocument = authedMutation
	.input({ id: v.id("demo_audit_documents") })
	.handler(async (ctx, args) => {
		const doc = await ctx.db.get(args.id);
		if (!doc) {
			throw new Error("Document not found");
		}
		await ctx.db.delete(args.id);
		await auditLog.log(ctx, {
			action: "document.deleted",
			actorId: "demo-user",
			resourceType: "demo_audit_documents",
			resourceId: args.id,
			severity: "warning",
			metadata: { title: doc.title },
		});
	})
	.public();

export const listDocuments = authedQuery
	.handler(async (ctx) => {
		return await ctx.db.query("demo_audit_documents").order("desc").take(20);
	})
	.public();

export const getAuditTrail = authedQuery
	.input({ resourceId: v.optional(v.string()) })
	.handler(async (ctx, args) => {
		if (args.resourceId) {
			return await auditLog.queryByResource(ctx, {
				resourceType: "demo_audit_documents",
				resourceId: args.resourceId,
				limit: 50,
			});
		}
		return await auditLog.queryByActor(ctx, {
			actorId: "demo-user",
			limit: 50,
		});
	})
	.public();
