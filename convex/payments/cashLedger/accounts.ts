import { ConvexError } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import type { CashAccountFamily, ControlSubaccount } from "./types";
import { CREDIT_NORMAL_FAMILIES } from "./types";

type DbReader = QueryCtx["db"] | MutationCtx["db"];

export interface CashAccountSpec {
	borrowerId?: Id<"borrowers">;
	family: CashAccountFamily;
	lenderId?: Id<"lenders">;
	metadata?: Record<string, unknown>;
	mortgageId?: Id<"mortgages">;
	obligationId?: Id<"obligations">;
	subaccount?: ControlSubaccount;
}

export function isCreditNormalFamily(family: CashAccountFamily) {
	return CREDIT_NORMAL_FAMILIES.has(family);
}

export function getCashAccountBalance(
	account: Pick<
		Doc<"cash_ledger_accounts">,
		"family" | "cumulativeDebits" | "cumulativeCredits"
	>
): bigint {
	return isCreditNormalFamily(account.family)
		? account.cumulativeCredits - account.cumulativeDebits
		: account.cumulativeDebits - account.cumulativeCredits;
}

export function projectCashAccountBalance(
	account: Pick<
		Doc<"cash_ledger_accounts">,
		"family" | "cumulativeDebits" | "cumulativeCredits"
	>,
	side: "debit" | "credit",
	amount: bigint
) {
	let signedDelta = amount;

	if (side === "debit" && isCreditNormalFamily(account.family)) {
		signedDelta = -amount;
	} else if (side === "credit" && !isCreditNormalFamily(account.family)) {
		signedDelta = -amount;
	}

	return getCashAccountBalance(account) + signedDelta;
}

function matchesSpec(
	account: Doc<"cash_ledger_accounts">,
	spec: CashAccountSpec
): boolean {
	return (
		account.family === spec.family &&
		(spec.mortgageId === undefined || account.mortgageId === spec.mortgageId) &&
		(spec.obligationId === undefined ||
			account.obligationId === spec.obligationId) &&
		(spec.lenderId === undefined || account.lenderId === spec.lenderId) &&
		(spec.borrowerId === undefined || account.borrowerId === spec.borrowerId) &&
		account.subaccount === spec.subaccount
	);
}

async function queryBySpec(db: DbReader, spec: CashAccountSpec) {
	if (spec.obligationId) {
		return db
			.query("cash_ledger_accounts")
			.withIndex("by_family_and_obligation", (q) =>
				q.eq("family", spec.family).eq("obligationId", spec.obligationId)
			)
			.collect();
	}

	if (spec.mortgageId && spec.lenderId) {
		return db
			.query("cash_ledger_accounts")
			.withIndex("by_family_and_mortgage_and_lender", (q) =>
				q
					.eq("family", spec.family)
					.eq("mortgageId", spec.mortgageId)
					.eq("lenderId", spec.lenderId)
			)
			.collect();
	}

	if (spec.mortgageId) {
		return db
			.query("cash_ledger_accounts")
			.withIndex("by_family_and_mortgage", (q) =>
				q.eq("family", spec.family).eq("mortgageId", spec.mortgageId)
			)
			.collect();
	}

	if (spec.lenderId) {
		return db
			.query("cash_ledger_accounts")
			.withIndex("by_family_and_lender", (q) =>
				q.eq("family", spec.family).eq("lenderId", spec.lenderId)
			)
			.collect();
	}

	return db
		.query("cash_ledger_accounts")
		.withIndex("by_family", (q) => q.eq("family", spec.family))
		.collect();
}

export async function findCashAccount(db: DbReader, spec: CashAccountSpec) {
	const candidates = await queryBySpec(db, spec);
	return candidates.find((account) => matchesSpec(account, spec)) ?? null;
}

export async function requireCashAccount(
	db: DbReader,
	spec: CashAccountSpec,
	label: string
) {
	const account = await findCashAccount(db, spec);
	if (!account) {
		throw new ConvexError(
			`${label}: cash account not found for family=${spec.family}`
		);
	}
	return account;
}

export async function getOrCreateCashAccount(
	ctx: MutationCtx,
	spec: CashAccountSpec
) {
	const existing = await findCashAccount(ctx.db, spec);
	if (existing) {
		return existing;
	}

	const accountId = await ctx.db.insert("cash_ledger_accounts", {
		family: spec.family,
		mortgageId: spec.mortgageId,
		obligationId: spec.obligationId,
		lenderId: spec.lenderId,
		borrowerId: spec.borrowerId,
		subaccount: spec.subaccount,
		cumulativeDebits: 0n,
		cumulativeCredits: 0n,
		createdAt: Date.now(),
		metadata: spec.metadata,
	});

	const account = await ctx.db.get(accountId);
	if (!account) {
		throw new Error("Failed to create cash ledger account");
	}
	return account;
}

export async function getControlAccountsBySubaccount(
	db: DbReader,
	subaccount: ControlSubaccount
): Promise<Doc<"cash_ledger_accounts">[]> {
	return db
		.query("cash_ledger_accounts")
		.withIndex("by_family_and_subaccount", (q) =>
			q.eq("family", "CONTROL").eq("subaccount", subaccount)
		)
		.collect();
}

// ── Shared Utilities ─────────────────────────────────────────

/**
 * Converts a bigint to a number, throwing if the value exceeds
 * Number.MAX_SAFE_INTEGER (or is below Number.MIN_SAFE_INTEGER).
 */
export function safeBigintToNumber(value: bigint): number {
	const num = Number(value);
	if (!Number.isSafeInteger(num)) {
		throw new Error(
			`BigInt value ${value} cannot be safely represented as a Number`
		);
	}
	return num;
}

// ── Account Cache Factory ────────────────────────────────────

/**
 * Creates a per-query account cache to avoid redundant db.get() calls
 * when iterating over journal entries that share the same accounts.
 */
export function createAccountCache(db: DbReader) {
	const cache = new Map<string, Doc<"cash_ledger_accounts"> | null>();
	return async (
		accountId: Id<"cash_ledger_accounts">
	): Promise<Doc<"cash_ledger_accounts"> | null> => {
		const key = accountId as string;
		if (cache.has(key)) {
			return cache.get(key) ?? null;
		}
		const account = await db.get(accountId);
		cache.set(key, account);
		return account;
	};
}

export function assertNonNegativeBalance(
	account: Pick<
		Doc<"cash_ledger_accounts">,
		"family" | "cumulativeDebits" | "cumulativeCredits"
	>,
	side: "debit" | "credit",
	amount: bigint,
	label: string
) {
	const currentBalance = getCashAccountBalance(account);
	const projected = projectCashAccountBalance(account, side, amount);
	if (projected < 0n) {
		throw new ConvexError(
			`${label}: posting would make ${account.family} negative ` +
				`(attempted: ${amount} cents, current balance: ${currentBalance} cents, ` +
				`projected: ${projected} cents)`
		);
	}
}
