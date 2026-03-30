import { ConvexError, v } from "convex/values";
import { auditLog } from "../auditLog";
import { crmAdminMutation, crmAdminQuery } from "../fluent";

// ── setViewFieldVisibility ───────────────────────────────────────────
// Toggle a field's visibility in a view. Creates the viewField if it doesn't exist.
export const setViewFieldVisibility = crmAdminMutation
	.input({
		viewDefId: v.id("viewDefs"),
		fieldDefId: v.id("fieldDefs"),
		isVisible: v.boolean(),
	})
	.handler(async (ctx, args) => {
		const orgId = ctx.viewer.orgId;
		if (!orgId) {
			throw new ConvexError("Org context required for CRM operations");
		}

		// Verify viewDef exists and belongs to org
		const viewDef = await ctx.db.get(args.viewDefId);
		if (!viewDef || viewDef.orgId !== orgId) {
			throw new ConvexError("View not found or access denied");
		}

		// Verify fieldDef exists and belongs to the same object as the view
		const fieldDef = await ctx.db.get(args.fieldDefId);
		if (!fieldDef) {
			throw new ConvexError("Field not found");
		}
		if (fieldDef.objectDefId !== viewDef.objectDefId) {
			throw new ConvexError("Field does not belong to the view's object");
		}

		// Find existing viewField
		const existing = await ctx.db
			.query("viewFields")
			.withIndex("by_view", (q) => q.eq("viewDefId", args.viewDefId))
			.filter((q) => q.eq(q.field("fieldDefId"), args.fieldDefId))
			.first();

		if (existing) {
			// Patch visibility
			await ctx.db.patch(existing._id, { isVisible: args.isVisible });

			await auditLog.log(ctx, {
				action: "crm.viewField.visibility.updated",
				actorId: ctx.viewer.authId,
				resourceType: "viewFields",
				resourceId: existing._id,
				severity: "info",
				metadata: {
					viewDefId: args.viewDefId,
					fieldDefId: args.fieldDefId,
					isVisible: args.isVisible,
					orgId,
				},
			});

			return existing._id;
		}

		// Not found — insert new viewField at the end
		const allViewFields = await ctx.db
			.query("viewFields")
			.withIndex("by_view", (q) => q.eq("viewDefId", args.viewDefId))
			.collect();
		const displayOrder = allViewFields.length;

		const viewFieldId = await ctx.db.insert("viewFields", {
			viewDefId: args.viewDefId,
			fieldDefId: args.fieldDefId,
			isVisible: args.isVisible,
			displayOrder,
		});

		await auditLog.log(ctx, {
			action: "crm.viewField.created",
			actorId: ctx.viewer.authId,
			resourceType: "viewFields",
			resourceId: viewFieldId,
			severity: "info",
			metadata: {
				viewDefId: args.viewDefId,
				fieldDefId: args.fieldDefId,
				isVisible: args.isVisible,
				orgId,
			},
		});

		return viewFieldId;
	})
	.public();

// ── reorderViewFields ────────────────────────────────────────────────
// Update displayOrder from an ordered array of fieldDefIds.
export const reorderViewFields = crmAdminMutation
	.input({
		viewDefId: v.id("viewDefs"),
		fieldIds: v.array(v.id("fieldDefs")),
	})
	.handler(async (ctx, args) => {
		const orgId = ctx.viewer.orgId;
		if (!orgId) {
			throw new ConvexError("Org context required for CRM operations");
		}

		// Verify viewDef exists and belongs to org
		const viewDef = await ctx.db.get(args.viewDefId);
		if (!viewDef || viewDef.orgId !== orgId) {
			throw new ConvexError("View not found or access denied");
		}

		// Validate no duplicates
		const uniqueIds = new Set(args.fieldIds);
		if (uniqueIds.size !== args.fieldIds.length) {
			throw new ConvexError(
				"fieldIds contains duplicate entries — provide each field ID exactly once"
			);
		}

		// Load all viewFields for this view
		const viewFields = await ctx.db
			.query("viewFields")
			.withIndex("by_view", (q) => q.eq("viewDefId", args.viewDefId))
			.collect();

		// Validate completeness — all view fields must be included to prevent displayOrder collisions
		if (args.fieldIds.length !== viewFields.length) {
			throw new ConvexError(
				`Expected ${viewFields.length} field IDs but received ${args.fieldIds.length} — all view fields must be included in reorder`
			);
		}

		// Build a lookup from fieldDefId to viewField
		const fieldToViewField = new Map(
			viewFields.map((vf) => [vf.fieldDefId, vf])
		);

		// Validate all fieldIds map to existing viewFields (no unknown IDs)
		for (const fieldId of args.fieldIds) {
			if (!fieldToViewField.has(fieldId)) {
				throw new ConvexError(
					`Field ${fieldId} does not have a viewField entry in view ${args.viewDefId}`
				);
			}
		}

		// Update displayOrder for each fieldId in the provided order
		// Safety: validated above that every fieldId maps to a viewField
		for (let i = 0; i < args.fieldIds.length; i++) {
			const vf = fieldToViewField.get(args.fieldIds[i]);
			if (vf) {
				await ctx.db.patch(vf._id, { displayOrder: i });
			}
		}

		// Audit
		await auditLog.log(ctx, {
			action: "crm.viewFields.reordered",
			actorId: ctx.viewer.authId,
			resourceType: "viewDefs",
			resourceId: args.viewDefId,
			severity: "info",
			metadata: {
				viewDefId: args.viewDefId,
				fieldIds: args.fieldIds,
				orgId,
			},
		});
	})
	.public();

// ── setViewFieldWidth ────────────────────────────────────────────────
// Set the column width for a field in a view.
export const setViewFieldWidth = crmAdminMutation
	.input({
		viewDefId: v.id("viewDefs"),
		fieldDefId: v.id("fieldDefs"),
		width: v.number(), // positive integer pixel width
	})
	.handler(async (ctx, args) => {
		const orgId = ctx.viewer.orgId;
		if (!orgId) {
			throw new ConvexError("Org context required for CRM operations");
		}

		// Verify viewDef exists and belongs to org
		const viewDef = await ctx.db.get(args.viewDefId);
		if (!viewDef || viewDef.orgId !== orgId) {
			throw new ConvexError("View not found or access denied");
		}

		// Validate width is positive
		if (args.width <= 0) {
			throw new ConvexError("Column width must be a positive number");
		}

		// Find viewField
		const viewField = await ctx.db
			.query("viewFields")
			.withIndex("by_view", (q) => q.eq("viewDefId", args.viewDefId))
			.filter((q) => q.eq(q.field("fieldDefId"), args.fieldDefId))
			.first();

		if (!viewField) {
			throw new ConvexError(
				"View field not found for this view and field combination"
			);
		}

		await ctx.db.patch(viewField._id, { width: args.width });

		// Audit
		await auditLog.log(ctx, {
			action: "crm.viewField.width.updated",
			actorId: ctx.viewer.authId,
			resourceType: "viewFields",
			resourceId: viewField._id,
			severity: "info",
			metadata: {
				viewDefId: args.viewDefId,
				fieldDefId: args.fieldDefId,
				width: args.width,
				orgId,
			},
		});
	})
	.public();

// ── listViewFields ───────────────────────────────────────────────────
// List viewFields for a view, ordered by displayOrder.
export const listViewFields = crmAdminQuery
	.input({ viewDefId: v.id("viewDefs") })
	.handler(async (ctx, args) => {
		const orgId = ctx.viewer.orgId;
		if (!orgId) {
			throw new ConvexError("Org context required for CRM operations");
		}

		// Verify viewDef exists and belongs to org
		const viewDef = await ctx.db.get(args.viewDefId);
		if (!viewDef || viewDef.orgId !== orgId) {
			throw new ConvexError("View not found or access denied");
		}

		const viewFields = await ctx.db
			.query("viewFields")
			.withIndex("by_view", (q) => q.eq("viewDefId", args.viewDefId))
			.collect();

		return viewFields.sort((a, b) => a.displayOrder - b.displayOrder);
	})
	.public();
