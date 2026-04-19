import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import {
	assertFairLendAdminAccess,
	assertLenderDispersalAccess,
} from "../authz/resourceAccess";
import { authedQuery, requirePermission } from "../fluent";
import { businessDateToUnixMs } from "../lib/businessDates";

const dispersalQuery = authedQuery.use(requirePermission("dispersal:view"));

function roundCurrency(amount: number) {
	return Math.round(amount * 100) / 100;
}

function sumByField<T>(
	entries: T[],
	project: (entry: T) => number | undefined
) {
	return roundCurrency(
		entries.reduce((sum, entry) => sum + (project(entry) ?? 0), 0)
	);
}

function toHistoryEntry(entry: Doc<"dispersalEntries">, runningTotal: number) {
	return {
		id: entry._id,
		mortgageId: entry.mortgageId,
		lenderId: entry.lenderId,
		lenderAccountId: entry.lenderAccountId,
		amount: entry.amount,
		dispersalDate: entry.dispersalDate,
		obligationId: entry.obligationId,
		servicingFeeDeducted: entry.servicingFeeDeducted,
		status: entry.status,
		idempotencyKey: entry.idempotencyKey,
		calculationDetails: entry.calculationDetails,
		createdAt: entry.createdAt,
		runningTotal: roundCurrency(runningTotal),
	};
}

function compareDispersalEntriesByDate(
	left: { dispersalDate: string; createdAt: number; _id: string },
	right: { dispersalDate: string; createdAt: number; _id: string }
) {
	if (left.dispersalDate !== right.dispersalDate) {
		return left.dispersalDate.localeCompare(right.dispersalDate);
	}
	if (left.createdAt !== right.createdAt) {
		return left.createdAt - right.createdAt;
	}
	return left._id.localeCompare(right._id);
}

function compareFeeEntriesByDate(
	left: { date: string; createdAt: number; _id: string },
	right: { date: string; createdAt: number; _id: string }
) {
	if (left.date !== right.date) {
		return left.date.localeCompare(right.date);
	}
	if (left.createdAt !== right.createdAt) {
		return left.createdAt - right.createdAt;
	}
	return left._id.localeCompare(right._id);
}

function sumAmounts(entries: Array<{ amount: number }>) {
	return roundCurrency(entries.reduce((sum, entry) => sum + entry.amount, 0));
}

function assertStrictBusinessDate(label: string, date: string) {
	try {
		businessDateToUnixMs(date);
	} catch (e) {
		const message = e instanceof Error ? e.message : String(e);
		throw new ConvexError(`Invalid ${label}: ${message}`);
	}
}

function summarizeByLender(
	entries: Array<{ lenderId: Id<"lenders">; amount: number }>
) {
	const totals = new Map<
		Id<"lenders">,
		{ entryCount: number; totalAmount: number }
	>();

	for (const entry of entries) {
		const existing = totals.get(entry.lenderId);
		if (existing) {
			existing.entryCount += 1;
			existing.totalAmount += entry.amount;
			continue;
		}
		totals.set(entry.lenderId, { entryCount: 1, totalAmount: entry.amount });
	}

	return [...totals.entries()]
		.map(([lenderId, summary]) => ({
			lenderId,
			entryCount: summary.entryCount,
			totalAmount: roundCurrency(summary.totalAmount),
		}))
		.sort((left, right) => left.lenderId.localeCompare(right.lenderId));
}

export const getUndisbursedBalance = dispersalQuery
	.input({
		lenderId: v.id("lenders"),
	})
	.handler(async (ctx, args) => {
		await assertLenderDispersalAccess(ctx, args.lenderId);

		const entries = await ctx.db
			.query("dispersalEntries")
			.withIndex("by_status", (q) =>
				q.eq("status", "pending").eq("lenderId", args.lenderId)
			)
			.collect();

		return {
			lenderId: args.lenderId,
			entryCount: entries.length,
			undisbursedBalance: sumAmounts(entries),
		};
	})
	.public();

export const getDisbursementHistory = dispersalQuery
	.input({
		lenderId: v.id("lenders"),
		fromDate: v.optional(v.string()),
		toDate: v.optional(v.string()),
		limit: v.optional(v.number()),
	})
	.handler(async (ctx, args) => {
		await assertLenderDispersalAccess(ctx, args.lenderId);

		const effectiveLimit = args.limit ?? 100;
		const fromDate = args.fromDate;
		const toDate = args.toDate;

		const entries = await (async () => {
			if (fromDate !== undefined && toDate !== undefined) {
				return ctx.db
					.query("dispersalEntries")
					.withIndex("by_lender", (q) =>
						q
							.eq("lenderId", args.lenderId)
							.gte("dispersalDate", fromDate)
							.lte("dispersalDate", toDate)
					)
					.collect();
			}
			if (fromDate !== undefined) {
				return ctx.db
					.query("dispersalEntries")
					.withIndex("by_lender", (q) =>
						q.eq("lenderId", args.lenderId).gte("dispersalDate", fromDate)
					)
					.collect();
			}
			if (toDate !== undefined) {
				return ctx.db
					.query("dispersalEntries")
					.withIndex("by_lender", (q) =>
						q.eq("lenderId", args.lenderId).lte("dispersalDate", toDate)
					)
					.collect();
			}
			return ctx.db
				.query("dispersalEntries")
				.withIndex("by_lender", (q) => q.eq("lenderId", args.lenderId))
				.collect();
		})();

		entries.sort(compareDispersalEntriesByDate);
		const overallTotal = sumAmounts(entries);
		const limitedEntries = entries.slice(0, effectiveLimit);
		const pageTotal = sumAmounts(limitedEntries);

		let runningTotal = 0;
		const history = limitedEntries.map((entry) => {
			runningTotal += entry.amount;
			return toHistoryEntry(entry, runningTotal);
		});

		return {
			lenderId: args.lenderId,
			entryCount: entries.length,
			entries: history,
			total: overallTotal,
			pageTotal,
		};
	})
	.public();

export const getDispersalsByMortgage = dispersalQuery
	.input({
		mortgageId: v.id("mortgages"),
		fromDate: v.optional(v.string()),
		toDate: v.optional(v.string()),
		limit: v.optional(v.number()),
	})
	.handler(async (ctx, args) => {
		assertFairLendAdminAccess(ctx.viewer, "No access to this dispersal data");
		const effectiveLimit = args.limit ?? 100;
		const fromDate = args.fromDate;
		const toDate = args.toDate;

		const entries = await (async () => {
			if (fromDate !== undefined && toDate !== undefined) {
				return ctx.db
					.query("dispersalEntries")
					.withIndex("by_mortgage", (q) =>
						q
							.eq("mortgageId", args.mortgageId)
							.gte("dispersalDate", fromDate)
							.lte("dispersalDate", toDate)
					)
					.collect();
			}
			if (fromDate !== undefined) {
				return ctx.db
					.query("dispersalEntries")
					.withIndex("by_mortgage", (q) =>
						q.eq("mortgageId", args.mortgageId).gte("dispersalDate", fromDate)
					)
					.collect();
			}
			if (toDate !== undefined) {
				return ctx.db
					.query("dispersalEntries")
					.withIndex("by_mortgage", (q) =>
						q.eq("mortgageId", args.mortgageId).lte("dispersalDate", toDate)
					)
					.collect();
			}
			return ctx.db
				.query("dispersalEntries")
				.withIndex("by_mortgage", (q) => q.eq("mortgageId", args.mortgageId))
				.collect();
		})();

		entries.sort(compareDispersalEntriesByDate);
		const overallTotal = sumAmounts(entries);
		const limitedEntries = entries.slice(0, effectiveLimit);
		const pageTotal = sumAmounts(limitedEntries);

		return {
			mortgageId: args.mortgageId,
			entryCount: entries.length,
			entries: limitedEntries,
			total: overallTotal,
			pageTotal,
			byLender: summarizeByLender(entries),
		};
	})
	.public();

export const getDispersalsByObligation = dispersalQuery
	.input({
		obligationId: v.id("obligations"),
	})
	.handler(async (ctx, args) => {
		assertFairLendAdminAccess(ctx.viewer, "No access to this dispersal data");

		const entries = await ctx.db
			.query("dispersalEntries")
			.withIndex("by_obligation", (q) =>
				q.eq("obligationId", args.obligationId)
			)
			.collect();

		entries.sort(compareDispersalEntriesByDate);

		return {
			obligationId: args.obligationId,
			entryCount: entries.length,
			entries,
			total: sumAmounts(entries),
			byLender: summarizeByLender(entries),
		};
	})
	.public();

export const getPayoutEligibleEntries = dispersalQuery
	.input({
		asOfDate: v.string(),
		lenderId: v.optional(v.id("lenders")),
		limit: v.optional(v.number()),
	})
	.handler(async (ctx, args) => {
		assertFairLendAdminAccess(ctx.viewer, "No access to this dispersal data");
		assertStrictBusinessDate("asOfDate", args.asOfDate);

		const effectiveLimit = args.limit ?? 100;

		// Pending entries whose hold date has passed (indexed on status + payoutEligibleAfter)
		const pendingPastHold = await ctx.db
			.query("dispersalEntries")
			.withIndex("by_eligibility", (q) =>
				q.eq("status", "pending").lte("payoutEligibleAfter", args.asOfDate)
			)
			.collect();

		const eligibleWithHold = pendingPastHold.filter((entry) => {
			if (args.lenderId && entry.lenderId !== args.lenderId) {
				return false;
			}
			return (
				entry.payoutEligibleAfter !== undefined &&
				entry.payoutEligibleAfter !== ""
			);
		});

		// Legacy: pending with no payoutEligibleAfter (not keyed the same in the index)
		const pendingAll = await ctx.db
			.query("dispersalEntries")
			.withIndex("by_eligibility", (q) => q.eq("status", "pending"))
			.collect();

		const eligibleLegacy = pendingAll.filter((entry) => {
			if (args.lenderId && entry.lenderId !== args.lenderId) {
				return false;
			}
			return !entry.payoutEligibleAfter;
		});

		const eligible = [...eligibleWithHold, ...eligibleLegacy];
		eligible.sort(compareDispersalEntriesByDate);
		const limited = eligible.slice(0, effectiveLimit);
		const pageTotal = sumAmounts(limited);
		const pageByLender = summarizeByLender(limited);

		return {
			asOfDate: args.asOfDate,
			entryCount: eligible.length,
			pageEntryCount: limited.length,
			entries: limited,
			total: sumAmounts(eligible),
			pageTotal,
			byLender: summarizeByLender(eligible),
			pageByLender,
		};
	})
	.public();

export const getServicingFeeHistory = dispersalQuery
	.input({
		mortgageId: v.id("mortgages"),
		fromDate: v.optional(v.string()),
		toDate: v.optional(v.string()),
		limit: v.optional(v.number()),
	})
	.handler(async (ctx, args) => {
		assertFairLendAdminAccess(ctx.viewer, "No access to this dispersal data");
		const effectiveLimit = args.limit ?? 100;
		const fromDate = args.fromDate;
		const toDate = args.toDate;

		const entries = await (async () => {
			if (fromDate !== undefined && toDate !== undefined) {
				return ctx.db
					.query("servicingFeeEntries")
					.withIndex("by_mortgage", (q) =>
						q
							.eq("mortgageId", args.mortgageId)
							.gte("date", fromDate)
							.lte("date", toDate)
					)
					.collect();
			}
			if (fromDate !== undefined) {
				return ctx.db
					.query("servicingFeeEntries")
					.withIndex("by_mortgage", (q) =>
						q.eq("mortgageId", args.mortgageId).gte("date", fromDate)
					)
					.collect();
			}
			if (toDate !== undefined) {
				return ctx.db
					.query("servicingFeeEntries")
					.withIndex("by_mortgage", (q) =>
						q.eq("mortgageId", args.mortgageId).lte("date", toDate)
					)
					.collect();
			}
			return ctx.db
				.query("servicingFeeEntries")
				.withIndex("by_mortgage", (q) => q.eq("mortgageId", args.mortgageId))
				.collect();
		})();

		entries.sort(compareFeeEntriesByDate);
		const overallTotalFees = sumAmounts(entries);
		const limitedEntries = entries.slice(0, effectiveLimit);
		const pageTotalFees = sumAmounts(limitedEntries);

		return {
			mortgageId: args.mortgageId,
			entryCount: entries.length,
			entries: limitedEntries,
			totalFees: overallTotalFees,
			pageTotalFees,
			totalFeeDue: sumByField(entries, (entry) => entry.feeDue),
			totalFeeCashApplied: sumByField(entries, (entry) => entry.feeCashApplied),
			totalFeeReceivable: sumByField(entries, (entry) => entry.feeReceivable),
			pageTotalFeeDue: sumByField(limitedEntries, (entry) => entry.feeDue),
			pageTotalFeeCashApplied: sumByField(
				limitedEntries,
				(entry) => entry.feeCashApplied
			),
			pageTotalFeeReceivable: sumByField(
				limitedEntries,
				(entry) => entry.feeReceivable
			),
		};
	})
	.public();
