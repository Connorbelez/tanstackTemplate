import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { auditLog } from "../auditLog";
import { crmMutation, crmQuery } from "../fluent";
import {
	applyFilters,
	assembleRecords,
	FILTERED_QUERY_CAP,
	loadActiveFieldDefs,
} from "./recordQueries";
import { readExistingValue, writeValue } from "./records";
import { queryNativeRecords } from "./systemAdapters/queryAdapter";
import type {
	EntityViewAdapterContract,
	NormalizedFieldDefinition,
	RecordFilter,
	SystemViewDefinition,
	UnifiedRecord,
	ViewLayout,
} from "./types";
import { KANBAN_NO_VALUE_SENTINEL } from "./viewDefs";

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
const OFFSET_CURSOR_PATTERN = /^[0-9]+$/;

// ── Types ────────────────────────────────────────────────────────────

interface ColumnDef {
	displayOrder: number;
	fieldDefId: Id<"fieldDefs">;
	fieldType: FieldDef["fieldType"];
	isVisible: boolean;
	label: string;
	name: string;
	width: number | undefined;
}

interface TableViewResult {
	columns: ColumnDef[];
	cursor: string | null;
	rows: UnifiedRecord[];
	totalCount: number;
}

interface KanbanGroup {
	color: string;
	count: number;
	groupId: Id<"viewKanbanGroups">;
	isCollapsed: boolean;
	label: string;
	records: UnifiedRecord[];
}

interface KanbanViewResult {
	groups: KanbanGroup[];
	totalCount: number;
}

interface ViewSchemaColumn extends ColumnDef {
	aggregation: FieldDef["aggregation"];
	editability: FieldDef["editability"];
	hasSortCapability: boolean;
	isVisibleByDefault: boolean;
	layoutEligibility: FieldDef["layoutEligibility"];
	normalizedFieldKind: FieldDef["normalizedFieldKind"];
	options: FieldDef["options"];
	relation: FieldDef["relation"];
	rendererHint: FieldDef["rendererHint"];
}

interface ViewSchemaResult {
	adapterContract: EntityViewAdapterContract;
	columns: ViewSchemaColumn[];
	fields: NormalizedFieldDefinition[];
	needsRepair: boolean;
	view: SystemViewDefinition;
	viewType: ViewLayout;
}

type KanbanGroupDoc = Doc<"viewKanbanGroups">;

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

function sanitizeQueryLimit(limit: number | undefined): number {
	if (typeof limit !== "number" || !Number.isFinite(limit) || limit <= 0) {
		return 50;
	}

	const flooredLimit = Math.floor(limit);
	if (flooredLimit < 1) {
		return 50;
	}

	return Math.min(flooredLimit, FILTERED_QUERY_CAP);
}

function toColumnDef(
	viewField: Doc<"viewFields">,
	fieldDef: FieldDef | undefined
): ColumnDef | null {
	if (!fieldDef) {
		return null;
	}

	return {
		fieldDefId: viewField.fieldDefId,
		name: fieldDef.name,
		label: fieldDef.label,
		fieldType: fieldDef.fieldType,
		width: viewField.width,
		isVisible: viewField.isVisible,
		displayOrder: viewField.displayOrder,
	};
}

function toNormalizedFieldDefinition(
	fieldDef: FieldDef
): NormalizedFieldDefinition {
	return {
		fieldDefId: fieldDef._id,
		objectDefId: fieldDef.objectDefId,
		name: fieldDef.name,
		label: fieldDef.label,
		fieldType: fieldDef.fieldType,
		normalizedFieldKind: fieldDef.normalizedFieldKind,
		description: fieldDef.description,
		isRequired: fieldDef.isRequired,
		isUnique: fieldDef.isUnique,
		isActive: fieldDef.isActive,
		displayOrder: fieldDef.displayOrder,
		defaultValue: fieldDef.defaultValue,
		options: fieldDef.options,
		rendererHint: fieldDef.rendererHint,
		relation: fieldDef.relation,
		computed: fieldDef.computed,
		layoutEligibility: fieldDef.layoutEligibility,
		aggregation: fieldDef.aggregation,
		editability: fieldDef.editability,
		nativeColumnPath: fieldDef.nativeColumnPath,
		nativeReadOnly: fieldDef.nativeReadOnly,
		isVisibleByDefault: fieldDef.isVisibleByDefault,
	};
}

function deriveDisabledLayoutMessages(
	fieldDefs: FieldDef[]
): SystemViewDefinition["disabledLayoutMessages"] | undefined {
	const messages: NonNullable<SystemViewDefinition["disabledLayoutMessages"]> =
		{};

	if (!fieldDefs.some((fieldDef) => fieldDef.layoutEligibility.table.enabled)) {
		messages.table = "Table layout requires at least one active field.";
	}

	if (
		!fieldDefs.some((fieldDef) => fieldDef.layoutEligibility.kanban.enabled)
	) {
		messages.kanban =
			"Add a select or multi-select field to unlock kanban layouts.";
	}

	if (
		!fieldDefs.some((fieldDef) => fieldDef.layoutEligibility.calendar.enabled)
	) {
		messages.calendar =
			"Add a date or datetime field to unlock calendar layouts.";
	}

	return Object.keys(messages).length > 0 ? messages : undefined;
}

function buildAdapterContract(args: {
	fieldDefs: FieldDef[];
	objectDef: Doc<"objectDefs">;
	viewDef: Doc<"viewDefs">;
}): EntityViewAdapterContract {
	const supportedLayouts = new Set<ViewLayout>(["table"]);
	if (
		args.fieldDefs.some((fieldDef) => fieldDef.layoutEligibility.kanban.enabled)
	) {
		supportedLayouts.add("kanban");
	}
	if (
		args.fieldDefs.some(
			(fieldDef) => fieldDef.layoutEligibility.calendar.enabled
		)
	) {
		supportedLayouts.add("calendar");
	}
	supportedLayouts.add(args.viewDef.viewType);
	const titleField = args.fieldDefs.find(
		(fieldDef) => fieldDef.name === "name"
	);
	const statusField = args.fieldDefs.find(
		(fieldDef) => fieldDef.name === "status"
	);
	return {
		entityType: args.objectDef.name,
		objectDefId: args.objectDef._id,
		detailSurfaceKey: args.objectDef.name,
		titleFieldName: titleField?.name,
		statusFieldName: statusField?.name,
		supportedLayouts: [...supportedLayouts],
	};
}

function buildSystemViewDefinition(args: {
	fieldDefsById: Map<string, FieldDef>;
	objectDefId: Id<"objectDefs">;
	viewDef: Doc<"viewDefs">;
	viewFields: Doc<"viewFields">[];
	viewFilters: Doc<"viewFilters">[];
}): SystemViewDefinition {
	const orderedFields = [...args.viewFields].sort(
		(a, b) => a.displayOrder - b.displayOrder
	);
	const fieldOrder = orderedFields
		.filter((viewField) =>
			args.fieldDefsById.has(viewField.fieldDefId.toString())
		)
		.map((viewField) => viewField.fieldDefId);
	const visibleFieldIds = orderedFields
		.filter(
			(viewField) =>
				viewField.isVisible &&
				args.fieldDefsById.has(viewField.fieldDefId.toString())
		)
		.map((viewField) => viewField.fieldDefId);

	return {
		viewDefId: args.viewDef._id,
		objectDefId: args.objectDefId,
		name: args.viewDef.name,
		layout: args.viewDef.viewType,
		boundFieldId: args.viewDef.boundFieldId,
		fieldOrder,
		visibleFieldIds,
		filters: convertViewFiltersToRecordFilters(args.viewFilters),
		groupByFieldId: args.viewDef.groupByFieldId,
		aggregatePresets: args.viewDef.aggregatePresets ?? [],
		disabledLayoutMessages:
			args.viewDef.disabledLayoutMessages ??
			deriveDisabledLayoutMessages([...args.fieldDefsById.values()]),
		isDefault: args.viewDef.isDefault,
		needsRepair: args.viewDef.needsRepair,
	};
}

async function loadOrderedKanbanGroups(
	ctx: QueryCtx,
	viewDefId: Id<"viewDefs">
): Promise<KanbanGroupDoc[]> {
	const kanbanGroups = await ctx.db
		.query("viewKanbanGroups")
		.withIndex("by_view", (q) => q.eq("viewDefId", viewDefId))
		.collect();

	kanbanGroups.sort((a, b) => a.displayOrder - b.displayOrder);
	return kanbanGroups;
}

async function requireKanbanBoundField(
	ctx: QueryCtx,
	viewDef: Doc<"viewDefs">
): Promise<FieldDef> {
	if (!viewDef.boundFieldId) {
		throw new ConvexError("Kanban view requires a bound field (boundFieldId)");
	}

	const boundFieldDef = await ctx.db.get(viewDef.boundFieldId);
	if (!boundFieldDef) {
		throw new ConvexError("Bound field definition not found");
	}

	return boundFieldDef;
}

async function loadViewRecords(
	ctx: QueryCtx,
	viewDef: Doc<"viewDefs">,
	activeFieldDefs: FieldDef[]
): Promise<UnifiedRecord[]> {
	const objectDef = await ctx.db.get(viewDef.objectDefId);
	if (!objectDef || objectDef.orgId !== viewDef.orgId || !objectDef.isActive) {
		throw new ConvexError("Object not found or access denied");
	}

	if (objectDef.isSystem && objectDef.nativeTable) {
		return queryNativeRecords(
			ctx,
			objectDef,
			activeFieldDefs,
			viewDef.orgId,
			FILTERED_QUERY_CAP
		);
	}

	const rawRecords = await ctx.db
		.query("records")
		.withIndex("by_org_object", (q) =>
			q.eq("orgId", viewDef.orgId).eq("objectDefId", viewDef.objectDefId)
		)
		.filter((q) => q.eq(q.field("isDeleted"), false))
		.take(FILTERED_QUERY_CAP);

	return assembleRecords(ctx, rawRecords, activeFieldDefs);
}

function buildKanbanOptionsLookup(
	boundFieldDef: FieldDef
): Map<string, { label: string; color: string }> {
	const optionsLookup = new Map<string, { label: string; color: string }>();
	for (const option of boundFieldDef.options ?? []) {
		optionsLookup.set(option.value, {
			label: option.label,
			color: option.color,
		});
	}
	return optionsLookup;
}

function createKanbanGroupRecordMap(
	kanbanGroups: KanbanGroupDoc[]
): Map<string, UnifiedRecord[]> {
	const groupRecordMap = new Map<string, UnifiedRecord[]>();
	for (const group of kanbanGroups) {
		groupRecordMap.set(group.optionValue, []);
	}
	groupRecordMap.set(KANBAN_NO_VALUE_SENTINEL, []);
	return groupRecordMap;
}

function pushRecordToGroup(
	groupRecordMap: Map<string, UnifiedRecord[]>,
	groupValue: string,
	record: UnifiedRecord
): boolean {
	const bucket = groupRecordMap.get(groupValue);
	if (!bucket) {
		return false;
	}

	bucket.push(record);
	return true;
}

function placeSingleValueKanbanRecord(
	value: unknown,
	kanbanGroups: KanbanGroupDoc[],
	groupRecordMap: Map<string, UnifiedRecord[]>,
	record: UnifiedRecord
): void {
	for (const group of kanbanGroups) {
		if (value === group.optionValue) {
			pushRecordToGroup(groupRecordMap, group.optionValue, record);
			return;
		}
	}

	pushRecordToGroup(groupRecordMap, KANBAN_NO_VALUE_SENTINEL, record);
}

function placeMultiSelectKanbanRecord(
	values: string[],
	kanbanGroups: KanbanGroupDoc[],
	groupRecordMap: Map<string, UnifiedRecord[]>,
	record: UnifiedRecord
): void {
	let placed = false;

	for (const group of kanbanGroups) {
		if (values.includes(group.optionValue)) {
			pushRecordToGroup(groupRecordMap, group.optionValue, record);
			placed = true;
		}
	}

	if (!placed) {
		pushRecordToGroup(groupRecordMap, KANBAN_NO_VALUE_SENTINEL, record);
	}
}

function distributeKanbanRecords(
	records: UnifiedRecord[],
	boundFieldDef: FieldDef,
	kanbanGroups: KanbanGroupDoc[]
): Map<string, UnifiedRecord[]> {
	const groupRecordMap = createKanbanGroupRecordMap(kanbanGroups);
	const isMultiSelect = boundFieldDef.fieldType === "multi_select";

	for (const record of records) {
		const value = record.fields[boundFieldDef.name];

		if (value === undefined || value === null) {
			pushRecordToGroup(groupRecordMap, KANBAN_NO_VALUE_SENTINEL, record);
			continue;
		}

		if (isMultiSelect && Array.isArray(value)) {
			placeMultiSelectKanbanRecord(value, kanbanGroups, groupRecordMap, record);
			continue;
		}

		placeSingleValueKanbanRecord(value, kanbanGroups, groupRecordMap, record);
	}

	return groupRecordMap;
}

function buildKanbanGroups(
	kanbanGroups: KanbanGroupDoc[],
	groupRecordMap: Map<string, UnifiedRecord[]>,
	optionsLookup: Map<string, { label: string; color: string }>
): KanbanGroup[] {
	return kanbanGroups.map((group) => {
		const isNoValue = group.optionValue === KANBAN_NO_VALUE_SENTINEL;
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
	const columns = viewFields
		.flatMap((vf) => {
			const column = toColumnDef(
				vf,
				fieldDefsById.get(vf.fieldDefId.toString())
			);
			return column ? [column] : [];
		})
		.sort((a, b) => a.displayOrder - b.displayOrder);

	// Convert viewFilters to RecordFilter[]
	const filters = convertViewFiltersToRecordFilters(viewFilters);
	const assembled = await loadViewRecords(ctx, viewDef, activeFieldDefs);

	// Apply filters
	const filtered = applyFilters(assembled, filters, fieldDefsById);

	// Offset-based pagination
	let offset = 0;
	if (cursor != null) {
		const cursorBody = cursor.startsWith("offset:")
			? cursor.slice("offset:".length)
			: cursor;
		if (!OFFSET_CURSOR_PATTERN.test(cursorBody)) {
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
	const kanbanGroups = await loadOrderedKanbanGroups(ctx, viewDef._id);
	const boundFieldDef = await requireKanbanBoundField(ctx, viewDef);
	const assembled = await loadViewRecords(ctx, viewDef, activeFieldDefs);
	const filters = convertViewFiltersToRecordFilters(viewFilters);
	const filtered = applyFilters(assembled, filters, fieldDefsById);
	const optionsLookup = buildKanbanOptionsLookup(boundFieldDef);
	const groupRecordMap = distributeKanbanRecords(
		filtered,
		boundFieldDef,
		kanbanGroups
	);

	return {
		groups: buildKanbanGroups(kanbanGroups, groupRecordMap, optionsLookup),
		totalCount: filtered.length,
	};
}

// ── queryViewRecords ─────────────────────────────────────────────────

export const queryViewRecords = crmQuery
	.input({
		viewDefId: v.id("viewDefs"),
		cursor: v.optional(v.union(v.string(), v.null())),
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
		const activeFieldDefs = await loadActiveFieldDefs(ctx, viewDef.objectDefId);

		const limit = sanitizeQueryLimit(args.limit);
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
				return queryKanbanView(ctx, viewDef, viewFilters, activeFieldDefs);
			case "calendar":
				throw new ConvexError("Calendar view rendering is not yet implemented");
			default: {
				const _exhaustive: never = viewDef.viewType;
				throw new ConvexError(`Unknown view type: ${String(_exhaustive)}`);
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
		const objectDef = await ctx.db.get(viewDef.objectDefId);
		if (!objectDef || objectDef.orgId !== orgId || !objectDef.isActive) {
			throw new ConvexError("Object not found or access denied");
		}

		// 2. Load viewFields for this view
		const viewFields = await ctx.db
			.query("viewFields")
			.withIndex("by_view", (q) => q.eq("viewDefId", args.viewDefId))
			.collect();
		const viewFilters = await ctx.db
			.query("viewFilters")
			.withIndex("by_view", (q) => q.eq("viewDefId", args.viewDefId))
			.collect();

		// 3. Load active fieldDefs for the objectDef
		const activeFieldDefs = await loadActiveFieldDefs(ctx, viewDef.objectDefId);
		const fieldDefsById = new Map(
			activeFieldDefs.map((fd) => [fd._id.toString(), fd])
		);

		// 4. Load fieldCapabilities where capability === "sort"
		const sortCapabilities = await ctx.db
			.query("fieldCapabilities")
			.withIndex("by_object_capability", (q) =>
				q.eq("objectDefId", viewDef.objectDefId).eq("capability", "sort")
			)
			.collect();
		const sortableFieldIds = new Set(
			sortCapabilities.map((cap) => cap.fieldDefId.toString())
		);

		// 5. Build columns array
		const columns = viewFields
			.flatMap((vf) => {
				const fieldDef = fieldDefsById.get(vf.fieldDefId.toString());
				const column = toColumnDef(vf, fieldDef);
				if (!(column && fieldDef)) {
					return [];
				}

				return [
					{
						...column,
						normalizedFieldKind: fieldDef.normalizedFieldKind,
						rendererHint: fieldDef.rendererHint,
						relation: fieldDef.relation,
						layoutEligibility: fieldDef.layoutEligibility,
						aggregation: fieldDef.aggregation,
						editability: fieldDef.editability,
						options: fieldDef.options,
						isVisibleByDefault: fieldDef.isVisibleByDefault,
						hasSortCapability: sortableFieldIds.has(vf.fieldDefId.toString()),
					},
				];
			})
			.sort((a, b) => a.displayOrder - b.displayOrder);
		const fields = activeFieldDefs.map(toNormalizedFieldDefinition);
		const view = buildSystemViewDefinition({
			viewDef,
			objectDefId: viewDef.objectDefId,
			viewFields,
			viewFilters,
			fieldDefsById,
		});

		return {
			adapterContract: buildAdapterContract({
				objectDef,
				viewDef,
				fieldDefs: activeFieldDefs,
			}),
			columns,
			fields,
			viewType: viewDef.viewType,
			needsRepair: viewDef.needsRepair,
			view,
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
		if (!orgId) {
			throw new ConvexError("Org context required");
		}

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
			boundFieldDef
		);
		const beforeValue = existingRow ? existingRow.value : null;

		// 5. Delete old value row if present
		if (existingRow) {
			await ctx.db.delete(existingRow._id);
		}

		const existingMultiSelectValues = Array.isArray(beforeValue)
			? beforeValue.filter(
					(value): value is string => typeof value === "string"
				)
			: [];
		let afterValue: string[] | string | null;
		if (args.targetGroupValue === KANBAN_NO_VALUE_SENTINEL) {
			afterValue = null;
		} else if (boundFieldDef.fieldType === "multi_select") {
			afterValue = existingMultiSelectValues.includes(args.targetGroupValue)
				? existingMultiSelectValues
				: [...existingMultiSelectValues, args.targetGroupValue];
		} else {
			afterValue = args.targetGroupValue;
		}

		// 6. Write new value (for "No Value", leave the field empty)
		if (afterValue !== null) {
			await writeValue(ctx, args.recordId, boundFieldDef, afterValue);
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
				[boundFieldDef.name]: afterValue,
			},
			generateDiff: true,
			severity: "info",
		});
	})
	.public();
