import { ConvexError } from "convex/values";
import type { Doc } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import type { UnifiedRecord } from "../types";
import { resolveColumnPath } from "./columnResolver";

type FieldDef = Doc<"fieldDefs">;
type ObjectDef = Doc<"objectDefs">;

interface NativePaginationOptions {
	cursor: string | null;
	numItems: number;
}

interface NativeTablePage {
	continueCursor: string | null;
	isDone: boolean;
	page: Record<string, unknown>[];
}

export interface NativeRecordPage {
	continueCursor: string | null;
	isDone: boolean;
	records: UnifiedRecord[];
}

function assembleNativeDoc(
	objectDef: ObjectDef,
	fieldDefs: FieldDef[],
	doc: Record<string, unknown>
): UnifiedRecord {
	const fields: Record<string, unknown> = {};
	for (const fieldDef of fieldDefs.filter((item) => item.nativeColumnPath)) {
		fields[fieldDef.name] = resolveColumnPath(doc, fieldDef);
	}

	return {
		_id: String(doc._id),
		_kind: "native",
		objectDefId: objectDef._id,
		fields,
		createdAt: (doc.createdAt as number) ?? (doc._creationTime as number),
		updatedAt:
			(doc.updatedAt as number) ??
			(doc._creationTime as number) ??
			(doc.createdAt as number) ??
			0,
	};
}

async function getNativeTableRecordById(
	ctx: QueryCtx,
	tableName: NativeTableName,
	recordId: string
): Promise<Record<string, unknown> | null> {
	switch (tableName) {
		case "mortgages": {
			const normalizedId = ctx.db.normalizeId("mortgages", recordId);
			return normalizedId ? ctx.db.get(normalizedId) : null;
		}
		case "borrowers": {
			const normalizedId = ctx.db.normalizeId("borrowers", recordId);
			return normalizedId ? ctx.db.get(normalizedId) : null;
		}
		case "lenders": {
			const normalizedId = ctx.db.normalizeId("lenders", recordId);
			return normalizedId ? ctx.db.get(normalizedId) : null;
		}
		case "brokers": {
			const normalizedId = ctx.db.normalizeId("brokers", recordId);
			return normalizedId ? ctx.db.get(normalizedId) : null;
		}
		case "deals": {
			const normalizedId = ctx.db.normalizeId("deals", recordId);
			return normalizedId ? ctx.db.get(normalizedId) : null;
		}
		case "obligations": {
			const normalizedId = ctx.db.normalizeId("obligations", recordId);
			return normalizedId ? ctx.db.get(normalizedId) : null;
		}
		default: {
			const exhaustiveCheck: never = tableName;
			throw new ConvexError(`Unknown native table: ${String(exhaustiveCheck)}`);
		}
	}
}

async function paginateNativeTable(
	ctx: QueryCtx,
	tableName: string,
	orgId: string,
	paginationOpts: NativePaginationOptions
): Promise<NativeTablePage> {
	switch (tableName) {
		case "mortgages":
			return ctx.db
				.query("mortgages")
				.withIndex("by_org", (q) => q.eq("orgId", orgId))
				.paginate(paginationOpts);
		case "borrowers":
			return ctx.db
				.query("borrowers")
				.withIndex("by_org", (q) => q.eq("orgId", orgId))
				.paginate(paginationOpts);
		case "lenders":
			return ctx.db
				.query("lenders")
				.withIndex("by_org", (q) => q.eq("orgId", orgId))
				.paginate(paginationOpts);
		case "brokers":
			return ctx.db
				.query("brokers")
				.withIndex("by_org", (q) => q.eq("orgId", orgId))
				.paginate(paginationOpts);
		case "deals":
			return ctx.db
				.query("deals")
				.withIndex("by_org", (q) => q.eq("orgId", orgId))
				.paginate(paginationOpts);
		case "obligations":
			return ctx.db
				.query("obligations")
				.withIndex("by_org", (q) => q.eq("orgId", orgId))
				.paginate(paginationOpts);
		default:
			throw new ConvexError(`Unknown native table: ${tableName}`);
	}
}

/** All native tables that can be queried via system adapters. */
export type NativeTableName =
	| "mortgages"
	| "borrowers"
	| "lenders"
	| "brokers"
	| "deals"
	| "obligations";

/**
 * Routes a runtime table name to a compile-time Convex query.
 *
 * Convex requires literal strings for ctx.db.query() — this switch pattern
 * is the only viable approach. Each native table gets its own case using
 * the `by_org` index for org-scoped listing.
 *
 * Returns raw documents as Record<string, unknown> for adapter consumption.
 */
export async function queryNativeTable(
	ctx: QueryCtx,
	tableName: string,
	orgId: string,
	limit: number
): Promise<Record<string, unknown>[]>;
export async function queryNativeTable(
	ctx: QueryCtx,
	tableName: string,
	orgId: string,
	paginationOpts: NativePaginationOptions
): Promise<NativeTablePage>;
export async function queryNativeTable(
	ctx: QueryCtx,
	tableName: string,
	orgId: string,
	paginationOptsOrLimit: NativePaginationOptions | number
): Promise<Record<string, unknown>[] | NativeTablePage> {
	const paginationOpts =
		typeof paginationOptsOrLimit === "number"
			? {
					cursor: null,
					numItems: paginationOptsOrLimit,
				}
			: paginationOptsOrLimit;

	const nativePage = await paginateNativeTable(
		ctx,
		tableName,
		orgId,
		paginationOpts
	);

	if (typeof paginationOptsOrLimit === "number") {
		return nativePage.page;
	}

	return nativePage;
}

/**
 * Assembles UnifiedRecord[] from native table documents.
 *
 * For each native doc, maps fields using resolveColumnPath() for every
 * fieldDef that has a nativeColumnPath. The result is identical in shape
 * to EAV-assembled records — the UI can't tell the difference.
 */
export async function queryNativeRecords(
	ctx: QueryCtx,
	objectDef: ObjectDef,
	fieldDefs: FieldDef[],
	orgId: string,
	limit: number
): Promise<UnifiedRecord[]>;
export async function queryNativeRecords(
	ctx: QueryCtx,
	objectDef: ObjectDef,
	fieldDefs: FieldDef[],
	orgId: string,
	paginationOpts: NativePaginationOptions
): Promise<NativeRecordPage>;
export async function queryNativeRecords(
	ctx: QueryCtx,
	objectDef: ObjectDef,
	fieldDefs: FieldDef[],
	orgId: string,
	paginationOptsOrLimit: NativePaginationOptions | number
): Promise<NativeRecordPage | UnifiedRecord[]> {
	if (!objectDef.nativeTable) {
		throw new ConvexError("System object missing nativeTable");
	}

	const paginationOpts =
		typeof paginationOptsOrLimit === "number"
			? {
					cursor: null,
					numItems: paginationOptsOrLimit,
				}
			: paginationOptsOrLimit;

	const nativePage = await paginateNativeTable(
		ctx,
		objectDef.nativeTable,
		orgId,
		paginationOpts
	);

	// Only iterate fieldDefs with nativeColumnPath (skip EAV-only fields)
	const records = nativePage.page.map((doc) =>
		assembleNativeDoc(objectDef, fieldDefs, doc)
	);

	if (typeof paginationOptsOrLimit === "number") {
		return records;
	}

	return {
		records,
		continueCursor: nativePage.continueCursor,
		isDone: nativePage.isDone,
	};
}

export async function getNativeRecordById(
	ctx: QueryCtx,
	objectDef: ObjectDef,
	fieldDefs: FieldDef[],
	orgId: string,
	recordId: string
): Promise<UnifiedRecord | null> {
	if (!objectDef.nativeTable) {
		throw new ConvexError("System object missing nativeTable");
	}

	const nativeDoc = await getNativeTableRecordById(
		ctx,
		objectDef.nativeTable as NativeTableName,
		recordId
	);

	if (!nativeDoc || nativeDoc.orgId !== orgId) {
		return null;
	}

	return assembleNativeDoc(objectDef, fieldDefs, nativeDoc);
}
