import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { getAccountLenderId } from "../ledger/accountOwnership";
import { getPostedBalance } from "../ledger/accounts";
import { mortgageNominalAnnualRateToDecimal } from "../mortgages/nominalAnnualRate";
import { calculateAccrualForPeriods, maxDate, minDate } from "./interestMath";
import { getOwnershipPeriods } from "./ownershipPeriods";
import type { AccrualResult, OwnershipPeriod } from "./types";

type MortgageDoc = Doc<"mortgages">;
type LedgerAccountDoc = Doc<"ledger_accounts">;

export interface MortgageAccrualBreakdown {
	accruedInterest: number;
	fromDate: string;
	interestRate: number;
	lenderBreakdowns: AccrualResult[];
	mortgageId: string;
	principal: number;
	toDate: string;
}

export interface PortfolioAccrualBreakdown {
	accruedInterest: number;
	fromDate: string;
	lenderId: string;
	mortgageBreakdowns: AccrualResult[];
	toDate: string;
}

export interface DailyAccrualBreakdown {
	accruedInterest: number;
	date: string;
	lenderBreakdowns: AccrualResult[];
	mortgageId: string;
}

export function toLedgerMortgageId(mortgageId: Id<"mortgages">): string {
	return String(mortgageId);
}

export async function getMortgageOrThrow(
	ctx: { db: QueryCtx["db"] },
	mortgageId: Id<"mortgages">
): Promise<MortgageDoc> {
	const mortgage = await ctx.db.get(mortgageId);
	if (!mortgage) {
		throw new ConvexError("Mortgage not found");
	}
	return mortgage;
}

function getPositionLenderId(account: LedgerAccountDoc): string {
	const lenderId = getAccountLenderId(account);
	if (!lenderId) {
		throw new Error(`POSITION account ${account._id} is missing lenderId`);
	}
	return lenderId;
}

export async function getMortgagePositionAccounts(
	ctx: { db: QueryCtx["db"] },
	mortgageLedgerId: string
): Promise<
	Array<{
		balance: bigint;
		lenderId: string;
	}>
> {
	const indexedAccounts = await ctx.db
		.query("ledger_accounts")
		.withIndex("by_mortgage_and_lender", (q) =>
			q.eq("mortgageId", mortgageLedgerId)
		)
		.collect();
	const legacyAccounts = await ctx.db
		.query("ledger_accounts")
		.withIndex("by_mortgage", (q) => q.eq("mortgageId", mortgageLedgerId))
		.collect();

	const dedupedAccounts = new Map<string, LedgerAccountDoc>();
	for (const account of [...indexedAccounts, ...legacyAccounts]) {
		if (account.type !== "POSITION") {
			continue;
		}
		const lenderId = getPositionLenderId(account);
		if (!dedupedAccounts.has(lenderId)) {
			dedupedAccounts.set(lenderId, account);
		}
	}

	return [...dedupedAccounts.entries()]
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([, account]) => ({
			balance: getPostedBalance(account),
			lenderId: getPositionLenderId(account),
		}));
}

export function clipOwnershipPeriods(
	periods: OwnershipPeriod[],
	fromDate: string,
	toDate: string
): Array<{ fraction: number; fromDate: string; toDate: string }> {
	return periods.flatMap((period) => {
		const effectiveFrom = maxDate(period.fromDate, fromDate);
		const effectiveTo = minDate(period.toDate ?? toDate, toDate);

		if (effectiveFrom > effectiveTo) {
			return [];
		}

		return [
			{
				fraction: period.fraction,
				fromDate: effectiveFrom,
				toDate: effectiveTo,
			},
		];
	});
}

export async function buildLenderAccrualResult(
	ctx: { db: QueryCtx["db"] },
	mortgageId: Id<"mortgages">,
	lenderId: string,
	fromDate: string,
	toDate: string,
	mortgageData?: { interestRate: number; principal: number }
): Promise<AccrualResult> {
	const mortgage = mortgageData ?? (await getMortgageOrThrow(ctx, mortgageId));
	const annualRateDecimal = mortgageNominalAnnualRateToDecimal(
		mortgage.interestRate
	);
	const mortgageLedgerId = toLedgerMortgageId(mortgageId);
	const periods = await getOwnershipPeriods(ctx, mortgageLedgerId, lenderId);
	return {
		mortgageId: mortgageLedgerId,
		lenderId,
		fromDate,
		toDate,
		accruedInterest: calculateAccrualForPeriods(
			periods,
			annualRateDecimal,
			mortgage.principal,
			fromDate,
			toDate
		),
		periods: clipOwnershipPeriods(periods, fromDate, toDate),
	};
}

export async function buildMortgageAccrualBreakdown(
	ctx: { db: QueryCtx["db"] },
	mortgageId: Id<"mortgages">,
	fromDate: string,
	toDate: string
): Promise<MortgageAccrualBreakdown> {
	const mortgage = await getMortgageOrThrow(ctx, mortgageId);
	const mortgageLedgerId = toLedgerMortgageId(mortgageId);
	const positionAccounts = await getMortgagePositionAccounts(
		ctx,
		mortgageLedgerId
	);
	const lenderBreakdowns = await Promise.all(
		positionAccounts.map((account) =>
			buildLenderAccrualResult(
				ctx,
				mortgageId,
				account.lenderId,
				fromDate,
				toDate,
				{ interestRate: mortgage.interestRate, principal: mortgage.principal }
			)
		)
	);

	return {
		mortgageId: mortgageLedgerId,
		fromDate,
		toDate,
		interestRate: mortgage.interestRate,
		principal: mortgage.principal,
		accruedInterest: lenderBreakdowns.reduce(
			(total, lender) => total + lender.accruedInterest,
			0
		),
		lenderBreakdowns: lenderBreakdowns.sort((left, right) =>
			left.lenderId.localeCompare(right.lenderId)
		),
	};
}

export async function buildDailyAccrualBreakdown(
	ctx: { db: QueryCtx["db"] },
	mortgageId: Id<"mortgages">,
	date: string
): Promise<DailyAccrualBreakdown> {
	const mortgageBreakdown = await buildMortgageAccrualBreakdown(
		ctx,
		mortgageId,
		date,
		date
	);

	return {
		mortgageId: mortgageBreakdown.mortgageId,
		date,
		accruedInterest: mortgageBreakdown.accruedInterest,
		lenderBreakdowns: mortgageBreakdown.lenderBreakdowns,
	};
}

export async function buildPortfolioAccrualBreakdown(
	ctx: { db: QueryCtx["db"] },
	lenderId: string,
	fromDate: string,
	toDate: string
): Promise<PortfolioAccrualBreakdown> {
	// NOTE: We intentionally do not fall back to a full-table scan for legacy
	// accounts without `lenderId` because that does not scale with ledger size.
	// Any remaining legacy accounts should have `lenderId` backfilled so they
	// are discoverable via the `by_lender` index above.
	const indexedAccounts = await ctx.db
		.query("ledger_accounts")
		.withIndex("by_lender", (q) => q.eq("lenderId", lenderId))
		.collect();
	const accounts = indexedAccounts.filter(
		(account) => account.type === "POSITION" && getPostedBalance(account) > 0n
	);
	const uniqueMortgageIds = Array.from(
		new Set(accounts.map((account) => account.mortgageId).filter(Boolean))
	) as string[];

	const mortgageBreakdowns = await Promise.all(
		uniqueMortgageIds.map(async (mortgageId) =>
			buildLenderAccrualResult(
				ctx,
				mortgageId as Id<"mortgages">,
				lenderId,
				fromDate,
				toDate
			)
		)
	);

	return {
		lenderId,
		fromDate,
		toDate,
		accruedInterest: mortgageBreakdowns.reduce(
			(total, mortgage) => total + mortgage.accruedInterest,
			0
		),
		mortgageBreakdowns: mortgageBreakdowns.sort((left, right) =>
			left.mortgageId.localeCompare(right.mortgageId)
		),
	};
}
