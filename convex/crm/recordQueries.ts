import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { crmQuery } from "../fluent";
import type {
	LinkedRecord,
	RecordFilter,
	RecordSort,
	UnifiedRecord,
} from "./types";
import { queryNativeRecords } from "./systemAdapters/queryAdapter";
import { type ValueTableName, fieldTypeToTable } from "./valueRouter";

type FieldDef = Doc<"fieldDefs">;

// ── Constants ────────────────────────────────────────────────────────

/**
 * Convex enforces 8,192 document reads per query/mutation.
 * Each record requires ~1 record doc + up to ~8 value rows (one per typed table),
 * plus field-def reads. We reserve a safety buffer for non-record reads
 * (objectDef, fieldDefs, etc.) and derive the cap from the hard limit.
 */
const CONVEX_READ_LIMIT = 8192;
const SAFETY_BUFFER = 192; // headroom for objectDef + fieldDefs + metadata reads
const ESTIMATED_VALUE_ROWS_PER_RECORD = 8; // worst case: one value row per typed table
const FILTERED_QUERY_CAP = Math.floor(
	(CONVEX_READ_LIMIT - SAFETY_BUFFER) / (1 + ESTIMATED_VALUE_ROWS_PER_RECORD)
); // ≈ 888

// ── Helpers: Value Assembly ──────────────────────────────────────────

/**
 * Reads ALL value rows for a given record from a specific typed table.
 * Uses `by_record` index — returns all values for this record in one scan.
 *
 * Convex requires compile-time table names, so we use the same switch
 * pattern as `writeValue`/`readExistingValue` in records.ts.
 */
async function readValuesFromTable(
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
async function assembleRecordFields(
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
async function assembleRecords(
	ctx: QueryCtx,
	records: Doc<"records">[],
	fieldDefs: FieldDef[]
): Promise<UnifiedRecord[]> {
	return Promise.all(
		records.map(async (record) => ({
			_id: record._id as string,
			_kind: "record" as const,
			objectDefId: record.objectDefId,
			fields: await assembleRecordFields(ctx, record._id, fieldDefs),
			createdAt: record.createdAt,
			updatedAt: record.updatedAt,
		}))
	);
}

// ── Helpers: Filtering ───────────────────────────────────────────────

function matchesFilter(
	fieldValue: unknown,
	operator: RecordFilter["operator"],
	filterValue: unknown
): boolean {
	switch (operator) {
		case "eq":
			return fieldValue === filterValue;
		case "gt":
			return (
				typeof fieldValue === "number" &&
				typeof filterValue === "number" &&
				fieldValue > filterValue
			);
		case "lt":
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
		default:
			return false; // fail-closed: unknown operators never match
	}
}

/**
 * Applies field-level filters in-memory.
 * All filters are AND'd together (every filter must match).
 */
function applyFilters(
	records: UnifiedRecord[],
	filters: RecordFilter[],
	fieldDefsById: Map<string, FieldDef>
): UnifiedRecord[] {
	if (filters.length === 0) return records;

	return records.filter((record) =>
		filters.every((filter) => {
			const fieldDef = fieldDefsById.get(filter.fieldDefId.toString());
			if (!fieldDef) return false; // fail-closed: unknown fieldDefId never matches
			const fieldValue = record.fields[fieldDef.name];
			return matchesFilter(fieldValue, filter.operator, filter.value);
		})
	);
}

// ── Helpers: Sorting ─────────────────────────────────────────────────

function applySort(
	records: UnifiedRecord[],
	sort: RecordSort | undefined,
	fieldDefsById: Map<string, FieldDef>
): UnifiedRecord[] {
	if (!sort) return records;

	const fieldDef = fieldDefsById.get(sort.fieldDefId.toString());
	if (!fieldDef) return records;

	const fieldName = fieldDef.name;
	const dir = sort.direction === "desc" ? -1 : 1;

	return [...records].sort((a, b) => {
		const va = a.fields[fieldName];
		const vb = b.fields[fieldName];
		if (va === vb) return 0;
		if (va == null) return 1;
		if (vb == null) return -1;
		if (typeof va === "number" && typeof vb === "number")
			return (va - vb) * dir;
		if (typeof va === "string" && typeof vb === "string")
			return va.localeCompare(vb) * dir;
		return 0;
	});
}

// ── Helpers: Shared ──────────────────────────────────────────────────

async function loadActiveFieldDefs(
	ctx: QueryCtx,
	objectDefId: Id<"objectDefs">
): Promise<FieldDef[]> {
	const allFieldDefs = await ctx.db
		.query("fieldDefs")
		.withIndex("by_object", (q) => q.eq("objectDefId", objectDefId))
		.collect();
	return allFieldDefs.filter((fd) => fd.isActive);
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
		const nativePage = await queryNativeRecords(
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

// ── Query Functions ──────────────────────────────────────────────────

// ── queryRecords ─────────────────────────────────────────────────────
export const queryRecords = crmQuery
	.input({
		objectDefId: v.id("objectDefs"),
		filters: v.optional(
			v.array(
				v.object({
					fieldDefId: v.id("fieldDefs"),
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
					value: v.any(),
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
			cursor: v.union(v.string(), v.null_()),
		}),
	})
	.handler(async (ctx, args) => {
		const orgId = ctx.viewer.orgId;
		if (!orgId) {
			throw new ConvexError("Org context required");
		}

		// 1. Load + verify objectDef
		const objectDef = await ctx.db.get(args.objectDefId);
		if (!objectDef || objectDef.orgId !== orgId || !objectDef.isActive) {
			throw new ConvexError("Object not found or access denied");
		}

		// 2. Load active fieldDefs (needed by both native and EAV paths)
		const activeFieldDefs = await loadActiveFieldDefs(
			ctx,
			args.objectDefId
		);

		// 3. Shared filter/sort metadata for both native and EAV paths.
		const fieldDefsById = new Map(
			activeFieldDefs.map((fd) => [fd._id.toString(), fd])
		);

		const hasFiltersOrSort =
			(args.filters && args.filters.length > 0) || args.sort;

		// ── PATH A: No filters/sort — native Convex pagination (hot path) ──
		if (!hasFiltersOrSort) {
			if (objectDef.isSystem && objectDef.nativeTable) {
				const rawCursor = args.paginationOpts.cursor;
				const nativeCursor =
					rawCursor && rawCursor.startsWith("native:")
						? rawCursor.slice("native:".length)
						: rawCursor;

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

			// Parse tagged cursor: strip "native:" prefix if present, pass raw to Convex
			const rawCursor = args.paginationOpts.cursor;
			const nativeCursor =
				rawCursor && rawCursor.startsWith("native:")
					? rawCursor.slice("native:".length)
					: rawCursor;

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

		// ── PATH B: Filters/sort — collect, assemble, filter, sort, slice ──
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

		const filters = (args.filters ?? []) as RecordFilter[];
		const filtered = applyFilters(assembled, filters, fieldDefsById);
		const sorted = applySort(
			filtered,
			args.sort as RecordSort | undefined,
			fieldDefsById
		);

		// Offset-based pagination for filtered results — validate cursor
		const { cursor, numItems: pageSize } = args.paginationOpts;
		let offset = 0;
		if (cursor != null) {
			// Strip "offset:" tag if present
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
		const page = sorted.slice(offset, offset + pageSize);
		const nextOffset = offset + pageSize;
		const isDone = nextOffset >= sorted.length;

		return {
			records: page,
			continueCursor: isDone ? null : `offset:${String(nextOffset)}`,
			isDone,
			truncated,
		};
	})
	.public();

// ── getRecord ────────────────────────────────────────────────────────
export const getRecord = crmQuery
	.input({ recordId: v.id("records") })
	.handler(async (ctx, args) => {
		const orgId = ctx.viewer.orgId;
		if (!orgId) {
			throw new ConvexError("Org context required");
		}

		// 1. Load record + verify org
		const record = await ctx.db.get(args.recordId);
		if (!record || record.orgId !== orgId || record.isDeleted) {
			throw new ConvexError("Record not found or access denied");
		}

		// 2. Load + verify objectDef (active, org-scoped, system check)
		const objectDef = await ctx.db.get(record.objectDefId);
		if (!objectDef || objectDef.orgId !== orgId || !objectDef.isActive) {
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
		const activeFieldDefs = await loadActiveFieldDefs(
			ctx,
			record.objectDefId
		);

		// 4. Assemble field values
		const fields = await assembleRecordFields(
			ctx,
			record._id,
			activeFieldDefs
		);

		const unifiedRecord: UnifiedRecord = {
			_id: record._id as string,
			_kind: "record",
			objectDefId: record.objectDefId,
			fields,
			createdAt: record.createdAt,
			updatedAt: record.updatedAt,
		};

		// 5. Load outbound links (this record is source)
		const outboundLinks = await ctx.db
			.query("recordLinks")
			.withIndex("by_org_source", (q) =>
				q
					.eq("orgId", orgId)
					.eq("sourceKind", "record")
					.eq("sourceId", record._id as string)
			)
			.filter((q) => q.eq(q.field("isDeleted"), false))
			.collect();

		// 6. Load inbound links (this record is target)
		const inboundLinks = await ctx.db
			.query("recordLinks")
			.withIndex("by_org_target", (q) =>
				q
					.eq("orgId", orgId)
					.eq("targetKind", "record")
					.eq("targetId", record._id as string)
			)
			.filter((q) => q.eq(q.field("isDeleted"), false))
			.collect();

		// 7. Resolve link display info (lightweight — labelValue only)
		const resolveLinks = async (
			links: Doc<"recordLinks">[],
			direction: "outbound" | "inbound"
		): Promise<LinkedRecord[]> => {
			return Promise.all(
				links.map(async (link) => {
					const peerRecordId =
						direction === "outbound" ? link.targetId : link.sourceId;
					const peerKind =
						direction === "outbound"
							? link.targetKind
							: link.sourceKind;
					const peerObjectDefId =
						direction === "outbound"
							? link.targetObjectDefId
							: link.sourceObjectDefId;

					let labelValue: string | undefined;
					if (peerKind === "record") {
						const peerRecord = await ctx.db.get(
							peerRecordId as Id<"records">
						);
						labelValue = peerRecord?.labelValue ?? undefined;
					}

					return {
						linkId: link._id as string,
						linkTypeDefId: link.linkTypeDefId,
						recordId: peerRecordId,
						recordKind: peerKind,
						objectDefId: peerObjectDefId,
						labelValue,
					};
				})
			);
		};

		return {
			record: unifiedRecord,
			links: {
				outbound: await resolveLinks(outboundLinks, "outbound"),
				inbound: await resolveLinks(inboundLinks, "inbound"),
			},
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
		const orgId = ctx.viewer.orgId;
		if (!orgId) {
			throw new ConvexError("Org context required");
		}

		// 1. Verify objectDef
		const objectDef = await ctx.db.get(args.objectDefId);
		if (!objectDef || objectDef.orgId !== orgId || !objectDef.isActive) {
			throw new ConvexError("Object not found or access denied");
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
		const activeFieldDefs = await loadActiveFieldDefs(
			ctx,
			args.objectDefId
		);

		return assembleRecords(ctx, results, activeFieldDefs);
	})
	.public();
