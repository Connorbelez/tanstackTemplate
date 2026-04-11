import type { Doc, Id } from "../../_generated/dataModel";
import { type ActionCtx, internalAction } from "../../_generated/server";
import type { CommandSource } from "../../engine/types";
import {
	DEFAULT_PAYOUT_FREQUENCY,
	isPayoutDue,
	MINIMUM_PAYOUT_CENTS,
} from "./config";
import {
	getActiveLendersRef,
	getEligibleDispersalEntriesRef,
	updateLenderPayoutDateRef,
} from "./refs";
import { executeTransferOwnedPayout } from "./transferOwnedFlow";
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

async function processMortgageGroup(
	ctx: ActionCtx,
	args: {
		entries: Doc<"dispersalEntries">[];
		mortgageId: Id<"mortgages">;
		source: CommandSource;
	}
): Promise<{
	confirmedCount: number;
	failures: Array<{
		dispersalEntryId: string;
		error: string;
		lenderId: string;
		mortgageId: string;
	}>;
	totalAmountCents: number;
}> {
	let confirmedCount = 0;
	let totalAmountCents = 0;
	const failures: Array<{
		dispersalEntryId: string;
		error: string;
		lenderId: string;
		mortgageId: string;
	}> = [];

	for (const entry of args.entries) {
		try {
			const result = await executeTransferOwnedPayout({
				confirmSettlement: true,
				ctx,
				entry,
				providerCode: "manual",
				source: args.source,
			});

			if (result.confirmed) {
				confirmedCount += 1;
				totalAmountCents += result.amount;
			}
		} catch (error) {
			failures.push({
				dispersalEntryId: entry._id as string,
				error: error instanceof Error ? error.message : String(error),
				lenderId: entry.lenderId as string,
				mortgageId: args.mortgageId as string,
			});
		}
	}

	return {
		confirmedCount,
		failures,
		totalAmountCents,
	};
}

// ── Batch payout action ─────────────────────────────────────────────

/**
 * Daily cron handler -- evaluates which lenders are due for payout and executes
 * each eligible dispersal entry on the canonical transfer rail.
 */
export const processPayoutBatch = internalAction({
	args: {},
	handler: async (ctx) => {
		const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

		// 1. Get all active lenders
		const lenders = await ctx.runQuery(getActiveLendersRef, {});

		const source: CommandSource = {
			actorType: "system",
			channel: "scheduler",
		};

		let totalPayouts = 0;
		let totalAmountCents = 0;
		let lendersProcessed = 0;
		let lendersSkipped = 0;
		const failures: Array<{
			dispersalEntryId: string;
			error: string;
			lenderId: string;
			mortgageId: string;
		}> = [];

		// 2. Evaluate each lender
		for (const lender of lenders) {
			const frequency =
				(lender.payoutFrequency as PayoutFrequency | undefined) ??
				DEFAULT_PAYOUT_FREQUENCY;

			if (!isPayoutDue(frequency, lender.lastPayoutDate, today)) {
				lendersSkipped++;
				continue;
			}

			const eligibleEntries = await ctx.runQuery(
				getEligibleDispersalEntriesRef,
				{ lenderId: lender._id, today }
			);

			if (eligibleEntries.length === 0) {
				lendersSkipped++;
				continue;
			}

			const groupedByMortgage = groupBy(
				eligibleEntries,
				(e: Doc<"dispersalEntries">) => e.mortgageId as string
			);

			let lenderPayoutCount = 0;

			for (const [mortgageIdStr, entries] of groupedByMortgage) {
				const mortgageId = mortgageIdStr as Id<"mortgages">;
				const totalAmount = entries.reduce(
					(acc: number, e: Doc<"dispersalEntries">) => acc + e.amount,
					0
				);

				const minimumCents = lender.minimumPayoutCents ?? MINIMUM_PAYOUT_CENTS;
				if (totalAmount < minimumCents) {
					continue;
				}

				const result = await processMortgageGroup(ctx, {
					entries,
					mortgageId,
					source,
				});
				lenderPayoutCount += result.confirmedCount;
				totalAmountCents += result.totalAmountCents;
				failures.push(...result.failures);
			}

			const lenderHadFailures = failures.some(
				(failure) => failure.lenderId === `${lender._id}`
			);

			if (lenderPayoutCount > 0) {
				totalPayouts += lenderPayoutCount;
			}

			if (lenderPayoutCount > 0 && !lenderHadFailures) {
				await ctx.runMutation(updateLenderPayoutDateRef, {
					lenderId: lender._id,
					payoutDate: today,
				});
				lendersProcessed++;
			} else if (lenderPayoutCount > 0) {
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
