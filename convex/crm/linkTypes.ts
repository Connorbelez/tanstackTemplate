import { ConvexError, v } from "convex/values";
import { auditLog } from "../auditLog";
import { crmAdminMutation, crmAdminQuery } from "../fluent";
import { cardinalityValidator } from "./validators";

// ── createLinkType ─────────────────────────────────────────────────
// Creates a linkTypeDef binding two objectDefs with a cardinality.
export const createLinkType = crmAdminMutation
	.input({
		name: v.string(),
		sourceObjectDefId: v.id("objectDefs"),
		targetObjectDefId: v.id("objectDefs"),
		cardinality: cardinalityValidator,
	})
	.handler(async (ctx, args) => {
		const orgId = ctx.viewer.orgId;
		if (!orgId) {
			throw new ConvexError("Org context required for CRM operations");
		}

		// Validate source objectDef exists, is active, and belongs to caller's org
		const sourceObjectDef = await ctx.db.get(args.sourceObjectDefId);
		if (!sourceObjectDef || sourceObjectDef.orgId !== orgId) {
			console.error(
				`[createLinkType] Source objectDef ${args.sourceObjectDefId} not found or org mismatch (org: ${orgId})`
			);
			throw new ConvexError("Source object not found or access denied");
		}
		if (!sourceObjectDef.isActive) {
			throw new ConvexError("Source object is not active");
		}

		// Validate target objectDef exists, is active, and belongs to caller's org
		const targetObjectDef = await ctx.db.get(args.targetObjectDefId);
		if (!targetObjectDef || targetObjectDef.orgId !== orgId) {
			console.error(
				`[createLinkType] Target objectDef ${args.targetObjectDefId} not found or org mismatch (org: ${orgId})`
			);
			throw new ConvexError("Target object not found or access denied");
		}
		if (!targetObjectDef.isActive) {
			throw new ConvexError("Target object is not active");
		}

		const linkTypeDefId = await ctx.db.insert("linkTypeDefs", {
			orgId,
			name: args.name,
			sourceObjectDefId: args.sourceObjectDefId,
			targetObjectDefId: args.targetObjectDefId,
			cardinality: args.cardinality,
			isActive: true,
			createdAt: Date.now(),
		});

		// Audit
		await auditLog.log(ctx, {
			action: "crm.linkType.created",
			actorId: ctx.viewer.authId,
			resourceType: "linkTypeDefs",
			resourceId: linkTypeDefId,
			severity: "info",
			metadata: {
				name: args.name,
				orgId,
				sourceObjectDefId: args.sourceObjectDefId,
				targetObjectDefId: args.targetObjectDefId,
				cardinality: args.cardinality,
			},
		});

		return linkTypeDefId;
	})
	.public();

// ── deactivateLinkType ─────────────────────────────────────────────
// Soft-deactivates a linkTypeDef by setting isActive=false. Throws if
// any non-deleted recordLinks reference this type.
export const deactivateLinkType = crmAdminMutation
	.input({ linkTypeDefId: v.id("linkTypeDefs") })
	.handler(async (ctx, args) => {
		const orgId = ctx.viewer.orgId;
		if (!orgId) {
			throw new ConvexError("Org context required for CRM operations");
		}

		const linkTypeDef = await ctx.db.get(args.linkTypeDefId);
		if (!linkTypeDef || linkTypeDef.orgId !== orgId) {
			console.error(
				`[deactivateLinkType] linkTypeDef ${args.linkTypeDefId} not found or org mismatch (org: ${orgId})`
			);
			throw new ConvexError("Link type not found or access denied");
		}

		// Check for active (non-deleted) record links using this link type
		const activeLink = await ctx.db
			.query("recordLinks")
			.withIndex("by_link_type", (q) =>
				q.eq("linkTypeDefId", args.linkTypeDefId)
			)
			.filter((q) => q.eq(q.field("isDeleted"), false))
			.first();

		if (activeLink) {
			throw new ConvexError(
				"Cannot deactivate link type: active record links exist. Delete all links first."
			);
		}

		await ctx.db.patch(args.linkTypeDefId, { isActive: false });

		// Audit
		await auditLog.log(ctx, {
			action: "crm.linkType.deactivated",
			actorId: ctx.viewer.authId,
			resourceType: "linkTypeDefs",
			resourceId: args.linkTypeDefId,
			severity: "warning",
			metadata: { name: linkTypeDef.name, orgId },
		});
	})
	.public();

// ── listLinkTypes ──────────────────────────────────────────────────
// Returns all active linkTypeDefs for the caller's org.
export const listLinkTypes = crmAdminQuery
	.handler(async (ctx) => {
		const orgId = ctx.viewer.orgId;
		if (!orgId) {
			throw new ConvexError("Org context required for CRM operations");
		}
		const linkTypes = await ctx.db
			.query("linkTypeDefs")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.collect();
		return linkTypes.filter((lt) => lt.isActive);
	})
	.public();
