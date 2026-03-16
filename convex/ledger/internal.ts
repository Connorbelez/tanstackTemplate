import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { getAccountLenderId } from "./accountOwnership";

/** Compute balance from cumulative fields: debits received minus credits given */
export function computeBalance(
	account: Pick<
		Doc<"ledger_accounts">,
		"cumulativeDebits" | "cumulativeCredits"
	>
): bigint {
	return account.cumulativeDebits - account.cumulativeCredits;
}

/** Get or create the global WORLD singleton account */
export async function getOrCreateWorldAccount(ctx: MutationCtx) {
	const existing = await ctx.db
		.query("ledger_accounts")
		.withIndex("by_type_and_mortgage", (q) =>
			q.eq("type", "WORLD").eq("mortgageId", undefined)
		)
		.first();
	if (existing) {
		return existing;
	}

	const id = await ctx.db.insert("ledger_accounts", {
		type: "WORLD",
		cumulativeDebits: 0n,
		cumulativeCredits: 0n,
		createdAt: Date.now(),
	});
	const account = await ctx.db.get(id);
	if (!account) {
		throw new Error("Failed to create WORLD account");
	}
	return account;
}

/** Find TREASURY account for a mortgage. Throws if not found. */
export async function getTreasuryAccount(ctx: QueryCtx, mortgageId: string) {
	const treasury = await ctx.db
		.query("ledger_accounts")
		.withIndex("by_type_and_mortgage", (q) =>
			q.eq("type", "TREASURY").eq("mortgageId", mortgageId)
		)
		.first();
	if (!treasury) {
		throw new Error(
			`No TREASURY account for mortgage ${mortgageId}. Mint the mortgage first.`
		);
	}
	return treasury;
}

/** Find existing POSITION account. Throws if not found. */
export async function getPositionAccount(
	ctx: QueryCtx,
	mortgageId: string,
	lenderId: string
) {
	const indexedPosition = await ctx.db
		.query("ledger_accounts")
		.withIndex("by_mortgage_and_lender", (q) =>
			q.eq("mortgageId", mortgageId).eq("lenderId", lenderId)
		)
		.first();
	const position =
		(indexedPosition?.type === "POSITION" ? indexedPosition : null) ??
		(
			await ctx.db
				.query("ledger_accounts")
				.withIndex("by_mortgage", (q) => q.eq("mortgageId", mortgageId))
				.collect()
		).find(
			(account) =>
				account.type === "POSITION" && getAccountLenderId(account) === lenderId
		);
	if (!position || position.type !== "POSITION") {
		throw new Error(
			`No POSITION account for lender ${lenderId} on mortgage ${mortgageId}`
		);
	}
	return position;
}

/** Find or create POSITION account for a lender×mortgage pair */
export async function getOrCreatePositionAccount(
	ctx: MutationCtx,
	mortgageId: string,
	lenderId: string
) {
	const indexedExisting = await ctx.db
		.query("ledger_accounts")
		.withIndex("by_mortgage_and_lender", (q) =>
			q.eq("mortgageId", mortgageId).eq("lenderId", lenderId)
		)
		.first();
	const existing =
		(indexedExisting?.type === "POSITION" ? indexedExisting : null) ??
		(
			await ctx.db
				.query("ledger_accounts")
				.withIndex("by_mortgage", (q) => q.eq("mortgageId", mortgageId))
				.collect()
		).find(
			(account) =>
				account.type === "POSITION" && getAccountLenderId(account) === lenderId
		);
	if (existing) {
		return existing;
	}

	const id = await ctx.db.insert("ledger_accounts", {
		type: "POSITION",
		mortgageId,
		lenderId,
		cumulativeDebits: 0n,
		cumulativeCredits: 0n,
		createdAt: Date.now(),
	});
	const account = await ctx.db.get(id);
	if (!account) {
		throw new Error("Failed to create POSITION account");
	}
	return account;
}

/** Get next monotonic gap-free sequence number */
export async function nextSequenceNumber(ctx: QueryCtx): Promise<bigint> {
	const latest = await ctx.db
		.query("ledger_journal_entries")
		.withIndex("by_sequence")
		.order("desc")
		.first();
	return latest ? latest.sequenceNumber + 1n : 1n;
}
