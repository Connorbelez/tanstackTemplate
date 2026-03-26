import { internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import { internalAction } from "../../_generated/server";
import type { CommandSource } from "../../engine/types";
import { buildIdempotencyKey } from "../cashLedger/types";
import {
	DEFAULT_PAYOUT_FREQUENCY,
	isPayoutDue,
	MINIMUM_PAYOUT_CENTS,
} from "./config";
import type { PayoutFrequency } from "./validators";

// ── Helpers ─────────────────────────────────────────────────────────

function groupBy<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
	const map = new Map<string, T[]>();
	for (const item of items) {
		const k = keyFn(item);
		const group = map.get(k) ?? [];
		group.push(item);
		map.set(k, group);
	}
	return map;
}

// ── Batch payout action ─────────────────────────────────────────────

/**
 * Daily cron handler — evaluates which lenders are due for payout,
 * checks eligible dispersal entries, and posts lender payouts via the cash
 * ledger.
 *
 * Concurrency safety: entries are claimed (pending → disbursed) BEFORE the
 * cash ledger payout is posted. This prevents double payouts when an admin
 * triggers a payout while the cron is running — only the first claim wins.
 * If the ledger post fails, claimed entries are reverted to "pending".
 *
 * Idempotency: keys use the standard cash-ledger prefix via buildIdempotencyKey.
 */
export const processPayoutBatch = internalAction({
	args: {},
	handler: async (ctx) => {
		const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

		// 1. Get all active lenders
		const lenders = await ctx.runQuery(
			internal.payments.payout.queries.getActiveLenders,
			{}
		);

		const source: CommandSource = {
			actorType: "system",
			channel: "scheduler",
		};

		let totalPayouts = 0;
		let totalAmountCents = 0;
		let lendersProcessed = 0;
		let lendersSkipped = 0;
		const failures: Array<{
			lenderId: string;
			mortgageId: string;
			error: string;
		}> = [];

		// 2. Evaluate each lender
		for (const lender of lenders) {
			const frequency =
				(lender.payoutFrequency as PayoutFrequency | undefined) ??
				DEFAULT_PAYOUT_FREQUENCY;

			// 2a. Check if payout is due based on frequency
			if (!isPayoutDue(frequency, lender.lastPayoutDate, today)) {
				lendersSkipped++;
				continue;
			}

			// 2b. Get eligible dispersal entries (past hold period)
			const eligibleEntries = await ctx.runQuery(
				internal.payments.payout.queries.getEligibleDispersalEntries,
				{ lenderId: lender._id, today }
			);

			if (eligibleEntries.length === 0) {
				lendersSkipped++;
				continue;
			}

			// 2c. Group entries by mortgageId
			const groupedByMortgage = groupBy(
				eligibleEntries,
				(e: Doc<"dispersalEntries">) => e.mortgageId as string
			);

			const postingGroupId = `payout-batch:${today}:${lender._id}`;
			let lenderPayoutCount = 0;

			// 2d. Process each mortgage group
			for (const [mortgageIdStr, entries] of groupedByMortgage) {
				const mortgageId = mortgageIdStr as Id<"mortgages">;
				const totalAmount = entries.reduce(
					(acc: number, e: Doc<"dispersalEntries">) => acc + e.amount,
					0
				);

				// Check minimum threshold
				const minimumCents = lender.minimumPayoutCents ?? MINIMUM_PAYOUT_CENTS;
				if (totalAmount < minimumCents) {
					continue;
				}

				const idempotencyKey = buildIdempotencyKey(
					"lender-payout-sent",
					"batch",
					today,
					lender._id,
					mortgageId
				);

				const entryIds = entries.map((e: Doc<"dispersalEntries">) => e._id);

				try {
					// Step 1: Claim entries (pending → disbursed) BEFORE posting payout.
					// This is the concurrency lock — only the first caller wins.
					await ctx.runMutation(
						internal.payments.payout.mutations.claimEntriesForPayout,
						{
							entryIds,
							payoutDate: today,
						}
					);

					// Step 2: Post lender payout via cash ledger.
					// If this fails, we revert the claim in the catch block.
					try {
						await ctx.runMutation(
							internal.payments.cashLedger.mutations.postLenderPayout,
							{
								mortgageId,
								lenderId: lender._id,
								amount: totalAmount,
								effectiveDate: today,
								idempotencyKey,
								source,
								reason: "Scheduled batch payout",
								postingGroupId,
							}
						);
					} catch (postError) {
						// Revert claimed entries so they can be retried
						await ctx.runMutation(
							internal.payments.payout.mutations.revertClaimedEntries,
							{
								entryIds,
							}
						);
						throw postError;
					}

					lenderPayoutCount++;
					totalAmountCents += totalAmount;
				} catch (error) {
					failures.push({
						lenderId: lender._id as string,
						mortgageId: mortgageIdStr,
						error: error instanceof Error ? error.message : String(error),
					});
				}
			}

			// 2e. Update lender's last payout date if any payouts were made
			if (lenderPayoutCount > 0) {
				await ctx.runMutation(
					internal.payments.payout.mutations.updateLenderPayoutDate,
					{
						lenderId: lender._id,
						payoutDate: today,
					}
				);
				totalPayouts += lenderPayoutCount;
				lendersProcessed++;
			} else {
				lendersSkipped++;
			}
		}

		// 3. Log batch summary
		console.log(
			`[payout-batch] date=${today} lenders_processed=${lendersProcessed} lenders_skipped=${lendersSkipped} payouts=${totalPayouts} total_cents=${totalAmountCents} failures=${failures.length}`
		);

		// 4. If any failures, throw so the scheduler surfaces the problem
		if (failures.length > 0) {
			console.error(
				`[payout-batch] FAILURES date=${today}`,
				JSON.stringify(failures)
			);
			throw new Error(
				`Payout batch had ${failures.length} failure(s). ${totalPayouts} payouts succeeded. See logs for details.`
			);
		}
	},
});
