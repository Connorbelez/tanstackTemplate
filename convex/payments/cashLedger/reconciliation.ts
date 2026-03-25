import { v } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";
import { internalQuery, type QueryCtx } from "../../_generated/server";
import {
	createAccountCache,
	getCashAccountBalance,
	getControlAccountsBySubaccount,
	safeBigintToNumber,
} from "./accounts";
import { replayJournalIntegrity } from "./replayIntegrity";
import type { ControlSubaccount } from "./types";
import { TRANSIENT_SUBACCOUNTS } from "./types";

async function loadObligationEntries(
	ctx: QueryCtx,
	obligationId: Id<"obligations">
): Promise<Doc<"cash_ledger_journal_entries">[]> {
	return ctx.db
		.query("cash_ledger_journal_entries")
		.withIndex("by_obligation_and_sequence", (q) =>
			q.eq("obligationId", obligationId)
		)
		.collect();
}

export async function getJournalSettledAmountForObligation(
	ctx: QueryCtx,
	obligationId: Id<"obligations">
) {
	const entries = await loadObligationEntries(ctx, obligationId);
	let journalSettledAmount = 0n;

	for (const entry of entries) {
		if (entry.entryType === "CASH_RECEIVED") {
			journalSettledAmount += entry.amount;
			continue;
		}

		if (entry.entryType !== "REVERSAL" || !entry.causedBy) {
			continue;
		}

		const original = await ctx.db.get(entry.causedBy);
		if (original?.entryType === "CASH_RECEIVED") {
			journalSettledAmount -= entry.amount;
		}
	}

	return journalSettledAmount;
}

export async function reconcileObligationSettlementProjectionInternal(
	ctx: QueryCtx,
	obligationId: Id<"obligations">
) {
	const obligation = await ctx.db.get(obligationId);
	if (!obligation) {
		throw new Error(`Obligation not found: ${obligationId}`);
	}

	const journalSettledAmount = await getJournalSettledAmountForObligation(
		ctx,
		obligationId
	);
	const projectedSettledAmount = BigInt(obligation.amountSettled);
	const driftAmount = projectedSettledAmount - journalSettledAmount;

	return {
		obligationId,
		projectedSettledAmount,
		journalSettledAmount,
		driftAmount,
		hasDrift: driftAmount !== 0n,
	};
}

/**
 * Internal query wrapper for getJournalSettledAmountForObligation.
 * Returns a number (not bigint) for use in actions via ctx.runQuery.
 */
export const getJournalSettledAmountForObligationInternal = internalQuery({
	args: { obligationId: v.id("obligations") },
	handler: async (ctx, { obligationId }) => {
		const amount = await getJournalSettledAmountForObligation(
			ctx,
			obligationId
		);
		return Number(amount);
	},
});

// ── Reversal Indicator Detection ─────────────────────────────

export interface ReversalIndicator {
	expectedBalance: bigint; // obligationAmount - journalSettledAmount
	journalSettledAmount: bigint;
	obligationAmount: number;
	obligationId: Id<"obligations">;
}

/**
 * Finds all settled obligations where the journal-derived receivable balance
 * is non-zero — indicating a reversal has occurred that needs correction.
 *
 * For each settled obligation, compares `obligation.amount` against the
 * journal-derived settled amount (which already accounts for REVERSAL entries).
 * A non-zero difference means the obligation was marked settled but the journal
 * disagrees — typically because a payment was reversed after settlement.
 */
export async function findSettledObligationsWithNonZeroBalance(
	ctx: QueryCtx
): Promise<ReversalIndicator[]> {
	const settledObligations = await ctx.db
		.query("obligations")
		.withIndex("by_status", (q) => q.eq("status", "settled"))
		.collect();

	const indicators: ReversalIndicator[] = [];

	for (const obligation of settledObligations) {
		const journalSettledAmount = await getJournalSettledAmountForObligation(
			ctx,
			obligation._id
		);
		const expectedBalance = BigInt(obligation.amount) - journalSettledAmount;

		if (expectedBalance !== 0n) {
			indicators.push({
				obligationId: obligation._id,
				journalSettledAmount,
				obligationAmount: obligation.amount,
				expectedBalance,
			});
		}
	}

	return indicators;
}

// ── Posting Group Reconciliation ──────────────────────────────

export interface PostingGroupReconciliationAlert {
	controlAllocationBalance: bigint;
	entryCount: number;
	obligationId: Id<"obligations">;
	oldestEntryTimestamp: number | null;
	postingGroupId: string;
}

export interface OrphanedAllocationAlert {
	accountId: Id<"cash_ledger_accounts">;
	controlAllocationBalance: bigint;
}

export interface NonZeroPostingGroupResult {
	alerts: PostingGroupReconciliationAlert[];
	orphaned: OrphanedAllocationAlert[];
}

export async function findNonZeroPostingGroups(
	ctx: QueryCtx
): Promise<NonZeroPostingGroupResult> {
	// Get all CONTROL:ALLOCATION accounts
	const allocationAccounts = await getControlAccountsBySubaccount(
		ctx.db,
		"ALLOCATION"
	);

	const alerts: PostingGroupReconciliationAlert[] = [];
	const orphaned: OrphanedAllocationAlert[] = [];

	for (const account of allocationAccounts) {
		const balance = getCashAccountBalance(account);
		if (balance === 0n) {
			continue;
		}

		// Surface orphaned accounts (non-zero balance, no obligation link) instead of silently skipping
		if (!account.obligationId) {
			orphaned.push({
				accountId: account._id,
				controlAllocationBalance: balance,
			});
			continue;
		}
		const postingGroupId = `allocation:${account.obligationId}`;

		// Get entries for this posting group
		const entries = await ctx.db
			.query("cash_ledger_journal_entries")
			.withIndex("by_posting_group", (q) =>
				q.eq("postingGroupId", postingGroupId)
			)
			.collect();

		// Use reduce instead of Math.min(...spread) to avoid stack overflow on large arrays
		const oldestEntryTimestamp =
			entries.length > 0
				? entries.reduce(
						(min, e) => Math.min(min, e.timestamp),
						entries[0].timestamp
					)
				: null;

		alerts.push({
			postingGroupId,
			controlAllocationBalance: balance,
			entryCount: entries.length,
			oldestEntryTimestamp,
			obligationId: account.obligationId,
		});
	}

	return { alerts, orphaned };
}

export const findSettledObligationsWithNonZeroBalanceInternal = internalQuery({
	args: {},
	handler: async (ctx) => {
		const result = await findSettledObligationsWithNonZeroBalance(ctx);
		// Convert bigint to number/string for serialization across Convex action/query boundary
		return result.map((indicator) => ({
			obligationId: indicator.obligationId,
			journalSettledAmount: safeBigintToNumber(indicator.journalSettledAmount),
			obligationAmount: indicator.obligationAmount,
			expectedBalance: safeBigintToNumber(indicator.expectedBalance),
		}));
	},
});

export const findNonZeroPostingGroupsInternal = internalQuery({
	args: {},
	handler: async (ctx) => {
		const result = await findNonZeroPostingGroups(ctx);
		// Convert bigint to number for serialization across Convex action/query boundary
		// Uses safeBigintToNumber to throw on precision loss instead of silently truncating
		return {
			alerts: result.alerts.map((a) => ({
				...a,
				controlAllocationBalance: safeBigintToNumber(
					a.controlAllocationBalance
				),
			})),
			orphaned: result.orphaned.map((o) => ({
				...o,
				controlAllocationBalance: safeBigintToNumber(
					o.controlAllocationBalance
				),
			})),
		};
	},
});

// ── CONTROL Subaccount Reconciliation ─────────────────────────

export interface ControlSubaccountBalance {
	balance: bigint;
	subaccount: ControlSubaccount;
}

export async function getControlBalancesByPostingGroup(
	ctx: QueryCtx,
	postingGroupId: string
): Promise<ControlSubaccountBalance[]> {
	const entries = await ctx.db
		.query("cash_ledger_journal_entries")
		.withIndex("by_posting_group", (q) =>
			q.eq("postingGroupId", postingGroupId)
		)
		.collect();

	const balances = new Map<ControlSubaccount, bigint>();
	const getCachedAccount = createAccountCache(ctx.db);

	for (const entry of entries) {
		const [debitAccount, creditAccount] = await Promise.all([
			getCachedAccount(entry.debitAccountId),
			getCachedAccount(entry.creditAccountId),
		]);

		// Missing accounts are a data integrity violation — log and skip rather than
		// silently producing incorrect CONTROL balances.
		if (!(debitAccount && creditAccount)) {
			console.error(
				`[getControlBalancesByPostingGroup] Journal entry ${entry._id} references missing account(s): ` +
					`debit=${entry.debitAccountId} (${debitAccount ? "found" : "MISSING"}), ` +
					`credit=${entry.creditAccountId} (${creditAccount ? "found" : "MISSING"}). Skipping entry.`
			);
			continue;
		}

		if (debitAccount?.family === "CONTROL" && debitAccount.subaccount) {
			const sub = debitAccount.subaccount;
			balances.set(sub, (balances.get(sub) ?? 0n) + entry.amount);
		}
		if (creditAccount?.family === "CONTROL" && creditAccount.subaccount) {
			const sub = creditAccount.subaccount;
			balances.set(sub, (balances.get(sub) ?? 0n) - entry.amount);
		}
	}

	const results: ControlSubaccountBalance[] = [];
	for (const sub of TRANSIENT_SUBACCOUNTS) {
		const balance = balances.get(sub) ?? 0n;
		results.push({ subaccount: sub, balance });
	}
	return results;
}

export async function getControlBalanceBySubaccount(
	ctx: QueryCtx,
	subaccount: ControlSubaccount
): Promise<{ totalBalance: bigint; accountCount: number }> {
	const accounts = await getControlAccountsBySubaccount(ctx.db, subaccount);
	let totalBalance = 0n;
	for (const account of accounts) {
		totalBalance += getCashAccountBalance(account);
	}
	return { totalBalance, accountCount: accounts.length };
}

// ── Replay Integrity Internal Query ─────────────────────────

/**
 * Internal query wrapper for journal replay integrity checks.
 * Always runs in full mode (no auth required). Called from the
 * daily reconciliation action via `ctx.runQuery`.
 */
export const runReplayIntegrityCheck = internalQuery({
	args: {},
	handler: async (ctx) => {
		return replayJournalIntegrity(ctx, { mode: "full" });
	},
});
