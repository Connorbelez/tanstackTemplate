import { ConvexError, v } from "convex/values";
import { cashLedgerQuery } from "../../fluent";
import {
	checkControlNetZero,
	checkMortgageMonthConservation,
	checkNegativePayables,
	checkObligationBalanceDrift,
	checkObligationConservation,
	checkOrphanedObligations,
	checkOrphanedUnappliedCash,
	checkStuckCollections,
	checkSuspenseItems,
	checkUnappliedCash,
	runFullReconciliationSuite,
} from "./reconciliationSuite";
import {
	checkOrphanedConfirmedTransfers,
	checkOrphanedReversedTransfers,
	checkStaleOutboundTransfers,
	checkTransferAmountMismatches,
} from "./transferReconciliation";

// ── Date filter helpers (YYYY-MM-DD, UTC day boundaries) ───────

const MS_PER_DAY = 86_400_000;

function parseInclusiveUtcDayRange(
	fromDate?: string,
	toDate?: string
): { fromMs?: number; toMsExclusive?: number } | undefined {
	if (fromDate === undefined && toDate === undefined) {
		return undefined;
	}
	let fromMs: number | undefined;
	let toMsExclusive: number | undefined;
	if (fromDate !== undefined) {
		const parsed = Date.parse(`${fromDate}T00:00:00.000Z`);
		if (Number.isNaN(parsed)) {
			throw new ConvexError("Invalid fromDate: expected YYYY-MM-DD");
		}
		fromMs = parsed;
	}
	if (toDate !== undefined) {
		const end = Date.parse(`${toDate}T23:59:59.999Z`);
		if (Number.isNaN(end)) {
			throw new ConvexError("Invalid toDate: expected YYYY-MM-DD");
		}
		toMsExclusive = end + 1;
	}
	return { fromMs, toMsExclusive };
}

function inUtcDayRange(
	ts: number,
	range?: { fromMs?: number; toMsExclusive?: number }
): boolean {
	if (!range) {
		return true;
	}
	if (range.fromMs !== undefined && ts < range.fromMs) {
		return false;
	}
	if (range.toMsExclusive !== undefined && ts >= range.toMsExclusive) {
		return false;
	}
	return true;
}

/**
 * Safe lower bound on account creation from snapshot age.
 * `ageDays` uses `Math.floor`, so `checkedAt - ageDays * MS_PER_DAY` is actually
 * an upper bound on the true creation time. Subtracting one extra day produces a
 * conservative lower bound for date-range filtering.
 */
function approxAccountCreatedAt(
	checkedAt: number,
	itemAgeDays: number
): number {
	return checkedAt - (itemAgeDays + 1) * MS_PER_DAY;
}

function monthKeyFromYmd(ymd: string): string {
	return ymd.slice(0, 7);
}

// ── Result reshape ───────────────────────────────────────────

/**
 * After filtering items, recalculate count, isHealthy, and totalAmountCents.
 * `amountAccessor` extracts the signed or absolute amount contribution per item.
 */
function recomputeResult<T>(
	base: { checkedAt: number; checkName: string },
	items: T[],
	amountAccessor: (item: T) => number
) {
	return {
		...base,
		items,
		count: items.length,
		isHealthy: items.length === 0,
		totalAmountCents: items.reduce((s, i) => s + amountAccessor(i), 0),
	};
}

const optionalMortgageAndDateRange = {
	fromDate: v.optional(v.string()),
	mortgageId: v.optional(v.id("mortgages")),
	toDate: v.optional(v.string()),
};

// ── 1. Unapplied Cash ────────────────────────────────────────

export const reconciliationUnappliedCash = cashLedgerQuery
	.input(optionalMortgageAndDateRange)
	.handler(async (ctx, args) => {
		const result = await checkUnappliedCash(ctx);
		const range = parseInclusiveUtcDayRange(args.fromDate, args.toDate);
		let items = result.items;
		if (args.mortgageId) {
			items = items.filter((i) => i.mortgageId === args.mortgageId);
		}
		if (range) {
			items = items.filter((i) =>
				inUtcDayRange(
					approxAccountCreatedAt(result.checkedAt, i.ageDays),
					range
				)
			);
		}
		return recomputeResult(result, items, (i) => i.balance);
	})
	.public();

// ── 2. Negative Payables ─────────────────────────────────────

export const reconciliationNegativePayables = cashLedgerQuery
	.input({
		lenderId: v.optional(v.id("lenders")),
		mortgageId: v.optional(v.id("mortgages")),
	})
	.handler(async (ctx, args) => {
		const result = await checkNegativePayables(ctx);
		if (!(args.lenderId || args.mortgageId)) {
			return result;
		}
		const items = result.items.filter((i) => {
			if (args.lenderId && i.lenderId !== args.lenderId) {
				return false;
			}
			if (args.mortgageId && i.mortgageId !== args.mortgageId) {
				return false;
			}
			return true;
		});
		return recomputeResult(result, items, (i) => Math.abs(i.balance));
	})
	.public();

// ── 3. Obligation Drift ──────────────────────────────────────

export const reconciliationObligationDrift = cashLedgerQuery
	.input(optionalMortgageAndDateRange)
	.handler(async (ctx, args) => {
		const result = await checkObligationBalanceDrift(ctx);
		const range = parseInclusiveUtcDayRange(args.fromDate, args.toDate);
		let items = result.items;

		if (args.mortgageId) {
			const mortgageId = args.mortgageId;
			const obligations = await ctx.db
				.query("obligations")
				.withIndex("by_mortgage", (q) => q.eq("mortgageId", mortgageId))
				.collect();
			const validIds = new Set(obligations.map((o) => o._id as string));
			items = items.filter((i) => validIds.has(i.obligationId as string));
		}
		if (range) {
			items = items.filter((i) => inUtcDayRange(i.dueDate, range));
		}
		return recomputeResult(result, items, (i) => Math.abs(i.driftCents));
	})
	.public();

// ── 4. Control Net Zero ──────────────────────────────────────

export const reconciliationControlNetZero = cashLedgerQuery
	.handler(async (ctx) => {
		return checkControlNetZero(ctx);
	})
	.public();

// ── 5. Suspense Items ────────────────────────────────────────

export const reconciliationSuspenseItems = cashLedgerQuery
	.input(optionalMortgageAndDateRange)
	.handler(async (ctx, args) => {
		const result = await checkSuspenseItems(ctx);
		const range = parseInclusiveUtcDayRange(args.fromDate, args.toDate);
		let items = result.items;
		if (args.mortgageId) {
			items = items.filter((i) => i.mortgageId === args.mortgageId);
		}
		if (range) {
			items = items.filter((i) =>
				inUtcDayRange(
					approxAccountCreatedAt(result.checkedAt, i.ageDays),
					range
				)
			);
		}
		return recomputeResult(result, items, (i) => i.balance);
	})
	.public();

// ── 6. Orphaned Obligations ──────────────────────────────────

export const reconciliationOrphanedObligations = cashLedgerQuery
	.input(optionalMortgageAndDateRange)
	.handler(async (ctx, args) => {
		const result = await checkOrphanedObligations(ctx);
		const range = parseInclusiveUtcDayRange(args.fromDate, args.toDate);
		let items = result.items;

		if (args.mortgageId) {
			const mortgageId = args.mortgageId;
			const obligations = await ctx.db
				.query("obligations")
				.withIndex("by_mortgage", (q) => q.eq("mortgageId", mortgageId))
				.collect();
			const validIds = new Set(obligations.map((o) => o._id as string));
			items = items.filter((i) => validIds.has(i.obligationId as string));
		}
		if (range) {
			items = items.filter((i) => inUtcDayRange(i.dueDate, range));
		}
		return recomputeResult(result, items, (i) => i.amount);
	})
	.public();

// ── 7. Stuck Collections ─────────────────────────────────────

export const reconciliationStuckCollections = cashLedgerQuery
	.input({
		fromDate: v.optional(v.string()),
		toDate: v.optional(v.string()),
	})
	.handler(async (ctx, args) => {
		const result = await checkStuckCollections(ctx);
		const range = parseInclusiveUtcDayRange(args.fromDate, args.toDate);
		if (!range) {
			return result;
		}
		const items = result.items.filter((i) =>
			inUtcDayRange(i.initiatedAt, range)
		);
		return recomputeResult(result, items, (i) => i.amount);
	})
	.public();

// ── 8. Orphaned Unapplied Cash ───────────────────────────────

export const reconciliationOrphanedUnapplied = cashLedgerQuery
	.input(optionalMortgageAndDateRange)
	.handler(async (ctx, args) => {
		const result = await checkOrphanedUnappliedCash(ctx);
		const range = parseInclusiveUtcDayRange(args.fromDate, args.toDate);
		let items = result.items;
		if (args.mortgageId) {
			items = items.filter((i) => i.mortgageId === args.mortgageId);
		}
		if (range) {
			items = items.filter((i) =>
				inUtcDayRange(
					approxAccountCreatedAt(result.checkedAt, i.ageDays),
					range
				)
			);
		}
		return recomputeResult(result, items, (i) => i.balance);
	})
	.public();

// ── 9. Obligation Conservation ───────────────────────────────

export const reconciliationObligationConservation = cashLedgerQuery
	.input(optionalMortgageAndDateRange)
	.handler(async (ctx, args) => {
		const result = await checkObligationConservation(ctx);
		const range = parseInclusiveUtcDayRange(args.fromDate, args.toDate);
		let items = result.items;

		if (args.mortgageId) {
			const mortgageId = args.mortgageId;
			const obligations = await ctx.db
				.query("obligations")
				.withIndex("by_mortgage", (q) => q.eq("mortgageId", mortgageId))
				.collect();
			const validIds = new Set(obligations.map((o) => o._id as string));
			items = items.filter((i) => validIds.has(i.obligationId as string));
		}
		if (range) {
			items = items.filter((i) => inUtcDayRange(i.dueDate, range));
		}
		return recomputeResult(result, items, (i) => Math.abs(i.differenceCents));
	})
	.public();

// ── 10. Mortgage Month Conservation ──────────────────────────

export const reconciliationMortgageMonthConservation = cashLedgerQuery
	.input({
		fromDate: v.optional(v.string()),
		mortgageId: v.optional(v.id("mortgages")),
		toDate: v.optional(v.string()),
	})
	.handler(async (ctx, args) => {
		// Validate date strings before using them (same as other endpoints)
		parseInclusiveUtcDayRange(args.fromDate, args.toDate);

		const result = await checkMortgageMonthConservation(ctx);
		let items = result.items;

		if (args.mortgageId) {
			items = items.filter((i) => i.mortgageId === args.mortgageId);
		}

		const fromMonth =
			args.fromDate !== undefined ? monthKeyFromYmd(args.fromDate) : undefined;
		const toMonth =
			args.toDate !== undefined ? monthKeyFromYmd(args.toDate) : undefined;

		if (fromMonth !== undefined) {
			items = items.filter((i) => i.month >= fromMonth);
		}
		if (toMonth !== undefined) {
			items = items.filter((i) => i.month <= toMonth);
		}

		return recomputeResult(result, items, (i) => Math.abs(i.differenceCents));
	})
	.public();

// ── 11. Full Suite ───────────────────────────────────────────

export const reconciliationFullSuite = cashLedgerQuery
	.handler(async (ctx) => {
		return runFullReconciliationSuite(ctx);
	})
	.public();

// ── 12. Orphaned Confirmed Transfers ──────────────────────────

export const reconciliationOrphanedConfirmedTransfers = cashLedgerQuery
	.input({ mortgageId: v.optional(v.id("mortgages")) })
	.handler(async (ctx, args) => {
		const result = await checkOrphanedConfirmedTransfers(ctx);
		if (!args.mortgageId) {
			return result;
		}
		const items = result.items.filter((i) => i.mortgageId === args.mortgageId);
		return recomputeResult(result, items, (i) => i.amount);
	})
	.public();

// ── 13. Orphaned Reversed Transfers ───────────────────────────

export const reconciliationOrphanedReversedTransfers = cashLedgerQuery
	.input({ mortgageId: v.optional(v.id("mortgages")) })
	.handler(async (ctx, args) => {
		const result = await checkOrphanedReversedTransfers(ctx);
		if (!args.mortgageId) {
			return result;
		}
		const items = result.items.filter((i) => i.mortgageId === args.mortgageId);
		return recomputeResult(result, items, (i) => i.amount);
	})
	.public();

// ── 14. Stale Outbound Transfers ──────────────────────────────

export const reconciliationStaleOutboundTransfers = cashLedgerQuery
	.handler(async (ctx) => {
		return checkStaleOutboundTransfers(ctx);
	})
	.public();

// ── 15. Transfer Amount Mismatches ────────────────────────────

export const reconciliationTransferAmountMismatches = cashLedgerQuery
	.input({ mortgageId: v.optional(v.id("mortgages")) })
	.handler(async (ctx, args) => {
		const result = await checkTransferAmountMismatches(ctx);
		if (!args.mortgageId) {
			return result;
		}
		// Join through transfer to filter by mortgage
		const mortgageId = args.mortgageId;
		const mortgageTransferIds = new Set<string>();
		const transfers = await ctx.db
			.query("transferRequests")
			.withIndex("by_mortgage", (q) => q.eq("mortgageId", mortgageId))
			.collect();
		for (const t of transfers) {
			mortgageTransferIds.add(t._id as string);
		}
		const items = result.items.filter((i) =>
			mortgageTransferIds.has(i.transferRequestId as string)
		);
		return recomputeResult(result, items, (i) => Math.abs(i.differenceCents));
	})
	.public();
