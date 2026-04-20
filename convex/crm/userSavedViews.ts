import { ConvexError, v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { auditLog } from "../auditLog";
import { crmMutation, crmQuery } from "../fluent";
import { isValidOperatorForFieldType } from "./filterOperatorValidation";
import {
	aggregatePresetValidator,
	recordSortValidator,
	savedViewFilterValidator,
	viewTypeValidator,
} from "./validators";
import {
	buildUserSavedViewSnapshot,
	findDefaultUserSavedView,
	loadBaseViewState,
	loadOwnedUserSavedView,
	toUserSavedViewDefinition,
} from "./viewState";

const MAX_SAVED_VIEW_NAME_LENGTH = 100;

function validateSavedViewName(name: string): string {
	const trimmed = name.trim();
	if (trimmed.length === 0) {
		throw new ConvexError("Saved view name cannot be empty");
	}
	if (trimmed.length > MAX_SAVED_VIEW_NAME_LENGTH) {
		throw new ConvexError(
			`Saved view name must be ${MAX_SAVED_VIEW_NAME_LENGTH} characters or fewer`
		);
	}
	return trimmed;
}

async function validateObjectAccess(
	ctx: MutationCtx,
	objectDefId: Id<"objectDefs">,
	orgId: string
) {
	const objectDef = await ctx.db.get(objectDefId);
	if (!objectDef || objectDef.orgId !== orgId) {
		throw new ConvexError("Object not found or access denied");
	}
	return objectDef;
}

async function validateFieldOwnership(
	ctx: MutationCtx,
	args: {
		fieldIds: Id<"fieldDefs">[];
		objectDefId: Id<"objectDefs">;
	}
) {
	if (args.fieldIds.length === 0) {
		return;
	}

	const fieldDefs = await ctx.db
		.query("fieldDefs")
		.withIndex("by_object", (query) =>
			query.eq("objectDefId", args.objectDefId)
		)
		.collect();
	const fieldIds = new Set(
		fieldDefs.map((fieldDef) => fieldDef._id.toString())
	);

	for (const fieldId of args.fieldIds) {
		if (!fieldIds.has(fieldId.toString())) {
			throw new ConvexError(
				`Field ${fieldId} does not belong to this object definition`
			);
		}
	}
}

async function validateSavedViewFilters(
	ctx: MutationCtx,
	args: {
		filters: Array<{
			fieldDefId: Id<"fieldDefs">;
			operator: Parameters<typeof isValidOperatorForFieldType>[0];
		}>;
		objectDefId: Id<"objectDefs">;
	}
) {
	if (args.filters.length === 0) {
		return;
	}

	const fieldDefs = await ctx.db
		.query("fieldDefs")
		.withIndex("by_object", (query) =>
			query.eq("objectDefId", args.objectDefId)
		)
		.collect();
	const fieldDefsById = new Map(
		fieldDefs.map((fieldDef) => [fieldDef._id.toString(), fieldDef])
	);

	for (const filter of args.filters) {
		const fieldDef = fieldDefsById.get(filter.fieldDefId.toString());
		if (!fieldDef) {
			throw new ConvexError(
				`Field ${filter.fieldDefId} does not belong to this object definition`
			);
		}

		if (!isValidOperatorForFieldType(filter.operator, fieldDef.fieldType)) {
			throw new ConvexError(
				`Operator "${filter.operator}" is not valid for field type "${fieldDef.fieldType}"`
			);
		}
	}
}

async function validateSavedViewSort(
	ctx: MutationCtx,
	args: {
		objectDefId: Id<"objectDefs">;
		sort?: {
			fieldDefId: Id<"fieldDefs">;
		};
	}
) {
	if (!args.sort) {
		return;
	}

	await validateFieldOwnership(ctx, {
		objectDefId: args.objectDefId,
		fieldIds: [args.sort.fieldDefId],
	});

	const sortableFieldCapabilities = await ctx.db
		.query("fieldCapabilities")
		.withIndex("by_object_capability", (query) =>
			query.eq("objectDefId", args.objectDefId).eq("capability", "sort")
		)
		.collect();
	const sortableFieldIds = new Set(
		sortableFieldCapabilities.map((capability) =>
			capability.fieldDefId.toString()
		)
	);

	if (!sortableFieldIds.has(args.sort.fieldDefId.toString())) {
		throw new ConvexError(
			`Field ${args.sort.fieldDefId} does not support sorting`
		);
	}
}

async function requireSourceView(
	ctx: MutationCtx,
	args: {
		objectDefId: Id<"objectDefs">;
		orgId: string;
		sourceViewDefId?: Id<"viewDefs">;
		viewType: "table" | "kanban" | "calendar";
	}
) {
	if (!args.sourceViewDefId) {
		throw new ConvexError("Personal saved views require a source system view");
	}

	const sourceView = await ctx.db.get(args.sourceViewDefId);
	if (!sourceView || sourceView.orgId !== args.orgId) {
		throw new ConvexError("Source view not found or access denied");
	}
	if (sourceView.objectDefId !== args.objectDefId) {
		throw new ConvexError(
			"Source view does not belong to this object definition"
		);
	}
	if (sourceView.viewType !== args.viewType) {
		throw new ConvexError(
			"Personal saved view layout must match the source system view layout"
		);
	}

	return sourceView;
}

async function clearExistingDefaultSavedViews(
	ctx: MutationCtx,
	args: {
		excludeId?: Id<"userSavedViews">;
		objectDefId: Id<"objectDefs">;
		ownerAuthId: string;
		orgId: string;
	}
) {
	const existingDefaults = await ctx.db
		.query("userSavedViews")
		.withIndex("by_org_owner_object_default", (query) =>
			query
				.eq("orgId", args.orgId)
				.eq("ownerAuthId", args.ownerAuthId)
				.eq("objectDefId", args.objectDefId)
				.eq("isDefault", true)
		)
		.collect();

	for (const savedView of existingDefaults) {
		if (
			args.excludeId &&
			savedView._id.toString() === args.excludeId.toString()
		) {
			continue;
		}

		await ctx.db.patch(savedView._id, {
			isDefault: false,
			updatedAt: Date.now(),
		});
	}
}

export const listUserSavedViews = crmQuery
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

		const rows = await ctx.db
			.query("userSavedViews")
			.withIndex("by_org_owner_object", (query) =>
				query
					.eq("orgId", orgId)
					.eq("ownerAuthId", ctx.viewer.authId)
					.eq("objectDefId", args.objectDefId)
			)
			.collect();

		return rows
			.sort((left, right) => {
				if (left.isDefault && !right.isDefault) {
					return -1;
				}
				if (!left.isDefault && right.isDefault) {
					return 1;
				}
				return right.updatedAt - left.updatedAt;
			})
			.map(toUserSavedViewDefinition);
	})
	.public();

export const getDefaultUserSavedView = crmQuery
	.input({ objectDefId: v.id("objectDefs") })
	.handler(async (ctx, args) => {
		const orgId = ctx.viewer.orgId;
		if (!orgId) {
			throw new ConvexError("Org context required for CRM operations");
		}

		const defaultView = await findDefaultUserSavedView(ctx, {
			objectDefId: args.objectDefId,
			ownerAuthId: ctx.viewer.authId,
			orgId,
		});

		return defaultView ? toUserSavedViewDefinition(defaultView) : null;
	})
	.public();

export const createUserSavedView = crmMutation
	.input({
		objectDefId: v.id("objectDefs"),
		sourceViewDefId: v.optional(v.id("viewDefs")),
		name: v.string(),
		viewType: viewTypeValidator,
		visibleFieldIds: v.optional(v.array(v.id("fieldDefs"))),
		fieldOrder: v.optional(v.array(v.id("fieldDefs"))),
		filters: v.optional(v.array(savedViewFilterValidator)),
		groupByFieldId: v.optional(v.id("fieldDefs")),
		sort: v.optional(v.union(recordSortValidator, v.null())),
		aggregatePresets: v.optional(v.array(aggregatePresetValidator)),
		isDefault: v.optional(v.boolean()),
	})
	.handler(async (ctx, args) => {
		const orgId = ctx.viewer.orgId;
		if (!orgId) {
			throw new ConvexError("Org context required for CRM operations");
		}

		await validateObjectAccess(ctx, args.objectDefId, orgId);
		await requireSourceView(ctx, {
			objectDefId: args.objectDefId,
			orgId,
			sourceViewDefId: args.sourceViewDefId,
			viewType: args.viewType,
		});

		const snapshot = await loadBaseViewState(
			ctx,
			args.sourceViewDefId as Id<"viewDefs">,
			orgId
		);
		const baseSavedView = buildUserSavedViewSnapshot({
			viewDef: snapshot.viewDef,
			viewFields: snapshot.viewFields,
			viewFilters: snapshot.viewFilters,
		});

		const visibleFieldIds =
			args.visibleFieldIds ?? baseSavedView.visibleFieldIds;
		const fieldOrder = args.fieldOrder ?? baseSavedView.fieldOrder;
		await validateFieldOwnership(ctx, {
			objectDefId: args.objectDefId,
			fieldIds: [...visibleFieldIds, ...fieldOrder],
		});
		await validateSavedViewFilters(ctx, {
			objectDefId: args.objectDefId,
			filters: args.filters ?? baseSavedView.filters,
		});
		await validateSavedViewSort(ctx, {
			objectDefId: args.objectDefId,
			sort: args.sort ?? baseSavedView.sort,
		});

		if (args.groupByFieldId) {
			await validateFieldOwnership(ctx, {
				objectDefId: args.objectDefId,
				fieldIds: [args.groupByFieldId],
			});
		}

		const isDefault = args.isDefault ?? false;
		if (isDefault) {
			await clearExistingDefaultSavedViews(ctx, {
				objectDefId: args.objectDefId,
				ownerAuthId: ctx.viewer.authId,
				orgId,
			});
		}

		const now = Date.now();
		const userSavedViewId = await ctx.db.insert("userSavedViews", {
			orgId,
			objectDefId: args.objectDefId,
			ownerAuthId: ctx.viewer.authId,
			sourceViewDefId: args.sourceViewDefId,
			name: validateSavedViewName(args.name),
			viewType: args.viewType,
			visibleFieldIds,
			fieldOrder,
			filters: args.filters ?? baseSavedView.filters,
			groupByFieldId: args.groupByFieldId ?? baseSavedView.groupByFieldId,
			sort: args.sort ?? baseSavedView.sort,
			aggregatePresets: args.aggregatePresets ?? baseSavedView.aggregatePresets,
			isDefault,
			createdAt: now,
			updatedAt: now,
		});

		await auditLog.log(ctx, {
			action: "crm.userSavedView.created",
			actorId: ctx.viewer.authId,
			resourceType: "userSavedViews",
			resourceId: userSavedViewId,
			severity: "info",
			metadata: {
				objectDefId: args.objectDefId,
				sourceViewDefId: args.sourceViewDefId,
				viewType: args.viewType,
				orgId,
				isDefault,
			},
		});

		return userSavedViewId;
	})
	.public();

export const updateUserSavedView = crmMutation
	.input({
		userSavedViewId: v.id("userSavedViews"),
		name: v.optional(v.string()),
		visibleFieldIds: v.optional(v.array(v.id("fieldDefs"))),
		fieldOrder: v.optional(v.array(v.id("fieldDefs"))),
		filters: v.optional(v.array(savedViewFilterValidator)),
		groupByFieldId: v.optional(v.id("fieldDefs")),
		sort: v.optional(v.union(recordSortValidator, v.null())),
		aggregatePresets: v.optional(v.array(aggregatePresetValidator)),
		isDefault: v.optional(v.boolean()),
	})
	.handler(async (ctx, args) => {
		const orgId = ctx.viewer.orgId;
		if (!orgId) {
			throw new ConvexError("Org context required for CRM operations");
		}

		const before = await loadOwnedUserSavedView(ctx, {
			userSavedViewId: args.userSavedViewId,
			viewer: ctx.viewer,
		});

		await validateFieldOwnership(ctx, {
			objectDefId: before.objectDefId,
			fieldIds: [...(args.visibleFieldIds ?? []), ...(args.fieldOrder ?? [])],
		});
		await validateSavedViewFilters(ctx, {
			objectDefId: before.objectDefId,
			filters: args.filters ?? [],
		});
		await validateSavedViewSort(ctx, {
			objectDefId: before.objectDefId,
			sort: args.sort ?? undefined,
		});

		if (args.groupByFieldId) {
			await validateFieldOwnership(ctx, {
				objectDefId: before.objectDefId,
				fieldIds: [args.groupByFieldId],
			});
		}

		if (args.isDefault === true) {
			await clearExistingDefaultSavedViews(ctx, {
				excludeId: args.userSavedViewId,
				objectDefId: before.objectDefId,
				ownerAuthId: ctx.viewer.authId,
				orgId,
			});
		}

		const patch: Partial<typeof before> = {
			updatedAt: Date.now(),
		};
		if (args.name !== undefined) {
			patch.name = validateSavedViewName(args.name);
		}
		if (args.visibleFieldIds !== undefined) {
			patch.visibleFieldIds = args.visibleFieldIds;
		}
		if (args.fieldOrder !== undefined) {
			patch.fieldOrder = args.fieldOrder;
		}
		if (args.filters !== undefined) {
			patch.filters = args.filters;
		}
		if (args.groupByFieldId !== undefined) {
			patch.groupByFieldId = args.groupByFieldId;
		}
		if (args.sort !== undefined) {
			patch.sort = args.sort ?? undefined;
		}
		if (args.aggregatePresets !== undefined) {
			patch.aggregatePresets = args.aggregatePresets;
		}
		if (args.isDefault !== undefined) {
			patch.isDefault = args.isDefault;
		}

		await ctx.db.patch(args.userSavedViewId, patch);
		const after = await ctx.db.get(args.userSavedViewId);

		await auditLog.logChange(ctx, {
			action: "crm.userSavedView.updated",
			actorId: ctx.viewer.authId,
			resourceType: "userSavedViews",
			resourceId: args.userSavedViewId,
			before,
			after,
			generateDiff: true,
			severity: "info",
		});
	})
	.public();

export const deleteUserSavedView = crmMutation
	.input({ userSavedViewId: v.id("userSavedViews") })
	.handler(async (ctx, args) => {
		const before = await loadOwnedUserSavedView(ctx, {
			userSavedViewId: args.userSavedViewId,
			viewer: ctx.viewer,
		});

		await ctx.db.delete(args.userSavedViewId);
		await auditLog.log(ctx, {
			action: "crm.userSavedView.deleted",
			actorId: ctx.viewer.authId,
			resourceType: "userSavedViews",
			resourceId: args.userSavedViewId,
			severity: "info",
			metadata: {
				objectDefId: before.objectDefId,
				orgId: before.orgId,
			},
		});
	})
	.public();

export const setDefaultUserSavedView = crmMutation
	.input({ userSavedViewId: v.id("userSavedViews") })
	.handler(async (ctx, args) => {
		const orgId = ctx.viewer.orgId;
		if (!orgId) {
			throw new ConvexError("Org context required for CRM operations");
		}

		const before = await loadOwnedUserSavedView(ctx, {
			userSavedViewId: args.userSavedViewId,
			viewer: ctx.viewer,
		});

		await clearExistingDefaultSavedViews(ctx, {
			excludeId: args.userSavedViewId,
			objectDefId: before.objectDefId,
			ownerAuthId: ctx.viewer.authId,
			orgId,
		});

		await ctx.db.patch(args.userSavedViewId, {
			isDefault: true,
			updatedAt: Date.now(),
		});

		const after = await ctx.db.get(args.userSavedViewId);
		await auditLog.logChange(ctx, {
			action: "crm.userSavedView.default.updated",
			actorId: ctx.viewer.authId,
			resourceType: "userSavedViews",
			resourceId: args.userSavedViewId,
			before,
			after,
			generateDiff: true,
			severity: "info",
		});
	})
	.public();
