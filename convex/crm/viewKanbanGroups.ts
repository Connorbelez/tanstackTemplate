import { ConvexError, v } from "convex/values";
import { auditLog } from "../auditLog";
import { crmAdminMutation, crmAdminQuery } from "../fluent";

// ── reorderKanbanGroups ──────────────────────────────────────────────
// Update displayOrder from an ordered array of kanban group IDs.
export const reorderKanbanGroups = crmAdminMutation
	.input({
		viewDefId: v.id("viewDefs"),
		groupIds: v.array(v.id("viewKanbanGroups")),
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

		// Verify viewType is kanban
		if (viewDef.viewType !== "kanban") {
			throw new ConvexError(
				"Kanban group reordering is only valid for kanban views"
			);
		}

		// Validate no duplicates
		const uniqueIds = new Set(args.groupIds);
		if (uniqueIds.size !== args.groupIds.length) {
			throw new ConvexError(
				"groupIds contains duplicate entries — provide each group ID exactly once"
			);
		}

		// Load all existing groups for this view
		const existingGroups = await ctx.db
			.query("viewKanbanGroups")
			.withIndex("by_view", (q) => q.eq("viewDefId", args.viewDefId))
			.collect();

		// Validate completeness — all groups must be included to prevent displayOrder collisions
		const existingGroupIds = new Set(existingGroups.map((g) => g._id));
		if (args.groupIds.length !== existingGroups.length) {
			throw new ConvexError(
				`Expected ${existingGroups.length} group IDs but received ${args.groupIds.length} — all groups must be included in reorder`
			);
		}
		for (const id of args.groupIds) {
			if (!existingGroupIds.has(id)) {
				throw new ConvexError(
					`Group ${id} does not belong to view ${args.viewDefId}`
				);
			}
		}

		// Update displayOrder for each group
		for (let i = 0; i < args.groupIds.length; i++) {
			await ctx.db.patch(args.groupIds[i], { displayOrder: i });
		}

		// Audit
		await auditLog.log(ctx, {
			action: "crm.kanbanGroups.reordered",
			actorId: ctx.viewer.authId,
			resourceType: "viewDefs",
			resourceId: args.viewDefId,
			severity: "info",
			metadata: {
				viewDefId: args.viewDefId,
				groupIds: args.groupIds,
				orgId,
			},
		});
	})
	.public();

// ── toggleKanbanGroupCollapse ────────────────────────────────────────
// Toggle the collapsed state of a kanban group.
export const toggleKanbanGroupCollapse = crmAdminMutation
	.input({ groupId: v.id("viewKanbanGroups") })
	.handler(async (ctx, args) => {
		const orgId = ctx.viewer.orgId;
		if (!orgId) {
			throw new ConvexError("Org context required for CRM operations");
		}

		// Load group
		const group = await ctx.db.get(args.groupId);
		if (!group) {
			throw new ConvexError("Kanban group not found");
		}

		// Verify org ownership via parent viewDef
		const viewDef = await ctx.db.get(group.viewDefId);
		if (!viewDef || viewDef.orgId !== orgId) {
			throw new ConvexError("View not found or access denied");
		}

		// Toggle isCollapsed
		await ctx.db.patch(args.groupId, { isCollapsed: !group.isCollapsed });

		// Audit
		await auditLog.log(ctx, {
			action: "crm.kanbanGroup.collapse.toggled",
			actorId: ctx.viewer.authId,
			resourceType: "viewKanbanGroups",
			resourceId: args.groupId,
			severity: "info",
			metadata: {
				viewDefId: group.viewDefId,
				isCollapsed: !group.isCollapsed,
				orgId,
			},
		});
	})
	.public();

// ── listKanbanGroups ─────────────────────────────────────────────────
// List kanban groups for a view, ordered by displayOrder.
export const listKanbanGroups = crmAdminQuery
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

		const groups = await ctx.db
			.query("viewKanbanGroups")
			.withIndex("by_view", (q) => q.eq("viewDefId", args.viewDefId))
			.collect();

		return groups.sort((a, b) => a.displayOrder - b.displayOrder);
	})
	.public();
