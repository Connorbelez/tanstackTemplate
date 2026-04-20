import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { getAccountLenderId } from "../ledger/accountOwnership";
import { getAvailableBalance, getPostedBalance } from "../ledger/accounts";
import { TOTAL_SUPPLY } from "../ledger/constants";

export interface MarketplaceAvailabilitySummary {
	availableFractions: number;
	availablePercent: number;
	lockedFractions: number;
	lockedPercent: number;
	soldFractions: number;
	soldPercent: number;
	totalFractions: number;
	totalInvestors: number;
}

const MIC_LENDER_ID_PATTERN = /(^|[_@.+-])mic([_@.+-]|$)/i;

function isMicLenderId(lenderId: string): boolean {
	return MIC_LENDER_ID_PATTERN.test(lenderId);
}

function roundToTwoDecimals(value: number): number {
	return Math.round(value * 100) / 100;
}

function toSafeNumber(value: bigint, label: string): number {
	if (
		value > BigInt(Number.MAX_SAFE_INTEGER) ||
		value < BigInt(Number.MIN_SAFE_INTEGER)
	) {
		throw new Error(`${label} exceeds Number safe integer range`);
	}

	return Number(value);
}

function buildAvailabilitySummary(args: {
	availableFractions: number;
	lockedFractions: number;
	soldFractions: number;
	totalFractions: number;
	totalInvestors: number;
}): MarketplaceAvailabilitySummary {
	return {
		availableFractions: args.availableFractions,
		availablePercent: roundToTwoDecimals(
			(args.availableFractions / Math.max(args.totalFractions, 1)) * 100
		),
		lockedFractions: args.lockedFractions,
		lockedPercent: roundToTwoDecimals(
			(args.lockedFractions / Math.max(args.totalFractions, 1)) * 100
		),
		soldFractions: args.soldFractions,
		soldPercent: roundToTwoDecimals(
			(args.soldFractions / Math.max(args.totalFractions, 1)) * 100
		),
		totalFractions: args.totalFractions,
		totalInvestors: args.totalInvestors,
	};
}

export function deriveMarketplacePropertyType(
	propertyType: Doc<"listings">["propertyType"]
): Doc<"listings">["marketplacePropertyType"] {
	switch (propertyType) {
		case "condo":
			return "Condo";
		case "multi_unit":
			return "Duplex";
		case "commercial":
			return "Commercial";
		default:
			return "Detached Home";
	}
}

export function lienPositionToMortgageType(
	lienPosition: number
): "First" | "Second" | "Other" {
	if (lienPosition === 1) {
		return "First";
	}

	if (lienPosition === 2) {
		return "Second";
	}

	return "Other";
}

export async function buildMarketplaceAvailabilitySummary(
	ctx: { db: Pick<QueryCtx["db"], "query"> },
	mortgageId: Doc<"listings">["mortgageId"]
): Promise<MarketplaceAvailabilitySummary> {
	const totalFractions = toSafeNumber(TOTAL_SUPPLY, "totalFractions");
	if (!mortgageId) {
		return buildAvailabilitySummary({
			availableFractions: totalFractions,
			lockedFractions: 0,
			soldFractions: 0,
			totalFractions,
			totalInvestors: 0,
		});
	}

	const accounts = await ctx.db
		.query("ledger_accounts")
		.withIndex("by_type_and_mortgage", (q) =>
			q.eq("type", "POSITION").eq("mortgageId", String(mortgageId))
		)
		.collect();

	const positions = accounts
		.map((account) => ({
			account,
			availableBalance: getAvailableBalance(account),
			lenderId: getAccountLenderId(account),
			postedBalance: getPostedBalance(account),
		}))
		.filter(
			(
				position
			): position is {
				account: (typeof accounts)[number];
				availableBalance: bigint;
				lenderId: string;
				postedBalance: bigint;
			} => position.postedBalance > 0n && position.lenderId !== undefined
		);

	const micPosition = positions.find((position) =>
		isMicLenderId(position.lenderId)
	);
	const soldFractions = toSafeNumber(
		positions
			.filter((position) => !isMicLenderId(position.lenderId))
			.reduce((total, position) => total + position.postedBalance, 0n),
		"soldFractions"
	);
	const totalInvestors = positions.filter(
		(position) => !isMicLenderId(position.lenderId)
	).length;
	const lockedFractions = micPosition
		? toSafeNumber(micPosition.account.pendingCredits ?? 0n, "lockedFractions")
		: 0;
	const availableFractions = micPosition
		? Math.max(
				toSafeNumber(micPosition.availableBalance, "availableFractions"),
				0
			)
		: Math.max(totalFractions - soldFractions - lockedFractions, 0);

	return buildAvailabilitySummary({
		availableFractions,
		lockedFractions,
		soldFractions,
		totalFractions,
		totalInvestors,
	});
}

export async function attachMarketplaceAvailabilityToListings(
	ctx: { db: Pick<QueryCtx["db"], "query"> },
	listings: Doc<"listings">[]
) {
	const mortgageIds = [
		...new Set(
			listings
				.map((listing) => listing.mortgageId)
				.filter(
					(mortgageId): mortgageId is NonNullable<typeof mortgageId> =>
						mortgageId !== undefined
				)
		),
	];
	const availabilityByMortgageId = new Map<
		NonNullable<Doc<"listings">["mortgageId"]>,
		MarketplaceAvailabilitySummary
	>();

	await Promise.all(
		mortgageIds.map(async (mortgageId) => {
			availabilityByMortgageId.set(
				mortgageId,
				await buildMarketplaceAvailabilitySummary(ctx, mortgageId)
			);
		})
	);

	return await Promise.all(
		listings.map(async (listing) => ({
			availability:
				listing.mortgageId === undefined
					? await buildMarketplaceAvailabilitySummary(ctx, undefined)
					: (availabilityByMortgageId.get(listing.mortgageId) ??
						(await buildMarketplaceAvailabilitySummary(
							ctx,
							listing.mortgageId
						))),
			listing,
		}))
	);
}

export async function getListingAppraisalsByProperty(
	ctx: { db: Pick<QueryCtx["db"], "query"> },
	propertyId: NonNullable<Doc<"listings">["propertyId"]>
) {
	const appraisals = await ctx.db
		.query("appraisals")
		.withIndex("by_property", (q) => q.eq("propertyId", propertyId))
		.collect();

	appraisals.sort((left, right) => {
		const byEffectiveDate = right.effectiveDate.localeCompare(
			left.effectiveDate
		);
		if (byEffectiveDate !== 0) {
			return byEffectiveDate;
		}

		return right.createdAt - left.createdAt;
	});

	const appraisalsWithComparables = await Promise.all(
		appraisals.map(async (appraisal) => {
			const comparables = await ctx.db
				.query("appraisalComparables")
				.withIndex("by_appraisal", (q) => q.eq("appraisalId", appraisal._id))
				.collect();

			comparables.sort((left, right) => left.sortOrder - right.sortOrder);

			return {
				comparables: comparables.map((comparable) => ({
					address: comparable.address,
					adjustedValue: comparable.adjustedValue ?? null,
					id: String(comparable._id),
					propertyType: comparable.propertyType ?? null,
					saleDate: comparable.saleDate ?? null,
					salePrice: comparable.salePrice ?? null,
					squareFootage: comparable.squareFootage ?? null,
				})),
				effectiveDate: appraisal.effectiveDate,
				id: String(appraisal._id),
				reportDate: appraisal.reportDate,
				type: appraisal.appraisalType,
				valueAsIfComplete: appraisal.asIfValue ?? null,
				valueAsIs: appraisal.appraisedValue,
			};
		})
	);

	return appraisalsWithComparables;
}

export async function getListingEncumbrancesByProperty(
	ctx: { db: Pick<QueryCtx["db"], "query"> },
	propertyId: NonNullable<Doc<"listings">["propertyId"]>
) {
	const encumbrances = await ctx.db
		.query("priorEncumbrances")
		.withIndex("by_property", (q) => q.eq("propertyId", propertyId))
		.collect();

	encumbrances.sort((left, right) => {
		if (left.priority !== right.priority) {
			return left.priority - right.priority;
		}

		return right.createdAt - left.createdAt;
	});

	return encumbrances.map((encumbrance) => ({
		balanceAsOfDate: encumbrance.balanceAsOfDate ?? null,
		holder: encumbrance.holder,
		id: String(encumbrance._id),
		outstandingBalance: encumbrance.outstandingBalance ?? null,
		priority: encumbrance.priority,
		type: encumbrance.encumbranceType,
	}));
}

export async function getHeroImageUrl(
	ctx: Pick<QueryCtx, "storage">,
	heroImage: Doc<"listings">["heroImages"][number] | undefined
) {
	if (!heroImage) {
		return null;
	}

	return await ctx.storage.getUrl(heroImage.storageId);
}

export function buildLocationLabel(
	listing: Pick<Doc<"listings">, "city" | "province">
) {
	const parts = [listing.city.trim(), listing.province.trim()].filter(
		(part) => part.length > 0
	);
	return parts.length > 0 ? parts.join(", ") : null;
}
