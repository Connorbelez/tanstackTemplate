import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { auditLog } from "../auditLog";
import { crmMutation, crmQuery } from "../fluent";
import { readExistingValue, writeValue } from "./records";
import {
	FILTERED_QUERY_CAP,
	applyFilters,
	assembleRecords,
	loadActiveFieldDefs,
} from "./recordQueries";
import type { RecordFilter, UnifiedRecord } from "./types";

// ── OQ-1: Multi-select kanban grouping ────────────────────────────────
// Decision: Client-side grouping for v1.
// multi_select fields have "kanban" capability (per metadataCompiler),
// but the recordValuesMultiSelect table stores arrays which aren't
// indexable by individual values in Convex.
// For v1: load all records, group client-side by iterating values array.
// A record with values: ["new", "hot"] appears in both "new" and "hot" columns.
// For v2: consider materializing individual select values into a
// dedicated index table for server-side grouping if perf requires it.

type FieldDef = Doc<"fieldDefs">;

// ── Types ────────────────────────────────────────────────────────────

type ColumnDef = {
	fieldDefId: Id<"fieldDefs">;
	name: string;
	label: string;
	fieldType: string;
	width: number | undefined;
	isVisible: boolean;
	displayOrder: number;
};

type TableViewResult = {
	columns: ColumnDef[];
	rows: UnifiedRecord[];
	totalCount: number;
	cursor: string | null;
};

type KanbanGroup = {
	groupId: Id<"viewKanbanGroups">;
	label: string;
	color: string;
	records: UnifiedRecord[];
	count: number;
	isCollapsed: boolean;
};

type KanbanViewResult = {
	groups: KanbanGroup[];
	totalCount: number;
};

type ViewSchemaColumn = ColumnDef & {
	hasSortCapability: boolean;
};

type ViewSchemaResult = {
	columns: ViewSchemaColumn[];
	viewType: "table" | "kanban" | "calendar";
	needsRepair: boolean;
};

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Converts viewFilter rows (which store value as optional string)
 * into RecordFilter[] suitable for applyFilters.
 */
function convertViewFiltersToRecordFilters(
	viewFilters: Doc<"viewFilters">[]
): RecordFilter[] {
	return viewFilters.map((vf) => {
		let parsedValue: unknown = vf.value;
		if (vf.value !== undefined) {
			try {
				parsedValue = JSON.parse(vf.value);
			} catch {
				parsedValue = vf.value;
			}
		}
		return {
			fieldDefId: vf.fieldDefId,
			operator: vf.operator as RecordFilter["operator"],
			value: parsedValue,
		};
	});
}

// ── queryTableView (internal helper) ─────────────────────────────────

async function queryTableView(
	ctx: QueryCtx,
	viewDef: Doc<"viewDefs">,
	viewFields: Doc<"viewFields">[],
	viewFilters: Doc<"viewFilters">[],
	activeFieldDefs: FieldDef[],
	cursor: string | null | undefined,
	limit: number
): Promise<TableViewResult> {
	const fieldDefsById = new Map(
		activeFieldDefs.map((fd) => [fd._id.toString(), fd])
	);

	// Build column definitions from visible viewFields joined with fieldDefs
	const columns: ColumnDef[] = viewFields
		.map((vf) => {
			const fd = fieldDefsById.get(vf.fieldDefId.toString());
			if (!fd) return null;
			return {
				fieldDefId: vf.fieldDefId,
				name: fd.name,
				label: fd.label,
				fieldType: fd.fieldType,
				width: vf.width,
				isVisible: vf.isVisible,
				displayOrder: vf.displayOrder,
			};
		})
		.filter((col): col is ColumnDef => col !== null)
		.sort((a, b) => a.displayOrder - b.displayOrder);

	// Convert viewFilters to RecordFilter[]
	const filters = convertViewFiltersToRecordFilters(viewFilters);

	// Load records via index
	const orgId = viewDef.orgId;
	const rawRecords = await ctx.db
		.query("records")
		.withIndex("by_org_object", (q) =>
			q.eq("orgId", orgId).eq("objectDefId", viewDef.objectDefId)
		)
		.filter((q) => q.eq(q.field("isDeleted"), false))
		.take(FILTERED_QUERY_CAP);

	// Assemble records with field values
	const assembled = await assembleRecords(ctx, rawRecords, activeFieldDefs);

	// Apply filters
	const filtered = applyFilters(assembled, filters, fieldDefsById);

	// Offset-based pagination
	let offset = 0;
	if (cursor != null) {
		const cursorBody = cursor.startsWith("offset:")
			? cursor.slice("offset:".length)
			: cursor;
		if (!/^[0-9]+$/.test(cursorBody)) {
			throw new ConvexError("Invalid pagination cursor");
		}
		offset = Number.parseInt(cursorBody, 10);
		if (!Number.isFinite(offset) || offset < 0) {
			throw new ConvexError("Invalid pagination cursor");
		}
	}

	const page = filtered.slice(offset, offset + limit);

	// Filter record fields to only include visible field names
	const visibleFieldNames = new Set(
		columns.filter((col) => col.isVisible).map((col) => col.name)
	);
	const rows = page.map((record) => {
		const visibleFields: Record<string, unknown> = {};
		for (const [key, val] of Object.entries(record.fields)) {
			if (visibleFieldNames.has(key)) {
				visibleFields[key] = val;
			}
		}
		return { ...record, fields: visibleFields };
	});

	const nextOffset = offset + limit;
	const isDone = nextOffset >= filtered.length;

	return {
		columns,
		rows,
		totalCount: filtered.length,
		cursor: isDone ? null : `offset:${String(nextOffset)}`,
	};
}

// ── queryKanbanView (internal helper) ────────────────────────────────

async function queryKanbanView(
	ctx: QueryCtx,
	viewDef: Doc<"viewDefs">,
	viewFilters: Doc<"viewFilters">[],
	activeFieldDefs: FieldDef[]
): Promise<KanbanViewResult> {
	const fieldDefsById = new Map(
		activeFieldDefs.map((fd) => [fd._id.toString(), fd])
	);

	// 1. Load kanban groups sorted by displayOrder
	const kanbanGroups = await ctx.db
		.query("viewKanbanGroups")
		.withIndex("by_view", (q) => q.eq("viewDefId", viewDef._id))
		.collect();
	kanbanGroups.sort((a, b) => a.displayOrder - b.displayOrder);

	// 2. Load bound field def
	if (!viewDef.boundFieldId) {
		throw new ConvexError(
			"Kanban view requires a bound field (boundFieldId)"
		);
	}
	const boundFieldDef = await ctx.db.get(viewDef.boundFieldId);
	if (!boundFieldDef) {
		throw new ConvexError("Bound field definition not found");
	}

	// 3. Load ALL records for the object
	const orgId = viewDef.orgId;
	const rawRecords = await ctx.db
		.query("records")
		.withIndex("by_org_object", (q) =>
			q.eq("orgId", orgId).eq("objectDefId", viewDef.objectDefId)
		)
		.filter((q) => q.eq(q.field("isDeleted"), false))
		.take(FILTERED_QUERY_CAP);

	// 4. Assemble ALL records once
	const assembled = await assembleRecords(ctx, rawRecords, activeFieldDefs);

	// 5. Convert viewFilters and apply
	const filters = convertViewFiltersToRecordFilters(viewFilters);
	const filtered = applyFilters(assembled, filters, fieldDefsById);

	// Build options lookup from boundFieldDef.options
	const optionsLookup = new Map<
		string,
		{ label: string; color: string }
	>();
	if (boundFieldDef.options) {
		for (const opt of boundFieldDef.options) {
			optionsLookup.set(opt.value, {
				label: opt.label,
				color: opt.color,
			});
		}
	}

	// 6-8. Distribute records into groups
	const isMultiSelect = boundFieldDef.fieldType === "multi_select";
	const groupRecordMap = new Map<string, UnifiedRecord[]>();

	// Initialize group buckets
	for (const group of kanbanGroups) {
		groupRecordMap.set(group.optionValue, []);
	}
	// __no_value__ bucket for records with undefined/null bound field
	groupRecordMap.set("__no_value__", []);

	for (const record of filtered) {
		const val = record.fields[boundFieldDef.name];

		if (val === undefined || val === null) {
			const bucket = groupRecordMap.get("__no_value__");
			if (bucket) bucket.push(record);
			continue;
		}

		if (isMultiSelect && Array.isArray(val)) {
			// Multi-select: record can appear in multiple groups
			let placed = false;
			for (const group of kanbanGroups) {
				if (val.includes(group.optionValue)) {
					const bucket = groupRecordMap.get(group.optionValue);
					if (bucket) bucket.push(record);
					placed = true;
				}
			}
			if (!placed) {
				const bucket = groupRecordMap.get("__no_value__");
				if (bucket) bucket.push(record);
			}
		} else {
			// Select: exact match
			let placed = false;
			for (const group of kanbanGroups) {
				if (val === group.optionValue) {
					const bucket = groupRecordMap.get(group.optionValue);
					if (bucket) bucket.push(record);
					placed = true;
					break;
				}
			}
			if (!placed) {
				const bucket = groupRecordMap.get("__no_value__");
				if (bucket) bucket.push(record);
			}
		}
	}

	// Build result groups
	// Note: __no_value__ group is already in kanbanGroups (created by createView in viewDefs.ts)
	const groups: KanbanGroup[] = kanbanGroups.map((group) => {
		const isNoValue = group.optionValue === "__no_value__";
		const optionInfo = optionsLookup.get(group.optionValue);
		const records = groupRecordMap.get(group.optionValue) ?? [];
		return {
			groupId: group._id,
			label: isNoValue ? "No Value" : (optionInfo?.label ?? group.optionValue),
			color: optionInfo?.color ?? "",
			records,
			count: records.length,
			isCollapsed: group.isCollapsed,
		};
	});

	const totalCount = filtered.length;

	return { groups, totalCount };
}

// ── queryViewRecords ─────────────────────────────────────────────────

export const queryViewRecords = crmQuery
	.input({
		viewDefId: v.id("viewDefs"),
		cursor: v.optional(v.union(v.string(), v.null_())),
		limit: v.optional(v.number()),
	})
	.handler(async (ctx, args) => {
		const orgId = ctx.viewer.orgId;
		if (!orgId) {
			throw new ConvexError("Org context required");
		}

		// 1. Load viewDef and verify org ownership
		const viewDef = await ctx.db.get(args.viewDefId);
		if (!viewDef || viewDef.orgId !== orgId) {
			throw new ConvexError("View not found or access denied");
		}

		// 2. Check needsRepair
		if (viewDef.needsRepair) {
			throw new ConvexError(
				"This view needs repair before it can be queried. Please update the view configuration."
			);
		}

		// 3. Load viewFields and viewFilters
		const viewFields = await ctx.db
			.query("viewFields")
			.withIndex("by_view", (q) => q.eq("viewDefId", args.viewDefId))
			.collect();

		const viewFilters = await ctx.db
			.query("viewFilters")
			.withIndex("by_view", (q) => q.eq("viewDefId", args.viewDefId))
			.collect();

		// 4. Load active field defs
		const activeFieldDefs = await loadActiveFieldDefs(
			ctx,
			viewDef.objectDefId
		);

		const limit = args.limit ?? 50;
		const cursor = args.cursor ?? null;

		// 5. Dispatch by viewType
		switch (viewDef.viewType) {
			case "table":
				return queryTableView(
					ctx,
					viewDef,
					viewFields,
					viewFilters,
					activeFieldDefs,
					cursor,
					limit
				);
			case "kanban":
				return queryKanbanView(
					ctx,
					viewDef,
					viewFilters,
					activeFieldDefs
				);
			case "calendar":
				throw new ConvexError(
					"Calendar view rendering is not yet implemented"
				);
			default: {
				const _exhaustive: never = viewDef.viewType;
				throw new ConvexError(
					`Unknown view type: ${String(_exhaustive)}`
				);
			}
		}
	})
	.public();

// ── getViewSchema ────────────────────────────────────────────────────

export const getViewSchema = crmQuery
	.input({
		viewDefId: v.id("viewDefs"),
	})
	.handler(async (ctx, args): Promise<ViewSchemaResult> => {
		const orgId = ctx.viewer.orgId;
		if (!orgId) {
			throw new ConvexError("Org context required");
		}

		// 1. Load viewDef and verify org ownership
		const viewDef = await ctx.db.get(args.viewDefId);
		if (!viewDef || viewDef.orgId !== orgId) {
			throw new ConvexError("View not found or access denied");
		}

		// 2. Load viewFields for this view
		const viewFields = await ctx.db
			.query("viewFields")
			.withIndex("by_view", (q) => q.eq("viewDefId", args.viewDefId))
			.collect();

		// 3. Load active fieldDefs for the objectDef
		const activeFieldDefs = await loadActiveFieldDefs(
			ctx,
			viewDef.objectDefId
		);
		const fieldDefsById = new Map(
			activeFieldDefs.map((fd) => [fd._id.toString(), fd])
		);

		// 4. Load fieldCapabilities where capability === "sort"
		const sortCapabilities = await ctx.db
			.query("fieldCapabilities")
			.withIndex("by_object_capability", (q) =>
				q
					.eq("objectDefId", viewDef.objectDefId)
					.eq("capability", "sort")
			)
			.collect();
		const sortableFieldIds = new Set(
			sortCapabilities.map((cap) => cap.fieldDefId.toString())
		);

		// 5. Build columns array
		const columns: ViewSchemaColumn[] = viewFields
			.map((vf) => {
				const fd = fieldDefsById.get(vf.fieldDefId.toString());
				if (!fd) return null;
				return {
					fieldDefId: vf.fieldDefId,
					name: fd.name,
					label: fd.label,
					fieldType: fd.fieldType,
					width: vf.width,
					isVisible: vf.isVisible,
					displayOrder: vf.displayOrder,
					hasSortCapability: sortableFieldIds.has(
						vf.fieldDefId.toString()
					),
				};
			})
			.filter((col): col is ViewSchemaColumn => col !== null)
			.sort((a, b) => a.displayOrder - b.displayOrder);

		return {
			columns,
			viewType: viewDef.viewType,
			needsRepair: viewDef.needsRepair,
		};
	})
	.public();

// ── moveKanbanRecord ─────────────────────────────────────────────────
// Thin view-aware wrapper for kanban drag-to-change.
// Validates the view is kanban, resolves the bound field, then delegates
// the actual value change to the shared write helpers from records.ts.

export const moveKanbanRecord = crmMutation
	.input({
		recordId: v.id("records"),
		viewDefId: v.id("viewDefs"),
		targetGroupValue: v.string(),
	})
	.handler(async (ctx, args) => {
		const orgId = ctx.viewer.orgId;
		if (!orgId) throw new ConvexError("Org context required");

		// 1. Load viewDef — verify kanban + org ownership
		const viewDef = await ctx.db.get(args.viewDefId);
		if (!viewDef || viewDef.orgId !== orgId) {
			throw new ConvexError("View not found or access denied");
		}
		if (viewDef.viewType !== "kanban") {
			throw new ConvexError("moveKanbanRecord only works on kanban views");
		}
		if (!viewDef.boundFieldId) {
			throw new ConvexError("Kanban view is missing a bound field");
		}

		// 2. Load record — verify org ownership + not deleted
		const record = await ctx.db.get(args.recordId);
		if (!record || record.orgId !== orgId || record.isDeleted) {
			throw new ConvexError("Record not found or access denied");
		}

		// 3. Load bound field def
		const boundFieldDef = await ctx.db.get(viewDef.boundFieldId);
		if (!boundFieldDef) {
			throw new ConvexError("Bound field definition not found");
		}

		// 4. Read existing value for audit diff
		const existingRow = await readExistingValue(
			ctx,
			args.recordId,
			boundFieldDef,
		);
		const beforeValue = existingRow ? existingRow.value : null;

		// 5. Delete old value row if present
		if (existingRow) {
			await ctx.db.delete(existingRow._id);
		}

		// 6. Write new value (for __no_value__ target, just delete — leave field empty)
		if (args.targetGroupValue !== "__no_value__") {
			await writeValue(
				ctx,
				args.recordId,
				boundFieldDef,
				args.targetGroupValue,
			);
		}

		// 7. Update record timestamp
		await ctx.db.patch(args.recordId, { updatedAt: Date.now() });

		// 8. Audit with diff
		await auditLog.logChange(ctx, {
			action: "crm.record.updated",
			actorId: ctx.viewer.authId,
			resourceType: "records",
			resourceId: args.recordId,
			before: { [boundFieldDef.name]: beforeValue },
			after: {
				[boundFieldDef.name]:
					args.targetGroupValue === "__no_value__"
						? null
						: args.targetGroupValue,
			},
			generateDiff: true,
			severity: "info",
		});
	})
	.public();
