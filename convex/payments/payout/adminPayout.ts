import { ConvexError, v } from "convex/values";
import { internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import type { CommandSource } from "../../engine/types";
import { adminAction } from "../../fluent";
import { MINIMUM_PAYOUT_CENTS } from "./config";
import {
	getEligibleDispersalEntriesRef,
	getLenderByIdRef,
	markEntriesDisbursedRef,
	updateLenderPayoutDateRef,
} from "./refs";

/**
 * Admin-triggered immediate payout for a specific lender.
 * Bypasses frequency schedule but still respects hold period.
 */
export const triggerImmediatePayout = adminAction
	.input({
		lenderId: v.id("lenders"),
		mortgageId: v.optional(v.id("mortgages")),
	})
	.handler(async (ctx, args) => {
		const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

		// 1. Get lender record directly — verify exists + active
		const lender = await ctx.runQuery(getLenderByIdRef, {
			lenderId: args.lenderId,
		});
		if (!lender || lender.status !== "active") {
			throw new ConvexError(`Lender ${args.lenderId} not found or not active`);
		}

		// 2. Get eligible dispersal entries (past hold period)
		const eligibleEntries = await ctx.runQuery(getEligibleDispersalEntriesRef, {
			lenderId: args.lenderId,
			today,
		});

		if (eligibleEntries.length === 0) {
			return { payoutCount: 0, totalAmountCents: 0, lenderId: args.lenderId };
		}

		// 3. If mortgageId provided, filter to that mortgage only
		const filteredEntries = args.mortgageId
			? eligibleEntries.filter(
					(e: Doc<"dispersalEntries">) => e.mortgageId === args.mortgageId
				)
			: eligibleEntries;

		if (filteredEntries.length === 0) {
			return { payoutCount: 0, totalAmountCents: 0, lenderId: args.lenderId };
		}

		// 4. Group entries by mortgageId
		const groupedByMortgage = new Map<
			Id<"mortgages">,
			Doc<"dispersalEntries">[]
		>();
		for (const entry of filteredEntries) {
			const key = entry.mortgageId;
			const group = groupedByMortgage.get(key);
			if (group) {
				group.push(entry);
			} else {
				groupedByMortgage.set(key, [entry]);
			}
		}

		// 5. For each mortgage group: sum, threshold check, post payout, mark disbursed
		const minimumCents = lender.minimumPayoutCents ?? MINIMUM_PAYOUT_CENTS;
		let payoutCount = 0;
		let totalAmountCents = 0;

		const source: CommandSource = {
			actorType: "admin",
			actorId: ctx.viewer.authId,
			channel: "admin_dashboard",
		};

		const failures: Array<{ mortgageId: string; error: string }> = [];

		for (const [mortgageId, entries] of groupedByMortgage) {
			const sumAmount = entries.reduce(
				(acc: number, e: Doc<"dispersalEntries">) => acc + e.amount,
				0
			);

			if (sumAmount < minimumCents) {
				continue;
			}

			const idempotencyKey = `admin-payout:${today}:${args.lenderId}:${mortgageId}`;

			try {
				await ctx.runMutation(
					internal.payments.cashLedger.mutations.postLenderPayout,
					{
						mortgageId,
						lenderId: args.lenderId,
						amount: sumAmount,
						effectiveDate: today,
						idempotencyKey,
						source,
						reason: "Admin-triggered immediate payout",
					}
				);

				// Optimistic concurrency guard in markEntriesDisbursed
				// prevents double-payout if cron is running concurrently
				await ctx.runMutation(markEntriesDisbursedRef, {
					entryIds: entries.map((e: Doc<"dispersalEntries">) => e._id),
					payoutDate: today,
				});

				payoutCount++;
				totalAmountCents += sumAmount;
			} catch (error) {
				failures.push({
					mortgageId: mortgageId as string,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}

		// 6. Update lender's last payout date (if any payouts were made)
		if (payoutCount > 0) {
			await ctx.runMutation(updateLenderPayoutDateRef, {
				lenderId: args.lenderId,
				payoutDate: today,
			});
		}

		// 7. If there were failures, report with partial success details
		if (failures.length > 0) {
			throw new ConvexError({
				message: `Admin payout had ${failures.length} failure(s) out of ${payoutCount + failures.length} mortgage groups`,
				payoutCount,
				totalAmountCents,
				failures,
			});
		}

		return { payoutCount, totalAmountCents, lenderId: args.lenderId };
	})
	.public();
