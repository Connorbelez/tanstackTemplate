import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { getAccountLenderId } from "./accountOwnership";

// ── Balance Calculations ──────────────────────────────────────

/** Compute posted balance: debits received minus credits given */
export function getPostedBalance(
	account: Pick<
		Doc<"ledger_accounts">,
		"cumulativeDebits" | "cumulativeCredits"
	>
): bigint {
	return account.cumulativeDebits - account.cumulativeCredits;
}

/** Compute available balance: posted balance minus pending outflows */
export function getAvailableBalance(
	account: Pick<
		Doc<"ledger_accounts">,
		"cumulativeDebits" | "cumulativeCredits" | "pendingCredits"
	>
): bigint {
	const posted = account.cumulativeDebits - account.cumulativeCredits;
	const pending = account.pendingCredits;
	return posted - pending;
}

// ── WORLD Account ─────────────────────────────────────────────

/** Returns the singleton WORLD account. Throws if not found. */
export async function getWorldAccount(ctx: QueryCtx) {
	const world = await ctx.db
		.query("ledger_accounts")
		.withIndex("by_type_and_mortgage", (q) =>
			q.eq("type", "WORLD").eq("mortgageId", undefined)
		)
		.first();
	if (!world) {
		throw new Error(
			"WORLD account not found. Call initializeWorldAccount first."
		);
	}
	return world;
}

/** Creates the WORLD singleton idempotently. Returns existing if already created. */
export async function initializeWorldAccount(ctx: MutationCtx) {
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
		pendingDebits: 0n,
		pendingCredits: 0n,
		createdAt: Date.now(),
	});
	const account = await ctx.db.get(id);
	if (!account) {
		throw new Error("Failed to create WORLD account");
	}
	return account;
}

// ── TREASURY Account ──────────────────────────────────────────

/** Returns TREASURY for a mortgage, or null if not found. */
export async function getTreasuryAccount(
	ctx: QueryCtx,
	mortgageId: string
): Promise<Doc<"ledger_accounts"> | null> {
	return ctx.db
		.query("ledger_accounts")
		.withIndex("by_type_and_mortgage", (q) =>
			q.eq("type", "TREASURY").eq("mortgageId", mortgageId)
		)
		.first();
}

// ── POSITION Account ──────────────────────────────────────────

/**
 * Shared lookup: indexed `by_mortgage_and_lender` first, then fallback
 * scan via `by_mortgage` for legacy rows that used `investorId`.
 */
async function findExistingPosition(
	ctx: QueryCtx,
	mortgageId: string,
	lenderId: string
): Promise<Doc<"ledger_accounts"> | null> {
	const indexed = await ctx.db
		.query("ledger_accounts")
		.withIndex("by_mortgage_and_lender", (q) =>
			q.eq("mortgageId", mortgageId).eq("lenderId", lenderId)
		)
		.first();
	if (indexed?.type === "POSITION") {
		return indexed;
	}

	return (
		(
			await ctx.db
				.query("ledger_accounts")
				.withIndex("by_mortgage", (q) => q.eq("mortgageId", mortgageId))
				.collect()
		).find(
			(account) =>
				account.type === "POSITION" && getAccountLenderId(account) === lenderId
		) ?? null
	);
}

/** Find existing POSITION account. Throws if not found. */
export async function getPositionAccount(
	ctx: QueryCtx,
	mortgageId: string,
	lenderId: string
) {
	const position = await findExistingPosition(ctx, mortgageId, lenderId);
	if (!position) {
		throw new Error(
			`No POSITION account for lender ${lenderId} on mortgage ${mortgageId}`
		);
	}
	return position;
}

/** Find or create POSITION account for a lender x mortgage pair */
export async function getOrCreatePositionAccount(
	ctx: MutationCtx,
	mortgageId: string,
	lenderId: string
) {
	const existing = await findExistingPosition(ctx, mortgageId, lenderId);
	if (existing) {
		return existing;
	}

	const id = await ctx.db.insert("ledger_accounts", {
		type: "POSITION",
		mortgageId,
		lenderId,
		cumulativeDebits: 0n,
		cumulativeCredits: 0n,
		pendingDebits: 0n,
		pendingCredits: 0n,
		createdAt: Date.now(),
	});
	const account = await ctx.db.get(id);
	if (!account) {
		throw new Error("Failed to create POSITION account");
	}
	return account;
}
