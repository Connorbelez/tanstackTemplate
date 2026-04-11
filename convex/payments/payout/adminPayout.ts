import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";
import type { CommandSource } from "../../engine/types";
import { adminAction } from "../../fluent";
import { MINIMUM_PAYOUT_CENTS } from "./config";
import {
	getEligibleDispersalEntriesRef,
	getLenderByIdRef,
	updateLenderPayoutDateRef,
} from "./refs";
import { executeTransferOwnedPayout } from "./transferOwnedFlow";

/**
 * Admin-triggered payout execution for a specific lender.
 *
 * Canonical behavior:
 * 1. Select eligible dispersal entries
 * 2. Create one outbound transfer per entry
 * 3. Initiate and confirm each transfer through the manual provider rail
 * 4. Let transfer confirmation own ledger posting + dispersal entry status
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

		// 4. Group entries by mortgageId so threshold checks remain mortgage-scoped
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

		// 5. For each mortgage group: create one transfer per eligible entry and
		// confirm it on the canonical manual rail.
		const minimumCents = lender.minimumPayoutCents ?? MINIMUM_PAYOUT_CENTS;
		let payoutCount = 0;
		let totalAmountCents = 0;

		const source: CommandSource = {
			actorType: "admin",
			actorId: ctx.viewer.authId,
			channel: "admin_dashboard",
		};

		const failures: Array<{
			dispersalEntryId: string;
			error: string;
			mortgageId: string;
		}> = [];

		for (const [mortgageId, entries] of groupedByMortgage) {
			const sumAmount = entries.reduce(
				(acc: number, e: Doc<"dispersalEntries">) => acc + e.amount,
				0
			);

			if (sumAmount < minimumCents) {
				continue;
			}

			for (const entry of entries) {
				try {
					const result = await executeTransferOwnedPayout({
						confirmSettlement: true,
						ctx,
						entry,
						providerCode: "manual",
						source,
					});

					if (result.confirmed) {
						payoutCount += 1;
						totalAmountCents += result.amount;
					}
				} catch (error) {
					failures.push({
						dispersalEntryId: entry._id as string,
						mortgageId: mortgageId as string,
						error: error instanceof Error ? error.message : String(error),
					});
				}
			}
		}

		// 6. Update lender's last payout date (if any payouts were made)
		if (payoutCount > 0 && failures.length === 0) {
			await ctx.runMutation(updateLenderPayoutDateRef, {
				lenderId: args.lenderId,
				payoutDate: today,
			});
		}

		// 7. If there were failures, report with partial success details
		if (failures.length > 0) {
			throw new ConvexError({
				message: `Admin payout had ${failures.length} failure(s) out of ${payoutCount + failures.length} dispersal entries`,
				payoutCount,
				totalAmountCents,
				failures,
			});
		}

		return { payoutCount, totalAmountCents, lenderId: args.lenderId };
	})
	.public();
