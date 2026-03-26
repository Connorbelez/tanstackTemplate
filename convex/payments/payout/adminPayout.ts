import { makeFunctionReference } from "convex/server";
import { ConvexError, v } from "convex/values";
import { internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import { adminAction } from "../../fluent";
import { MINIMUM_PAYOUT_CENTS } from "./config";

// ── Internal function references ────────────────────────────────────
// The payout module is new; generated API types won't include it until
// convex codegen runs. Use makeFunctionReference for payout-internal refs.
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

/**
 * T-008: Admin-triggered immediate payout for a specific lender.
 * Bypasses frequency schedule but still respects hold period.
 */
export const triggerImmediatePayout = adminAction
	.input({
		lenderId: v.id("lenders"),
		mortgageId: v.optional(v.id("mortgages")),
	})
	.handler(async (ctx, args) => {
		const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

		// 1. Get lender record — verify exists + active
		const activeLenders = await ctx.runQuery(
			getLendersWithPayableBalanceRef,
			{}
		);
		const lenderRecord = activeLenders.find(
			(l: Doc<"lenders">) => l._id === args.lenderId
		);
		if (!lenderRecord) {
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
			const key = (entry as Doc<"dispersalEntries">).mortgageId;
			const group = groupedByMortgage.get(key);
			if (group) {
				group.push(entry as Doc<"dispersalEntries">);
			} else {
				groupedByMortgage.set(key, [entry as Doc<"dispersalEntries">]);
			}
		}

		// 5. For each mortgage group: sum, threshold check, post payout, mark disbursed
		const minimumCents =
			lenderRecord.minimumPayoutCents ?? MINIMUM_PAYOUT_CENTS;
		let payoutCount = 0;
		let totalAmountCents = 0;

		const source = {
			actorType: "admin" as const,
			actorId: ctx.viewer.authId,
			channel: "admin_dashboard" as const,
		};

		for (const [mortgageId, entries] of groupedByMortgage) {
			const sumAmount = entries.reduce(
				(acc: number, e: Doc<"dispersalEntries">) => acc + e.amount,
				0
			);

			// Check minimum threshold
			if (sumAmount < minimumCents) {
				continue;
			}

			const idempotencyKey = `admin-payout:${today}:${args.lenderId}:${mortgageId}`;

			// Post the lender payout via cash ledger
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

			// Mark entries as disbursed
			await ctx.runMutation(markEntriesDisbursedRef, {
				entryIds: entries.map((e: Doc<"dispersalEntries">) => e._id),
				payoutDate: today,
			});

			payoutCount++;
			totalAmountCents += sumAmount;
		}

		// 6. Update lender's last payout date (if any payouts were made)
		if (payoutCount > 0) {
			await ctx.runMutation(updateLenderPayoutDateRef, {
				lenderId: args.lenderId,
				payoutDate: today,
			});
		}

		// 7. Return summary
		return { payoutCount, totalAmountCents, lenderId: args.lenderId };
	})
	.public();
