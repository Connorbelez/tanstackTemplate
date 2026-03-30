import { ConvexError, v } from "convex/values";
import { auditLog } from "../auditLog";
import { crmAdminMutation, crmAdminQuery } from "../fluent";
import { viewTypeValidator } from "./validators";

// ── createView ───────────────────────────────────────────────────────
// Creates a viewDef + auto-populates viewFields from active fieldDefs
// + auto-creates kanban groups for kanban views.
export const createView = crmAdminMutation
	.input({
		objectDefId: v.id("objectDefs"),
		name: v.string(),
		viewType: viewTypeValidator,
		boundFieldId: v.optional(v.id("fieldDefs")),
	})
	.handler(async (ctx, args) => {
		const orgId = ctx.viewer.orgId;
		if (!orgId) {
			throw new ConvexError("Org context required for CRM operations");
		}
		const now = Date.now();

		// Verify objectDef exists and belongs to org
		const objectDef = await ctx.db.get(args.objectDefId);
		if (!objectDef || objectDef.orgId !== orgId) {
			throw new ConvexError("Object not found or access denied");
		}

		// Capability validation for kanban
		if (args.viewType === "kanban") {
			if (!args.boundFieldId) {
				throw new ConvexError(
					"Kanban views require a boundFieldId (select or multi_select field)"
				);
			}
			const cap = await ctx.db
				.query("fieldCapabilities")
				.withIndex("by_object_capability", (q) =>
					q
						.eq("objectDefId", args.objectDefId)
						.eq("capability", "kanban")
				)
				.filter((q) => q.eq(q.field("fieldDefId"), args.boundFieldId))
				.first();
			if (!cap) {
				throw new ConvexError(
					"Bound field does not have kanban capability"
				);
			}
		}

		// Capability validation for calendar
		if (args.viewType === "calendar") {
			if (!args.boundFieldId) {
				throw new ConvexError(
					"Calendar views require a boundFieldId (date or datetime field)"
				);
			}
			const cap = await ctx.db
				.query("fieldCapabilities")
				.withIndex("by_object_capability", (q) =>
					q
						.eq("objectDefId", args.objectDefId)
						.eq("capability", "calendar")
				)
				.filter((q) => q.eq(q.field("fieldDefId"), args.boundFieldId))
				.first();
			if (!cap) {
				throw new ConvexError(
					"Bound field does not have calendar capability"
				);
			}
		}

		// Insert viewDef
		const viewDefId = await ctx.db.insert("viewDefs", {
			orgId,
			objectDefId: args.objectDefId,
			name: args.name,
			viewType: args.viewType,
			boundFieldId: args.boundFieldId,
			isDefault: false,
			needsRepair: false,
			createdAt: now,
			updatedAt: now,
			createdBy: ctx.viewer.authId,
		});

		// Auto-populate viewFields from all active fieldDefs
		const activeFields = await ctx.db
			.query("fieldDefs")
			.withIndex("by_object", (q) =>
				q.eq("objectDefId", args.objectDefId)
			)
			.collect();
		const sortedActiveFields = activeFields
			.filter((f) => f.isActive)
			.sort((a, b) => a.displayOrder - b.displayOrder);

		for (let i = 0; i < sortedActiveFields.length; i++) {
			await ctx.db.insert("viewFields", {
				viewDefId,
				fieldDefId: sortedActiveFields[i]._id,
				isVisible: true,
				displayOrder: i,
			});
		}

		// Kanban group auto-creation
		if (args.viewType === "kanban" && args.boundFieldId) {
			const fieldDef = await ctx.db.get(args.boundFieldId);
			const options = fieldDef?.options ?? [];
			for (let i = 0; i < options.length; i++) {
				await ctx.db.insert("viewKanbanGroups", {
					viewDefId,
					fieldDefId: args.boundFieldId,
					optionValue: options[i].value,
					displayOrder: i,
					isCollapsed: false,
				});
			}
			// "No Value" group always last
			await ctx.db.insert("viewKanbanGroups", {
				viewDefId,
				fieldDefId: args.boundFieldId,
				optionValue: "__no_value__",
				displayOrder: options.length,
				isCollapsed: false,
			});
		}

		// Audit
		await auditLog.log(ctx, {
			action: "crm.view.created",
			actorId: ctx.viewer.authId,
			resourceType: "viewDefs",
			resourceId: viewDefId,
			severity: "info",
			metadata: {
				name: args.name,
				viewType: args.viewType,
				orgId,
			},
		});

		return viewDefId;
	})
	.public();

// ── updateView ───────────────────────────────────────────────────────
// Rename, rebind field (with capability re-validation and kanban group rebuild).
export const updateView = crmAdminMutation
	.input({
		viewDefId: v.id("viewDefs"),
		name: v.optional(v.string()),
		boundFieldId: v.optional(v.id("fieldDefs")),
	})
	.handler(async (ctx, args) => {
		const orgId = ctx.viewer.orgId;
		if (!orgId) {
			throw new ConvexError("Org context required for CRM operations");
		}

		const before = await ctx.db.get(args.viewDefId);
		if (!before || before.orgId !== orgId) {
			throw new ConvexError("View not found or access denied");
		}

		// If boundFieldId changes and view is kanban/calendar, validate capability
		if (
			args.boundFieldId !== undefined &&
			args.boundFieldId !== before.boundFieldId
		) {
			if (before.viewType === "kanban") {
				const cap = await ctx.db
					.query("fieldCapabilities")
					.withIndex("by_object_capability", (q) =>
						q
							.eq("objectDefId", before.objectDefId)
							.eq("capability", "kanban")
					)
					.filter((q) =>
						q.eq(q.field("fieldDefId"), args.boundFieldId)
					)
					.first();
				if (!cap) {
					throw new ConvexError(
						"Bound field does not have kanban capability"
					);
				}

				// Delete old kanban groups
				const oldGroups = await ctx.db
					.query("viewKanbanGroups")
					.withIndex("by_view", (q) =>
						q.eq("viewDefId", args.viewDefId)
					)
					.collect();
				for (const group of oldGroups) {
					await ctx.db.delete(group._id);
				}

				// Create new kanban groups from new field's options
				const fieldDef = await ctx.db.get(args.boundFieldId);
				const options = fieldDef?.options ?? [];
				for (let i = 0; i < options.length; i++) {
					await ctx.db.insert("viewKanbanGroups", {
						viewDefId: args.viewDefId,
						fieldDefId: args.boundFieldId,
						optionValue: options[i].value,
						displayOrder: i,
						isCollapsed: false,
					});
				}
				// "No Value" group always last
				await ctx.db.insert("viewKanbanGroups", {
					viewDefId: args.viewDefId,
					fieldDefId: args.boundFieldId,
					optionValue: "__no_value__",
					displayOrder: options.length,
					isCollapsed: false,
				});
			}

			if (before.viewType === "calendar") {
				const cap = await ctx.db
					.query("fieldCapabilities")
					.withIndex("by_object_capability", (q) =>
						q
							.eq("objectDefId", before.objectDefId)
							.eq("capability", "calendar")
					)
					.filter((q) =>
						q.eq(q.field("fieldDefId"), args.boundFieldId)
					)
					.first();
				if (!cap) {
					throw new ConvexError(
						"Bound field does not have calendar capability"
					);
				}
			}
		}

		// Build patch
		const patch: Record<string, string | number> = {
			updatedAt: Date.now(),
		};
		if (args.name !== undefined) {
			patch.name = args.name;
		}
		if (args.boundFieldId !== undefined) {
			patch.boundFieldId = args.boundFieldId;
		}

		await ctx.db.patch(args.viewDefId, patch);
		const after = await ctx.db.get(args.viewDefId);

		// Audit with diff
		await auditLog.logChange(ctx, {
			action: "crm.view.updated",
			actorId: ctx.viewer.authId,
			resourceType: "viewDefs",
			resourceId: args.viewDefId,
			before,
			after,
			generateDiff: true,
			severity: "info",
		});
	})
	.public();

// ── deleteView ───────────────────────────────────────────────────────
// Hard delete with default view protection, cascade delete children.
export const deleteView = crmAdminMutation
	.input({ viewDefId: v.id("viewDefs") })
	.handler(async (ctx, args) => {
		const orgId = ctx.viewer.orgId;
		if (!orgId) {
			throw new ConvexError("Org context required for CRM operations");
		}

		const viewDef = await ctx.db.get(args.viewDefId);
		if (!viewDef || viewDef.orgId !== orgId) {
			throw new ConvexError("View not found or access denied");
		}

		// Prevent deletion of default view
		if (viewDef.isDefault) {
			throw new ConvexError("Cannot delete the default view");
		}

		// Cascade delete viewFields
		const viewFields = await ctx.db
			.query("viewFields")
			.withIndex("by_view", (q) => q.eq("viewDefId", args.viewDefId))
			.collect();
		for (const vf of viewFields) {
			await ctx.db.delete(vf._id);
		}

		// Cascade delete viewFilters
		const viewFilters = await ctx.db
			.query("viewFilters")
			.withIndex("by_view", (q) => q.eq("viewDefId", args.viewDefId))
			.collect();
		for (const vf of viewFilters) {
			await ctx.db.delete(vf._id);
		}

		// Cascade delete viewKanbanGroups
		const viewKanbanGroups = await ctx.db
			.query("viewKanbanGroups")
			.withIndex("by_view", (q) => q.eq("viewDefId", args.viewDefId))
			.collect();
		for (const vkg of viewKanbanGroups) {
			await ctx.db.delete(vkg._id);
		}

		// Delete the viewDef itself
		await ctx.db.delete(args.viewDefId);

		// Audit
		await auditLog.log(ctx, {
			action: "crm.view.deleted",
			actorId: ctx.viewer.authId,
			resourceType: "viewDefs",
			resourceId: args.viewDefId,
			severity: "warning",
			metadata: {
				name: viewDef.name,
				viewType: viewDef.viewType,
				orgId,
			},
		});
	})
	.public();

// ── duplicateView ────────────────────────────────────────────────────
// Clone viewDef + all viewFields + viewFilters + viewKanbanGroups.
export const duplicateView = crmAdminMutation
	.input({
		viewDefId: v.id("viewDefs"),
		newName: v.string(),
	})
	.handler(async (ctx, args) => {
		const orgId = ctx.viewer.orgId;
		if (!orgId) {
			throw new ConvexError("Org context required for CRM operations");
		}
		const now = Date.now();

		// Verify source viewDef exists and belongs to org
		const source = await ctx.db.get(args.viewDefId);
		if (!source || source.orgId !== orgId) {
			throw new ConvexError("View not found or access denied");
		}

		// Insert new viewDef (always non-default)
		const newViewDefId = await ctx.db.insert("viewDefs", {
			orgId,
			objectDefId: source.objectDefId,
			name: args.newName,
			viewType: source.viewType,
			boundFieldId: source.boundFieldId,
			isDefault: false,
			needsRepair: source.needsRepair,
			createdAt: now,
			updatedAt: now,
			createdBy: ctx.viewer.authId,
		});

		// Clone viewFields
		const viewFields = await ctx.db
			.query("viewFields")
			.withIndex("by_view", (q) => q.eq("viewDefId", args.viewDefId))
			.collect();
		for (const vf of viewFields) {
			await ctx.db.insert("viewFields", {
				viewDefId: newViewDefId,
				fieldDefId: vf.fieldDefId,
				isVisible: vf.isVisible,
				displayOrder: vf.displayOrder,
				width: vf.width,
			});
		}

		// Clone viewFilters
		const viewFilters = await ctx.db
			.query("viewFilters")
			.withIndex("by_view", (q) => q.eq("viewDefId", args.viewDefId))
			.collect();
		for (const vf of viewFilters) {
			await ctx.db.insert("viewFilters", {
				viewDefId: newViewDefId,
				fieldDefId: vf.fieldDefId,
				operator: vf.operator,
				value: vf.value,
				logicalOperator: vf.logicalOperator,
			});
		}

		// Clone viewKanbanGroups
		const viewKanbanGroups = await ctx.db
			.query("viewKanbanGroups")
			.withIndex("by_view", (q) => q.eq("viewDefId", args.viewDefId))
			.collect();
		for (const vkg of viewKanbanGroups) {
			await ctx.db.insert("viewKanbanGroups", {
				viewDefId: newViewDefId,
				fieldDefId: vkg.fieldDefId,
				optionValue: vkg.optionValue,
				displayOrder: vkg.displayOrder,
				isCollapsed: vkg.isCollapsed,
			});
		}

		// Audit
		await auditLog.log(ctx, {
			action: "crm.view.duplicated",
			actorId: ctx.viewer.authId,
			resourceType: "viewDefs",
			resourceId: newViewDefId,
			severity: "info",
			metadata: {
				sourceViewDefId: args.viewDefId,
				newName: args.newName,
				orgId,
			},
		});

		return newViewDefId;
	})
	.public();

// ── listViews ────────────────────────────────────────────────────────
// List viewDefs by objectDefId, default view first.
export const listViews = crmAdminQuery
	.input({ objectDefId: v.id("objectDefs") })
	.handler(async (ctx, args) => {
		const orgId = ctx.viewer.orgId;
		if (!orgId) {
			throw new ConvexError("Org context required for CRM operations");
		}

		// Verify objectDef belongs to org
		const objectDef = await ctx.db.get(args.objectDefId);
		if (!objectDef || objectDef.orgId !== orgId) {
			throw new ConvexError("Object not found or access denied");
		}

		const views = await ctx.db
			.query("viewDefs")
			.withIndex("by_object", (q) =>
				q.eq("objectDefId", args.objectDefId)
			)
			.collect();

		// Sort: default view first, then by createdAt
		return views.sort((a, b) => {
			if (a.isDefault && !b.isDefault) return -1;
			if (!a.isDefault && b.isDefault) return 1;
			return a.createdAt - b.createdAt;
		});
	})
	.public();

// ── getView ──────────────────────────────────────────────────────────
// Single fetch with org verification.
export const getView = crmAdminQuery
	.input({ viewDefId: v.id("viewDefs") })
	.handler(async (ctx, args) => {
		const orgId = ctx.viewer.orgId;
		if (!orgId) {
			throw new ConvexError("Org context required for CRM operations");
		}

		const viewDef = await ctx.db.get(args.viewDefId);
		if (!viewDef || viewDef.orgId !== orgId) {
			throw new ConvexError("View not found or access denied");
		}

		return viewDef;
	})
	.public();
