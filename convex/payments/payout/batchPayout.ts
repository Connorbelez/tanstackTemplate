import { makeFunctionReference } from "convex/server";
import { internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import { internalAction } from "../../_generated/server";
import {
	DEFAULT_PAYOUT_FREQUENCY,
	isPayoutDue,
	MINIMUM_PAYOUT_CENTS,
	type PayoutFrequency,
} from "./config";

// ── Internal function references ────────────────────────────────────
// Use makeFunctionReference for payout-internal refs to avoid codegen
// ordering issues. See adminPayout.ts for the same pattern.
const getEligibleDispersalEntriesRef = makeFunctionReference<
	"query",
	{ lenderId: Id<"lenders">; today: string },
	Doc<"dispersalEntries">[]
>("payments/payout/queries:getEligibleDispersalEntries");

const getLendersWithPayableBalanceRef = makeFunctionReference<
	"query",
	Record<string, never>,
	Doc<"lenders">[]
>("payments/payout/queries:getLendersWithPayableBalance");

const markEntriesDisbursedRef = makeFunctionReference<
	"mutation",
	{ entryIds: Id<"dispersalEntries">[]; payoutDate: string },
	null
>("payments/payout/mutations:markEntriesDisbursed");

const updateLenderPayoutDateRef = makeFunctionReference<
	"mutation",
	{ lenderId: Id<"lenders">; payoutDate: string },
	null
>("payments/payout/mutations:updateLenderPayoutDate");

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
 * T-009: Daily cron handler — evaluates which lenders are due for payout,
 * checks eligible dispersal entries, and posts lender payouts via the cash
 * ledger. Idempotent per day (key: payout-batch:{date}:{lender}:{mortgage}).
 */
export const processPayoutBatch = internalAction({
	args: {},
	handler: async (ctx) => {
		const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

		// 1. Get all active lenders
		const lenders = await ctx.runQuery(getLendersWithPayableBalanceRef, {});

		const source = {
			actorType: "system" as const,
			channel: "scheduler" as const,
		};

		let totalPayouts = 0;
		let totalAmountCents = 0;
		let lendersProcessed = 0;
		let lendersSkipped = 0;

		// 2. Evaluate each lender
		for (const lender of lenders) {
			const frequency: PayoutFrequency =
				(lender.payoutFrequency as PayoutFrequency | undefined) ??
				DEFAULT_PAYOUT_FREQUENCY;

			// 2a. Check if payout is due based on frequency
			if (
				!isPayoutDue(
					frequency,
					lender.lastPayoutDate as string | undefined,
					today
				)
			) {
				lendersSkipped++;
				continue;
			}

			// 2b. Get eligible dispersal entries (past hold period)
			const eligibleEntries = await ctx.runQuery(
				getEligibleDispersalEntriesRef,
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

				const idempotencyKey = `payout-batch:${today}:${lender._id}:${mortgageId}`;

				try {
					// Post lender payout via cash ledger
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

					// Mark entries as disbursed
					await ctx.runMutation(markEntriesDisbursedRef, {
						entryIds: entries.map((e: Doc<"dispersalEntries">) => e._id),
						payoutDate: today,
					});

					lenderPayoutCount++;
					totalAmountCents += totalAmount;
				} catch (error) {
					// Log error and continue with next mortgage/lender
					console.error(
						`Payout failed for lender=${lender._id} mortgage=${mortgageId}:`,
						error
					);
				}
			}

			// 2e. Update lender's last payout date if any payouts were made
			if (lenderPayoutCount > 0) {
				await ctx.runMutation(updateLenderPayoutDateRef, {
					lenderId: lender._id,
					payoutDate: today,
				});
				totalPayouts += lenderPayoutCount;
				lendersProcessed++;
			} else {
				lendersSkipped++;
			}
		}

		// 3. Log batch summary
		console.log(
			`[payout-batch] date=${today} lenders_processed=${lendersProcessed} lenders_skipped=${lendersSkipped} payouts=${totalPayouts} total_cents=${totalAmountCents}`
		);
	},
});
