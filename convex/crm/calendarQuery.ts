import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { crmQuery } from "../fluent";
import {
	assembleRecords,
	FILTERED_QUERY_CAP,
	loadActiveFieldDefs,
	matchesFilter,
} from "./recordQueries";
import type { UnifiedRecord } from "./types";

// ── Types ────────────────────────────────────────────────────────────

interface CalendarEvent {
	date: number; // unix ms, truncated to the start of the day/week/month bucket
	records: UnifiedRecord[];
}

interface CalendarData {
	events: CalendarEvent[];
	range: { start: number; end: number };
	skippedFilters: number;
	truncated: boolean;
}

type Granularity = "day" | "week" | "month";
type FieldDef = Doc<"fieldDefs">;
type ViewFilter = Doc<"viewFilters">;

interface ParsedViewFilter {
	fieldDefId: Id<"fieldDefs">;
	logicalOperator?: ViewFilter["logicalOperator"];
	operator: ViewFilter["operator"];
	value: unknown;
}

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

function parseScalarFilterValue(
	rawValue: string | undefined,
	fieldDef: FieldDef
): unknown {
	if (rawValue === undefined || rawValue === "") {
		return undefined;
	}

	switch (fieldDef.fieldType) {
		case "number":
		case "currency":
		case "percentage":
		case "date":
		case "datetime": {
			const n = Number.parseFloat(rawValue);
			return Number.isFinite(n) ? n : undefined;
		}
		case "boolean":
			return rawValue === "true";
		default:
			return rawValue;
	}
}

function parseRangeBoundary(value: unknown, fieldDef: FieldDef): unknown {
	return parseScalarFilterValue(String(value), fieldDef);
}

function parseBetweenFilterValue(
	rawValue: string,
	fieldDef: FieldDef
): [unknown, unknown] | undefined {
	try {
		const parsed: unknown = JSON.parse(rawValue);
		if (Array.isArray(parsed) && parsed.length === 2) {
			const start = parseRangeBoundary(parsed[0], fieldDef);
			const end = parseRangeBoundary(parsed[1], fieldDef);
			return start !== undefined && end !== undefined
				? [start, end]
				: undefined;
		}
	} catch {
		// Fall through to lenient legacy parsing below.
	}

	const [startRaw, endRaw, ...rest] = rawValue
		.split(",")
		.map((part) => part.trim());
	if (!(startRaw && endRaw) || rest.length > 0) {
		return undefined;
	}
	const start = parseScalarFilterValue(startRaw, fieldDef);
	const end = parseScalarFilterValue(endRaw, fieldDef);
	return start !== undefined && end !== undefined ? [start, end] : undefined;
}

function parseIsAnyOfFilterValue(rawValue: string): unknown[] {
	try {
		const parsed: unknown = JSON.parse(rawValue);
		if (Array.isArray(parsed)) {
			return parsed;
		}
	} catch {
		// Fall back to a single-value array for leniency.
	}
	return [rawValue];
}

function parseFilterValue(
	rawValue: string | undefined,
	fieldDef: FieldDef,
	operator: ViewFilter["operator"]
): unknown {
	if (operator === "is_true" || operator === "is_false") {
		return undefined;
	}

	if (operator === "between") {
		if (rawValue === undefined || rawValue === "") {
			return undefined;
		}
		return parseBetweenFilterValue(rawValue, fieldDef);
	}

	if (operator === "is_any_of") {
		if (rawValue === undefined || rawValue === "") {
			return undefined;
		}
		return parseIsAnyOfFilterValue(rawValue);
	}

	return parseScalarFilterValue(rawValue, fieldDef);
}

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

		const value = parseFilterValue(vf.value, fieldDef, vf.operator);
		if (
			value === undefined &&
			vf.operator !== "is_true" &&
			vf.operator !== "is_false"
		) {
			skippedCount++;
			continue;
		}

		result.push({
			fieldDefId: vf.fieldDefId,
			logicalOperator: vf.logicalOperator,
			operator: vf.operator,
			value,
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
}

/**
 * Validates the viewDef and objectDef, returning the verified context
 * needed for the calendar query. Throws ConvexError on any failure.
 */
async function validateCalendarView(
	ctx: QueryCtx,
	viewDefId: Id<"viewDefs">,
	orgId: string
): Promise<ValidatedCalendarContext> {
	const viewDef = await ctx.db.get(viewDefId);
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

	return { orgId, objectDefId: viewDef.objectDefId, boundFieldId };
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
	granularity: Granularity
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
		.map(([date, recs]) => ({ date, records: recs }));
}

// ── Query ────────────────────────────────────────────────────────────

export const queryCalendarRecords = crmQuery
	.input({
		viewDefId: v.id("viewDefs"),
		rangeStart: v.number(),
		rangeEnd: v.number(),
		granularity: v.optional(
			v.union(v.literal("day"), v.literal("week"), v.literal("month"))
		),
	})
	.handler(async (ctx, args): Promise<CalendarData> => {
		const orgId = ctx.viewer.orgId;
		if (!orgId) {
			throw new ConvexError("Org context required");
		}

		// Validate range bounds
		if (args.rangeStart > args.rangeEnd) {
			throw new ConvexError("rangeStart must be <= rangeEnd");
		}

		// Validate viewDef, boundField, objectDef
		const { objectDefId, boundFieldId } = await validateCalendarView(
			ctx,
			args.viewDefId,
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

		// Load view-level filters and apply as second pass
		const viewFilterRows = await ctx.db
			.query("viewFilters")
			.withIndex("by_view", (q) => q.eq("viewDefId", args.viewDefId))
			.collect();

		const { filters: parsedFilters, skippedCount: skippedFilters } =
			parseViewFilters(viewFilterRows, fieldDefsById);
		const filtered = applyViewFilters(assembled, parsedFilters, fieldDefsById);

		// Group records by truncated date and sort ascending
		const granularity: Granularity = args.granularity ?? "day";
		const events = groupRecordsByDate(filtered, recordIdToDate, granularity);

		return {
			events,
			range: { start: args.rangeStart, end: args.rangeEnd },
			truncated,
			skippedFilters,
		};
	})
	.public();
