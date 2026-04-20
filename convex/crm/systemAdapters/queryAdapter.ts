import { ConvexError } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import {
	EMPTY_MORTGAGE_PAYMENT_SNAPSHOT,
	loadMortgagePaymentSnapshots,
} from "../../payments/mortgagePaymentSnapshot";
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

interface NativeViewerContext {
	viewer?: {
		isFairLendAdmin?: boolean;
	};
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
		nativeTable: objectDef.nativeTable ?? null,
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

async function enrichNativeDocs(
	ctx: QueryCtx,
	objectDef: ObjectDef,
	docs: Record<string, unknown>[]
): Promise<Record<string, unknown>[]> {
	if (objectDef.nativeTable !== "mortgages" || docs.length === 0) {
		return docs;
	}

	const snapshotByMortgageId = await loadMortgagePaymentSnapshots(
		ctx,
		docs.map((doc) => doc._id as Id<"mortgages">)
	);

	return docs.map((doc) => ({
		...doc,
		__snapshot__:
			snapshotByMortgageId.get(String(doc._id)) ??
			EMPTY_MORTGAGE_PAYMENT_SNAPSHOT,
	}));
}

async function assembleNativeDocs(
	ctx: QueryCtx,
	objectDef: ObjectDef,
	fieldDefs: FieldDef[],
	docs: Record<string, unknown>[]
): Promise<UnifiedRecord[]> {
	const enrichedDocs = await enrichNativeDocs(ctx, objectDef, docs);
	return enrichedDocs.map((doc) =>
		assembleNativeDoc(objectDef, fieldDefs, doc)
	);
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
		case "listings": {
			const normalizedId = ctx.db.normalizeId("listings", recordId);
			return normalizedId ? ctx.db.get(normalizedId) : null;
		}
		case "properties": {
			const normalizedId = ctx.db.normalizeId("properties", recordId);
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
	const canReadAcrossOrgs =
		(ctx as QueryCtx & NativeViewerContext).viewer?.isFairLendAdmin === true;

	switch (tableName) {
		case "mortgages":
			return canReadAcrossOrgs
				? ctx.db.query("mortgages").paginate(paginationOpts)
				: ctx.db
						.query("mortgages")
						.withIndex("by_org", (q) => q.eq("orgId", orgId))
						.paginate(paginationOpts);
		case "borrowers":
			return canReadAcrossOrgs
				? ctx.db.query("borrowers").paginate(paginationOpts)
				: ctx.db
						.query("borrowers")
						.withIndex("by_org", (q) => q.eq("orgId", orgId))
						.paginate(paginationOpts);
		case "lenders":
			return canReadAcrossOrgs
				? ctx.db.query("lenders").paginate(paginationOpts)
				: ctx.db
						.query("lenders")
						.withIndex("by_org", (q) => q.eq("orgId", orgId))
						.paginate(paginationOpts);
		case "brokers":
			return canReadAcrossOrgs
				? ctx.db.query("brokers").paginate(paginationOpts)
				: ctx.db
						.query("brokers")
						.withIndex("by_org", (q) => q.eq("orgId", orgId))
						.paginate(paginationOpts);
		case "deals":
			return canReadAcrossOrgs
				? ctx.db.query("deals").paginate(paginationOpts)
				: ctx.db
						.query("deals")
						.withIndex("by_org", (q) => q.eq("orgId", orgId))
						.paginate(paginationOpts);
		case "obligations":
			return canReadAcrossOrgs
				? ctx.db.query("obligations").paginate(paginationOpts)
				: ctx.db
						.query("obligations")
						.withIndex("by_org", (q) => q.eq("orgId", orgId))
						.paginate(paginationOpts);
		case "listings":
			// Listings live on the FairLend marketplace surface and do not carry
			// their own orgId. Admin access to this native table is already scoped
			// to the FairLend staff org at the route/auth layer.
			return ctx.db.query("listings").paginate(paginationOpts);
		case "properties":
			// Properties are shared across the FairLend marketplace (same shape as
			// listings — no per-row orgId). The FairLend staff admin route is the
			// only consumer, gated at the route/auth layer.
			return ctx.db.query("properties").paginate(paginationOpts);
		default:
			throw new ConvexError(`Unknown native table: ${tableName}`);
	}
}

async function takeNativeTable(
	ctx: QueryCtx,
	tableName: string,
	orgId: string,
	limit: number
): Promise<Record<string, unknown>[]> {
	const canReadAcrossOrgs =
		(ctx as QueryCtx & NativeViewerContext).viewer?.isFairLendAdmin === true;

	switch (tableName) {
		case "mortgages":
			return canReadAcrossOrgs
				? ctx.db.query("mortgages").take(limit)
				: ctx.db
						.query("mortgages")
						.withIndex("by_org", (q) => q.eq("orgId", orgId))
						.take(limit);
		case "borrowers":
			return canReadAcrossOrgs
				? ctx.db.query("borrowers").take(limit)
				: ctx.db
						.query("borrowers")
						.withIndex("by_org", (q) => q.eq("orgId", orgId))
						.take(limit);
		case "lenders":
			return canReadAcrossOrgs
				? ctx.db.query("lenders").take(limit)
				: ctx.db
						.query("lenders")
						.withIndex("by_org", (q) => q.eq("orgId", orgId))
						.take(limit);
		case "brokers":
			return canReadAcrossOrgs
				? ctx.db.query("brokers").take(limit)
				: ctx.db
						.query("brokers")
						.withIndex("by_org", (q) => q.eq("orgId", orgId))
						.take(limit);
		case "deals":
			return canReadAcrossOrgs
				? ctx.db.query("deals").take(limit)
				: ctx.db
						.query("deals")
						.withIndex("by_org", (q) => q.eq("orgId", orgId))
						.take(limit);
		case "obligations":
			return canReadAcrossOrgs
				? ctx.db.query("obligations").take(limit)
				: ctx.db
						.query("obligations")
						.withIndex("by_org", (q) => q.eq("orgId", orgId))
						.take(limit);
		case "listings":
			return ctx.db.query("listings").take(limit);
		case "properties":
			// See paginateNativeTable — properties are not org-scoped.
			return ctx.db.query("properties").take(limit);
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
	| "obligations"
	| "listings"
	| "properties";

/**
 * Counts rows in a native system table using `.take()` rather than `.paginate()`.
 *
 * Convex only allows a single paginated query per function invocation, so the
 * count path must avoid `.paginate()` when the same function is already using
 * pagination to load a page of records. Callers pass `limit` as the cap + 1
 * and check `result.length > cap` to detect truncation.
 */
export async function countNativeTable(
	ctx: QueryCtx,
	tableName: string,
	orgId: string,
	limit: number
): Promise<number> {
	return (await takeNativeTable(ctx, tableName, orgId, limit)).length;
}

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
	if (typeof paginationOptsOrLimit === "number") {
		return takeNativeTable(ctx, tableName, orgId, paginationOptsOrLimit);
	}

	return paginateNativeTable(ctx, tableName, orgId, paginationOptsOrLimit);
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

	if (typeof paginationOptsOrLimit === "number") {
		const docs = await takeNativeTable(
			ctx,
			objectDef.nativeTable,
			orgId,
			paginationOptsOrLimit
		);
		return assembleNativeDocs(ctx, objectDef, fieldDefs, docs);
	}

	const nativePage = await paginateNativeTable(
		ctx,
		objectDef.nativeTable,
		orgId,
		paginationOptsOrLimit
	);

	// Only iterate fieldDefs with nativeColumnPath (skip EAV-only fields)
	const records = await assembleNativeDocs(
		ctx,
		objectDef,
		fieldDefs,
		nativePage.page
	);

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

	const canReadAcrossOrgs =
		(ctx as QueryCtx & NativeViewerContext).viewer?.isFairLendAdmin === true;
	const isCrossOrgNativeTable =
		objectDef.nativeTable === "listings" ||
		objectDef.nativeTable === "properties";

	if (
		!nativeDoc ||
		(!canReadAcrossOrgs && (isCrossOrgNativeTable || nativeDoc.orgId !== orgId))
	) {
		return null;
	}

	const [record] = await assembleNativeDocs(ctx, objectDef, fieldDefs, [
		nativeDoc,
	]);
	return record ?? null;
}
