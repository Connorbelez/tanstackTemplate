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

// ── Shared: Orphaned Confirmed Transfer Candidates ──────────

/** Raw candidate returned by the shared orphan filter. */
export interface OrphanedConfirmedCandidate {
	amount: number;
	confirmedAt: number;
	direction: "inbound" | "outbound";
	lenderId?: Id<"lenders">;
	mortgageId?: Id<"mortgages">;
	obligationId?: Id<"obligations">;
	transferRequestId: Id<"transferRequests">;
}

/**
 * Shared filter: finds confirmed transfers older than threshold
 * with no matching journal entry of the expected type.
 * Used by both the reconciliation check and the healing query.
 */
export async function findOrphanedConfirmedTransferCandidates(
	ctx: QueryCtx,
	options?: { nowMs?: number }
): Promise<OrphanedConfirmedCandidate[]> {
	const now = options?.nowMs ?? Date.now();
	const threshold = now - ORPHAN_THRESHOLD_MS;

	const transfers = await ctx.db
		.query("transferRequests")
		.withIndex("by_status", (q) => q.eq("status", "confirmed"))
		.collect();

	const candidates: OrphanedConfirmedCandidate[] = [];
	for (const transfer of transfers) {
		const effectiveConfirmedAt = transfer.confirmedAt ?? transfer._creationTime;
		if (!transfer.confirmedAt) {
			console.warn(
				`[TRANSFER-RECONCILIATION] transfer=${transfer._id} has confirmed status but missing confirmedAt; falling back to _creationTime for age calculation`
			);
		}
		if (effectiveConfirmedAt >= threshold) {
			continue;
		}
		if (!transfer.direction || transfer.amount == null) {
			console.warn(
				`[TRANSFER-RECONCILIATION] Skipping legacy stub transfer=${transfer._id}: missing direction or amount`
			);
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
			candidates.push({
				transferRequestId: transfer._id,
				direction: transfer.direction,
				amount: transfer.amount,
				confirmedAt: transfer.confirmedAt,
				mortgageId: transfer.mortgageId ?? undefined,
				obligationId: transfer.obligationId ?? undefined,
				lenderId: transfer.lenderId ?? undefined,
			});
		}
	}
	return candidates;
}

// ── TR-001: Orphaned Confirmed Transfers ─────────────────────

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
	const candidates = await findOrphanedConfirmedTransferCandidates(ctx, {
		nowMs: now,
	});

	const items: OrphanedConfirmedTransferItem[] = [];
	let totalAmountCents = 0;

	for (const c of candidates) {
		const keyType =
			c.direction === "inbound" ? "cash-received" : "lender-payout-sent";
		const expectedIdempotencyKey = buildIdempotencyKey(
			keyType,
			"transfer",
			c.transferRequestId
		);
		items.push({
			transferRequestId: c.transferRequestId,
			direction: c.direction,
			amount: c.amount,
			confirmedAt: c.confirmedAt,
			ageDays: ageDays(c.confirmedAt, now),
			mortgageId: c.mortgageId,
			expectedIdempotencyKey,
		});
		totalAmountCents += c.amount;
	}

	return buildResult(
		"orphanedConfirmedTransfers",
		items,
		totalAmountCents,
		now
	);
}

// ── TR-002: Orphaned Reversed Transfers ──────────────────────

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
			console.warn(
				`[TRANSFER-RECONCILIATION] Skipping legacy stub reversed transfer=${transfer._id}: missing direction or amount`
			);
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

// ── TR-003: Stale Outbound Transfers ─────────────────────────

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
		if (!dispersalEntry) {
			console.warn(
				`[TRANSFER-RECONCILIATION] dispersalEntry missing for outbound transfer=${transfer._id}, ` +
					`dispersalEntryId=${transfer.dispersalEntryId}`
			);
			const amount = transfer.amount ?? 0;
			items.push({
				transferRequestId: transfer._id,
				dispersalEntryId: transfer.dispersalEntryId,
				dispersalStatus: "missing",
				amount,
				confirmedAt: transfer.confirmedAt ?? transfer.createdAt,
				ageDays: ageDays(transfer.confirmedAt ?? transfer.createdAt, now),
			});
			totalAmountCents += amount;
			continue;
		}

		if (dispersalEntry.status === "pending") {
			if (transfer.amount == null) {
				console.warn(
					`[TRANSFER-RECONCILIATION] transfer=${transfer._id} has null amount in stale outbound check; excluding from totals`
				);
				continue;
			}
			const amount = transfer.amount;
			items.push({
				transferRequestId: transfer._id,
				dispersalEntryId: transfer.dispersalEntryId,
				dispersalStatus: dispersalEntry.status,
				amount,
				confirmedAt: transfer.confirmedAt ?? transfer.createdAt,
				ageDays: ageDays(transfer.confirmedAt ?? transfer.createdAt, now),
			});
			totalAmountCents += amount;
		}
	}

	return buildResult("staleOutboundTransfers", items, totalAmountCents, now);
}

// ── TR-004: Transfer Amount Mismatches ───────────────────────

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
			console.warn(
				`[TRANSFER-RECONCILIATION] Skipping legacy stub transfer=${transfer._id} in amount mismatch check: missing direction or amount`
			);
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
