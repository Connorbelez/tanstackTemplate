import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../../_generated/server";
import { auditLog } from "../../auditLog";
import type { CommandSource } from "../../engine/types";
import { sourceValidator } from "../../engine/validators";
import { adminMutation } from "../../fluent";
import { requireCashAccount } from "./accounts";
import {
	postCashApplication,
	postCashCorrectionForEntry,
	postObligationWriteOff,
	postSuspenseResolution,
} from "./integrations";
import { postCashEntryInternal } from "./postEntry";
import { buildIdempotencyKey } from "./types";
import { postCashCorrectionArgsValidator } from "./validators";
import { runWaiveObligationBalance } from "./waiveObligationBalanceHandler";

export const postLenderPayout = internalMutation({
	args: {
		mortgageId: v.id("mortgages"),
		lenderId: v.id("lenders"),
		amount: v.number(),
		effectiveDate: v.string(),
		idempotencyKey: v.string(),
		source: sourceValidator,
		reason: v.optional(v.string()),
		postingGroupId: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		if (!Number.isSafeInteger(args.amount) || args.amount <= 0) {
			throw new ConvexError("Payout amount must be a positive safe integer");
		}

		const lenderPayableAccount = await requireCashAccount(
			ctx.db,
			{
				family: "LENDER_PAYABLE",
				mortgageId: args.mortgageId,
				lenderId: args.lenderId,
			},
			"postLenderPayout"
		);
		const trustCashAccount = await requireCashAccount(
			ctx.db,
			{
				family: "TRUST_CASH",
				mortgageId: args.mortgageId,
			},
			"postLenderPayout"
		);

		return postCashEntryInternal(ctx, {
			entryType: "LENDER_PAYOUT_SENT",
			effectiveDate: args.effectiveDate,
			amount: args.amount,
			debitAccountId: lenderPayableAccount._id,
			creditAccountId: trustCashAccount._id,
			idempotencyKey: args.idempotencyKey,
			mortgageId: args.mortgageId,
			lenderId: args.lenderId,
			source: args.source,
			reason: args.reason,
			postingGroupId: args.postingGroupId,
		});
	},
});

export const postCashCorrection = internalMutation({
	args: postCashCorrectionArgsValidator,
	handler: async (ctx, args) => {
		return postCashCorrectionForEntry(ctx, {
			originalEntryId: args.originalEntryId,
			reason: args.reason,
			source: args.source,
			effectiveDate: args.effectiveDate,
			replacement: args.replacement,
		});
	},
});

// ── Admin Waiver ─────────────────────────────────────────────────────

export const waiveObligationBalance = adminMutation
	.input({
		obligationId: v.id("obligations"),
		amount: v.number(),
		reason: v.string(),
		idempotencyKey: v.optional(v.string()),
	})
	.handler(async (ctx, args) => {
		if (!Number.isSafeInteger(args.amount) || args.amount <= 0) {
			throw new ConvexError(
				"Waiver amount must be a positive safe integer (cents)"
			);
		}
		return runWaiveObligationBalance(ctx, args, ctx.viewer);
	})
	.public();

// ── Write-Off ────────────────────────────────────────────────────────

const TERMINAL_ATTEMPT_STATUSES = new Set([
	"confirmed",
	"permanent_fail",
	"cancelled",
]);

const ACTIVE_PLAN_ENTRY_STATUSES = ["planned", "executing"] as const;

async function findActiveCollectionAttempts(
	ctx: MutationCtx,
	obligationId: Id<"obligations">
): Promise<Doc<"collectionAttempts">[]> {
	// collectionPlanEntries.obligationIds is an array — no index on individual
	// obligationId, so we scan planned/executing entries and filter in JS.
	// We at least restrict the scan to entries with relevant statuses via the
	// `by_status` index; this is expected to run over a relatively small
	// dataset (per obligation / per customer).
	// The N+1 attempt queries are acknowledged — a future improvement could collect
	// plan entry IDs first then query attempts by a batch index.
	const activePlanEntries: Doc<"collectionPlanEntries">[] = [];

	for (const status of ACTIVE_PLAN_ENTRY_STATUSES) {
		const entries = await ctx.db
			.query("collectionPlanEntries")
			.withIndex("by_status", (q) => q.eq("status", status))
			.collect();
		for (const entry of entries) {
			if (entry.obligationIds.includes(obligationId)) {
				activePlanEntries.push(entry);
			}
		}
	}

	if (activePlanEntries.length === 0) {
		return [];
	}

	// For each active plan entry, find non-terminal collection attempts
	const activeAttempts: Doc<"collectionAttempts">[] = [];
	for (const planEntry of activePlanEntries) {
		const attempts = await ctx.db
			.query("collectionAttempts")
			.withIndex("by_plan_entry", (q) => q.eq("planEntryId", planEntry._id))
			.collect();
		for (const attempt of attempts) {
			if (!TERMINAL_ATTEMPT_STATUSES.has(attempt.status)) {
				activeAttempts.push(attempt);
			}
		}
	}

	return activeAttempts;
}

const WRITE_OFF_BLOCKED_STATUSES = new Set(["settled", "waived"]);

export const writeOffObligationBalance = adminMutation
	.input({
		obligationId: v.id("obligations"),
		amount: v.number(),
		reason: v.string(),
		/** Caller-generated UUID (or equivalent) that uniquely identifies this write-off intent. */
		idempotencyKey: v.string(),
	})
	.handler(async (ctx, args) => {
		// 1. Validate amount
		if (!Number.isSafeInteger(args.amount) || args.amount <= 0) {
			throw new ConvexError("Write-off amount must be a positive safe integer");
		}

		// 2. Validate reason — reject blank/whitespace-only values at the public boundary
		const reason = args.reason.trim();
		if (reason.length === 0) {
			throw new ConvexError("Write-off reason cannot be blank");
		}

		// 3. Load obligation, reject if settled/waived
		const obligation = await ctx.db.get(args.obligationId);
		if (!obligation) {
			throw new ConvexError(`Obligation not found: ${args.obligationId}`);
		}
		if (WRITE_OFF_BLOCKED_STATUSES.has(obligation.status)) {
			throw new ConvexError(
				`Cannot write off obligation in "${obligation.status}" status`
			);
		}

		// 3. Check active collection attempts (warning only, does not block)
		const activeAttempts = await findActiveCollectionAttempts(
			ctx,
			args.obligationId
		);
		const hasActiveCollectionWarning = activeAttempts.length > 0;

		// 4. Build source from viewer context
		const source: CommandSource = {
			actorType: "admin",
			actorId: ctx.viewer.authId,
			channel: "admin_dashboard",
		};

		// 5. Post the write-off entry (pass pre-loaded obligation to avoid redundant load)
		const result = await postObligationWriteOff(ctx, {
			obligationId: args.obligationId,
			amount: args.amount,
			reason,
			source,
			idempotencyKey: buildIdempotencyKey("write-off", args.idempotencyKey),
			obligation,
		});

		// 6. Audit log
		await auditLog.log(ctx, {
			action: "cashLedger.obligation_written_off",
			actorId: ctx.viewer.authId,
			resourceType: "obligation",
			resourceId: args.obligationId,
			severity: "warning",
			metadata: {
				amount: args.amount,
				reason,
				entryId: result.entry._id,
				hasActiveCollectionWarning,
				activeAttemptCount: activeAttempts.length,
			},
		});

		return {
			entry: result.entry,
			writtenOffAmount: args.amount,
			hasActiveCollectionWarning,
		};
	})
	.public();

// ── Cash Application ─────────────────────────────────────────────────

export const applyCashToObligation = adminMutation
	.input({
		sourceAccountId: v.id("cash_ledger_accounts"),
		targetObligationId: v.id("obligations"),
		amount: v.number(),
		reason: v.string(),
		sourceEntryId: v.optional(v.id("cash_ledger_journal_entries")),
		/** Caller-generated UUID that uniquely identifies this cash application intent. */
		idempotencyKey: v.string(),
	})
	.handler(async (ctx, args) => {
		// 1. Validate amount
		if (!Number.isSafeInteger(args.amount) || args.amount <= 0) {
			throw new ConvexError(
				"Cash application amount must be a positive safe integer (cents)"
			);
		}

		// 2. Validate reason
		const reason = args.reason.trim();
		if (reason.length === 0) {
			throw new ConvexError("Cash application reason cannot be blank");
		}

		// 3. Build source from viewer context
		const source: CommandSource = {
			actorType: "admin",
			actorId: ctx.viewer.authId,
			channel: "admin_dashboard",
		};

		// 4. Post the cash application entry
		const result = await postCashApplication(ctx, {
			sourceAccountId: args.sourceAccountId,
			targetObligationId: args.targetObligationId,
			amount: args.amount,
			reason,
			sourceEntryId: args.sourceEntryId,
			source,
			idempotencyKey: args.idempotencyKey,
		});

		// 5. Audit log
		await auditLog.log(ctx, {
			action: "cashLedger.cash_applied",
			actorId: ctx.viewer.authId,
			resourceType: "obligation",
			resourceId: args.targetObligationId,
			severity: "info",
			metadata: {
				amount: args.amount,
				reason,
				sourceAccountId: args.sourceAccountId,
				entryId: result.entry._id,
			},
		});

		return { entry: result.entry, appliedAmount: args.amount };
	})
	.public();

// ── Suspense Resolution ──────────────────────────────────────────────

export const resolveSuspenseItem = adminMutation
	.input({
		suspenseAccountId: v.id("cash_ledger_accounts"),
		resolutionType: v.union(
			v.literal("match"),
			v.literal("refund"),
			v.literal("write_off")
		),
		amount: v.number(),
		obligationId: v.optional(v.id("obligations")),
		reason: v.string(),
		sourceEntryId: v.optional(v.id("cash_ledger_journal_entries")),
		/** Caller-generated UUID that uniquely identifies this resolution intent. */
		idempotencyKey: v.string(),
	})
	.handler(async (ctx, args) => {
		// 1. Validate amount
		if (!Number.isSafeInteger(args.amount) || args.amount <= 0) {
			throw new ConvexError(
				"Suspense resolution amount must be a positive safe integer (cents)"
			);
		}

		// 2. Validate reason
		const reason = args.reason.trim();
		if (reason.length === 0) {
			throw new ConvexError("Suspense resolution reason cannot be blank");
		}

		// 3. Build source from viewer context
		const source: CommandSource = {
			actorType: "admin",
			actorId: ctx.viewer.authId,
			channel: "admin_dashboard",
		};

		// 4. Build the resolution union object from flat args
		let resolution:
			| { type: "match"; obligationId: Id<"obligations">; amount: number }
			| { type: "refund"; amount: number; reason: string }
			| { type: "write_off"; amount: number; reason: string };

		if (args.resolutionType === "match") {
			if (!args.obligationId) {
				throw new ConvexError(
					'Resolution type "match" requires an obligationId'
				);
			}
			resolution = {
				type: "match",
				obligationId: args.obligationId,
				amount: args.amount,
			};
		} else if (args.resolutionType === "refund") {
			resolution = {
				type: "refund",
				amount: args.amount,
				reason,
			};
		} else {
			resolution = {
				type: "write_off",
				amount: args.amount,
				reason,
			};
		}

		// 5. Call postSuspenseResolution
		const result = await postSuspenseResolution(ctx, {
			suspenseAccountId: args.suspenseAccountId,
			resolution,
			sourceEntryId: args.sourceEntryId,
			source,
			reason,
			idempotencyKey: args.idempotencyKey,
		});

		// 6. Audit log — severity based on resolution type
		const severity = args.resolutionType === "match" ? "info" : "warning";

		await auditLog.log(ctx, {
			action: "cashLedger.suspense_resolved",
			actorId: ctx.viewer.authId,
			resourceType: "cash_ledger_account",
			resourceId: args.suspenseAccountId,
			severity,
			metadata: {
				resolutionType: args.resolutionType,
				amount: args.amount,
				reason,
				obligationId: args.obligationId ?? null,
			},
		});

		return { resolutionType: args.resolutionType, ...result };
	})
	.public();
