import { ConvexError } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { auditLog } from "../../auditLog";
import { buildSource } from "../../engine/commands";
import { executeTransition } from "../../engine/transition";
import type { Viewer } from "../../fluent";
import {
	findCashAccount,
	getCashAccountBalance,
	safeBigintToNumber,
} from "./accounts";
import { postObligationWaiver } from "./integrations";
import { buildIdempotencyKey } from "./types";

export interface WaiveObligationBalanceArgs {
	amount: number;
	idempotencyKey?: string;
	obligationId: Id<"obligations">;
	reason: string;
}

export interface WaiveObligationBalanceResult {
	idempotencyKey: string;
	isFullWaiver: boolean;
	journalEntryId: Id<"cash_ledger_journal_entries">;
	outstandingAfter: number;
	outstandingBefore: number;
	waiverAmount: number;
}

async function logWaiverRejected(
	ctx: MutationCtx,
	actorId: string,
	obligationId: Id<"obligations">,
	metadata: Record<string, unknown>
) {
	await auditLog.log(ctx, {
		action: "obligation.waiver_rejected",
		actorId,
		resourceType: "obligations",
		resourceId: obligationId,
		severity: "warning",
		metadata,
	});
}

async function idempotentReplayIfPresent(
	ctx: MutationCtx,
	args: WaiveObligationBalanceArgs,
	obligation: Doc<"obligations">
): Promise<WaiveObligationBalanceResult | null> {
	const idempotencyKey = args.idempotencyKey;
	if (!idempotencyKey) {
		return null;
	}
	const existingEntry = await ctx.db
		.query("cash_ledger_journal_entries")
		.withIndex("by_idempotency", (q) => q.eq("idempotencyKey", idempotencyKey))
		.first();
	if (
		!existingEntry ||
		existingEntry.entryType !== "OBLIGATION_WAIVED" ||
		existingEntry.obligationId !== args.obligationId
	) {
		return null;
	}
	const waiverAmount = safeBigintToNumber(existingEntry.amount);
	// Prefer immutable values captured at post time, if available on the journal entry.
	// postObligationWaiver stores outstandingBefore/outstandingAfter/isFullWaiver directly in metadata.
	const metadata = (existingEntry.metadata ?? {}) as {
		outstandingBefore?: number;
		outstandingAfter?: number;
		isFullWaiver?: boolean;
	};

	let outstandingAfter: number;
	let outstandingBefore: number;
	let isFullWaiver: boolean;

	if (
		typeof metadata.outstandingAfter === "number" &&
		typeof metadata.outstandingBefore === "number" &&
		typeof metadata.isFullWaiver === "boolean"
	) {
		// Use persisted values to keep idempotent replays consistent with the original call.
		outstandingAfter = metadata.outstandingAfter;
		outstandingBefore = metadata.outstandingBefore;
		isFullWaiver = metadata.isFullWaiver;
	} else {
		// Fallback for entries without persisted waiver metadata: derive from the current balance.
		const receivableAfter = await findCashAccount(ctx.db, {
			family: "BORROWER_RECEIVABLE",
			mortgageId: obligation.mortgageId,
			obligationId: obligation._id,
		});
		outstandingAfter = receivableAfter
			? safeBigintToNumber(getCashAccountBalance(receivableAfter))
			: 0;
		outstandingBefore = outstandingAfter + waiverAmount;
		isFullWaiver = outstandingAfter === 0;
	}
	return {
		idempotencyKey,
		journalEntryId: existingEntry._id,
		waiverAmount,
		outstandingBefore,
		outstandingAfter,
		isFullWaiver,
	};
}

export async function runWaiveObligationBalance(
	ctx: MutationCtx,
	args: WaiveObligationBalanceArgs,
	viewer: Viewer
): Promise<WaiveObligationBalanceResult> {
	const actorId = viewer.authId;

	const obligation = await ctx.db.get(args.obligationId);
	if (!obligation) {
		throw new ConvexError(`Obligation not found: ${args.obligationId}`);
	}

	const replay = await idempotentReplayIfPresent(ctx, args, obligation);
	if (replay) {
		return replay;
	}

	if (obligation.status === "settled") {
		await logWaiverRejected(ctx, actorId, args.obligationId, {
			reason: "obligation_already_settled",
			obligationStatus: obligation.status,
			requestedAmount: args.amount,
			adminReason: args.reason,
		});
		throw new ConvexError(
			`Obligation ${args.obligationId} is already settled — cannot waive`
		);
	}

	if (obligation.status === "waived") {
		await logWaiverRejected(ctx, actorId, args.obligationId, {
			reason: "obligation_already_waived",
			obligationStatus: obligation.status,
			requestedAmount: args.amount,
			adminReason: args.reason,
		});
		throw new ConvexError(
			`Obligation ${args.obligationId} is already waived — no receivable to waive`
		);
	}

	const receivableAccount = await findCashAccount(ctx.db, {
		family: "BORROWER_RECEIVABLE",
		mortgageId: obligation.mortgageId,
		obligationId: obligation._id,
	});

	if (!receivableAccount) {
		await logWaiverRejected(ctx, actorId, args.obligationId, {
			reason: "no_receivable_account",
			requestedAmount: args.amount,
			adminReason: args.reason,
		});
		throw new ConvexError(
			`No BORROWER_RECEIVABLE account for obligation=${args.obligationId}. Nothing to waive.`
		);
	}

	const outstandingCents = safeBigintToNumber(
		getCashAccountBalance(receivableAccount)
	);

	if (outstandingCents <= 0) {
		await logWaiverRejected(ctx, actorId, args.obligationId, {
			reason: "zero_balance",
			outstandingBalance: outstandingCents,
			requestedAmount: args.amount,
			adminReason: args.reason,
		});
		throw new ConvexError(
			`Obligation ${args.obligationId} has no outstanding balance to waive (current: ${outstandingCents} cents)`
		);
	}

	if (args.amount > outstandingCents) {
		await logWaiverRejected(ctx, actorId, args.obligationId, {
			reason: "exceeds_balance",
			outstandingBalance: outstandingCents,
			requestedAmount: args.amount,
			adminReason: args.reason,
		});
		throw new ConvexError(
			`Waiver amount (${args.amount} cents) exceeds outstanding balance (${outstandingCents} cents)`
		);
	}

	const source = buildSource(viewer, "admin_dashboard");
	const isFullWaiver = args.amount === outstandingCents;
	const idempotencyKey =
		args.idempotencyKey ??
		buildIdempotencyKey(
			"obligation-waived-admin",
			args.obligationId,
			`${args.amount}:${args.reason}`
		);

	const result = await postObligationWaiver(ctx, {
		obligationId: args.obligationId,
		amount: args.amount,
		reason: args.reason,
		idempotencyKey,
		source,
		outstandingBefore: outstandingCents,
		outstandingAfter: outstandingCents - args.amount,
		isFullWaiver,
	});

	if (isFullWaiver) {
		const latest = await ctx.db.get(args.obligationId);
		if (latest?.status !== "waived") {
			const transitionResult = await executeTransition(ctx, {
				entityType: "obligation",
				entityId: obligation._id,
				eventType: "OBLIGATION_WAIVED",
				payload: {
					reason: args.reason,
					approvedBy: actorId,
				},
				source,
			});
			if (!transitionResult.success) {
				await auditLog.log(ctx, {
					action: "obligation.waiver_transition_rejected",
					actorId,
					resourceType: "obligations",
					resourceId: args.obligationId,
					severity: "error",
					metadata: {
						waiverAmount: args.amount,
						outstandingBefore: outstandingCents,
						outstandingAfter: outstandingCents - args.amount,
						isFullWaiver,
						reason: args.reason,
						journalEntryId: result.entry._id,
						rejectionReason: transitionResult.reason,
					},
				});
				throw new ConvexError(
					transitionResult.reason ??
						"OBLIGATION_WAIVED transition rejected after cash ledger post"
				);
			}
		}
	}

	await auditLog.log(ctx, {
		action: "obligation.waived",
		actorId,
		resourceType: "obligations",
		resourceId: args.obligationId,
		severity: "warning",
		metadata: {
			waiverAmount: args.amount,
			outstandingBefore: outstandingCents,
			outstandingAfter: outstandingCents - args.amount,
			isFullWaiver,
			reason: args.reason,
			journalEntryId: result.entry._id,
		},
	});

	return {
		idempotencyKey,
		journalEntryId: result.entry._id,
		waiverAmount: args.amount,
		outstandingBefore: outstandingCents,
		outstandingAfter: outstandingCents - args.amount,
		isFullWaiver,
	};
}
