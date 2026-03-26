import { ConvexError, v } from "convex/values";
import { internalMutation } from "../../_generated/server";

/**
 * Claim dispersal entries for payout BEFORE posting to the cash ledger.
 *
 * Atomically transitions entries from "pending" → "disbursed" in a single
 * mutation. If ANY entry is not in "pending" status (e.g. already claimed
 * by a concurrent admin or cron process), the entire claim fails — preventing
 * double payouts.
 *
 * Callers MUST call this before `postLenderPayout`. If the ledger post
 * subsequently fails, call `revertClaimedEntries` to roll back.
 */
export const claimEntriesForPayout = internalMutation({
	args: {
		entryIds: v.array(v.id("dispersalEntries")),
		payoutDate: v.string(),
	},
	handler: async (ctx, args) => {
		for (const id of args.entryIds) {
			const entry = await ctx.db.get(id);
			if (!entry) {
				throw new ConvexError(
					`Dispersal entry ${id} not found during payout claim`
				);
			}
			if (entry.status !== "pending") {
				throw new ConvexError(
					`Dispersal entry ${id} has status "${entry.status}", expected "pending" — possible concurrent payout`
				);
			}
			await ctx.db.patch(id, {
				status: "disbursed" as const,
				payoutDate: args.payoutDate,
			});
		}
	},
});

/**
 * Revert claimed entries back to "pending" if the subsequent cash ledger
 * posting fails. This is the compensating action for `claimEntriesForPayout`.
 */
export const revertClaimedEntries = internalMutation({
	args: {
		entryIds: v.array(v.id("dispersalEntries")),
	},
	handler: async (ctx, args) => {
		for (const id of args.entryIds) {
			const entry = await ctx.db.get(id);
			if (!entry) {
				throw new ConvexError(
					`Dispersal entry ${id} not found during claim revert`
				);
			}
			// Only revert if still "disbursed" — avoid touching entries that
			// were modified by another process in the interim.
			if (entry.status === "disbursed") {
				await ctx.db.patch(id, {
					status: "pending" as const,
					payoutDate: undefined,
				});
			}
		}
	},
});

/**
 * Mark dispersal entries as disbursed after payout is posted.
 *
 * @deprecated Use `claimEntriesForPayout` before posting and
 * `revertClaimedEntries` on failure instead. Kept for backward compatibility.
 *
 * Enforces an optimistic concurrency guard: each entry MUST have
 * status === "pending" before being marked "disbursed". This prevents
 * double-payout if admin and batch cron process the same entries
 * concurrently (they use different idempotency key prefixes).
 *
 * Persists payoutDate for audit traceability.
 */
export const markEntriesDisbursed = internalMutation({
	args: {
		entryIds: v.array(v.id("dispersalEntries")),
		payoutDate: v.string(),
	},
	handler: async (ctx, args) => {
		for (const id of args.entryIds) {
			const entry = await ctx.db.get(id);
			if (!entry) {
				throw new ConvexError(
					`Dispersal entry ${id} not found during disbursement marking`
				);
			}
			if (entry.status !== "pending") {
				throw new ConvexError(
					`Dispersal entry ${id} has status "${entry.status}", expected "pending" — possible concurrent payout`
				);
			}
			await ctx.db.patch(id, {
				status: "disbursed" as const,
				payoutDate: args.payoutDate,
			});
		}
	},
});

/**
 * Update the lender's lastPayoutDate after a payout round completes.
 */
export const updateLenderPayoutDate = internalMutation({
	args: {
		lenderId: v.id("lenders"),
		payoutDate: v.string(),
	},
	handler: async (ctx, args) => {
		const lender = await ctx.db.get(args.lenderId);
		if (!lender) {
			throw new ConvexError(
				`Lender ${args.lenderId} not found during payout date update`
			);
		}
		await ctx.db.patch(args.lenderId, {
			lastPayoutDate: args.payoutDate,
		});
	},
});
