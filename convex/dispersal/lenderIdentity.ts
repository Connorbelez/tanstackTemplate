import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type DbReader = QueryCtx["db"] | MutationCtx["db"];

async function getUserByAuthId(db: DbReader, authId: string) {
	return db
		.query("users")
		.withIndex("authId", (q) => q.eq("authId", authId))
		.unique();
}

export async function findLenderByAuthId(
	db: DbReader,
	authId: string
): Promise<Doc<"lenders"> | null> {
	const user = await getUserByAuthId(db, authId);
	if (!user) {
		return null;
	}

	const lenders = await db
		.query("lenders")
		.withIndex("by_user", (q) => q.eq("userId", user._id))
		.collect();

	if (lenders.length === 0) {
		return null;
	}
	if (lenders.length > 1) {
		throw new Error(
			`findLenderByAuthId: found ${lenders.length} lenders for user ${user._id} — data corruption detected`
		);
	}
	return lenders[0];
}

export async function requireLenderIdForAuthId(
	db: DbReader,
	authId: string,
	errorPrefix: string
): Promise<Id<"lenders">> {
	const lender = await findLenderByAuthId(db, authId);
	if (!lender) {
		throw new ConvexError(
			`${errorPrefix}: lender not found for auth id ${authId}`
		);
	}

	return lender._id;
}
