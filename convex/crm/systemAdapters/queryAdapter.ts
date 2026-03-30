import { ConvexError } from "convex/values";
import type { Doc } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import type { UnifiedRecord } from "../types";
import { resolveColumnPath } from "./columnResolver";

type FieldDef = Doc<"fieldDefs">;
type ObjectDef = Doc<"objectDefs">;

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
	limit: number,
): Promise<Record<string, unknown>[]> {
	switch (tableName) {
		case "mortgages":
			return ctx.db
				.query("mortgages")
				.withIndex("by_org", (q) => q.eq("orgId", orgId))
				.take(limit);
		case "borrowers":
			return ctx.db
				.query("borrowers")
				.withIndex("by_org", (q) => q.eq("orgId", orgId))
				.take(limit);
		case "lenders":
			return ctx.db
				.query("lenders")
				.withIndex("by_org", (q) => q.eq("orgId", orgId))
				.take(limit);
		case "brokers":
			return ctx.db
				.query("brokers")
				.withIndex("by_org", (q) => q.eq("orgId", orgId))
				.take(limit);
		case "deals":
			return ctx.db
				.query("deals")
				.withIndex("by_org", (q) => q.eq("orgId", orgId))
				.take(limit);
		case "obligations":
			return ctx.db
				.query("obligations")
				.withIndex("by_org", (q) => q.eq("orgId", orgId))
				.take(limit);
		default:
			throw new ConvexError(`Unknown native table: ${tableName}`);
	}
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
	limit: number,
): Promise<UnifiedRecord[]> {
	if (!objectDef.nativeTable) {
		throw new ConvexError("System object missing nativeTable");
	}

	const nativeDocs = await queryNativeTable(
		ctx,
		objectDef.nativeTable,
		orgId,
		limit,
	);

	// Only iterate fieldDefs with nativeColumnPath (skip EAV-only fields)
	const nativeFieldDefs = fieldDefs.filter((fd) => fd.nativeColumnPath);

	return nativeDocs.map((doc) => {
		const fields: Record<string, unknown> = {};
		for (const fd of nativeFieldDefs) {
			fields[fd.name] = resolveColumnPath(
				doc as Record<string, unknown>,
				fd,
			);
		}
		return {
			_id: String(doc._id),
			_kind: "native" as const,
			objectDefId: objectDef._id,
			fields,
			createdAt:
				(doc.createdAt as number) ?? (doc._creationTime as number),
			updatedAt: doc._creationTime as number,
		};
	});
}
