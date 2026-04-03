import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { auditLog } from "../auditLog";
import { crmMutation, crmQuery } from "../fluent";
import { queryCalendarViewData } from "./calendarQuery";
import type { FilterOperator } from "./filterConstants";
import {
	applyFilters,
	assembleRecords,
	FILTERED_QUERY_CAP,
} from "./recordQueries";
import { readExistingValue, writeValue } from "./records";
import {
	type NativeRecordPage,
	queryNativeRecords,
	queryNativeTable,
} from "./systemAdapters/queryAdapter";
import type {
	EntityViewAdapterContract,
	EntityViewPageResult,
	EntityViewRow,
	NormalizedFieldDefinition,
	RecordFilter,
	SystemViewDefinition,
	UnifiedRecord,
	ViewAggregateResult,
	ViewFilterDefinition,
	ViewLayout,
} from "./types";
import { KANBAN_NO_VALUE_SENTINEL } from "./viewDefs";
import {
	buildEntityViewRows,
	buildViewAggregates,
	projectRecordToVisibleColumns,
	type ResolvedViewState,
	resolveViewState,
	type ViewColumnDefinition,
} from "./viewState";

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
interface NativeTablePage {
	continueCursor: string | null;
	isDone: boolean;
	page: Record<string, unknown>[];
}
const OFFSET_CURSOR_PATTERN = /^[0-9]+$/;
const NATIVE_CURSOR_PREFIX = "native:";
const COUNT_PAGE_SIZE = 256;

// ── Types ────────────────────────────────────────────────────────────

interface TableViewResult {
	adapterContract: EntityViewAdapterContract;
	aggregates: ViewAggregateResult[];
	columns: ViewColumnDefinition[];
	cursor: string | null;
	fields: NormalizedFieldDefinition[];
	needsRepair: boolean;
	page: EntityViewPageResult;
	rows: UnifiedRecord[];
	totalCount: number;
	truncated: boolean;
	view: SystemViewDefinition;
	viewType: ViewLayout;
}

interface KanbanGroup {
	color: string;
	count: number;
	groupId: Id<"viewKanbanGroups">;
	isCollapsed: boolean;
	label: string;
	records: UnifiedRecord[];
	rows: EntityViewRow[];
}

interface KanbanViewResult {
	adapterContract: EntityViewAdapterContract;
	aggregates: ViewAggregateResult[];
	columns: ViewColumnDefinition[];
	fields: NormalizedFieldDefinition[];
	groups: KanbanGroup[];
	needsRepair: boolean;
	totalCount: number;
	truncated: boolean;
	view: SystemViewDefinition;
	viewType: ViewLayout;
}

interface ViewSchemaColumn extends ViewColumnDefinition {
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

function normalizeViewFilterOperator(
	operator: FilterOperator
): RecordFilter["operator"] {
	switch (operator) {
		case "equals":
		case "is":
			return "eq";
		case "before":
			return "lt";
		case "after":
			return "gt";
		case "eq":
		case "gt":
		case "lt":
		case "gte":
		case "lte":
		case "contains":
		case "starts_with":
		case "is_any_of":
		case "is_true":
		case "is_false":
			return operator;
		case "between":
		case "is_not":
			throw new ConvexError(
				`Operator "${operator}" is not supported by table or kanban view filtering yet`
			);
		default: {
			const _exhaustive: never = operator;
			throw new ConvexError(`Unknown filter operator: ${String(_exhaustive)}`);
		}
	}
}

/**
 * Converts persisted view filters into the narrower in-memory record filter set
 * used by table and kanban queries.
 */
function convertViewFiltersToRecordFilters(
	viewFilters: ViewFilterDefinition[]
): RecordFilter[] {
	return viewFilters.map((filter) => ({
		fieldDefId: filter.fieldDefId,
		operator: normalizeViewFilterOperator(filter.operator),
		value: filter.value,
	}));
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
	state: ResolvedViewState
): Promise<{ records: UnifiedRecord[]; truncated: boolean }> {
	if (state.objectDef.isSystem && state.objectDef.nativeTable) {
		const records: UnifiedRecord[] = [];
		let cursor: string | null = null;
		let isDone = false;

		while (!isDone && records.length <= FILTERED_QUERY_CAP) {
			const pageSize = FILTERED_QUERY_CAP + 1 - records.length;
			const nativePage: NativeRecordPage = await queryNativeRecords(
				ctx,
				state.objectDef,
				state.activeFieldDefs,
				state.viewDef.orgId,
				{
					cursor,
					numItems: pageSize,
				}
			);

			records.push(...nativePage.records);
			cursor = nativePage.continueCursor;
			isDone = nativePage.isDone;
		}

		const truncated = records.length > FILTERED_QUERY_CAP || !isDone;
		return {
			records: truncated ? records.slice(0, FILTERED_QUERY_CAP) : records,
			truncated,
		};
	}

	const rawRecords = await ctx.db
		.query("records")
		.withIndex("by_org_object", (q) =>
			q
				.eq("orgId", state.viewDef.orgId)
				.eq("objectDefId", state.viewDef.objectDefId)
		)
		.filter((q) => q.eq(q.field("isDeleted"), false))
		.take(FILTERED_QUERY_CAP + 1);
	const truncated = rawRecords.length > FILTERED_QUERY_CAP;

	return {
		records: await assembleRecords(
			ctx,
			truncated ? rawRecords.slice(0, FILTERED_QUERY_CAP) : rawRecords,
			state.activeFieldDefs
		),
		truncated,
	};
}

function stripNativeCursor(cursor: string | null): string | null {
	if (cursor?.startsWith(NATIVE_CURSOR_PREFIX)) {
		return cursor.slice(NATIVE_CURSOR_PREFIX.length);
	}

	return cursor;
}

function parseOffsetCursor(cursor: string | null): number {
	if (cursor == null) {
		return 0;
	}

	const cursorBody = cursor.startsWith("offset:")
		? cursor.slice("offset:".length)
		: cursor;
	if (!OFFSET_CURSOR_PATTERN.test(cursorBody)) {
		throw new ConvexError("Invalid pagination cursor");
	}

	const offset = Number.parseInt(cursorBody, 10);
	if (!Number.isFinite(offset) || offset < 0) {
		throw new ConvexError("Invalid pagination cursor");
	}

	return offset;
}

function buildViewQueryBase(state: ResolvedViewState) {
	return {
		adapterContract: state.adapterContract,
		columns: state.columns,
		fields: state.fields,
		needsRepair: state.view.needsRepair,
		view: state.view,
		viewType: state.view.layout,
	};
}

function buildPageResult(args: {
	continueCursor: string | null;
	isDone: boolean;
	limit: number;
	records: UnifiedRecord[];
	columns: ViewColumnDefinition[];
	totalCount: number;
	truncated: boolean;
}): EntityViewPageResult {
	return {
		continueCursor: args.continueCursor,
		isDone: args.isDone,
		limit: args.limit,
		returnedCount: args.records.length,
		rows: buildEntityViewRows(args.records, args.columns),
		totalCount: args.totalCount,
		truncated: args.truncated,
	};
}

async function countUnfilteredRecords(
	ctx: QueryCtx,
	state: ResolvedViewState
): Promise<number> {
	let total = 0;
	let cursor: string | null = null;
	let isDone = false;

	while (!isDone) {
		if (state.objectDef.isSystem && state.objectDef.nativeTable) {
			const page: NativeTablePage = await queryNativeTable(
				ctx,
				state.objectDef.nativeTable,
				state.viewDef.orgId,
				{
					cursor,
					numItems: COUNT_PAGE_SIZE,
				}
			);
			total += page.page.length;
			cursor = page.continueCursor;
			isDone = page.isDone;
			continue;
		}

		const page = await ctx.db
			.query("records")
			.withIndex("by_org_object", (q) =>
				q
					.eq("orgId", state.viewDef.orgId)
					.eq("objectDefId", state.viewDef.objectDefId)
			)
			.filter((q) => q.eq(q.field("isDeleted"), false))
			.paginate({
				cursor,
				numItems: COUNT_PAGE_SIZE,
			});
		total += page.page.length;
		cursor = page.continueCursor;
		isDone = page.isDone;
	}

	return total;
}

async function paginateUnfilteredTableRecords(
	ctx: QueryCtx,
	state: ResolvedViewState,
	cursor: string | null,
	limit: number
): Promise<{
	continueCursor: string | null;
	isDone: boolean;
	records: UnifiedRecord[];
}> {
	if (state.objectDef.isSystem && state.objectDef.nativeTable) {
		const nativePage = await queryNativeRecords(
			ctx,
			state.objectDef,
			state.activeFieldDefs,
			state.viewDef.orgId,
			{
				cursor: stripNativeCursor(cursor),
				numItems: limit,
			}
		);

		return {
			records: nativePage.records,
			continueCursor: nativePage.isDone
				? null
				: `${NATIVE_CURSOR_PREFIX}${nativePage.continueCursor}`,
			isDone: nativePage.isDone,
		};
	}

	const page = await ctx.db
		.query("records")
		.withIndex("by_org_object", (q) =>
			q
				.eq("orgId", state.viewDef.orgId)
				.eq("objectDefId", state.viewDef.objectDefId)
		)
		.filter((q) => q.eq(q.field("isDeleted"), false))
		.paginate({
			cursor: stripNativeCursor(cursor),
			numItems: limit,
		});

	return {
		records: await assembleRecords(ctx, page.page, state.activeFieldDefs),
		continueCursor: page.isDone ? null : page.continueCursor,
		isDone: page.isDone,
	};
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
	optionsLookup: Map<string, { label: string; color: string }>,
	columns: ViewColumnDefinition[]
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
			rows: buildEntityViewRows(records, columns),
			count: records.length,
			isCollapsed: group.isCollapsed,
		};
	});
}

// ── queryTableView (internal helper) ─────────────────────────────────

async function queryTableView(
	ctx: QueryCtx,
	state: ResolvedViewState,
	cursor: string | null | undefined,
	limit: number
): Promise<TableViewResult> {
	const recordFilters = convertViewFiltersToRecordFilters(state.view.filters);
	const hasWindowedViewRequirements =
		recordFilters.length > 0 || state.view.aggregatePresets.length > 0;

	if (!hasWindowedViewRequirements) {
		const [pagedRecords, totalCount] = await Promise.all([
			paginateUnfilteredTableRecords(ctx, state, cursor ?? null, limit),
			countUnfilteredRecords(ctx, state),
		]);
		const rows = pagedRecords.records.map((record) =>
			projectRecordToVisibleColumns(record, state.columns)
		);

		return {
			...buildViewQueryBase(state),
			aggregates: [],
			cursor: pagedRecords.continueCursor,
			page: buildPageResult({
				continueCursor: pagedRecords.continueCursor,
				isDone: pagedRecords.isDone,
				limit,
				records: pagedRecords.records,
				columns: state.columns,
				totalCount,
				truncated: false,
			}),
			rows,
			totalCount,
			truncated: false,
		};
	}

	const assembled = await loadViewRecords(ctx, state);
	const filtered = applyFilters(
		assembled.records,
		recordFilters,
		state.fieldDefsById
	);
	const offset = parseOffsetCursor(cursor ?? null);
	const page = filtered.slice(offset, offset + limit);
	const nextOffset = offset + limit;
	const isDone = nextOffset >= filtered.length;
	const rows = page.map((record) =>
		projectRecordToVisibleColumns(record, state.columns)
	);

	return {
		...buildViewQueryBase(state),
		aggregates: buildViewAggregates(
			filtered,
			state.view.aggregatePresets,
			state.fieldDefsById
		),
		cursor: isDone ? null : `offset:${String(nextOffset)}`,
		page: buildPageResult({
			continueCursor: isDone ? null : `offset:${String(nextOffset)}`,
			isDone,
			limit,
			records: page,
			columns: state.columns,
			totalCount: filtered.length,
			truncated: assembled.truncated,
		}),
		rows,
		totalCount: filtered.length,
		truncated: assembled.truncated,
	};
}

// ── queryKanbanView (internal helper) ────────────────────────────────

async function queryKanbanView(
	ctx: QueryCtx,
	state: ResolvedViewState
): Promise<KanbanViewResult> {
	const recordFilters = convertViewFiltersToRecordFilters(state.view.filters);
	const kanbanGroups = await loadOrderedKanbanGroups(ctx, state.viewDef._id);
	const boundFieldDef = await requireKanbanBoundField(ctx, state.viewDef);
	const assembled = await loadViewRecords(ctx, state);
	const filtered = applyFilters(
		assembled.records,
		recordFilters,
		state.fieldDefsById
	);
	const optionsLookup = buildKanbanOptionsLookup(boundFieldDef);
	const groupRecordMap = distributeKanbanRecords(
		filtered,
		boundFieldDef,
		kanbanGroups
	);

	return {
		...buildViewQueryBase(state),
		aggregates: buildViewAggregates(
			filtered,
			state.view.aggregatePresets,
			state.fieldDefsById
		),
		groups: buildKanbanGroups(
			kanbanGroups,
			groupRecordMap,
			optionsLookup,
			state.columns
		),
		totalCount: filtered.length,
		truncated: assembled.truncated,
	};
}

// ── queryViewRecords ─────────────────────────────────────────────────

export const queryViewRecords = crmQuery
	.input({
		viewDefId: v.id("viewDefs"),
		cursor: v.optional(v.union(v.string(), v.null())),
		limit: v.optional(v.number()),
		rangeStart: v.optional(v.number()),
		rangeEnd: v.optional(v.number()),
		granularity: v.optional(
			v.union(v.literal("day"), v.literal("week"), v.literal("month"))
		),
	})
	.handler(async (ctx, args) => {
		const state = await resolveViewState(ctx, args.viewDefId);
		if (state.viewDef.needsRepair) {
			throw new ConvexError(
				"This view needs repair before it can be queried. Please update the view configuration."
			);
		}

		const limit = sanitizeQueryLimit(args.limit);
		const cursor = args.cursor ?? null;

		switch (state.viewDef.viewType) {
			case "table":
				return queryTableView(ctx, state, cursor, limit);
			case "kanban":
				return queryKanbanView(ctx, state);
			case "calendar":
				if (
					typeof args.rangeStart !== "number" ||
					typeof args.rangeEnd !== "number"
				) {
					throw new ConvexError(
						"Calendar view queries require rangeStart and rangeEnd"
					);
				}
				return queryCalendarViewData(ctx, {
					viewDefId: args.viewDefId,
					rangeStart: args.rangeStart,
					rangeEnd: args.rangeEnd,
					granularity: args.granularity,
				});
			default: {
				const _exhaustive: never = state.viewDef.viewType;
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
		const state = await resolveViewState(ctx, args.viewDefId);

		// 4. Load fieldCapabilities where capability === "sort"
		const sortCapabilities = await ctx.db
			.query("fieldCapabilities")
			.withIndex("by_object_capability", (q) =>
				q.eq("objectDefId", state.viewDef.objectDefId).eq("capability", "sort")
			)
			.collect();
		const sortableFieldIds = new Set(
			sortCapabilities.map((cap) => cap.fieldDefId.toString())
		);

		const columns = state.columns.flatMap((column) => {
			const fieldDef = state.fieldDefsById.get(column.fieldDefId.toString());
			if (!fieldDef) {
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
					hasSortCapability: sortableFieldIds.has(column.fieldDefId.toString()),
				},
			];
		});
		return {
			adapterContract: state.adapterContract,
			columns,
			fields: state.fields,
			viewType: state.view.layout,
			needsRepair: state.view.needsRepair,
			view: state.view,
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
