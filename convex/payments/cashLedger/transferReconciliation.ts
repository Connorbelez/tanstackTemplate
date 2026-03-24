import type { Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import { safeBigintToNumber } from "./accounts";
import { buildIdempotencyKey } from "./types";

export type {
	ReconciliationCheckResult,
	ReconciliationSuiteOptions,
} from "./reconciliationSuite";

import type {
	ReconciliationCheckResult,
	ReconciliationSuiteOptions,
} from "./reconciliationSuite";

// ── Constants ─────────────────────────────────────────────────

const MS_PER_DAY = 86_400_000;

/** Transfers confirmed/reversed longer than this without a matching journal entry are orphaned. */
export const ORPHAN_THRESHOLD_MS = 5 * 60_000;

// ── Item Types ────────────────────────────────────────────────

export interface OrphanedConfirmedTransferItem {
	ageDays: number;
	amount: number;
	confirmedAt: number;
	direction: "inbound" | "outbound";
	expectedIdempotencyKey: string;
	mortgageId?: Id<"mortgages">;
	transferRequestId: Id<"transferRequests">;
}

export interface OrphanedReversedTransferItem {
	ageDays: number;
	amount: number;
	direction: "inbound" | "outbound";
	expectedIdempotencyKey: string;
	mortgageId?: Id<"mortgages">;
	reversedAt: number;
	transferRequestId: Id<"transferRequests">;
}

export interface StaleOutboundTransferItem {
	ageDays: number;
	amount: number;
	confirmedAt: number;
	dispersalEntryId: Id<"dispersalEntries">;
	dispersalStatus: string;
	transferRequestId: Id<"transferRequests">;
}

export interface TransferAmountMismatchItem {
	differenceCents: number;
	journalAmount: number;
	journalEntryId: Id<"cash_ledger_journal_entries">;
	transferAmount: number;
	transferRequestId: Id<"transferRequests">;
}

// ── Helpers ───────────────────────────────────────────────────

export function buildResult<T>(
	checkName: string,
	items: T[],
	totalAmountCents: number,
	checkedAt: number
): ReconciliationCheckResult<T> {
	return {
		checkName,
		isHealthy: items.length === 0,
		items,
		count: items.length,
		totalAmountCents,
		checkedAt,
	};
}

export function ageDays(creationTime: number, now: number): number {
	return Math.floor((now - creationTime) / MS_PER_DAY);
}

// ── T-006: Orphaned Confirmed Transfers ──────────────────────

/**
 * Finds confirmed transfers that have no matching journal entry
 * (CASH_RECEIVED for inbound, LENDER_PAYOUT_SENT for outbound).
 * Only checks transfers confirmed longer than ORPHAN_THRESHOLD_MS ago
 * to avoid flagging transfers still being processed.
 */
export async function checkOrphanedConfirmedTransfers(
	ctx: QueryCtx,
	options?: ReconciliationSuiteOptions
): Promise<ReconciliationCheckResult<OrphanedConfirmedTransferItem>> {
	const now = options?.nowMs ?? Date.now();
	const threshold = now - ORPHAN_THRESHOLD_MS;

	const transfers = await ctx.db
		.query("transferRequests")
		.withIndex("by_status", (q) => q.eq("status", "confirmed"))
		.collect();

	const items: OrphanedConfirmedTransferItem[] = [];
	let totalAmountCents = 0;

	for (const transfer of transfers) {
		// Skip recent transfers still being processed
		if (!transfer.confirmedAt || transfer.confirmedAt >= threshold) {
			continue;
		}
		// Skip legacy stubs missing direction or amount
		if (!transfer.direction || transfer.amount == null) {
			continue;
		}

		const entries = await ctx.db
			.query("cash_ledger_journal_entries")
			.withIndex("by_transfer_request", (q) =>
				q.eq("transferRequestId", transfer._id)
			)
			.collect();

		const expectedType =
			transfer.direction === "inbound" ? "CASH_RECEIVED" : "LENDER_PAYOUT_SENT";

		const hasMatch = entries.some((e) => e.entryType === expectedType);

		if (!hasMatch) {
			const keyType =
				transfer.direction === "inbound"
					? "cash-received"
					: "lender-payout-sent";
			const expectedIdempotencyKey = buildIdempotencyKey(
				keyType,
				"transfer",
				transfer._id
			);
			items.push({
				transferRequestId: transfer._id,
				direction: transfer.direction,
				amount: transfer.amount,
				confirmedAt: transfer.confirmedAt,
				ageDays: ageDays(transfer.confirmedAt, now),
				mortgageId: transfer.mortgageId ?? undefined,
				expectedIdempotencyKey,
			});
			totalAmountCents += transfer.amount;
		}
	}

	return buildResult(
		"orphanedConfirmedTransfers",
		items,
		totalAmountCents,
		now
	);
}

// ── T-007: Orphaned Reversed Transfers ───────────────────────

/**
 * Finds reversed transfers that have no REVERSAL journal entry.
 * Only checks transfers reversed longer than ORPHAN_THRESHOLD_MS ago.
 */
export async function checkOrphanedReversedTransfers(
	ctx: QueryCtx,
	options?: ReconciliationSuiteOptions
): Promise<ReconciliationCheckResult<OrphanedReversedTransferItem>> {
	const now = options?.nowMs ?? Date.now();
	const threshold = now - ORPHAN_THRESHOLD_MS;

	const transfers = await ctx.db
		.query("transferRequests")
		.withIndex("by_status", (q) => q.eq("status", "reversed"))
		.collect();

	const items: OrphanedReversedTransferItem[] = [];
	let totalAmountCents = 0;

	for (const transfer of transfers) {
		// Skip recent reversals still being processed
		if (!transfer.reversedAt || transfer.reversedAt >= threshold) {
			continue;
		}
		// Skip legacy stubs missing direction or amount
		if (!transfer.direction || transfer.amount == null) {
			continue;
		}

		const entries = await ctx.db
			.query("cash_ledger_journal_entries")
			.withIndex("by_transfer_request", (q) =>
				q.eq("transferRequestId", transfer._id)
			)
			.collect();

		const hasReversal = entries.some((e) => e.entryType === "REVERSAL");

		if (!hasReversal) {
			const expectedIdempotencyKey = buildIdempotencyKey(
				"reversal",
				"transfer",
				transfer._id
			);
			items.push({
				transferRequestId: transfer._id,
				direction: transfer.direction,
				amount: transfer.amount,
				reversedAt: transfer.reversedAt,
				ageDays: ageDays(transfer.reversedAt, now),
				mortgageId: transfer.mortgageId ?? undefined,
				expectedIdempotencyKey,
			});
			totalAmountCents += transfer.amount;
		}
	}

	return buildResult("orphanedReversedTransfers", items, totalAmountCents, now);
}

// ── T-008: Stale Outbound Transfers ──────────────────────────

/**
 * Finds confirmed outbound transfers whose linked dispersalEntry
 * is still in "pending" status, indicating the payout was never disbursed.
 */
export async function checkStaleOutboundTransfers(
	ctx: QueryCtx,
	options?: ReconciliationSuiteOptions
): Promise<ReconciliationCheckResult<StaleOutboundTransferItem>> {
	const now = options?.nowMs ?? Date.now();

	const transfers = await ctx.db
		.query("transferRequests")
		.withIndex("by_status_and_direction", (q) =>
			q.eq("status", "confirmed").eq("direction", "outbound")
		)
		.collect();

	const items: StaleOutboundTransferItem[] = [];
	let totalAmountCents = 0;

	for (const transfer of transfers) {
		if (!transfer.dispersalEntryId) {
			continue;
		}

		const dispersalEntry = await ctx.db.get(transfer.dispersalEntryId);
		// Skip if the dispersal entry was deleted or is missing
		if (!dispersalEntry) {
			continue;
		}

		if (dispersalEntry.status === "pending") {
			items.push({
				transferRequestId: transfer._id,
				dispersalEntryId: transfer.dispersalEntryId,
				dispersalStatus: dispersalEntry.status,
				amount: transfer.amount ?? 0,
				confirmedAt: transfer.confirmedAt ?? transfer.createdAt,
				ageDays: ageDays(transfer.confirmedAt ?? transfer.createdAt, now),
			});
			totalAmountCents += transfer.amount ?? 0;
		}
	}

	return buildResult("staleOutboundTransfers", items, totalAmountCents, now);
}

// ── T-009: Transfer Amount Mismatches ────────────────────────

/**
 * Compares the amount on confirmed transfers against the amount
 * recorded in their matching journal entries. Flags any non-zero
 * difference between the transfer amount and the journal entry amount.
 */
export async function checkTransferAmountMismatches(
	ctx: QueryCtx,
	options?: ReconciliationSuiteOptions
): Promise<ReconciliationCheckResult<TransferAmountMismatchItem>> {
	const now = options?.nowMs ?? Date.now();

	const transfers = await ctx.db
		.query("transferRequests")
		.withIndex("by_status", (q) => q.eq("status", "confirmed"))
		.collect();

	const items: TransferAmountMismatchItem[] = [];
	let totalAmountCents = 0;

	for (const transfer of transfers) {
		// Skip transfers without amount or direction
		if (transfer.amount == null || !transfer.direction) {
			continue;
		}

		const entries = await ctx.db
			.query("cash_ledger_journal_entries")
			.withIndex("by_transfer_request", (q) =>
				q.eq("transferRequestId", transfer._id)
			)
			.collect();

		const expectedType =
			transfer.direction === "inbound" ? "CASH_RECEIVED" : "LENDER_PAYOUT_SENT";

		for (const entry of entries) {
			if (entry.entryType !== expectedType) {
				continue;
			}

			const journalAmount = safeBigintToNumber(entry.amount);
			const difference = transfer.amount - journalAmount;

			if (difference !== 0) {
				items.push({
					transferRequestId: transfer._id,
					journalEntryId: entry._id,
					transferAmount: transfer.amount,
					journalAmount,
					differenceCents: difference,
				});
				totalAmountCents += Math.abs(difference);
			}
		}
	}

	return buildResult("transferAmountMismatches", items, totalAmountCents, now);
}
