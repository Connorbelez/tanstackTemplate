import { ConvexError, v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { canAccessDispersal } from "../auth/resourceChecks";
import { authedQuery, requirePermission, type Viewer } from "../fluent";

const dispersalQuery = authedQuery.use(requirePermission("dispersal:view"));

type DispersalQueryCtx = Pick<QueryCtx, "db"> & { viewer: Viewer };

function roundCurrency(amount: number) {
	return Math.round(amount * 100) / 100;
}

function toHistoryEntry(
	entry: {
		_id: Id<"dispersalEntries">;
		mortgageId: Id<"mortgages">;
		lenderId: Id<"lenders">;
		lenderAccountId: Id<"ledger_accounts">;
		amount: number;
		dispersalDate: string;
		obligationId: Id<"obligations">;
		servicingFeeDeducted: number;
		status: "pending";
		idempotencyKey: string;
		calculationDetails: {
			settledAmount: number;
			servicingFee: number;
			distributableAmount: number;
			ownershipUnits: number;
			totalUnits: number;
			ownershipFraction: number;
			rawAmount: number;
			roundedAmount: number;
		};
		createdAt: number;
	},
	runningTotal: number
) {
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

async function resolveLenderAuthIdOrThrow(
	ctx: Pick<QueryCtx, "db">,
	lenderId: Id<"lenders">
) {
	const lender = await ctx.db.get(lenderId);
	if (!lender) {
		throw new ConvexError("Lender not found");
	}

	const user = await ctx.db.get(lender.userId);
	if (!user) {
		throw new ConvexError("Lender user not found");
	}

	return user.authId;
}

async function assertLenderScopedDispersalAccess(
	ctx: DispersalQueryCtx,
	lenderId: Id<"lenders">
) {
	const lenderAuthId = await resolveLenderAuthIdOrThrow(ctx, lenderId);
	const hasAccess = await canAccessDispersal(ctx, ctx.viewer, lenderAuthId);
	if (!hasAccess) {
		throw new ConvexError("No access to this dispersal data");
	}
}

function assertAdminScopedDispersalAccess(viewer: Viewer) {
	if (!viewer.isFairLendAdmin) {
		throw new ConvexError("No access to this dispersal data");
	}
}

function sumAmounts(entries: Array<{ amount: number }>) {
	return roundCurrency(entries.reduce((sum, entry) => sum + entry.amount, 0));
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
		await assertLenderScopedDispersalAccess(ctx, args.lenderId);

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
		await assertLenderScopedDispersalAccess(ctx, args.lenderId);

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
		const limitedEntries = entries.slice(0, effectiveLimit);

		let runningTotal = 0;
		const history = limitedEntries.map((entry) => {
			runningTotal += entry.amount;
			return toHistoryEntry(entry, runningTotal);
		});

		return {
			lenderId: args.lenderId,
			entryCount: history.length,
			entries: history,
			total: roundCurrency(runningTotal),
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
		assertAdminScopedDispersalAccess(ctx.viewer);
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
		const limitedEntries = entries.slice(0, effectiveLimit);

		return {
			mortgageId: args.mortgageId,
			entryCount: limitedEntries.length,
			entries: limitedEntries,
			total: sumAmounts(limitedEntries),
			byLender: summarizeByLender(limitedEntries),
		};
	})
	.public();

export const getDispersalsByObligation = dispersalQuery
	.input({
		obligationId: v.id("obligations"),
	})
	.handler(async (ctx, args) => {
		assertAdminScopedDispersalAccess(ctx.viewer);

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

export const getServicingFeeHistory = dispersalQuery
	.input({
		mortgageId: v.id("mortgages"),
		fromDate: v.optional(v.string()),
		toDate: v.optional(v.string()),
		limit: v.optional(v.number()),
	})
	.handler(async (ctx, args) => {
		assertAdminScopedDispersalAccess(ctx.viewer);
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
		const limitedEntries = entries.slice(0, effectiveLimit);

		return {
			mortgageId: args.mortgageId,
			entryCount: limitedEntries.length,
			entries: limitedEntries,
			totalFees: sumAmounts(limitedEntries),
		};
	})
	.public();
