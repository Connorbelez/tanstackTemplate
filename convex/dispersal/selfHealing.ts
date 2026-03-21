import type { FunctionReference, FunctionType } from "convex/server";
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import {
	internalAction,
	internalMutation,
	internalQuery,
} from "../_generated/server";
import { auditLog } from "../auditLog";
import type { CommandSource } from "../engine/types";
import { unixMsToBusinessDate } from "../lib/businessDates";
import {
	getOrCreateCashAccount,
	requireCashAccount,
} from "../payments/cashLedger/accounts";
import { postCashEntryInternal } from "../payments/cashLedger/postEntry";
import type { HealingCandidate, HealingResult } from "./selfHealingTypes";
import { MAX_HEALING_ATTEMPTS } from "./selfHealingTypes";

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

const findSettledWithoutDispersalsRef = makeInternalRef<
	"query",
	Record<string, never>,
	HealingCandidate[]
>("dispersal/selfHealing:findSettledWithoutDispersals");

const getJournalSettledAmountRef = makeInternalRef<
	"query",
	{ obligationId: Id<"obligations"> },
	number
>(
	"payments/cashLedger/reconciliation:getJournalSettledAmountForObligationInternal"
);

const retriggerDispersalRef = makeInternalRef<
	"mutation",
	{
		obligationId: Id<"obligations">;
		mortgageId: Id<"mortgages">;
		settledAmount: number;
		settledDate: string;
	},
	{ action: "skipped" | "escalated" | "retriggered"; attemptCount: number }
>("dispersal/selfHealing:retriggerDispersal");

const HEALING_SOURCE: CommandSource = {
	actorType: "system",
	channel: "scheduler",
};

// ── T-009: findSettledWithoutDispersals ──────────────────────────────

// TODO: At scale, paginate the settled obligations query and batch the
// per-obligation lookups to avoid N+1. Pre-launch volume is small enough
// that the current approach is acceptable on a 15-minute interval.

/**
 * Find settled obligations that have no dispersal entries,
 * filtering out those already escalated.
 */
export const findSettledWithoutDispersals = internalQuery({
	args: {},
	handler: async (ctx): Promise<HealingCandidate[]> => {
		const settled = await ctx.db
			.query("obligations")
			.withIndex("by_status", (q) => q.eq("status", "settled"))
			.collect();

		const candidates: HealingCandidate[] = [];
		for (const obligation of settled) {
			const hasDispersal = await ctx.db
				.query("dispersalEntries")
				.withIndex("by_obligation", (q) => q.eq("obligationId", obligation._id))
				.first();
			if (hasDispersal) {
				continue;
			}

			const healingAttempt = await ctx.db
				.query("dispersalHealingAttempts")
				.withIndex("by_obligation", (q) => q.eq("obligationId", obligation._id))
				.first();
			if (healingAttempt?.status === "escalated") {
				continue;
			}

			candidates.push({
				obligationId: obligation._id,
				mortgageId: obligation.mortgageId,
				amount: obligation.amount,
				settledAt: obligation.settledAt,
			});
		}
		return candidates;
	},
});

// ── T-010: retriggerDispersal ────────────────────────────────────────

/**
 * Attempt to retrigger dispersal for an orphaned settled obligation.
 * Three code paths: retry, escalate, or skip (already escalated).
 */
export const retriggerDispersal = internalMutation({
	args: {
		obligationId: v.id("obligations"),
		mortgageId: v.id("mortgages"),
		settledAmount: v.number(),
		settledDate: v.string(),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query("dispersalHealingAttempts")
			.withIndex("by_obligation", (q) =>
				q.eq("obligationId", args.obligationId)
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

		if (attemptCount > MAX_HEALING_ATTEMPTS) {
			// ── Escalate to SUSPENSE ──
			if (existing) {
				await ctx.db.patch(existing._id, {
					status: "escalated",
					attemptCount,
					lastAttemptAt: Date.now(),
					escalatedAt: Date.now(),
				});
			} else {
				await ctx.db.insert("dispersalHealingAttempts", {
					obligationId: args.obligationId,
					attemptCount,
					lastAttemptAt: Date.now(),
					escalatedAt: Date.now(),
					status: "escalated",
					createdAt: Date.now(),
				});
			}

			const suspenseAccount = await getOrCreateCashAccount(ctx, {
				family: "SUSPENSE",
				mortgageId: args.mortgageId,
				obligationId: args.obligationId,
			});

			const receivableAccount = await requireCashAccount(
				ctx.db,
				{
					family: "BORROWER_RECEIVABLE",
					mortgageId: args.mortgageId,
					obligationId: args.obligationId,
				},
				"dispersalSelfHealing:escalation"
			);

			await postCashEntryInternal(ctx, {
				entryType: "SUSPENSE_ESCALATED",
				effectiveDate: unixMsToBusinessDate(Date.now()),
				amount: args.settledAmount,
				debitAccountId: suspenseAccount._id,
				creditAccountId: receivableAccount._id,
				idempotencyKey: `suspense-escalation:${args.obligationId}`,
				mortgageId: args.mortgageId,
				obligationId: args.obligationId,
				source: HEALING_SOURCE,
				reason: "Dispersal retrigger failed after 3 attempts",
				metadata: { attemptCount },
			});

			await auditLog.log(ctx, {
				action: "dispersal.self_healing_escalated",
				actorId: "system",
				resourceType: "obligation",
				resourceId: args.obligationId,
				severity: "error",
				metadata: {
					attemptCount,
					mortgageId: args.mortgageId,
				},
			});

			return { action: "escalated" as const, attemptCount };
		}

		// ── Retry: schedule createDispersalEntries ──
		if (existing) {
			await ctx.db.patch(existing._id, {
				status: "retrying",
				attemptCount,
				lastAttemptAt: Date.now(),
			});
		} else {
			await ctx.db.insert("dispersalHealingAttempts", {
				obligationId: args.obligationId,
				attemptCount,
				lastAttemptAt: Date.now(),
				status: "retrying",
				createdAt: Date.now(),
			});
		}

		await ctx.scheduler.runAfter(
			0,
			internal.dispersal.createDispersalEntries.createDispersalEntries,
			{
				obligationId: args.obligationId,
				mortgageId: args.mortgageId,
				settledAmount: args.settledAmount,
				settledDate: args.settledDate,
				idempotencyKey: `dispersal:${args.obligationId}`,
				source: HEALING_SOURCE,
			}
		);

		return { action: "retriggered" as const, attemptCount };
	},
});

// ── T-011: resolveHealingAttempt ─────────────────────────────────────

/**
 * Mark a healing attempt as resolved once dispersal entries exist.
 * Called manually by admin or by future auto-resolution logic — not by
 * the self-healing cron itself (which only retries or escalates).
 */
export const resolveHealingAttempt = internalMutation({
	args: { obligationId: v.id("obligations") },
	handler: async (ctx, { obligationId }) => {
		const attempt = await ctx.db
			.query("dispersalHealingAttempts")
			.withIndex("by_obligation", (q) => q.eq("obligationId", obligationId))
			.first();
		if (attempt) {
			await ctx.db.patch(attempt._id, { status: "resolved" });
		}
	},
});

// ── T-012: dispersalSelfHealingCron ──────────────────────────────────

/**
 * Cron handler: find settled obligations missing dispersals and retrigger them.
 */
export const dispersalSelfHealingCron = internalAction({
	handler: async (ctx): Promise<HealingResult> => {
		const candidates = await ctx.runQuery(findSettledWithoutDispersalsRef, {});

		if (candidates.length === 0) {
			console.info("[DISPERSAL-HEALING] No orphaned settlements found.");
			return {
				checkedAt: Date.now(),
				candidatesFound: 0,
				retriggered: 0,
				escalated: 0,
			};
		}

		console.warn(
			`[DISPERSAL-HEALING] Found ${candidates.length} settled obligations without dispersals`
		);

		let retriggered = 0;
		let escalated = 0;
		for (const candidate of candidates) {
			const settledDate = candidate.settledAt
				? unixMsToBusinessDate(candidate.settledAt)
				: unixMsToBusinessDate(Date.now());

			const journalAmount = await ctx.runQuery(getJournalSettledAmountRef, {
				obligationId: candidate.obligationId,
			});
			const settledAmount =
				journalAmount > 0 ? journalAmount : candidate.amount;

			const result = await ctx.runMutation(retriggerDispersalRef, {
				obligationId: candidate.obligationId,
				mortgageId: candidate.mortgageId,
				settledAmount,
				settledDate,
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
				`[DISPERSAL-HEALING P0] ${escalated} obligations escalated to SUSPENSE`
			);
		}
		console.info(
			`[DISPERSAL-HEALING] Complete: ${candidates.length} found, ${retriggered} retriggered, ${escalated} escalated`
		);

		return {
			checkedAt: Date.now(),
			candidatesFound: candidates.length,
			retriggered,
			escalated,
		};
	},
});
