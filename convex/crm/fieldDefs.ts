import { ConvexError, v } from "convex/values";
import { auditLog } from "../auditLog";
import { crmAdminMutation, crmAdminQuery } from "../fluent";
import {
	deriveCapabilities,
	deriveFieldContractMetadata,
} from "./metadataCompiler";
import {
	computedFieldMetadataValidator,
	fieldTypeValidator,
	relationMetadataValidator,
	selectOptionValidator,
} from "./validators";

// ── createField ─────────────────────────────────────────────────────
// Creates fieldDef + runs capability compiler + adds to default view.
export const createField = crmAdminMutation
	.input({
		objectDefId: v.id("objectDefs"),
		name: v.string(),
		label: v.string(),
		fieldType: fieldTypeValidator,
		description: v.optional(v.string()),
		isRequired: v.optional(v.boolean()),
		isUnique: v.optional(v.boolean()),
		defaultValue: v.optional(v.string()),
		options: v.optional(v.array(selectOptionValidator)),
		relation: v.optional(relationMetadataValidator),
		computed: v.optional(computedFieldMetadataValidator),
		isVisibleByDefault: v.optional(v.boolean()),
		nativeColumnPath: v.optional(v.string()),
		nativeReadOnly: v.optional(v.boolean()),
	})
	.handler(async (ctx, args) => {
		const orgId = ctx.viewer.orgId;
		if (!orgId) {
			throw new ConvexError("Org context required for CRM operations");
		}
		const now = Date.now();
		if (args.relation && args.computed) {
			throw new ConvexError(
				"Field definitions cannot be both relation-backed and computed"
			);
		}

		// Verify objectDef exists and belongs to org
		const objectDef = await ctx.db.get(args.objectDefId);
		if (!objectDef || objectDef.orgId !== orgId) {
			throw new ConvexError("Object not found or access denied");
		}

		// Validate name uniqueness per object
		const existing = await ctx.db
			.query("fieldDefs")
			.withIndex("by_object_name", (q) =>
				q.eq("objectDefId", args.objectDefId).eq("name", args.name)
			)
			.first();
		if (existing) {
			throw new ConvexError(
				`Field "${args.name}" already exists on object "${objectDef.name}"`
			);
		}

		// Validate select/multi_select have options
		if (
			(args.fieldType === "select" || args.fieldType === "multi_select") &&
			(!args.options || args.options.length === 0)
		) {
			throw new ConvexError(
				`Field type "${args.fieldType}" requires at least one option`
			);
		}

		// Count existing fields for displayOrder
		const existingFields = await ctx.db
			.query("fieldDefs")
			.withIndex("by_object", (q) => q.eq("objectDefId", args.objectDefId))
			.collect();
		const displayOrder = existingFields.length;
		const fieldContract = deriveFieldContractMetadata({
			fieldType: args.fieldType,
			nativeReadOnly: args.nativeReadOnly ?? false,
			relation: args.relation,
			computed: args.computed,
			isVisibleByDefault: args.isVisibleByDefault,
		});

		const fieldDefId = await ctx.db.insert("fieldDefs", {
			orgId,
			objectDefId: args.objectDefId,
			name: args.name,
			label: args.label,
			fieldType: args.fieldType,
			normalizedFieldKind: fieldContract.normalizedFieldKind,
			description: args.description,
			isRequired: args.isRequired ?? false,
			isUnique: args.isUnique ?? false,
			isActive: true,
			displayOrder,
			defaultValue: args.defaultValue,
			options: args.options,
			rendererHint: fieldContract.rendererHint,
			relation: fieldContract.relation,
			computed: fieldContract.computed,
			layoutEligibility: fieldContract.layoutEligibility,
			aggregation: fieldContract.aggregation,
			editability: fieldContract.editability,
			isVisibleByDefault: fieldContract.isVisibleByDefault,
			nativeColumnPath: args.nativeColumnPath,
			nativeReadOnly: args.nativeReadOnly ?? false,
			createdAt: now,
			updatedAt: now,
		});

		// Run capability compiler and insert capabilities
		const capabilities = deriveCapabilities(args.fieldType);
		for (const capability of capabilities) {
			await ctx.db.insert("fieldCapabilities", {
				fieldDefId,
				objectDefId: args.objectDefId,
				capability,
			});
		}

		// Auto-add to default view's viewFields
		const defaultView = await ctx.db
			.query("viewDefs")
			.withIndex("by_object", (q) => q.eq("objectDefId", args.objectDefId))
			.filter((q) => q.eq(q.field("isDefault"), true))
			.first();
		if (defaultView) {
			const existingViewFields = await ctx.db
				.query("viewFields")
				.withIndex("by_view", (q) => q.eq("viewDefId", defaultView._id))
				.collect();
			await ctx.db.insert("viewFields", {
				viewDefId: defaultView._id,
				fieldDefId,
				isVisible: true,
				displayOrder: existingViewFields.length,
			});
		}

		// Audit
		await auditLog.log(ctx, {
			action: "crm.field.created",
			actorId: ctx.viewer.authId,
			resourceType: "fieldDefs",
			resourceId: fieldDefId,
			severity: "info",
			metadata: {
				name: args.name,
				fieldType: args.fieldType,
				objectDefId: args.objectDefId,
				orgId,
			},
		});

		return fieldDefId;
	})
	.public();

// ── updateField ─────────────────────────────────────────────────────
// Rename, change options, toggle required. If fieldType changes, re-derives capabilities.
export const updateField = crmAdminMutation
	.input({
		fieldDefId: v.id("fieldDefs"),
		name: v.optional(v.string()),
		label: v.optional(v.string()),
		fieldType: v.optional(fieldTypeValidator),
		description: v.optional(v.string()),
		isRequired: v.optional(v.boolean()),
		isUnique: v.optional(v.boolean()),
		defaultValue: v.optional(v.string()),
		options: v.optional(v.array(selectOptionValidator)),
		relation: v.optional(relationMetadataValidator),
		computed: v.optional(computedFieldMetadataValidator),
		isVisibleByDefault: v.optional(v.boolean()),
	})
	.handler(async (ctx, args) => {
		const orgId = ctx.viewer.orgId;
		if (!orgId) {
			throw new ConvexError("Org context required for CRM operations");
		}

		const before = await ctx.db.get(args.fieldDefId);
		if (!before) {
			throw new ConvexError("Field not found");
		}

		// Verify org ownership via objectDef
		const objectDef = await ctx.db.get(before.objectDefId);
		if (!objectDef || objectDef.orgId !== orgId) {
			throw new ConvexError("Field not found or access denied");
		}
		const effectiveRelation =
			args.relation !== undefined ? args.relation : before.relation;
		const effectiveComputed =
			args.computed !== undefined ? args.computed : before.computed;
		if (effectiveRelation && effectiveComputed) {
			throw new ConvexError(
				"Field definitions cannot be both relation-backed and computed"
			);
		}

		// Validate name uniqueness per object when renaming
		if (args.name !== undefined && args.name !== before.name) {
			const duplicate = await ctx.db
				.query("fieldDefs")
				.withIndex("by_object_name", (q) =>
					q
						.eq("objectDefId", before.objectDefId)
						.eq("name", args.name as string)
				)
				.first();
			if (duplicate) {
				throw new ConvexError(
					`Field "${args.name}" already exists on object "${objectDef.name}"`
				);
			}
		}

		// Validate select/multi_select have options (using effective type and options)
		const effectiveType = args.fieldType ?? before.fieldType;
		const effectiveOptions = args.options ?? before.options;
		if (
			(effectiveType === "select" || effectiveType === "multi_select") &&
			(!effectiveOptions || effectiveOptions.length === 0)
		) {
			throw new ConvexError(
				`Field type "${effectiveType}" requires at least one option`
			);
		}
		const effectiveFieldContract = deriveFieldContractMetadata({
			fieldType: effectiveType,
			nativeReadOnly: before.nativeReadOnly,
			relation: effectiveRelation,
			computed: effectiveComputed,
			isVisibleByDefault:
				args.isVisibleByDefault !== undefined
					? args.isVisibleByDefault
					: before.isVisibleByDefault,
		});

		// Build patch
		const patch: Record<string, unknown> = { updatedAt: Date.now() };
		if (args.name !== undefined) {
			patch.name = args.name;
		}
		if (args.label !== undefined) {
			patch.label = args.label;
		}
		if (args.fieldType !== undefined) {
			patch.fieldType = args.fieldType;
		}
		if (args.description !== undefined) {
			patch.description = args.description;
		}
		if (args.isRequired !== undefined) {
			patch.isRequired = args.isRequired;
		}
		if (args.isUnique !== undefined) {
			patch.isUnique = args.isUnique;
		}
		if (args.defaultValue !== undefined) {
			patch.defaultValue = args.defaultValue;
		}
		if (args.options !== undefined) {
			patch.options = args.options;
		}
		if (args.relation !== undefined) {
			patch.relation = args.relation;
		}
		if (args.computed !== undefined) {
			patch.computed = args.computed;
		}
		patch.isVisibleByDefault = effectiveFieldContract.isVisibleByDefault;
		patch.normalizedFieldKind = effectiveFieldContract.normalizedFieldKind;
		patch.rendererHint = effectiveFieldContract.rendererHint;
		patch.layoutEligibility = effectiveFieldContract.layoutEligibility;
		patch.aggregation = effectiveFieldContract.aggregation;
		patch.editability = effectiveFieldContract.editability;
		patch.isVisibleByDefault = effectiveFieldContract.isVisibleByDefault;

		await ctx.db.patch(args.fieldDefId, patch);

		// If fieldType changes, delete old capabilities and re-run compiler
		if (args.fieldType !== undefined && args.fieldType !== before.fieldType) {
			const oldCaps = await ctx.db
				.query("fieldCapabilities")
				.withIndex("by_field", (q) => q.eq("fieldDefId", args.fieldDefId))
				.collect();
			for (const cap of oldCaps) {
				await ctx.db.delete(cap._id);
			}

			const newCaps = deriveCapabilities(args.fieldType);
			for (const capability of newCaps) {
				await ctx.db.insert("fieldCapabilities", {
					fieldDefId: args.fieldDefId,
					objectDefId: before.objectDefId,
					capability,
				});
			}

			// Flag views that use this field as boundFieldId as needing repair
			// (field type change may invalidate kanban/group_by configurations)
			const views = await ctx.db
				.query("viewDefs")
				.withIndex("by_object", (q) => q.eq("objectDefId", before.objectDefId))
				.collect();
			for (const view of views) {
				if (view.boundFieldId === args.fieldDefId) {
					await ctx.db.patch(view._id, {
						needsRepair: true,
						updatedAt: Date.now(),
					});
				}
			}
		}

		const after = await ctx.db.get(args.fieldDefId);

		// Audit with diff
		await auditLog.logChange(ctx, {
			action: "crm.field.updated",
			actorId: ctx.viewer.authId,
			resourceType: "fieldDefs",
			resourceId: args.fieldDefId,
			before,
			after,
			generateDiff: true,
			severity: "info",
		});
	})
	.public();

// ── deactivateField ─────────────────────────────────────────────────
// Soft-delete + view integrity check (REQ-163).
export const deactivateField = crmAdminMutation
	.input({ fieldDefId: v.id("fieldDefs") })
	.handler(async (ctx, args) => {
		const orgId = ctx.viewer.orgId;
		if (!orgId) {
			throw new ConvexError("Org context required for CRM operations");
		}

		const fieldDef = await ctx.db.get(args.fieldDefId);
		if (!fieldDef) {
			throw new ConvexError("Field not found");
		}

		// Verify org ownership via objectDef
		const objectDef = await ctx.db.get(fieldDef.objectDefId);
		if (!objectDef || objectDef.orgId !== orgId) {
			throw new ConvexError("Field not found or access denied");
		}

		// Set isActive=false
		await ctx.db.patch(args.fieldDefId, {
			isActive: false,
			updatedAt: Date.now(),
		});

		// Find all viewDefs where boundFieldId === fieldDefId → set needsRepair=true
		const views = await ctx.db
			.query("viewDefs")
			.withIndex("by_object", (q) => q.eq("objectDefId", fieldDef.objectDefId))
			.collect();
		for (const view of views) {
			if (view.boundFieldId === args.fieldDefId) {
				await ctx.db.patch(view._id, {
					needsRepair: true,
					updatedAt: Date.now(),
				});
			}
		}

		// Remove from viewFields, viewFilters, and viewKanbanGroups
		// Note: viewFilters and viewKanbanGroups only have a by_view index (no by_field),
		// so we iterate per-view and filter by fieldDefId.
		for (const view of views) {
			const viewFields = await ctx.db
				.query("viewFields")
				.withIndex("by_view", (q) => q.eq("viewDefId", view._id))
				.collect();
			for (const vf of viewFields) {
				if (vf.fieldDefId === args.fieldDefId) {
					await ctx.db.delete(vf._id);
				}
			}

			// Clean up viewFilters referencing this field
			const viewFilters = await ctx.db
				.query("viewFilters")
				.withIndex("by_view", (q) => q.eq("viewDefId", view._id))
				.collect();
			for (const vf of viewFilters) {
				if (vf.fieldDefId === args.fieldDefId) {
					await ctx.db.delete(vf._id);
				}
			}

			// Clean up viewKanbanGroups referencing this field
			const viewKanbanGroups = await ctx.db
				.query("viewKanbanGroups")
				.withIndex("by_view", (q) => q.eq("viewDefId", view._id))
				.collect();
			for (const vkg of viewKanbanGroups) {
				if (vkg.fieldDefId === args.fieldDefId) {
					await ctx.db.delete(vkg._id);
				}
			}
		}

		// Delete capabilities
		const caps = await ctx.db
			.query("fieldCapabilities")
			.withIndex("by_field", (q) => q.eq("fieldDefId", args.fieldDefId))
			.collect();
		for (const cap of caps) {
			await ctx.db.delete(cap._id);
		}

		// Audit
		await auditLog.log(ctx, {
			action: "crm.field.deactivated",
			actorId: ctx.viewer.authId,
			resourceType: "fieldDefs",
			resourceId: args.fieldDefId,
			severity: "warning",
			metadata: {
				name: fieldDef.name,
				objectDefId: fieldDef.objectDefId,
				orgId,
			},
		});
	})
	.public();

// ── reorderFields ───────────────────────────────────────────────────
// Update displayOrder for a set of fields.
export const reorderFields = crmAdminMutation
	.input({
		objectDefId: v.id("objectDefs"),
		fieldIds: v.array(v.id("fieldDefs")),
	})
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

		// Validate no duplicates in the provided fieldIds
		const uniqueIds = new Set(args.fieldIds);
		if (uniqueIds.size !== args.fieldIds.length) {
			throw new ConvexError(
				"fieldIds contains duplicate entries — provide each field ID exactly once"
			);
		}

		// Fetch all active fields for the object to validate completeness
		const allFields = await ctx.db
			.query("fieldDefs")
			.withIndex("by_object", (q) => q.eq("objectDefId", args.objectDefId))
			.collect();
		const activeFieldIds = new Set(
			allFields.filter((f) => f.isActive).map((f) => f._id)
		);

		if (uniqueIds.size !== activeFieldIds.size) {
			throw new ConvexError(
				`fieldIds must be a complete ordering of all active fields — expected ${activeFieldIds.size} IDs, got ${uniqueIds.size}`
			);
		}
		for (const id of uniqueIds) {
			if (!activeFieldIds.has(id)) {
				throw new ConvexError(
					`Field ${id} does not belong to object ${args.objectDefId} or is not active`
				);
			}
		}

		// Apply new display order
		for (let i = 0; i < args.fieldIds.length; i++) {
			await ctx.db.patch(args.fieldIds[i], {
				displayOrder: i,
				updatedAt: Date.now(),
			});
		}

		// Audit
		await auditLog.log(ctx, {
			action: "crm.fields.reordered",
			actorId: ctx.viewer.authId,
			resourceType: "objectDefs",
			resourceId: args.objectDefId,
			severity: "info",
			metadata: {
				fieldIds: args.fieldIds,
				orgId,
			},
		});
	})
	.public();

// ── listFields ──────────────────────────────────────────────────────
// Query active fields by object, ordered by displayOrder.
export const listFields = crmAdminQuery
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

		const fields = await ctx.db
			.query("fieldDefs")
			.withIndex("by_object", (q) => q.eq("objectDefId", args.objectDefId))
			.collect();
		return fields
			.filter((f) => f.isActive)
			.sort((a, b) => a.displayOrder - b.displayOrder);
	})
	.public();
