import { ConvexError, v } from "convex/values";
import { auditLog } from "../auditLog";
import { crmAdminMutation, crmAdminQuery } from "../fluent";

// ── createObject ────────────────────────────────────────────────────
// Creates an objectDef + auto-creates a default "All {pluralLabel}" table view.
export const createObject = crmAdminMutation
	.input({
		name: v.string(),
		singularLabel: v.string(),
		pluralLabel: v.string(),
		icon: v.string(),
		description: v.optional(v.string()),
		isSystem: v.optional(v.boolean()),
		nativeTable: v.optional(v.string()),
	})
	.handler(async (ctx, args) => {
		const orgId = ctx.viewer.orgId;
		if (!orgId) {
			throw new ConvexError("Org context required for CRM operations");
		}
		const now = Date.now();

		// Validate name uniqueness per org
		const existing = await ctx.db
			.query("objectDefs")
			.withIndex("by_org_name", (q) =>
				q.eq("orgId", orgId).eq("name", args.name)
			)
			.first();
		if (existing) {
			throw new ConvexError(
				`Object "${args.name}" already exists in this organization`
			);
		}

		// Count existing objects for displayOrder
		const existingObjects = await ctx.db
			.query("objectDefs")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.collect();
		const displayOrder = existingObjects.length;

		const objectDefId = await ctx.db.insert("objectDefs", {
			orgId,
			name: args.name,
			singularLabel: args.singularLabel,
			pluralLabel: args.pluralLabel,
			icon: args.icon,
			description: args.description,
			isSystem: args.isSystem ?? false,
			nativeTable: args.nativeTable,
			isActive: true,
			displayOrder,
			createdAt: now,
			updatedAt: now,
			createdBy: ctx.viewer.authId,
		});

		// Auto-create default table view (REQ-168)
		await ctx.db.insert("viewDefs", {
			orgId,
			objectDefId,
			name: `All ${args.pluralLabel}`,
			viewType: "table",
			isDefault: true,
			needsRepair: false,
			createdAt: now,
			updatedAt: now,
			createdBy: ctx.viewer.authId,
		});

		// Audit
		await auditLog.log(ctx, {
			action: "crm.object.created",
			actorId: ctx.viewer.authId,
			resourceType: "objectDefs",
			resourceId: objectDefId,
			severity: "info",
			metadata: { name: args.name, orgId },
		});

		return objectDefId;
	})
	.public();

// ── updateObject ────────────────────────────────────────────────────
export const updateObject = crmAdminMutation
	.input({
		objectDefId: v.id("objectDefs"),
		name: v.optional(v.string()),
		singularLabel: v.optional(v.string()),
		pluralLabel: v.optional(v.string()),
		icon: v.optional(v.string()),
		description: v.optional(v.string()),
	})
	.handler(async (ctx, args) => {
		const orgId = ctx.viewer.orgId;
		if (!orgId) {
			throw new ConvexError("Org context required for CRM operations");
		}
		const before = await ctx.db.get(args.objectDefId);
		if (!before || before.orgId !== orgId) {
			throw new ConvexError("Object not found or access denied");
		}

		// If name changes, validate uniqueness
		if (args.name && args.name !== before.name) {
			const duplicate = await ctx.db
				.query("objectDefs")
				.withIndex("by_org_name", (q) =>
					q.eq("orgId", orgId).eq("name", args.name as string)
				)
				.first();
			if (duplicate) {
				throw new ConvexError(
					`Object "${args.name}" already exists in this organization`
				);
			}
		}

		const patch: Record<string, string | number> = { updatedAt: Date.now() };
		if (args.name !== undefined) {
			patch.name = args.name;
		}
		if (args.singularLabel !== undefined) {
			patch.singularLabel = args.singularLabel;
		}
		if (args.pluralLabel !== undefined) {
			patch.pluralLabel = args.pluralLabel;
		}
		if (args.icon !== undefined) {
			patch.icon = args.icon;
		}
		if (args.description !== undefined) {
			patch.description = args.description;
		}

		await ctx.db.patch(args.objectDefId, patch);
		const after = await ctx.db.get(args.objectDefId);

		// Audit with diff
		await auditLog.logChange(ctx, {
			action: "crm.object.updated",
			actorId: ctx.viewer.authId,
			resourceType: "objectDefs",
			resourceId: args.objectDefId,
			before,
			after,
			generateDiff: true,
			severity: "info",
		});
	})
	.public();

// ── deactivateObject ────────────────────────────────────────────────
// Soft-delete: sets isActive=false on the objectDef and marks all associated
// viewDefs as needsRepair=true (viewDefs have no isActive field).
export const deactivateObject = crmAdminMutation
	.input({ objectDefId: v.id("objectDefs") })
	.handler(async (ctx, args) => {
		const orgId = ctx.viewer.orgId;
		if (!orgId) {
			throw new ConvexError("Org context required for CRM operations");
		}
		const objectDef = await ctx.db.get(args.objectDefId);
		if (!objectDef || objectDef.orgId !== orgId) {
			throw new ConvexError("Object not found or access denied");
		}

		await ctx.db.patch(args.objectDefId, {
			isActive: false,
			updatedAt: Date.now(),
		});

		// Cascade: deactivate all views for this object
		const views = await ctx.db
			.query("viewDefs")
			.withIndex("by_object", (q) => q.eq("objectDefId", args.objectDefId))
			.collect();
		for (const view of views) {
			await ctx.db.patch(view._id, {
				needsRepair: true,
				updatedAt: Date.now(),
			});
		}

		// Audit
		await auditLog.log(ctx, {
			action: "crm.object.deactivated",
			actorId: ctx.viewer.authId,
			resourceType: "objectDefs",
			resourceId: args.objectDefId,
			severity: "warning",
			metadata: { name: objectDef.name, orgId },
		});
	})
	.public();

// ── listObjects ─────────────────────────────────────────────────────
// Query active objectDefs by org, ordered by displayOrder.
export const listObjects = crmAdminQuery
	.handler(async (ctx) => {
		const orgId = ctx.viewer.orgId;
		if (!orgId) {
			throw new ConvexError("Org context required for CRM operations");
		}
		const objects = await ctx.db
			.query("objectDefs")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.collect();
		return objects
			.filter((o) => o.isActive)
			.sort((a, b) => a.displayOrder - b.displayOrder);
	})
	.public();

// ── getObject ───────────────────────────────────────────────────────
// Single fetch with org verification.
export const getObject = crmAdminQuery
	.input({ objectDefId: v.id("objectDefs") })
	.handler(async (ctx, args) => {
		const orgId = ctx.viewer.orgId;
		if (!orgId) {
			throw new ConvexError("Org context required for CRM operations");
		}
		const objectDef = await ctx.db.get(args.objectDefId);
		if (!objectDef || objectDef.orgId !== orgId) {
			throw new ConvexError("Object not found or access denied");
		}
		return objectDef;
	})
	.public();
