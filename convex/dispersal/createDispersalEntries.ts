import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { internalMutation } from "../_generated/server";
import { calculateProRataShares } from "../accrual/interestMath";
import { sourceValidator } from "../engine/validators";
import { getAccountLenderId } from "../ledger/accountOwnership";
import { getPostedBalance } from "../ledger/accounts";
import { businessDateToUnixMs } from "../lib/businessDates";
import { requireLenderIdForAuthId } from "./lenderIdentity";
import { calculateServicingFee } from "./servicingFee";

interface ActivePosition {
	lenderAccountId: Id<"ledger_accounts">;
	lenderAuthId: string;
	units: number;
}

interface DispersalCreationResult {
	created: boolean;
	entries: Array<{
		id: Id<"dispersalEntries">;
		lenderId: Id<"lenders">;
		lenderAccountId: Id<"ledger_accounts">;
		amount: number;
		rawAmount: number;
		units: number;
	}>;
	servicingFeeEntryId: Id<"servicingFeeEntries"> | null;
}

async function resolveLenderIdFromAuthId(
	ctx: MutationCtx,
	lenderAuthId: string
): Promise<Id<"lenders">> {
	return requireLenderIdForAuthId(
		ctx.db,
		lenderAuthId,
		"createDispersalEntries"
	);
}

function validateIntegerCents(value: number, label: string) {
	if (!Number.isSafeInteger(value) || value < 0) {
		throw new ConvexError(
			`createDispersalEntries: ${label} must be a non-negative integer cent value, got ${value}`
		);
	}
}

async function loadActivePositions(
	ctx: MutationCtx,
	ledgerMortgageId: string
): Promise<ActivePosition[]> {
	const accounts = await ctx.db
		.query("ledger_accounts")
		.withIndex("by_type_and_mortgage", (q) =>
			q.eq("type", "POSITION").eq("mortgageId", ledgerMortgageId)
		)
		.collect();

	const positions: ActivePosition[] = [];
	for (const account of accounts) {
		const balance = getPostedBalance(account);
		if (balance <= 0n) {
			continue;
		}

		const lenderAuthId = getAccountLenderId(account);
		if (!lenderAuthId) {
			throw new ConvexError(
				`createDispersalEntries: POSITION account ${account._id} is missing lenderId`
			);
		}

		const units = Number(balance);
		if (!Number.isSafeInteger(units)) {
			throw new ConvexError(
				`createDispersalEntries: POSITION account ${account._id} has a balance that does not fit in a safe integer`
			);
		}

		positions.push({
			lenderAccountId: account._id,
			lenderAuthId,
			units,
		});
	}

	return positions;
}

async function applyDealReroutes(
	ctx: MutationCtx,
	mortgageId: Id<"mortgages">,
	settledDate: string,
	positions: ActivePosition[]
) {
	const reroutes = await ctx.db
		.query("dealReroutes")
		.withIndex("by_mortgage", (q) => q.eq("mortgageId", mortgageId))
		.collect();

	// Sort reroutes by effectiveAfterDate to ensure deterministic processing order
	const sortedReroutes = reroutes.slice().sort((a, b) => {
		const dateCompare = a.effectiveAfterDate.localeCompare(
			b.effectiveAfterDate
		);
		if (dateCompare !== 0) {
			return dateCompare;
		}
		return a._creationTime - b._creationTime;
	});

	for (const reroute of sortedReroutes) {
		if (reroute.effectiveAfterDate > settledDate) {
			continue;
		}

		const fromPosition = positions.find(
			(position) => position.lenderAuthId === reroute.fromOwnerId
		);
		const toPosition = positions.find(
			(position) => position.lenderAuthId === reroute.toOwnerId
		);

		if (!(fromPosition && toPosition)) {
			continue;
		}

		if (!Number.isSafeInteger(reroute.fractionalShare)) {
			throw new ConvexError(
				`createDispersalEntries: deal reroute ${reroute._id} has a non-integer fractionalShare`
			);
		}

		if (reroute.fractionalShare <= 0) {
			throw new ConvexError(
				`createDispersalEntries: reroute ${reroute._id} has invalid fractionalShare ${reroute.fractionalShare} (must be > 0)`
			);
		}

		fromPosition.units -= reroute.fractionalShare;
		toPosition.units += reroute.fractionalShare;

		if (fromPosition.units < 0) {
			throw new ConvexError(
				`createDispersalEntries: reroute ${reroute._id} would make lender ${reroute.fromOwnerId} negative`
			);
		}
	}
}

export const createDispersalEntries = internalMutation({
	args: {
		obligationId: v.id("obligations"),
		mortgageId: v.id("mortgages"),
		settledAmount: v.number(),
		settledDate: v.string(),
		idempotencyKey: v.string(),
		source: sourceValidator,
	},
	handler: async (ctx, args): Promise<DispersalCreationResult> => {
		validateIntegerCents(args.settledAmount, "settledAmount");
		try {
			businessDateToUnixMs(args.settledDate);
		} catch {
			throw new ConvexError(
				`createDispersalEntries: settledDate must be YYYY-MM-DD, got ${args.settledDate}`
			);
		}

		const existingEntries = await ctx.db
			.query("dispersalEntries")
			.withIndex("by_obligation", (q) =>
				q.eq("obligationId", args.obligationId)
			)
			.collect();
		if (existingEntries.length > 0) {
			const existingFee = await ctx.db
				.query("servicingFeeEntries")
				.withIndex("by_obligation", (q) =>
					q.eq("obligationId", args.obligationId)
				)
				.first();

			return {
				created: false,
				entries: existingEntries.map((entry) => ({
					id: entry._id,
					lenderId: entry.lenderId,
					lenderAccountId: entry.lenderAccountId,
					amount: entry.amount,
					rawAmount: entry.calculationDetails.rawAmount,
					units: entry.calculationDetails.ownershipUnits,
				})),
				servicingFeeEntryId: existingFee?._id ?? null,
			};
		}

		const mortgage = (await ctx.db.get(
			args.mortgageId
		)) as Doc<"mortgages"> | null;
		if (!mortgage) {
			throw new ConvexError(
				`createDispersalEntries: mortgage not found: ${args.mortgageId}`
			);
		}

		const annualServicingRate = mortgage.annualServicingRate ?? 0.01;
		const servicingFee = calculateServicingFee(
			annualServicingRate,
			mortgage.principal,
			mortgage.paymentFrequency
		);
		// Allow zero-distributable settlements: when the servicing fee consumes
		// all (or more than) the settled cash, we still record entries with a
		// distributable amount of 0 so the settlement chain is never broken.
		const effectiveServicingFee = Math.min(servicingFee, args.settledAmount);
		const distributableAmount = args.settledAmount - effectiveServicingFee;

		const ledgerMortgageId = mortgage.simulationId ?? String(args.mortgageId);
		const activePositions = await loadActivePositions(ctx, ledgerMortgageId);
		if (activePositions.length === 0) {
			throw new ConvexError(
				`createDispersalEntries: no active positions for mortgage ${args.mortgageId}`
			);
		}

		await applyDealReroutes(
			ctx,
			args.mortgageId,
			args.settledDate,
			activePositions
		);

		const lenderIdCache = new Map<string, Id<"lenders">>();
		const normalizedPositions: Array<{
			lenderAccountId: Id<"ledger_accounts">;
			lenderId: Id<"lenders">;
			units: number;
		}> = [];
		for (const position of activePositions) {
			if (position.units <= 0) {
				continue;
			}

			const cachedLenderId = lenderIdCache.get(position.lenderAuthId);
			const lenderId =
				cachedLenderId ??
				(await resolveLenderIdFromAuthId(ctx, position.lenderAuthId));
			lenderIdCache.set(position.lenderAuthId, lenderId);

			normalizedPositions.push({
				lenderAccountId: position.lenderAccountId,
				lenderId,
				units: position.units,
			});
		}

		if (normalizedPositions.length === 0) {
			throw new ConvexError(
				`createDispersalEntries: no positive positions remain after reroutes for mortgage ${args.mortgageId}`
			);
		}

		const totalUnits = normalizedPositions.reduce(
			(sum, position) => sum + position.units,
			0
		);
		const shares = calculateProRataShares(
			normalizedPositions,
			distributableAmount
		);

		const entries: DispersalCreationResult["entries"] = [];
		for (const share of shares) {
			const entryId = await ctx.db.insert("dispersalEntries", {
				mortgageId: args.mortgageId,
				lenderId: share.lenderId,
				lenderAccountId: share.lenderAccountId,
				amount: share.amount,
				dispersalDate: args.settledDate,
				obligationId: args.obligationId,
				// Canonical fee accounting lives on servicingFeeEntries and
				// calculationDetails.servicingFee. Keep this row-level field as a
				// non-overcounting compatibility value.
				servicingFeeDeducted: 0,
				status: "pending",
				idempotencyKey: `${args.idempotencyKey}:${share.lenderId}`,
				calculationDetails: {
					settledAmount: args.settledAmount,
					servicingFee: effectiveServicingFee,
					distributableAmount,
					ownershipUnits: share.units,
					totalUnits,
					ownershipFraction: totalUnits === 0 ? 0 : share.units / totalUnits,
					rawAmount: share.rawAmount,
					roundedAmount: share.amount,
				},
				createdAt: Date.now(),
			});
			entries.push({
				id: entryId,
				lenderId: share.lenderId,
				lenderAccountId: share.lenderAccountId,
				amount: share.amount,
				rawAmount: share.rawAmount,
				units: share.units,
			});
		}

		const servicingFeeEntryId = await ctx.db.insert("servicingFeeEntries", {
			mortgageId: args.mortgageId,
			obligationId: args.obligationId,
			amount: effectiveServicingFee,
			annualRate: annualServicingRate,
			principalBalance: mortgage.principal,
			date: args.settledDate,
			createdAt: Date.now(),
		});

		return {
			created: true,
			entries,
			servicingFeeEntryId,
		};
	},
});
