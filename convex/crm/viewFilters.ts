import { ConvexError, v } from "convex/values";
import { auditLog } from "../auditLog";
import { crmAdminMutation, crmAdminQuery } from "../fluent";
import { isValidOperatorForFieldType } from "./filterOperatorValidation";
import { filterOperatorValidator, logicalOperatorValidator } from "./validators";

// ── addViewFilter ────────────────────────────────────────────────────
// Add a filter to a view with operator-type validation.
export const addViewFilter = crmAdminMutation
	.input({
		viewDefId: v.id("viewDefs"),
		fieldDefId: v.id("fieldDefs"),
		operator: filterOperatorValidator,
		value: v.optional(v.string()),
		logicalOperator: v.optional(logicalOperatorValidator),
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

		// Verify fieldDef exists
		const fieldDef = await ctx.db.get(args.fieldDefId);
		if (!fieldDef) {
			throw new ConvexError("Field not found");
		}

		// Verify fieldDef belongs to the same object as the view
		if (fieldDef.objectDefId !== viewDef.objectDefId) {
			throw new ConvexError("Field does not belong to the view's object");
		}

		// Validate operator against field type
		if (!isValidOperatorForFieldType(args.operator, fieldDef.fieldType)) {
			throw new ConvexError(
				`Operator "${args.operator}" is not valid for field type "${fieldDef.fieldType}"`
			);
		}

		// Insert viewFilter
		const viewFilterId = await ctx.db.insert("viewFilters", {
			viewDefId: args.viewDefId,
			fieldDefId: args.fieldDefId,
			operator: args.operator,
			value: args.value,
			logicalOperator: args.logicalOperator,
		});

		// Audit
		await auditLog.log(ctx, {
			action: "crm.viewFilter.created",
			actorId: ctx.viewer.authId,
			resourceType: "viewFilters",
			resourceId: viewFilterId,
			severity: "info",
			metadata: {
				viewDefId: args.viewDefId,
				fieldDefId: args.fieldDefId,
				operator: args.operator,
				orgId,
			},
		});

		return viewFilterId;
	})
	.public();

// ── updateViewFilter ─────────────────────────────────────────────────
// Update a filter's operator, value, or logical operator with validation.
export const updateViewFilter = crmAdminMutation
	.input({
		filterId: v.id("viewFilters"),
		operator: v.optional(filterOperatorValidator),
		value: v.optional(v.string()),
		logicalOperator: v.optional(logicalOperatorValidator),
	})
	.handler(async (ctx, args) => {
		const orgId = ctx.viewer.orgId;
		if (!orgId) {
			throw new ConvexError("Org context required for CRM operations");
		}

		// Load filter
		const before = await ctx.db.get(args.filterId);
		if (!before) {
			throw new ConvexError("Filter not found");
		}

		// Verify org ownership via parent viewDef
		const viewDef = await ctx.db.get(before.viewDefId);
		if (!viewDef || viewDef.orgId !== orgId) {
			throw new ConvexError("View not found or access denied");
		}

		// If operator changes, validate against field type
		if (args.operator !== undefined && args.operator !== before.operator) {
			const fieldDef = await ctx.db.get(before.fieldDefId);
			if (!fieldDef) {
				throw new ConvexError("Field not found");
			}
			if (!isValidOperatorForFieldType(args.operator, fieldDef.fieldType)) {
				throw new ConvexError(
					`Operator "${args.operator}" is not valid for field type "${fieldDef.fieldType}"`
				);
			}
		}

		// Build patch
		const patch: Record<string, string> = {};
		if (args.operator !== undefined) {
			patch.operator = args.operator;
		}
		if (args.value !== undefined) {
			patch.value = args.value;
		}
		if (args.logicalOperator !== undefined) {
			patch.logicalOperator = args.logicalOperator;
		}

		await ctx.db.patch(args.filterId, patch);
		const after = await ctx.db.get(args.filterId);

		// Audit with diff
		await auditLog.logChange(ctx, {
			action: "crm.viewFilter.updated",
			actorId: ctx.viewer.authId,
			resourceType: "viewFilters",
			resourceId: args.filterId,
			before,
			after,
			generateDiff: true,
			severity: "info",
		});
	})
	.public();

// ── removeViewFilter ─────────────────────────────────────────────────
// Hard delete a filter with org verification.
export const removeViewFilter = crmAdminMutation
	.input({ filterId: v.id("viewFilters") })
	.handler(async (ctx, args) => {
		const orgId = ctx.viewer.orgId;
		if (!orgId) {
			throw new ConvexError("Org context required for CRM operations");
		}

		// Load filter
		const filter = await ctx.db.get(args.filterId);
		if (!filter) {
			throw new ConvexError("Filter not found");
		}

		// Verify org ownership via parent viewDef
		const viewDef = await ctx.db.get(filter.viewDefId);
		if (!viewDef || viewDef.orgId !== orgId) {
			throw new ConvexError("View not found or access denied");
		}

		// Hard delete
		await ctx.db.delete(args.filterId);

		// Audit
		await auditLog.log(ctx, {
			action: "crm.viewFilter.deleted",
			actorId: ctx.viewer.authId,
			resourceType: "viewFilters",
			resourceId: args.filterId,
			severity: "info",
			metadata: {
				viewDefId: filter.viewDefId,
				fieldDefId: filter.fieldDefId,
				operator: filter.operator,
				orgId,
			},
		});
	})
	.public();

// ── listViewFilters ──────────────────────────────────────────────────
// List all filters for a view.
export const listViewFilters = crmAdminQuery
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

		return await ctx.db
			.query("viewFilters")
			.withIndex("by_view", (q) => q.eq("viewDefId", args.viewDefId))
			.collect();
	})
	.public();
