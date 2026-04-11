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
import type {
	TransferHealingCandidate,
	TransferHealingResult,
} from "./transferHealingTypes";
import { findOrphanedConfirmedTransferCandidates } from "./transferReconciliation";

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

/**
 * Surface a confirmed transfer without ledger linkage as an integrity defect.
 *
 * Audit policy: a transfer that has already reached `confirmed` without an
 * authoritative ledger entry is a primary-state defect, not a retriable
 * derived-state gap. The cron must surface and escalate it, not silently
 * reconfirm it.
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
		if (existing) {
			await ctx.db.patch(existing._id, {
				status: "escalated",
				attemptCount,
				lastAttemptAt: Date.now(),
				escalatedAt: existing.escalatedAt ?? Date.now(),
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

		await auditLog.log(ctx, {
			action: "transfer.integrity_defect.confirmed_without_ledger",
			actorId: "system",
			resourceType: "transferRequest",
			resourceId: args.transferRequestId,
			severity: "error",
			metadata: {
				amount: args.amount,
				attemptCount,
				direction: args.direction,
				lenderId: args.lenderId,
				mortgageId: args.mortgageId,
				obligationId: args.obligationId,
				reason:
					"Confirmed transfer has no authoritative cash-ledger linkage. Manual investigation required.",
			},
		});

		return { action: "escalated" as const, attemptCount };
	},
});

// ── TR-013: transferReconciliationCron ───────────────────────────────

/**
 * Cron handler: find confirmed transfers missing journal entries and surface
 * them as integrity defects. Per-candidate error handling ensures one failure
 * does not abort the batch.
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
