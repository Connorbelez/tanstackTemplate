import type { FunctionReference, FunctionType } from "convex/server";
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import type { Id } from "../../_generated/dataModel";
import {
	internalAction,
	internalMutation,
	internalQuery,
} from "../../_generated/server";
import { auditLog } from "../../auditLog";
import type { CommandSource } from "../../engine/types";
import { unixMsToBusinessDate } from "../../lib/businessDates";
import { getOrCreateCashAccount, requireCashAccount } from "./accounts";
import { postCashEntryInternal } from "./postEntry";
import type {
	TransferHealingCandidate,
	TransferHealingResult,
} from "./transferHealingTypes";
import { MAX_TRANSFER_HEALING_ATTEMPTS } from "./transferHealingTypes";
import { ORPHAN_THRESHOLD_MS } from "./transferReconciliation";
import { buildIdempotencyKey } from "./types";

// ── Typed function references to break circular type inference ────────

function makeInternalRef<
	Type extends FunctionType,
	Args extends Record<string, unknown>,
	ReturnType,
>(name: string) {
	return makeFunctionReference<Type, Args, ReturnType>(
		name
	) as unknown as FunctionReference<Type, "internal", Args, ReturnType>;
}

const findOrphanedConfirmedTransfersForHealingRef = makeInternalRef<
	"query",
	Record<string, never>,
	TransferHealingCandidate[]
>(
	"payments/cashLedger/transferReconciliationCron:findOrphanedConfirmedTransfersForHealing"
);

const retriggerTransferConfirmationRef = makeInternalRef<
	"mutation",
	{
		transferRequestId: Id<"transferRequests">;
		direction: string;
		amount: number;
		mortgageId?: Id<"mortgages">;
		obligationId?: Id<"obligations">;
		lenderId?: Id<"lenders">;
	},
	{ action: "skipped" | "retriggered" | "escalated"; attemptCount: number }
>(
	"payments/cashLedger/transferReconciliationCron:retriggerTransferConfirmation"
);

const HEALING_SOURCE: CommandSource = {
	actorType: "system",
	channel: "scheduler",
};

// ── T-011: findOrphanedConfirmedTransfersForHealing ──────────────────

/**
 * Find confirmed transfers older than 5 minutes that have no journal entry,
 * filtering out those already escalated.
 */
export const findOrphanedConfirmedTransfersForHealing = internalQuery({
	args: {},
	handler: async (ctx): Promise<TransferHealingCandidate[]> => {
		const now = Date.now();
		const threshold = now - ORPHAN_THRESHOLD_MS;

		const transfers = await ctx.db
			.query("transferRequests")
			.withIndex("by_status", (q) => q.eq("status", "confirmed"))
			.collect();

		const candidates: TransferHealingCandidate[] = [];
		for (const transfer of transfers) {
			// Skip recent transfers still being processed
			if (!transfer.confirmedAt || transfer.confirmedAt >= threshold) {
				continue;
			}
			// Skip legacy stubs missing direction or amount
			if (!transfer.direction || transfer.amount == null) {
				continue;
			}

			// Check if a journal entry exists for this transfer
			const journalEntry = await ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_transfer_request", (q) =>
					q.eq("transferRequestId", transfer._id)
				)
				.first();

			if (journalEntry) {
				continue;
			}

			// Filter out already-escalated transfers
			const healingAttempt = await ctx.db
				.query("transferHealingAttempts")
				.withIndex("by_transfer_request", (q) =>
					q.eq("transferRequestId", transfer._id)
				)
				.first();

			if (healingAttempt?.status === "escalated") {
				continue;
			}

			candidates.push({
				transferRequestId: transfer._id,
				direction: transfer.direction,
				amount: transfer.amount,
				confirmedAt: transfer.confirmedAt,
				mortgageId: transfer.mortgageId ?? undefined,
				obligationId: transfer.obligationId ?? undefined,
			});
		}

		return candidates;
	},
});

// ── T-012: retriggerTransferConfirmation ─────────────────────────────

/**
 * Placeholder effect for retrying transfer confirmation.
 * The actual `publishTransferConfirmed` does not exist yet.
 */
export const retryTransferConfirmationEffect = internalMutation({
	args: {
		transferRequestId: v.id("transferRequests"),
		direction: v.string(),
		amount: v.number(),
	},
	handler: async (_ctx, args) => {
		console.warn(
			"[TRANSFER-HEALING] retryTransferConfirmationEffect called for " +
				`transfer=${args.transferRequestId}, direction=${args.direction}, ` +
				`amount=${args.amount}. publishTransferConfirmed not yet implemented.`
		);
	},
});

/**
 * Attempt to retrigger confirmation journal entry for an orphaned transfer.
 * Three code paths: retry, escalate, or skip (already escalated).
 */
export const retriggerTransferConfirmation = internalMutation({
	args: {
		transferRequestId: v.id("transferRequests"),
		direction: v.string(),
		amount: v.number(),
		mortgageId: v.optional(v.id("mortgages")),
		obligationId: v.optional(v.id("obligations")),
		lenderId: v.optional(v.id("lenders")),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query("transferHealingAttempts")
			.withIndex("by_transfer_request", (q) =>
				q.eq("transferRequestId", args.transferRequestId)
			)
			.first();

		// Already escalated — skip
		if (existing?.status === "escalated") {
			return {
				action: "skipped" as const,
				attemptCount: existing.attemptCount,
			};
		}

		const attemptCount = (existing?.attemptCount ?? 0) + 1;

		if (attemptCount > MAX_TRANSFER_HEALING_ATTEMPTS) {
			// ── Escalate to SUSPENSE ──
			if (existing) {
				await ctx.db.patch(existing._id, {
					status: "escalated",
					attemptCount,
					lastAttemptAt: Date.now(),
					escalatedAt: Date.now(),
				});
			} else {
				await ctx.db.insert("transferHealingAttempts", {
					transferRequestId: args.transferRequestId,
					attemptCount,
					lastAttemptAt: Date.now(),
					escalatedAt: Date.now(),
					status: "escalated",
					createdAt: Date.now(),
				});
			}

			// Cannot create SUSPENSE account without a mortgageId
			if (!args.mortgageId) {
				console.error(
					`[TRANSFER-HEALING] Cannot escalate transfer=${args.transferRequestId} ` +
						"to SUSPENSE: missing mortgageId. Skipping journal entry."
				);
				await auditLog.log(ctx, {
					action: "transfer.self_healing_escalated_no_mortgage",
					actorId: "system",
					resourceType: "transferRequest",
					resourceId: args.transferRequestId,
					severity: "error",
					metadata: {
						attemptCount,
						direction: args.direction,
						amount: args.amount,
					},
				});
				return { action: "escalated" as const, attemptCount };
			}

			const suspenseAccount = await getOrCreateCashAccount(ctx, {
				family: "SUSPENSE",
				mortgageId: args.mortgageId,
			});

			// For inbound transfers, credit BORROWER_RECEIVABLE; for outbound, credit LENDER_PAYABLE
			const creditFamily =
				args.direction === "inbound" ? "BORROWER_RECEIVABLE" : "LENDER_PAYABLE";
			const creditAccount = await requireCashAccount(
				ctx.db,
				{
					family: creditFamily,
					mortgageId: args.mortgageId,
					obligationId: args.obligationId,
					lenderId: args.lenderId,
				},
				"transferSelfHealing:escalation"
			);

			await postCashEntryInternal(ctx, {
				entryType: "SUSPENSE_ESCALATED",
				effectiveDate: unixMsToBusinessDate(Date.now()),
				amount: args.amount,
				debitAccountId: suspenseAccount._id,
				creditAccountId: creditAccount._id,
				idempotencyKey: buildIdempotencyKey(
					"suspense-escalation",
					"transfer",
					args.transferRequestId
				),
				mortgageId: args.mortgageId,
				obligationId: args.obligationId,
				source: HEALING_SOURCE,
				reason: `Transfer confirmation retrigger failed after ${MAX_TRANSFER_HEALING_ATTEMPTS} attempts`,
				metadata: { attemptCount },
			});

			await auditLog.log(ctx, {
				action: "transfer.self_healing_escalated",
				actorId: "system",
				resourceType: "transferRequest",
				resourceId: args.transferRequestId,
				severity: "error",
				metadata: {
					attemptCount,
					mortgageId: args.mortgageId,
					direction: args.direction,
				},
			});

			return { action: "escalated" as const, attemptCount };
		}

		// ── Retry: schedule placeholder retrigger ──
		if (existing) {
			await ctx.db.patch(existing._id, {
				status: "retrying",
				attemptCount,
				lastAttemptAt: Date.now(),
			});
		} else {
			await ctx.db.insert("transferHealingAttempts", {
				transferRequestId: args.transferRequestId,
				attemptCount,
				lastAttemptAt: Date.now(),
				status: "retrying",
				createdAt: Date.now(),
			});
		}

		await ctx.scheduler.runAfter(
			0,
			makeInternalRef<
				"mutation",
				{
					transferRequestId: Id<"transferRequests">;
					direction: string;
					amount: number;
				},
				void
			>(
				"payments/cashLedger/transferReconciliationCron:retryTransferConfirmationEffect"
			),
			{
				transferRequestId: args.transferRequestId,
				direction: args.direction,
				amount: args.amount,
			}
		);

		return { action: "retriggered" as const, attemptCount };
	},
});

// ── T-013: transferReconciliationCron ────────────────────────────────

/**
 * Cron handler: find confirmed transfers missing journal entries and retrigger them.
 */
export const transferReconciliationCron = internalAction({
	handler: async (ctx): Promise<TransferHealingResult> => {
		const candidates = await ctx.runQuery(
			findOrphanedConfirmedTransfersForHealingRef,
			{}
		);

		if (candidates.length === 0) {
			console.info("[TRANSFER-HEALING] No orphaned confirmed transfers found.");
			return {
				checkedAt: Date.now(),
				candidatesFound: 0,
				retriggered: 0,
				escalated: 0,
			};
		}

		console.warn(
			`[TRANSFER-HEALING] Found ${candidates.length} confirmed transfers without journal entries`
		);

		let retriggered = 0;
		let escalated = 0;
		for (const candidate of candidates) {
			const result = await ctx.runMutation(retriggerTransferConfirmationRef, {
				transferRequestId: candidate.transferRequestId,
				direction: candidate.direction,
				amount: candidate.amount,
				mortgageId: candidate.mortgageId,
				obligationId: candidate.obligationId,
			});

			if (result.action === "retriggered") {
				retriggered++;
			}
			if (result.action === "escalated") {
				escalated++;
			}
		}

		if (escalated > 0) {
			console.error(
				`[TRANSFER-HEALING P0] ${escalated} transfers escalated to SUSPENSE`
			);
		}
		console.info(
			`[TRANSFER-HEALING] Complete: ${candidates.length} found, ${retriggered} retriggered, ${escalated} escalated`
		);

		return {
			checkedAt: Date.now(),
			candidatesFound: candidates.length,
			retriggered,
			escalated,
		};
	},
});
