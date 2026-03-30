import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { crmQuery } from "../fluent";
import {
	applyFilters,
	assembleRecords,
	FILTERED_QUERY_CAP,
	loadActiveFieldDefs,
} from "./recordQueries";
import type { RecordFilter, UnifiedRecord } from "./types";

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

// ── View Filter → RecordFilter Conversion ────────────────────────────

type ViewFilter = Doc<"viewFilters">;

/**
 * Maps viewFilter operators to RecordFilter operators.
 * Returns null for `is_not` (requires negation logic) and `between`
 * (requires two-value decomposition), which are not yet supported
 * in the in-memory filter engine.
 */
const VIEW_TO_RECORD_OPERATOR: Record<string, RecordFilter["operator"] | null> =
	{
		equals: "eq",
		is: "eq",
		eq: "eq",
		gt: "gt",
		lt: "lt",
		gte: "gte",
		lte: "lte",
		before: "lt",
		after: "gt",
		contains: "contains",
		starts_with: "starts_with",
		is_any_of: "is_any_of",
		is_true: "is_true",
		is_false: "is_false",
		// Explicitly unsupported — mapped to null so callers can warn
		is_not: null,
		between: null,
	};

function mapViewFilterOperator(
	viewOp: ViewFilter["operator"]
): RecordFilter["operator"] | null {
	return VIEW_TO_RECORD_OPERATOR[viewOp] ?? null;
}

/**
 * Parses a view filter's string value into the appropriate runtime type
 * based on the target field's type.
 */
function parseFilterValue(
	rawValue: string | undefined,
	fieldDef: Doc<"fieldDefs">
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
			// Filter values arrive as strings; parse to numeric unix ms
			// to match recordValuesDate's numeric storage format.
			const n = Number.parseFloat(rawValue);
			return Number.isFinite(n) ? n : undefined;
		}
		case "boolean":
			return rawValue === "true";
		case "multi_select":
		case "select": {
			// Could be a JSON array for is_any_of, or a plain string
			try {
				const parsed: unknown = JSON.parse(rawValue);
				if (Array.isArray(parsed)) {
					return parsed;
				}
			} catch {
				// Not valid JSON — treat as plain string for single-value operators
			}
			return rawValue;
		}
		default:
			return rawValue;
	}
}

/**
 * Converts viewFilter rows into RecordFilter[] suitable for in-memory filtering.
 * Returns both the converted filters and a count of skipped filters so the
 * frontend can surface a warning when filters are silently ignored.
 */
function convertViewFilters(
	viewFilters: ViewFilter[],
	fieldDefsById: Map<string, Doc<"fieldDefs">>
): { filters: RecordFilter[]; skippedCount: number } {
	const result: RecordFilter[] = [];
	let skippedCount = 0;

	for (const vf of viewFilters) {
		const operator = mapViewFilterOperator(vf.operator);
		if (operator === null) {
			skippedCount++;
			continue;
		}

		const fieldDef = fieldDefsById.get(vf.fieldDefId.toString());
		if (!fieldDef) {
			skippedCount++;
			continue;
		}

		// is_true / is_false don't need a value
		if (operator === "is_true" || operator === "is_false") {
			result.push({ fieldDefId: vf.fieldDefId, operator, value: undefined });
			continue;
		}

		const value = parseFilterValue(vf.value, fieldDef);
		if (value === undefined) {
			skippedCount++;
			continue;
		}

		result.push({ fieldDefId: vf.fieldDefId, operator, value });
	}

	return { filters: result, skippedCount };
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

		const { filters: recordFilters, skippedCount: skippedFilters } =
			convertViewFilters(viewFilterRows, fieldDefsById);
		const filtered = applyFilters(assembled, recordFilters, fieldDefsById);

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
