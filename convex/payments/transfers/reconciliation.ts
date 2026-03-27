/**
 * Transfer reconciliation — detect confirmed transfers without journal entries.
 *
 * This module provides a lightweight reconciliation entry point in the
 * transfers domain. The primary reconciliation cron is wired from
 * `convex/payments/cashLedger/transferReconciliationCron.ts` which has a
 * more complete implementation including SUSPENSE escalation and cash ledger
 * journal posting.
 *
 * This mutation is NOT wired to the production cron. It is an alternative
 * lightweight entry point for mutation-scoped reconciliation checks.
 *
 * See ENG-165 and Tech Design §10.
 */

import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { internalMutation } from "../../_generated/server";

// ── Constants ───────────────────────────────────────────────────────

const ORPHAN_THRESHOLD_MS = 5 * 60 * 1000;
const MAX_HEALING_ATTEMPTS = 3;

// ── Helpers ─────────────────────────────────────────────────────────

/** Returns true if the transfer is too fresh to be considered orphaned. */
export function isFreshTransfer(
	transfer: { settledAt?: number; createdAt: number },
	threshold: number
): boolean {
	if (transfer.settledAt && transfer.settledAt > threshold) {
		return true;
	}
	return transfer.createdAt > threshold;
}

/** Re-schedule the publishTransferConfirmed effect for a given transfer. */
async function scheduleHealingEffect(
	ctx: MutationCtx,
	transferId: Id<"transferRequests">
): Promise<void> {
	await ctx.scheduler.runAfter(
		0,
		internal.engine.effects.transfer.publishTransferConfirmed,
		{
			entityId: transferId,
			entityType: "transfer" as const,
			eventType: "FUNDS_SETTLED",
			journalEntryId: `healing:${transferId}:${Date.now()}`,
			effectName: "publishTransferConfirmed",
			source: { channel: "scheduler" as const, actorType: "system" as const },
		}
	);
}

/** Create or update a healing attempt for an orphaned transfer. */
async function processOrphanedTransfer(
	ctx: MutationCtx,
	transferId: Id<"transferRequests">,
	healing: {
		_id: Id<"transferHealingAttempts">;
		attemptCount: number;
		status: string;
	} | null
): Promise<void> {
	if (!healing) {
		await ctx.db.insert("transferHealingAttempts", {
			transferRequestId: transferId,
			attemptCount: 1,
			lastAttemptAt: Date.now(),
			status: "retrying",
			createdAt: Date.now(),
		});

		await scheduleHealingEffect(ctx, transferId);
		console.warn(
			`[transfer-reconciliation] Orphaned transfer ${transferId} — healing attempt 1, re-scheduled publishTransferConfirmed`
		);
		return;
	}

	if (healing.attemptCount < MAX_HEALING_ATTEMPTS) {
		await ctx.db.patch(healing._id, {
			attemptCount: healing.attemptCount + 1,
			lastAttemptAt: Date.now(),
		});

		await scheduleHealingEffect(ctx, transferId);
		console.warn(
			`[transfer-reconciliation] Orphaned transfer ${transferId} — healing attempt ${healing.attemptCount + 1}, re-scheduled publishTransferConfirmed`
		);
		return;
	}

	// Escalate — 3 healing attempts exhausted, manual intervention required
	await ctx.db.patch(healing._id, {
		status: "escalated" as const,
		escalatedAt: Date.now(),
	});
	console.error(
		`[transfer-reconciliation] Transfer ${transferId} ESCALATED — ${MAX_HEALING_ATTEMPTS} healing attempts failed`
	);
}

// ── Cron Handler ────────────────────────────────────────────────────

/**
 * Reconciliation mutation: find confirmed transfers missing journal entries
 * and create/update healing attempts with automatic re-scheduling of the
 * publishTransferConfirmed effect.
 *
 * Three healing paths per orphaned transfer:
 * 1. First detection -> insert healing attempt, schedule effect
 * 2. Subsequent retries (attemptCount < 3) -> increment, schedule effect
 * 3. After 3 failed attempts -> escalate (manual intervention)
 */
export const transferReconciliationCron = internalMutation({
	handler: async (ctx) => {
		const threshold = Date.now() - ORPHAN_THRESHOLD_MS;

		const confirmedTransfers = await ctx.db
			.query("transferRequests")
			.withIndex("by_status", (q) => q.eq("status", "confirmed"))
			.take(100);

		for (const transfer of confirmedTransfers) {
			if (isFreshTransfer(transfer, threshold)) {
				continue;
			}

			// Bridged transfers have journal entries via the collection attempt path
			if (transfer.collectionAttemptId) {
				continue;
			}

			const journalEntry = await ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_transfer_request", (q) =>
					q.eq("transferRequestId", transfer._id)
				)
				.first();

			if (journalEntry) {
				continue;
			}

			const healing = await ctx.db
				.query("transferHealingAttempts")
				.withIndex("by_transfer_request", (q) =>
					q.eq("transferRequestId", transfer._id)
				)
				.first();

			if (healing?.status === "escalated" || healing?.status === "resolved") {
				continue;
			}

			await processOrphanedTransfer(ctx, transfer._id, healing);
		}
	},
});
