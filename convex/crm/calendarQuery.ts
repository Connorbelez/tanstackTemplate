import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import type { Viewer } from "../fluent";
import { crmQuery } from "../fluent";
import {
	assembleRecords,
	FILTERED_QUERY_CAP,
	loadActiveFieldDefs,
	matchesFilter,
	normalizeFilterValue,
} from "./recordQueries";
import type {
	EntityViewAdapterContract,
	EntityViewRow,
	NormalizedFieldDefinition,
	RecordFilter,
	SystemViewDefinition,
	UnifiedRecord,
	ViewAggregateResult,
	ViewLayout,
} from "./types";
import {
	buildEntityViewRows,
	buildViewAggregates,
	type ResolvedViewState,
	resolveViewState,
	type ViewColumnDefinition,
} from "./viewState";

// ── Types ────────────────────────────────────────────────────────────

interface CalendarEvent {
	date: number; // unix ms, truncated to the start of the day/week/month bucket
	records: UnifiedRecord[];
	rows: EntityViewRow[];
}

interface CalendarData {
	adapterContract: EntityViewAdapterContract;
	aggregates: ViewAggregateResult[];
	columns: ViewColumnDefinition[];
	events: CalendarEvent[];
	fields: NormalizedFieldDefinition[];
	needsRepair: boolean;
	range: { start: number; end: number };
	skippedFilters: number;
	truncated: boolean;
	view: SystemViewDefinition;
	viewType: ViewLayout;
}

type Granularity = "day" | "week" | "month";
type FieldDef = Doc<"fieldDefs">;
type ViewFilter = RecordFilter;
type CrmQueryCtx = QueryCtx & { viewer: Viewer };
type ParsedViewFilter = RecordFilter;

// ── Date Truncation Helpers ──────────────────────────────────────────

function truncateToDay(unixMs: number): number {
	const d = new Date(unixMs);
	d.setUTCHours(0, 0, 0, 0);
	return d.getTime();
}

function truncateToWeek(unixMs: number): number {
	const d = new Date(unixMs);
	d.setUTCHours(0, 0, 0, 0);
	d.setUTCDate(d.getUTCDate() - d.getUTCDay());
	return d.getTime();
}

function truncateToMonth(unixMs: number): number {
	const d = new Date(unixMs);
	d.setUTCDate(1);
	d.setUTCHours(0, 0, 0, 0);
	return d.getTime();
}

function truncateDate(unixMs: number, granularity: Granularity): number {
	switch (granularity) {
		case "day":
			return truncateToDay(unixMs);
		case "week":
			return truncateToWeek(unixMs);
		case "month":
			return truncateToMonth(unixMs);
		default: {
			const _exhaustive: never = granularity;
			throw new Error(`Unknown granularity: ${String(_exhaustive)}`);
		}
	}
}

// ── View Filter Parsing + Evaluation ─────────────────────────────────

function parseViewFilters(
	viewFilters: ViewFilter[],
	fieldDefsById: Map<string, FieldDef>
): { filters: ParsedViewFilter[]; skippedCount: number } {
	const result: ParsedViewFilter[] = [];
	let skippedCount = 0;

	for (const vf of viewFilters) {
		const fieldDef = fieldDefsById.get(vf.fieldDefId.toString());
		if (!fieldDef) {
			skippedCount++;
			continue;
		}

		const normalizedValue = normalizeFilterValue(
			vf.value,
			fieldDef,
			vf.operator
		);
		if (
			normalizedValue === undefined &&
			vf.operator !== "is_true" &&
			vf.operator !== "is_false"
		) {
			skippedCount++;
			continue;
		}

		result.push({
			...vf,
			value: normalizedValue,
		});
	}

	return { filters: result, skippedCount };
}

function matchesViewFilter(
	fieldValue: unknown,
	filter: ParsedViewFilter
): boolean {
	switch (filter.operator) {
		case "equals":
		case "is": {
			if (Array.isArray(fieldValue)) {
				return fieldValue.includes(filter.value);
			}
			return matchesFilter(fieldValue, "eq", filter.value);
		}
		case "is_not": {
			if (Array.isArray(fieldValue)) {
				return !fieldValue.includes(filter.value);
			}
			return !matchesFilter(fieldValue, "eq", filter.value);
		}
		case "eq":
			return matchesFilter(fieldValue, "eq", filter.value);
		case "gt":
			return matchesFilter(fieldValue, "gt", filter.value);
		case "lt":
		case "before":
			return matchesFilter(fieldValue, "lt", filter.value);
		case "gte":
			return matchesFilter(fieldValue, "gte", filter.value);
		case "lte":
			return matchesFilter(fieldValue, "lte", filter.value);
		case "after":
			return matchesFilter(fieldValue, "gt", filter.value);
		case "contains":
			return matchesFilter(fieldValue, "contains", filter.value);
		case "starts_with":
			return matchesFilter(fieldValue, "starts_with", filter.value);
		case "is_any_of":
			return matchesFilter(fieldValue, "is_any_of", filter.value);
		case "is_true":
			return matchesFilter(fieldValue, "is_true", undefined);
		case "is_false":
			return matchesFilter(fieldValue, "is_false", undefined);
		case "between": {
			if (
				!Array.isArray(filter.value) ||
				filter.value.length !== 2 ||
				typeof fieldValue !== "number"
			) {
				return false;
			}
			const [start, end] = filter.value;
			return (
				typeof start === "number" &&
				typeof end === "number" &&
				fieldValue >= start &&
				fieldValue <= end
			);
		}
		default: {
			const _exhaustive: never = filter.operator;
			throw new Error(`Unknown view filter operator: ${String(_exhaustive)}`);
		}
	}
}

function applyViewFilters(
	records: UnifiedRecord[],
	filters: ParsedViewFilter[],
	fieldDefsById: Map<string, FieldDef>
): UnifiedRecord[] {
	if (filters.length === 0) {
		return records;
	}

	return records.filter((record) => {
		let combined: boolean | undefined;

		for (const filter of filters) {
			const fieldDef = fieldDefsById.get(filter.fieldDefId.toString());
			if (!fieldDef) {
				return false;
			}

			const nextMatch = matchesViewFilter(record.fields[fieldDef.name], filter);
			if (combined === undefined) {
				combined = nextMatch;
				continue;
			}

			combined =
				filter.logicalOperator === "or"
					? combined || nextMatch
					: combined && nextMatch;
		}

		return combined ?? true;
	});
}

// ── Extracted Query Helpers ──────────────────────────────────────────

interface ValidatedCalendarContext {
	boundFieldId: Id<"fieldDefs">;
	objectDefId: Id<"objectDefs">;
	orgId: string;
	viewState: ResolvedViewState;
}

/**
 * Validates the viewDef and objectDef, returning the verified context
 * needed for the calendar query. Throws ConvexError on any failure.
 */
async function validateCalendarView(
	ctx: CrmQueryCtx,
	viewDefId: Id<"viewDefs">,
	userSavedViewId: Id<"userSavedViews"> | undefined,
	orgId: string
): Promise<ValidatedCalendarContext> {
	const viewState = await resolveViewState(ctx, viewDefId, userSavedViewId);
	const { viewDef } = viewState;
	if (!viewDef || viewDef.orgId !== orgId) {
		throw new ConvexError("View not found or access denied");
	}
	if (viewDef.viewType !== "calendar") {
		throw new ConvexError("View is not a calendar view");
	}
	if (viewDef.needsRepair) {
		throw new ConvexError("View needs repair before use");
	}

	const boundFieldId = viewDef.boundFieldId;
	if (!boundFieldId) {
		throw new ConvexError("Calendar view is missing a bound date field");
	}

	const objectDef = await ctx.db.get(viewDef.objectDefId);
	if (!objectDef || objectDef.orgId !== orgId || !objectDef.isActive) {
		throw new ConvexError("Object not found or access denied");
	}
	// TODO(ENG-255): implement system object query adapter
	if (objectDef.isSystem) {
		throw new ConvexError(
			"System object queries not yet implemented (see ENG-255)"
		);
	}

	return { orgId, objectDefId: viewDef.objectDefId, boundFieldId, viewState };
}

/**
 * Loads record docs by IDs, filtering out soft-deleted and wrong-org records.
 */
async function loadValidRecords(
	ctx: QueryCtx,
	recordIds: Id<"records">[],
	orgId: string
): Promise<Doc<"records">[]> {
	const loaded = await Promise.all(
		recordIds.map(async (recordId) => {
			const record = await ctx.db.get(recordId);
			if (record && !record.isDeleted && record.orgId === orgId) {
				return record;
			}
			return null;
		})
	);
	return loaded.filter((r): r is Doc<"records"> => r !== null);
}

/**
 * Groups assembled records into CalendarEvent[] by truncated date,
 * sorted ascending by date.
 */
function groupRecordsByDate(
	records: UnifiedRecord[],
	recordIdToDate: Map<string, number>,
	granularity: Granularity,
	columns: ViewColumnDefinition[]
): CalendarEvent[] {
	const groupMap = new Map<number, UnifiedRecord[]>();
	for (const record of records) {
		const dateValue = recordIdToDate.get(record._id);
		if (dateValue === undefined) {
			continue;
		}
		const bucketKey = truncateDate(dateValue, granularity);
		const bucket = groupMap.get(bucketKey);
		if (bucket) {
			bucket.push(record);
		} else {
			groupMap.set(bucketKey, [record]);
		}
	}

	return [...groupMap.entries()]
		.sort(([a], [b]) => a - b)
		.map(([date, recs]) => ({
			date,
			records: recs,
			rows: buildEntityViewRows(recs, columns),
		}));
}

// ── Query ────────────────────────────────────────────────────────────

export async function queryCalendarViewData(
	ctx: CrmQueryCtx,
	args: {
		granularity?: Granularity;
		rangeEnd: number;
		rangeStart: number;
		userSavedViewId?: Id<"userSavedViews">;
		viewDefId: Id<"viewDefs">;
	}
): Promise<CalendarData> {
	const orgId = ctx.viewer.orgId;
	if (!orgId) {
		throw new ConvexError("Org context required");
	}

	if (args.rangeStart > args.rangeEnd) {
		throw new ConvexError("rangeStart must be <= rangeEnd");
	}

	const { objectDefId, boundFieldId, viewState } = await validateCalendarView(
		ctx,
		args.viewDefId,
		args.userSavedViewId,
		orgId
	);

	// Range scan recordValuesDate using compound index (capped for safety)
	const dateValueRows = await ctx.db
		.query("recordValuesDate")
		.withIndex("by_object_field_value", (q) =>
			q
				.eq("objectDefId", objectDefId)
				.eq("fieldDefId", boundFieldId)
				.gte("value", args.rangeStart)
				.lte("value", args.rangeEnd)
		)
		.take(FILTERED_QUERY_CAP + 1);

	const truncated = dateValueRows.length > FILTERED_QUERY_CAP;
	const capped = truncated
		? dateValueRows.slice(0, FILTERED_QUERY_CAP)
		: dateValueRows;

	// Collect unique recordIds + map recordId → date value
	const recordIdToDate = new Map<string, number>();
	const uniqueRecordIds: Id<"records">[] = [];
	for (const row of capped) {
		const key = row.recordId.toString();
		if (!recordIdToDate.has(key)) {
			recordIdToDate.set(key, row.value);
			uniqueRecordIds.push(row.recordId);
		}
	}

	// Load full record docs, verify not soft-deleted
	const recordDocs = await loadValidRecords(ctx, uniqueRecordIds, orgId);

	// Fan-out assembly using shared helpers
	const activeFieldDefs = await loadActiveFieldDefs(ctx, objectDefId);
	const fieldDefsById = new Map(
		activeFieldDefs.map((fd) => [fd._id.toString(), fd])
	);
	const assembled = await assembleRecords(ctx, recordDocs, activeFieldDefs);

	const { filters: parsedFilters, skippedCount: skippedFilters } =
		parseViewFilters(viewState.view.filters, fieldDefsById);
	const filtered = applyViewFilters(assembled, parsedFilters, fieldDefsById);

	// Group records by truncated date and sort ascending
	const granularity: Granularity = args.granularity ?? "day";
	const events = groupRecordsByDate(
		filtered,
		recordIdToDate,
		granularity,
		viewState.columns
	);

	return {
		adapterContract: viewState.adapterContract,
		aggregates: buildViewAggregates(
			filtered,
			viewState.view.aggregatePresets,
			viewState.fieldDefsById
		),
		columns: viewState.columns,
		events,
		fields: viewState.fields,
		needsRepair: viewState.view.needsRepair,
		range: { start: args.rangeStart, end: args.rangeEnd },
		truncated,
		skippedFilters,
		view: viewState.view,
		viewType: viewState.view.layout,
	};
}

export const queryCalendarRecords = crmQuery
	.input({
		viewDefId: v.id("viewDefs"),
		userSavedViewId: v.optional(v.id("userSavedViews")),
		rangeStart: v.number(),
		rangeEnd: v.number(),
		granularity: v.optional(
			v.union(v.literal("day"), v.literal("week"), v.literal("month"))
		),
	})
	.handler(
		async (ctx, args): Promise<CalendarData> => queryCalendarViewData(ctx, args)
	)
	.public();
