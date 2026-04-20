import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { canAccessCrmOrgScopedRecord } from "../authz/crm";
import { crmQuery } from "../fluent";
import {
	buildEntityViewAdapter,
	buildNormalizedFieldDefinitions,
} from "./entityViewFields";
import { materializeEntityViewRecords } from "./entityViewHydration";
import { materializeRelationFieldValues } from "./relationCellPayloads";
import {
	getNativeRecordById,
	type NativeRecordPage,
	queryNativeRecords,
} from "./systemAdapters/queryAdapter";
import type {
	GetRecordDetailSurfaceResult,
	LinkedRecord,
	QueryRecordsResult,
	RecordFilter,
	RecordSort,
	UnifiedRecord,
} from "./types";
import { entityKindValidator, logicalOperatorValidator } from "./validators";
import { fieldTypeToTable, type ValueTableName } from "./valueRouter";

type FieldDef = Doc<"fieldDefs">;
type DbCtx = Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">;
const OFFSET_CURSOR_PATTERN = /^[0-9]+$/;

interface QueryPaginationOpts {
	cursor: string | null;
	numItems: number;
}

interface QueryRecordsArgs {
	filters?: RecordFilter[];
	objectDefId: Id<"objectDefs">;
	paginationOpts: QueryPaginationOpts;
	sort?: RecordSort;
}

// ── Constants ────────────────────────────────────────────────────────

/**
 * Convex enforces 8,192 document reads per query/mutation.
 * Each record requires ~1 record doc read + up to 8 table scans (one per typed table).
 * Each table scan may return multiple rows. This estimate is conservative for objects
 * with few fields but may undercount for objects with many fields of the same type.
 * We reserve a safety buffer for non-record reads (objectDef, fieldDefs, etc.).
 */
const CONVEX_READ_LIMIT = 8192;
const SAFETY_BUFFER = 192; // headroom for objectDef + fieldDefs + metadata reads
const ESTIMATED_TABLE_QUERIES_PER_RECORD = 8; // one scan per typed value table
export const FILTERED_QUERY_CAP = Math.floor(
	(CONVEX_READ_LIMIT - SAFETY_BUFFER) / (1 + ESTIMATED_TABLE_QUERIES_PER_RECORD)
); // ≈ 888

// ── Helpers: Value Assembly ──────────────────────────────────────────

/**
 * Reads ALL value rows for a given record from a specific typed table.
 * Uses `by_record` index — returns all values for this record in one scan.
 *
 * Convex requires compile-time table names, so we use a switch
 * to dispatch per-table queries.
 */
export async function readValuesFromTable(
	ctx: QueryCtx,
	table: ValueTableName,
	recordId: Id<"records">
): Promise<Array<{ fieldDefId: Id<"fieldDefs">; value: unknown }>> {
	switch (table) {
		case "recordValuesText":
			return ctx.db
				.query("recordValuesText")
				.withIndex("by_record", (q) => q.eq("recordId", recordId))
				.collect();
		case "recordValuesNumber":
			return ctx.db
				.query("recordValuesNumber")
				.withIndex("by_record", (q) => q.eq("recordId", recordId))
				.collect();
		case "recordValuesBoolean":
			return ctx.db
				.query("recordValuesBoolean")
				.withIndex("by_record", (q) => q.eq("recordId", recordId))
				.collect();
		case "recordValuesDate":
			return ctx.db
				.query("recordValuesDate")
				.withIndex("by_record", (q) => q.eq("recordId", recordId))
				.collect();
		case "recordValuesSelect":
			return ctx.db
				.query("recordValuesSelect")
				.withIndex("by_record", (q) => q.eq("recordId", recordId))
				.collect();
		case "recordValuesMultiSelect":
			return ctx.db
				.query("recordValuesMultiSelect")
				.withIndex("by_record", (q) => q.eq("recordId", recordId))
				.collect();
		case "recordValuesRichText":
			return ctx.db
				.query("recordValuesRichText")
				.withIndex("by_record", (q) => q.eq("recordId", recordId))
				.collect();
		case "recordValuesUserRef":
			return ctx.db
				.query("recordValuesUserRef")
				.withIndex("by_record", (q) => q.eq("recordId", recordId))
				.collect();
		default: {
			const _exhaustive: never = table;
			throw new ConvexError(`Unknown value table: ${String(_exhaustive)}`);
		}
	}
}

/**
 * Assembles a single record's field values from typed EAV tables.
 * Only queries tables that the object's fields actually use
 * (optimization: skip tables with no relevant fields).
 */
export async function assembleRecordFields(
	ctx: QueryCtx,
	recordId: Id<"records">,
	fieldDefs: FieldDef[]
): Promise<Record<string, unknown>> {
	// Determine which value tables this object's fields use
	const tableSet = new Set<ValueTableName>();
	for (const fd of fieldDefs) {
		tableSet.add(fieldTypeToTable(fd.fieldType));
	}

	// Build fieldDefId → fieldName lookup
	const fieldNameById = new Map<string, string>();
	for (const fd of fieldDefs) {
		fieldNameById.set(fd._id.toString(), fd.name);
	}

	const fields: Record<string, unknown> = {};

	// Query only relevant tables (parallel within transaction)
	const tableQueries = [...tableSet].map(async (table) => {
		const rows = await readValuesFromTable(ctx, table, recordId);
		for (const row of rows) {
			const name = fieldNameById.get(row.fieldDefId.toString());
			if (name) {
				fields[name] = row.value;
			}
		}
	});

	await Promise.all(tableQueries);
	return fields;
}

/**
 * Assembles a batch of record docs into UnifiedRecord[].
 * Uses Promise.all for parallel fan-out across records.
 */
export async function assembleRecords(
	ctx: QueryCtx,
	records: Doc<"records">[],
	fieldDefs: FieldDef[]
): Promise<UnifiedRecord[]> {
	return Promise.all(
		records.map(async (record) => ({
			_id: record._id as string,
			_kind: "record" as const,
			nativeTable: null,
			objectDefId: record.objectDefId,
			fields: await assembleRecordFields(ctx, record._id, fieldDefs),
			createdAt: record.createdAt,
			updatedAt: record.updatedAt,
		}))
	);
}

// ── Helpers: Filtering ───────────────────────────────────────────────

export function matchesFilter(
	fieldValue: unknown,
	operator: RecordFilter["operator"],
	filterValue: unknown
): boolean {
	switch (operator) {
		case "equals":
		case "is":
		case "eq":
			return fieldValue === filterValue;
		case "is_not":
			return fieldValue !== filterValue;
		case "gt":
		case "after":
			return (
				typeof fieldValue === "number" &&
				typeof filterValue === "number" &&
				fieldValue > filterValue
			);
		case "lt":
		case "before":
			return (
				typeof fieldValue === "number" &&
				typeof filterValue === "number" &&
				fieldValue < filterValue
			);
		case "gte":
			return (
				typeof fieldValue === "number" &&
				typeof filterValue === "number" &&
				fieldValue >= filterValue
			);
		case "lte":
			return (
				typeof fieldValue === "number" &&
				typeof filterValue === "number" &&
				fieldValue <= filterValue
			);
		case "between": {
			if (
				typeof fieldValue !== "number" ||
				!Array.isArray(filterValue) ||
				filterValue.length !== 2
			) {
				return false;
			}
			const [start, end] = filterValue;
			return (
				typeof start === "number" &&
				typeof end === "number" &&
				fieldValue >= start &&
				fieldValue <= end
			);
		}
		case "contains":
			return (
				typeof fieldValue === "string" &&
				typeof filterValue === "string" &&
				fieldValue.toLowerCase().includes(filterValue.toLowerCase())
			);
		case "starts_with":
			return (
				typeof fieldValue === "string" &&
				typeof filterValue === "string" &&
				fieldValue.toLowerCase().startsWith(filterValue.toLowerCase())
			);
		case "is_any_of": {
			if (!Array.isArray(filterValue)) {
				return false;
			}
			if (Array.isArray(fieldValue)) {
				return fieldValue.some((value) => filterValue.includes(value));
			}
			return filterValue.includes(fieldValue);
		}
		case "is_true":
			return fieldValue === true;
		case "is_false":
			return fieldValue === false;
		default: {
			const _exhaustive: never = operator;
			throw new Error(`Unknown filter operator: ${String(_exhaustive)}`);
		}
	}
}

function parseScalarFilterValue(
	rawValue: unknown,
	fieldDef: FieldDef
): unknown {
	if (rawValue === undefined || rawValue === null || rawValue === "") {
		return undefined;
	}

	if (typeof rawValue !== "string") {
		return rawValue;
	}

	switch (fieldDef.fieldType) {
		case "number":
		case "currency":
		case "percentage":
		case "date":
		case "datetime": {
			const parsedNumber = Number.parseFloat(rawValue);
			return Number.isFinite(parsedNumber) ? parsedNumber : undefined;
		}
		case "boolean":
			return rawValue === "true";
		default:
			return rawValue;
	}
}

function parseRangeBoundary(value: unknown, fieldDef: FieldDef): unknown {
	return parseScalarFilterValue(value, fieldDef);
}

function parseBetweenFilterValue(
	rawValue: unknown,
	fieldDef: FieldDef
): [unknown, unknown] | undefined {
	if (Array.isArray(rawValue) && rawValue.length === 2) {
		const [start, end] = rawValue;
		const parsedStart = parseRangeBoundary(start, fieldDef);
		const parsedEnd = parseRangeBoundary(end, fieldDef);
		return parsedStart !== undefined && parsedEnd !== undefined
			? [parsedStart, parsedEnd]
			: undefined;
	}

	if (typeof rawValue === "string") {
		try {
			const parsed: unknown = JSON.parse(rawValue);
			if (Array.isArray(parsed) && parsed.length === 2) {
				const [start, end] = parsed;
				const parsedStart = parseRangeBoundary(start, fieldDef);
				const parsedEnd = parseRangeBoundary(end, fieldDef);
				return parsedStart !== undefined && parsedEnd !== undefined
					? [parsedStart, parsedEnd]
					: undefined;
			}
		} catch {
			// Fall through to legacy comma-delimited parsing.
		}

		const [startRaw, endRaw, ...rest] = rawValue
			.split(",")
			.map((part) => part.trim());
		if (!(startRaw && endRaw) || rest.length > 0) {
			return undefined;
		}

		const parsedStart = parseScalarFilterValue(startRaw, fieldDef);
		const parsedEnd = parseScalarFilterValue(endRaw, fieldDef);
		return parsedStart !== undefined && parsedEnd !== undefined
			? [parsedStart, parsedEnd]
			: undefined;
	}

	return undefined;
}

function parseIsAnyOfFilterValue(rawValue: unknown): unknown[] | undefined {
	if (rawValue === undefined || rawValue === null || rawValue === "") {
		return undefined;
	}

	if (Array.isArray(rawValue)) {
		return rawValue;
	}

	if (typeof rawValue === "string") {
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

	return [rawValue];
}

export function normalizeFilterValue(
	filterValue: unknown,
	fieldDef: FieldDef,
	operator: RecordFilter["operator"]
): unknown {
	if (operator === "is_true" || operator === "is_false") {
		return undefined;
	}

	if (operator === "between") {
		return parseBetweenFilterValue(filterValue, fieldDef);
	}

	if (operator === "is_any_of") {
		return parseIsAnyOfFilterValue(filterValue);
	}

	return parseScalarFilterValue(filterValue, fieldDef);
}

/**
 * Applies field-level filters in-memory.
 * Filters are evaluated left-to-right and respect each filter's logicalOperator,
 * defaulting to AND when omitted.
 */
export function applyFilters(
	records: UnifiedRecord[],
	filters: RecordFilter[],
	fieldDefsById: Map<string, FieldDef>
): UnifiedRecord[] {
	// No filters = no constraints; return all records (permissive empty case)
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

			const normalizedValue = normalizeFilterValue(
				filter.value,
				fieldDef,
				filter.operator
			);
			if (
				normalizedValue === undefined &&
				filter.operator !== "is_true" &&
				filter.operator !== "is_false"
			) {
				return false;
			}

			const fieldValue = record.fields[fieldDef.name];
			const nextMatch = matchesFilter(
				fieldValue,
				filter.operator,
				normalizedValue
			);

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

// ── Helpers: Sorting ─────────────────────────────────────────────────

export function applySort(
	records: UnifiedRecord[],
	sort: RecordSort | undefined,
	fieldDefsById: Map<string, FieldDef>
): UnifiedRecord[] {
	if (!sort) {
		return records;
	}

	const fieldDef = fieldDefsById.get(sort.fieldDefId.toString());
	if (!fieldDef) {
		return records;
	}

	const fieldName = fieldDef.name;
	const dir = sort.direction === "desc" ? -1 : 1;

	return [...records].sort((a, b) => {
		const va = a.fields[fieldName];
		const vb = b.fields[fieldName];
		if (va === vb) {
			return 0;
		}
		if (va == null) {
			return 1;
		}
		if (vb == null) {
			return -1;
		}
		if (typeof va === "number" && typeof vb === "number") {
			return (va - vb) * dir;
		}
		if (typeof va === "string" && typeof vb === "string") {
			return va.localeCompare(vb) * dir;
		}
		return 0;
	});
}

// ── Helpers: Shared ──────────────────────────────────────────────────

export async function loadActiveFieldDefs(
	ctx: DbCtx,
	objectDefId: Id<"objectDefs">
): Promise<FieldDef[]> {
	const allFieldDefs = await ctx.db
		.query("fieldDefs")
		.withIndex("by_object", (q) => q.eq("objectDefId", objectDefId))
		.collect();
	return allFieldDefs.filter((fd) => fd.isActive);
}

async function resolveLinkedRecords(
	ctx: QueryCtx,
	links: Doc<"recordLinks">[],
	direction: "outbound" | "inbound"
): Promise<LinkedRecord[]> {
	return Promise.all(
		links.map(async (link) => {
			const peerRecordId =
				direction === "outbound" ? link.targetId : link.sourceId;
			const peerKind =
				direction === "outbound" ? link.targetKind : link.sourceKind;
			const peerObjectDefId =
				direction === "outbound"
					? link.targetObjectDefId
					: link.sourceObjectDefId;

			let labelValue: string | undefined;
			if (peerKind === "record") {
				const peerRecord = await ctx.db.get(peerRecordId as Id<"records">);
				labelValue = peerRecord?.labelValue ?? undefined;
			}

			return {
				linkId: link._id,
				linkTypeDefId: link.linkTypeDefId,
				recordId: peerRecordId,
				recordKind: peerKind,
				objectDefId: peerObjectDefId,
				labelValue,
			};
		})
	);
}

async function loadLinksForReference(
	ctx: QueryCtx,
	orgId: string,
	recordKind: "record" | "native",
	recordId: string
): Promise<{ inbound: LinkedRecord[]; outbound: LinkedRecord[] }> {
	const [outboundLinks, inboundLinks] = await Promise.all([
		ctx.db
			.query("recordLinks")
			.withIndex("by_org_source", (q) =>
				q
					.eq("orgId", orgId)
					.eq("sourceKind", recordKind)
					.eq("sourceId", recordId)
			)
			.filter((q) => q.eq(q.field("isDeleted"), false))
			.collect(),
		ctx.db
			.query("recordLinks")
			.withIndex("by_org_target", (q) =>
				q
					.eq("orgId", orgId)
					.eq("targetKind", recordKind)
					.eq("targetId", recordId)
			)
			.filter((q) => q.eq(q.field("isDeleted"), false))
			.collect(),
	]);

	return {
		outbound: await resolveLinkedRecords(ctx, outboundLinks, "outbound"),
		inbound: await resolveLinkedRecords(ctx, inboundLinks, "inbound"),
	};
}

async function loadReferencedRecord(args: {
	activeFieldDefs: FieldDef[];
	ctx: QueryCtx;
	objectDef: Doc<"objectDefs">;
	orgId: string;
	recordId: string;
	recordKind: "record" | "native";
	viewer: {
		isFairLendAdmin: boolean;
		orgId?: string | null;
	};
}): Promise<UnifiedRecord> {
	if (args.recordKind === "record") {
		const normalizedId = args.ctx.db.normalizeId("records", args.recordId);
		if (!normalizedId) {
			throw new ConvexError("Record not found or access denied");
		}

		const recordDoc = await args.ctx.db.get(normalizedId);
		if (
			!(recordDoc && canAccessCrmOrgScopedRecord(args.viewer, recordDoc)) ||
			recordDoc.isDeleted ||
			recordDoc.objectDefId !== args.objectDef._id
		) {
			throw new ConvexError("Record not found or access denied");
		}

		return {
			_id: recordDoc._id as string,
			_kind: "record",
			nativeTable: null,
			objectDefId: recordDoc.objectDefId,
			fields: await assembleRecordFields(
				args.ctx,
				recordDoc._id,
				args.activeFieldDefs
			),
			createdAt: recordDoc.createdAt,
			updatedAt: recordDoc.updatedAt,
		};
	}

	if (!(args.objectDef.isSystem && args.objectDef.nativeTable)) {
		throw new ConvexError("Native record detail requires a system object");
	}

	const nativeRecord = await getNativeRecordById(
		args.ctx,
		args.objectDef,
		args.activeFieldDefs,
		args.orgId,
		args.recordId
	);
	if (!nativeRecord) {
		throw new ConvexError("Record not found or access denied");
	}

	return nativeRecord;
}

function hasFiltersOrSort(args: QueryRecordsArgs): boolean {
	return (args.filters?.length ?? 0) > 0 || args.sort !== undefined;
}

function stripTaggedCursor(
	cursor: string | null,
	tag: "native" | "offset"
): string | null {
	const prefix = `${tag}:`;
	return cursor?.startsWith(prefix) ? cursor.slice(prefix.length) : cursor;
}

function parseOffsetCursor(cursor: string | null): number {
	if (cursor == null) {
		return 0;
	}

	const cursorBody = stripTaggedCursor(cursor, "offset") ?? cursor;
	if (!OFFSET_CURSOR_PATTERN.test(cursorBody)) {
		throw new ConvexError("Invalid pagination cursor");
	}

	const offset = Number.parseInt(cursorBody, 10);
	if (!Number.isFinite(offset) || offset < 0) {
		throw new ConvexError("Invalid pagination cursor");
	}

	return offset;
}

async function collectNativeRecordsForFiltering(
	ctx: QueryCtx,
	objectDef: Doc<"objectDefs">,
	fieldDefs: FieldDef[],
	orgId: string,
	limit: number
): Promise<{ records: UnifiedRecord[]; truncated: boolean }> {
	const records: UnifiedRecord[] = [];
	let cursor: string | null = null;
	let isDone = false;

	while (!isDone && records.length <= limit) {
		const pageSize = limit + 1 - records.length;
		const nativePage: NativeRecordPage = await queryNativeRecords(
			ctx,
			objectDef,
			fieldDefs,
			orgId,
			{
				cursor,
				numItems: pageSize,
			}
		);

		records.push(...nativePage.records);
		cursor = nativePage.continueCursor;
		isDone = nativePage.isDone;
	}

	const truncated = records.length > limit || !isDone;
	return {
		records: truncated ? records.slice(0, limit) : records,
		truncated,
	};
}

async function queryNativeRecordPage(
	ctx: QueryCtx,
	orgId: string,
	objectDef: Doc<"objectDefs">,
	args: QueryRecordsArgs,
	activeFieldDefs: FieldDef[]
): Promise<QueryRecordsResult> {
	const nativeCursor = stripTaggedCursor(args.paginationOpts.cursor, "native");

	if (objectDef.isSystem && objectDef.nativeTable) {
		const nativePage = await queryNativeRecords(
			ctx,
			objectDef,
			activeFieldDefs,
			orgId,
			{
				...args.paginationOpts,
				cursor: nativeCursor,
			}
		);

		return {
			records: nativePage.records,
			continueCursor: nativePage.isDone
				? null
				: `native:${nativePage.continueCursor}`,
			isDone: nativePage.isDone,
			truncated: false,
		};
	}

	const paginationResult = await ctx.db
		.query("records")
		.withIndex("by_org_object", (q) =>
			q.eq("orgId", orgId).eq("objectDefId", args.objectDefId)
		)
		.filter((q) => q.eq(q.field("isDeleted"), false))
		.paginate({
			...args.paginationOpts,
			cursor: nativeCursor,
		});

	const assembled = await assembleRecords(
		ctx,
		paginationResult.page,
		activeFieldDefs
	);

	return {
		records: assembled,
		continueCursor: paginationResult.isDone
			? null
			: `native:${paginationResult.continueCursor}`,
		isDone: paginationResult.isDone,
		truncated: false,
	};
}

async function queryFilteredRecordPage(
	ctx: QueryCtx,
	orgId: string,
	objectDef: Doc<"objectDefs">,
	args: QueryRecordsArgs,
	activeFieldDefs: FieldDef[],
	fieldDefsById: Map<string, FieldDef>
): Promise<QueryRecordsResult> {
	let assembled: UnifiedRecord[];
	let truncated: boolean;

	if (objectDef.isSystem && objectDef.nativeTable) {
		const nativeResult = await collectNativeRecordsForFiltering(
			ctx,
			objectDef,
			activeFieldDefs,
			orgId,
			FILTERED_QUERY_CAP
		);
		assembled = nativeResult.records;
		truncated = nativeResult.truncated;
	} else {
		const allRecords = await ctx.db
			.query("records")
			.withIndex("by_org_object", (q) =>
				q.eq("orgId", orgId).eq("objectDefId", args.objectDefId)
			)
			.filter((q) => q.eq(q.field("isDeleted"), false))
			.take(FILTERED_QUERY_CAP + 1);

		truncated = allRecords.length > FILTERED_QUERY_CAP;
		const capped = truncated
			? allRecords.slice(0, FILTERED_QUERY_CAP)
			: allRecords;
		assembled = await assembleRecords(ctx, capped, activeFieldDefs);
	}

	const filtered = applyFilters(assembled, args.filters ?? [], fieldDefsById);
	const sorted = applySort(filtered, args.sort, fieldDefsById);
	const offset = parseOffsetCursor(args.paginationOpts.cursor);
	const page = sorted.slice(offset, offset + args.paginationOpts.numItems);
	const nextOffset = offset + args.paginationOpts.numItems;
	const isDone = nextOffset >= sorted.length;

	return {
		records: page,
		continueCursor: isDone ? null : `offset:${String(nextOffset)}`,
		isDone,
		truncated,
	};
}

// ── Query Functions ──────────────────────────────────────────────────

// ── queryRecords ─────────────────────────────────────────────────────
export const queryRecords = crmQuery
	.input({
		objectDefId: v.id("objectDefs"),
		filters: v.optional(
			v.array(
				v.object({
					fieldDefId: v.id("fieldDefs"),
					logicalOperator: v.optional(logicalOperatorValidator),
					operator: v.union(
						v.literal("eq"),
						v.literal("gt"),
						v.literal("lt"),
						v.literal("gte"),
						v.literal("lte"),
						v.literal("contains"),
						v.literal("starts_with"),
						v.literal("is_any_of"),
						v.literal("is_true"),
						v.literal("is_false")
					),
					value: v.union(
						v.string(),
						v.number(),
						v.boolean(),
						v.array(v.string()),
						v.null()
					),
				})
			)
		),
		sort: v.optional(
			v.object({
				fieldDefId: v.id("fieldDefs"),
				direction: v.union(v.literal("asc"), v.literal("desc")),
			})
		),
		paginationOpts: v.object({
			numItems: v.number(),
			cursor: v.union(v.string(), v.null()),
		}),
	})
	.handler(async (ctx, args) => {
		const objectDef = await ctx.db.get(args.objectDefId);
		if (
			!(
				canAccessCrmOrgScopedRecord(ctx.viewer, objectDef) && objectDef.isActive
			)
		) {
			throw new ConvexError("Object not found or access denied");
		}
		const orgId = objectDef.orgId;
		if (!orgId) {
			throw new ConvexError("Object org context required");
		}

		if (objectDef.isSystem && !objectDef.nativeTable) {
			throw new ConvexError(
				"System object queries not yet implemented (see ENG-255)"
			);
		}

		const activeFieldDefs = await loadActiveFieldDefs(ctx, args.objectDefId);

		const rawNumItems = args.paginationOpts.numItems;
		if (!Number.isFinite(rawNumItems) || rawNumItems < 1) {
			throw new ConvexError(
				"paginationOpts.numItems must be a positive number"
			);
		}

		const fieldDefsById = new Map(
			activeFieldDefs.map((fd) => [fd._id.toString(), fd])
		);
		const adapterContract = buildEntityViewAdapter({
			currentLayout: "table",
			fieldDefs: activeFieldDefs,
			objectDef,
			objectDefId: objectDef._id,
		});

		if (!hasFiltersOrSort(args)) {
			const page = await queryNativeRecordPage(
				ctx,
				orgId,
				objectDef,
				args,
				activeFieldDefs
			);
			return {
				...page,
				records: await materializeEntityViewRecords({
					adapterContract,
					ctx,
					objectDef,
					orgId,
					records: page.records,
				}),
			};
		}

		const page = await queryFilteredRecordPage(
			ctx,
			orgId,
			objectDef,
			args,
			activeFieldDefs,
			fieldDefsById
		);
		return {
			...page,
			records: await materializeEntityViewRecords({
				adapterContract,
				ctx,
				objectDef,
				orgId,
				records: page.records,
			}),
		};
	})
	.public();

// ── getRecord ────────────────────────────────────────────────────────
export const getRecord = crmQuery
	.input({ recordId: v.id("records") })
	.handler(async (ctx, args) => {
		const record = await ctx.db.get(args.recordId);
		if (!canAccessCrmOrgScopedRecord(ctx.viewer, record) || record.isDeleted) {
			throw new ConvexError("Record not found or access denied");
		}
		const orgId = record.orgId;
		if (!orgId) {
			throw new ConvexError("Record org context required");
		}

		const objectDef = await ctx.db.get(record.objectDefId);
		if (
			!(
				canAccessCrmOrgScopedRecord(ctx.viewer, objectDef) && objectDef.isActive
			)
		) {
			throw new ConvexError("Object not found or access denied");
		}
		if (objectDef.isSystem) {
			// getRecord takes Id<"records"> — native entities don't live in the records table.
			// Full native getRecord requires (nativeTable, nativeId) — deferred to a follow-up.
			throw new ConvexError(
				"getRecord for system objects not yet supported — use queryRecords instead"
			);
		}

		// 3. Load fieldDefs
		const activeFieldDefs = await loadActiveFieldDefs(ctx, record.objectDefId);

		// 4. Assemble field values
		const fields = await assembleRecordFields(ctx, record._id, activeFieldDefs);

		const unifiedRecord: UnifiedRecord = {
			_id: record._id as string,
			_kind: "record",
			nativeTable: null,
			objectDefId: record.objectDefId,
			fields,
			createdAt: record.createdAt,
			updatedAt: record.updatedAt,
		};

		return {
			record: unifiedRecord,
			links: await loadLinksForReference(ctx, orgId, "record", `${record._id}`),
		};
	})
	.public();

export const getRecordReference = crmQuery
	.input({
		objectDefId: v.id("objectDefs"),
		recordId: v.string(),
		recordKind: entityKindValidator,
	})
	.handler(async (ctx, args) => {
		const objectDef = await ctx.db.get(args.objectDefId);
		if (
			!(
				canAccessCrmOrgScopedRecord(ctx.viewer, objectDef) && objectDef.isActive
			)
		) {
			throw new ConvexError("Object not found or access denied");
		}
		const orgId = objectDef.orgId;
		if (!orgId) {
			throw new ConvexError("Object org context required");
		}

		const activeFieldDefs = await loadActiveFieldDefs(ctx, args.objectDefId);
		const record = await loadReferencedRecord({
			activeFieldDefs,
			ctx,
			objectDef,
			orgId,
			recordId: args.recordId,
			recordKind: args.recordKind,
			viewer: ctx.viewer,
		});

		return {
			record,
			links: await loadLinksForReference(
				ctx,
				orgId,
				args.recordKind,
				args.recordId
			),
		};
	})
	.public();

export const getRecordDetailSurface = crmQuery
	.input({
		objectDefId: v.id("objectDefs"),
		recordId: v.string(),
		recordKind: entityKindValidator,
	})
	.handler(async (ctx, args): Promise<GetRecordDetailSurfaceResult> => {
		const objectDef = await ctx.db.get(args.objectDefId);
		if (
			!(
				canAccessCrmOrgScopedRecord(ctx.viewer, objectDef) && objectDef.isActive
			)
		) {
			throw new ConvexError("Object not found or access denied");
		}
		const orgId = objectDef.orgId;
		if (!orgId) {
			throw new ConvexError("Object org context required");
		}

		const activeFieldDefs = await loadActiveFieldDefs(ctx, args.objectDefId);
		const adapterContract = buildEntityViewAdapter({
			currentLayout: "table",
			fieldDefs: activeFieldDefs,
			objectDef,
			objectDefId: objectDef._id,
		});
		const fields = buildNormalizedFieldDefinitions({
			adapterContract,
			applyLayoutVisibility: false,
			currentLayout: "table",
			fieldDefs: activeFieldDefs,
			objectDefId: objectDef._id,
			viewIsDefault: true,
		});
		const [record] = await materializeRelationFieldValues({
			ctx,
			fields,
			objectDef,
			orgId,
			records: await materializeEntityViewRecords({
				adapterContract,
				ctx,
				objectDef,
				orgId,
				records: [
					await loadReferencedRecord({
						activeFieldDefs,
						ctx,
						objectDef,
						orgId,
						recordId: args.recordId,
						recordKind: args.recordKind,
						viewer: ctx.viewer,
					}),
				],
			}),
		});

		return {
			adapterContract,
			fields,
			objectDef,
			record,
		};
	})
	.public();

// ── searchRecords ────────────────────────────────────────────────────
export const searchRecords = crmQuery
	.input({
		objectDefId: v.id("objectDefs"),
		query: v.string(),
		limit: v.optional(v.number()),
	})
	.handler(async (ctx, args) => {
		const objectDef = await ctx.db.get(args.objectDefId);
		if (
			!(
				canAccessCrmOrgScopedRecord(ctx.viewer, objectDef) && objectDef.isActive
			)
		) {
			throw new ConvexError("Object not found or access denied");
		}
		const orgId = objectDef.orgId;
		if (!orgId) {
			throw new ConvexError("Object org context required");
		}
		if (objectDef.isSystem) {
			// Native tables don't have a search index on labelValue.
			// Return empty results for v1 — full native search is a future enhancement.
			return [];
		}

		// 2. Validate and clamp limit
		const rawLimit = args.limit ?? 20;
		if (rawLimit < 1) {
			throw new ConvexError("Limit must be a positive number");
		}
		const MAX_LIMIT = 100;
		const limit = rawLimit > MAX_LIMIT ? MAX_LIMIT : rawLimit;

		// 3. Search using Convex search index — O(results), not O(all records)
		const results = await ctx.db
			.query("records")
			.withSearchIndex("search_label", (q) =>
				q
					.search("labelValue", args.query)
					.eq("orgId", orgId)
					.eq("objectDefId", args.objectDefId)
					.eq("isDeleted", false)
			)
			.take(limit);

		// 4. Assemble matching records
		const activeFieldDefs = await loadActiveFieldDefs(ctx, args.objectDefId);

		return assembleRecords(ctx, results, activeFieldDefs);
	})
	.public();
