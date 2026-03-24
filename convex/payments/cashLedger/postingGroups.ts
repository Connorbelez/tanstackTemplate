import { ConvexError } from "convex/values";
import type { QueryCtx } from "../../_generated/server";
import { createAccountCache } from "./accounts";
import type { CashEntryType } from "./types";

// ── T-001: Pure validation ─────────────────────────────────────

/**
 * Validates that lender amounts + servicing fee === obligation amount.
 * Pure function — no database access.
 *
 * @throws ConvexError with code POSTING_GROUP_SUM_MISMATCH on mismatch
 */
export function validatePostingGroupAmounts(
	obligationAmount: number,
	lenderAmounts: number[],
	servicingFee: number
): void {
	// All amounts must be safe integers (cents). Floating-point arithmetic
	// is exact for safe integers, so the reduce/compare below is reliable.
	if (!Number.isSafeInteger(obligationAmount)) {
		throw new ConvexError({
			code: "INVALID_AMOUNT" as const,
			field: "obligationAmount",
			value: obligationAmount,
		});
	}
	if (!Number.isSafeInteger(servicingFee)) {
		throw new ConvexError({
			code: "INVALID_AMOUNT" as const,
			field: "servicingFee",
			value: servicingFee,
		});
	}
	for (const [index, a] of lenderAmounts.entries()) {
		if (!Number.isSafeInteger(a)) {
			throw new ConvexError({
				code: "INVALID_AMOUNT" as const,
				field: "lenderAmount",
				index,
				value: a,
			});
		}
	}

	const totalLenderAmount = lenderAmounts.reduce((sum, a) => sum + a, 0);
	const actualTotal = totalLenderAmount + servicingFee;

	// Guard against overflow: sum of safe integers can exceed MAX_SAFE_INTEGER
	if (
		!(
			Number.isSafeInteger(totalLenderAmount) &&
			Number.isSafeInteger(actualTotal)
		)
	) {
		throw new ConvexError({
			code: "AMOUNT_OVERFLOW" as const,
			totalLenderAmount,
			servicingFee,
			actualTotal,
		});
	}

	if (actualTotal !== obligationAmount) {
		throw new ConvexError({
			code: "POSTING_GROUP_SUM_MISMATCH" as const,
			obligationAmount,
			totalLenderAmount,
			servicingFee,
			actualTotal,
		});
	}
}

// ── T-002: Query helper ────────────────────────────────────────

export interface PostingGroupValidationResult {
	controlAllocationBalance: bigint;
	entries: Array<{
		entryType: CashEntryType;
		amount: bigint;
		side: "debit" | "credit";
	}>;
	postingGroupId: string;
	/** Total number of journal entries in the posting group (not just CONTROL:ALLOCATION entries). */
	totalJournalEntryCount: number;
}

/**
 * Loads all journal entries for a posting group and computes
 * the CONTROL:ALLOCATION balance with entry-level detail.
 */
export async function getPostingGroupSummary(
	ctx: QueryCtx,
	postingGroupId: string
): Promise<PostingGroupValidationResult> {
	const entries = await ctx.db
		.query("cash_ledger_journal_entries")
		.withIndex("by_posting_group", (q) =>
			q.eq("postingGroupId", postingGroupId)
		)
		.collect();

	const getCachedAccount = createAccountCache(ctx.db);

	let controlAllocationBalance = 0n;
	const resultEntries: PostingGroupValidationResult["entries"] = [];

	for (const entry of entries) {
		const [debitAccount, creditAccount] = await Promise.all([
			getCachedAccount(entry.debitAccountId),
			getCachedAccount(entry.creditAccountId),
		]);

		// Missing accounts are a data integrity violation — log and skip rather than silently
		// treating as non-CONTROL (which would produce incorrect balance results).
		if (!(debitAccount && creditAccount)) {
			console.error(
				`[getPostingGroupSummary] Journal entry ${entry._id} references missing account(s): ` +
					`debit=${entry.debitAccountId} (${debitAccount ? "found" : "MISSING"}), ` +
					`credit=${entry.creditAccountId} (${creditAccount ? "found" : "MISSING"}). Skipping entry.`
			);
			continue;
		}

		const debitIsControlAllocation =
			debitAccount?.family === "CONTROL" &&
			debitAccount.subaccount === "ALLOCATION";
		const creditIsControlAllocation =
			creditAccount?.family === "CONTROL" &&
			creditAccount.subaccount === "ALLOCATION";

		if (debitIsControlAllocation) {
			controlAllocationBalance += entry.amount;
			resultEntries.push({
				entryType: entry.entryType,
				amount: entry.amount,
				side: "debit",
			});
		} else if (creditIsControlAllocation) {
			controlAllocationBalance -= entry.amount;
			resultEntries.push({
				entryType: entry.entryType,
				amount: entry.amount,
				side: "credit",
			});
		}
	}

	return {
		postingGroupId,
		controlAllocationBalance,
		totalJournalEntryCount: entries.length,
		entries: resultEntries,
	};
}

// ── T-003: Pure predicate ──────────────────────────────────────

/**
 * Determines whether a posting group is complete based on its validation result.
 * A posting group is complete when the CONTROL:ALLOCATION balance is zero
 * and at least one entry exists.
 */
export function isPostingGroupComplete(
	result: PostingGroupValidationResult
): boolean {
	return (
		result.controlAllocationBalance === 0n && result.totalJournalEntryCount > 0
	);
}
