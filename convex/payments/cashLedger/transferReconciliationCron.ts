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
import { findOrphanedConfirmedTransferCandidates } from "./transferReconciliation";
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
		direction: "inbound" | "outbound";
		amount: number;
		mortgageId?: Id<"mortgages">;
		obligationId?: Id<"obligations">;
		lenderId?: Id<"lenders">;
	},
	{
		action: "skipped" | "retriggered" | "escalated" | "pending_no_effect";
		attemptCount: number;
	}
>(
	"payments/cashLedger/transferReconciliationCron:retriggerTransferConfirmation"
);

const HEALING_SOURCE: CommandSource = {
	actorType: "system",
	channel: "scheduler",
};

// ── TR-011: findOrphanedConfirmedTransfersForHealing ─────────────────

/**
 * Find confirmed transfers older than 5 minutes that have no matching
 * journal entry of the expected type, filtering out those already escalated.
 * Delegates orphan detection to the shared filter in transferReconciliation.ts.
 */
export const findOrphanedConfirmedTransfersForHealing = internalQuery({
	args: {},
	handler: async (ctx): Promise<TransferHealingCandidate[]> => {
		const orphans = await findOrphanedConfirmedTransferCandidates(ctx);

		const candidates: TransferHealingCandidate[] = [];
		for (const orphan of orphans) {
			// Filter out already-escalated transfers (healing-specific)
			const healingAttempt = await ctx.db
				.query("transferHealingAttempts")
				.withIndex("by_transfer_request", (q) =>
					q.eq("transferRequestId", orphan.transferRequestId)
				)
				.first();

			if (healingAttempt?.status === "escalated") {
				continue;
			}

			candidates.push({
				transferRequestId: orphan.transferRequestId,
				direction: orphan.direction,
				amount: orphan.amount,
				confirmedAt: orphan.confirmedAt,
				lenderId: orphan.lenderId,
				mortgageId: orphan.mortgageId,
				obligationId: orphan.obligationId,
			});
		}

		return candidates;
	},
});

// ── TR-012: retriggerTransferConfirmation ────────────────────────────

/**
 * Placeholder effect for retrying transfer confirmation.
 * TODO: Replace with actual publishTransferConfirmed call when implemented.
 * WARNING: This is a no-op — the cron counts the result as "retriggered"
 * but no actual retry occurs. The healing attempt record tracks state.
 */
export const retryTransferConfirmationEffect = internalMutation({
	args: {
		transferRequestId: v.id("transferRequests"),
		direction: v.union(v.literal("inbound"), v.literal("outbound")),
		amount: v.number(),
	},
	handler: async (_ctx, args) => {
		console.error(
			"[TRANSFER-HEALING] retryTransferConfirmationEffect is a PLACEHOLDER — " +
				`transfer=${args.transferRequestId} was NOT actually retried. ` +
				`direction=${args.direction}, amount=${args.amount}.`
		);
	},
});

/**
 * Attempt to retrigger confirmation journal entry for an orphaned transfer.
 * Four code paths: skip (already escalated), escalate with SUSPENSE entry,
 * escalate without entry (no mortgageId), or retry.
 */
export const retriggerTransferConfirmation = internalMutation({
	args: {
		transferRequestId: v.id("transferRequests"),
		direction: v.union(v.literal("inbound"), v.literal("outbound")),
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
				args.direction === "inbound"
					? ("BORROWER_RECEIVABLE" as const)
					: ("LENDER_PAYABLE" as const);

			// Cannot resolve LENDER_PAYABLE account without a lenderId
			if (creditFamily === "LENDER_PAYABLE" && !args.lenderId) {
				console.error(
					`[TRANSFER-HEALING] Cannot escalate transfer=${args.transferRequestId} ` +
						"to SUSPENSE: missing lenderId. Skipping journal entry."
				);
				await auditLog.log(ctx, {
					action: "transfer.self_healing_escalated_no_lender",
					actorId: "system",
					resourceType: "transferRequest",
					resourceId: args.transferRequestId,
					severity: "error",
					metadata: {
						attemptCount,
						mortgageId: args.mortgageId,
						direction: args.direction,
						amount: args.amount,
					},
				});
				return { action: "escalated" as const, attemptCount };
			}
			const creditAccountSpec =
				creditFamily === "LENDER_PAYABLE"
					? {
							family: creditFamily,
							mortgageId: args.mortgageId,
							lenderId: args.lenderId,
						}
					: {
							family: creditFamily,
							mortgageId: args.mortgageId,
							obligationId: args.obligationId,
						};
			const creditAccount = await requireCashAccount(
				ctx.db,
				creditAccountSpec,
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
				transferRequestId: args.transferRequestId,
				lenderId: args.direction === "outbound" ? args.lenderId : undefined,
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
					direction: "inbound" | "outbound";
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

		// NOTE: retryTransferConfirmationEffect is currently a no-op placeholder.
		// Return "pending_no_effect" so the batch summary distinguishes real retries
		// from placeholder no-ops. Change to "retriggered" once a real publish hook exists.
		return { action: "pending_no_effect" as const, attemptCount };
	},
});

// ── TR-013: transferReconciliationCron ───────────────────────────────

/**
 * Cron handler: find confirmed transfers missing journal entries and retrigger them.
 * Per-candidate error handling ensures one failure does not abort the batch.
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
				pendingNoEffect: 0,
				escalated: 0,
				skipped: 0,
			};
		}

		console.warn(
			`[TRANSFER-HEALING] Found ${candidates.length} confirmed transfers without journal entries`
		);

		let retriggered = 0;
		let pendingNoEffect = 0;
		let escalated = 0;
		let skipped = 0;
		for (const candidate of candidates) {
			try {
				const result = await ctx.runMutation(retriggerTransferConfirmationRef, {
					transferRequestId: candidate.transferRequestId,
					direction: candidate.direction,
					amount: candidate.amount,
					mortgageId: candidate.mortgageId,
					obligationId: candidate.obligationId,
					lenderId: candidate.lenderId,
				});

				if (result.action === "retriggered") {
					retriggered++;
				} else if (result.action === "pending_no_effect") {
					pendingNoEffect++;
				} else if (result.action === "escalated") {
					escalated++;
				} else if (result.action === "skipped") {
					skipped++;
				}
			} catch (error) {
				console.error(
					`[TRANSFER-HEALING] Failed to retrigger transfer=${candidate.transferRequestId}:`,
					error instanceof Error ? error.message : String(error)
				);
			}
		}

		if (escalated > 0) {
			console.error(
				`[TRANSFER-HEALING P0] ${escalated} transfers escalated to SUSPENSE`
			);
		}
		if (pendingNoEffect > 0) {
			console.warn(
				`[TRANSFER-HEALING] ${pendingNoEffect} transfers scheduled placeholder retry (no real effect)`
			);
		}
		console.info(
			`[TRANSFER-HEALING] Complete: ${candidates.length} found, ` +
				`${retriggered} retriggered, ${pendingNoEffect} pending (no effect), ` +
				`${escalated} escalated, ${skipped} skipped`
		);

		return {
			checkedAt: Date.now(),
			candidatesFound: candidates.length,
			retriggered,
			pendingNoEffect,
			escalated,
			skipped,
		};
	},
});
