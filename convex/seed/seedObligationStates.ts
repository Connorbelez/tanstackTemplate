import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { executeTransition } from "../engine/transition";
import type { CommandSource } from "../engine/types";
import { adminMutation } from "../fluent";

const LOG_PREFIX = "[seedObligationStates]";

/**
 * Attempt a single transition and return whether it succeeded.
 * Logs a warning on failure so callers can simply check the boolean.
 */
async function tryTransition(
	ctx: MutationCtx,
	obligationId: Id<"obligations">,
	eventType: string,
	source: CommandSource,
	payload?: Record<string, unknown>
): Promise<boolean> {
	const result = await executeTransition(ctx, {
		entityType: "obligation",
		entityId: obligationId,
		eventType,
		payload,
		source,
	});

	if (!result.success) {
		console.warn(
			`${LOG_PREFIX} ${eventType} failed for obligation ${obligationId}: ${result.reason}`
		);
	}

	return result.success;
}

/**
 * Transition obligation to settled: DUE_DATE_REACHED -> PAYMENT_APPLIED -> patch settlement fields.
 * Returns true only if both transitions succeed and the patch is applied.
 */
async function transitionToSettled(
	ctx: MutationCtx,
	obl: Doc<"obligations">,
	source: CommandSource
): Promise<boolean> {
	const duePassed = await tryTransition(
		ctx,
		obl._id,
		"DUE_DATE_REACHED",
		source
	);
	if (!duePassed) {
		return false;
	}

	const paymentPassed = await tryTransition(
		ctx,
		obl._id,
		"PAYMENT_APPLIED",
		source,
		{ amount: obl.amount, paidAt: Date.now() }
	);
	if (!paymentPassed) {
		return false;
	}

	await ctx.db.patch(obl._id, {
		amountSettled: obl.amount,
		settledAt: Date.now(),
	});
	return true;
}

/**
 * Transition obligation to due: DUE_DATE_REACHED.
 */
async function transitionToDue(
	ctx: MutationCtx,
	obl: Doc<"obligations">,
	source: CommandSource
): Promise<boolean> {
	return tryTransition(ctx, obl._id, "DUE_DATE_REACHED", source);
}

/**
 * Transition obligation to overdue: DUE_DATE_REACHED -> GRACE_PERIOD_EXPIRED.
 */
async function transitionToOverdue(
	ctx: MutationCtx,
	obl: Doc<"obligations">,
	source: CommandSource
): Promise<boolean> {
	const duePassed = await tryTransition(
		ctx,
		obl._id,
		"DUE_DATE_REACHED",
		source
	);
	if (!duePassed) {
		return false;
	}

	return tryTransition(ctx, obl._id, "GRACE_PERIOD_EXPIRED", source);
}

/**
 * Transition some obligations to non-initial states to create a realistic mix.
 * Uses executeTransition so each state change gets a proper journal entry.
 *
 * Per mortgage, transitions by paymentNumber:
 *   - Payment 1: settled (paid)
 *   - Payment 2: due (due date reached)
 *   - Payment 3: overdue (grace period expired)
 *   - Remaining: upcoming (unchanged)
 */
export async function seedObligationStatesImpl(
	ctx: MutationCtx,
	args: { mortgageIds: Id<"mortgages">[] }
) {
	let transitioned = 0;
	const source: CommandSource = {
		channel: "admin_dashboard",
		actorType: "system",
	};

	for (const mortgageId of args.mortgageIds) {
		const obligations = await ctx.db
			.query("obligations")
			.withIndex("by_mortgage_and_date", (q) =>
				q.eq("mortgageId", mortgageId)
			)
			.collect();

		obligations.sort((a, b) => a.paymentNumber - b.paymentNumber);

		for (let i = 0; i < obligations.length; i++) {
			const obl = obligations[i];
			let succeeded = false;

			if (i === 0) {
				succeeded = await transitionToSettled(ctx, obl, source);
			} else if (i === 1) {
				succeeded = await transitionToDue(ctx, obl, source);
			} else if (i === 2) {
				succeeded = await transitionToOverdue(ctx, obl, source);
			}

			if (succeeded) {
				transitioned++;
			}
		}
	}

	return { transitioned };
}

export const seedObligationStates = adminMutation
	.input({ mortgageIds: v.array(v.id("mortgages")) })
	.handler(async (ctx, args) =>
		seedObligationStatesImpl(ctx as unknown as MutationCtx, {
			mortgageIds: args.mortgageIds,
		})
	)
	.public();
