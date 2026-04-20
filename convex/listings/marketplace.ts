import { ConvexError, v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { listingQuery } from "../fluent";
import {
	attachMarketplaceAvailabilityToListings,
	buildLocationLabel,
	buildMarketplaceAvailabilitySummary,
	getHeroImageUrl,
	getListingAppraisalsByProperty,
	getListingEncumbrancesByProperty,
	lienPositionToMortgageType,
} from "./marketplaceShared";
import { readListingPublicDocuments } from "./publicDocuments";
import { marketplaceListingPropertyTypeValidator } from "./validators";

const DEFAULT_PAGE_SIZE = 24;
const MAX_PAGE_SIZE = 50;
const OFFSET_CURSOR_PREFIX = "offset:";
const OFFSET_CURSOR_PATTERN = /^\d+$/;

type ListingDoc = Doc<"listings">;
type MortgageTypeLabel = "First" | "Second" | "Other";

interface MarketplaceFilters {
	interestRate?: { max?: number; min?: number };
	ltv?: { max?: number; min?: number };
	maturityDate?: { end?: string };
	mortgageTypes?: MortgageTypeLabel[];
	principalAmount?: { max?: number; min?: number };
	propertyTypes?: ListingDoc["marketplacePropertyType"][];
	searchQuery?: string;
}

function normalizePageSize(value: number | undefined): number {
	if (!Number.isFinite(value ?? DEFAULT_PAGE_SIZE)) {
		return DEFAULT_PAGE_SIZE;
	}

	const rounded = Math.trunc(value ?? DEFAULT_PAGE_SIZE);
	if (rounded < 1) {
		return DEFAULT_PAGE_SIZE;
	}

	return Math.min(rounded, MAX_PAGE_SIZE);
}

function parseOffsetCursor(cursor: string | null | undefined): number {
	if (cursor == null) {
		return 0;
	}

	const raw = cursor.startsWith(OFFSET_CURSOR_PREFIX)
		? cursor.slice(OFFSET_CURSOR_PREFIX.length)
		: cursor;
	if (!OFFSET_CURSOR_PATTERN.test(raw)) {
		throw new ConvexError("Invalid pagination cursor");
	}

	const offset = Number.parseInt(raw, 10);
	if (!Number.isSafeInteger(offset) || offset < 0) {
		throw new ConvexError("Invalid pagination cursor");
	}

	return offset;
}

function paginateResults<T>(
	items: T[],
	cursor: string | null | undefined,
	numItems: number | undefined
) {
	const offset = parseOffsetCursor(cursor);
	const pageSize = normalizePageSize(numItems);
	const page = items.slice(offset, offset + pageSize);
	const nextOffset = offset + page.length;
	const isDone = nextOffset >= items.length;

	return {
		continueCursor: isDone
			? null
			: `${OFFSET_CURSOR_PREFIX}${String(nextOffset)}`,
		isDone,
		page,
	};
}

function matchesMarketplaceFilters(
	listing: ListingDoc,
	filters: MarketplaceFilters | undefined
) {
	if (!filters) {
		return true;
	}

	const searchQuery = filters.searchQuery?.trim().toLowerCase();
	const mortgageType = lienPositionToMortgageType(listing.lienPosition);

	return [
		!searchQuery ||
			listing.title?.toLowerCase().includes(searchQuery) ||
			listing.city.toLowerCase().includes(searchQuery) ||
			listing.province.toLowerCase().includes(searchQuery) ||
			listing.marketplaceCopy?.toLowerCase().includes(searchQuery) ||
			listing.description?.toLowerCase().includes(searchQuery),
		!filters.mortgageTypes?.length ||
			filters.mortgageTypes.includes(mortgageType),
		!filters.propertyTypes?.length ||
			filters.propertyTypes.includes(listing.marketplacePropertyType),
		filters.ltv?.min === undefined || listing.ltvRatio >= filters.ltv.min,
		filters.ltv?.max === undefined || listing.ltvRatio <= filters.ltv.max,
		filters.interestRate?.min === undefined ||
			listing.interestRate >= filters.interestRate.min,
		filters.interestRate?.max === undefined ||
			listing.interestRate <= filters.interestRate.max,
		filters.principalAmount?.min === undefined ||
			listing.principal >= filters.principalAmount.min,
		filters.principalAmount?.max === undefined ||
			listing.principal <= filters.principalAmount.max,
		filters.maturityDate?.end === undefined ||
			listing.maturityDate <= filters.maturityDate.end,
	].every(Boolean);
}

function compareMarketplaceListings(left: ListingDoc, right: ListingDoc) {
	if (left.featured !== right.featured) {
		return left.featured ? -1 : 1;
	}

	const leftDisplayOrder = left.displayOrder ?? Number.MAX_SAFE_INTEGER;
	const rightDisplayOrder = right.displayOrder ?? Number.MAX_SAFE_INTEGER;
	if (leftDisplayOrder !== rightDisplayOrder) {
		return leftDisplayOrder - rightDisplayOrder;
	}

	const leftPublishedAt = left.publishedAt ?? 0;
	const rightPublishedAt = right.publishedAt ?? 0;
	if (leftPublishedAt !== rightPublishedAt) {
		return rightPublishedAt - leftPublishedAt;
	}

	return String(left._id).localeCompare(String(right._id));
}

async function collectMarketplaceListingCandidates(
	ctx: Pick<QueryCtx, "db">,
	filters: MarketplaceFilters | undefined
): Promise<ListingDoc[]> {
	if (filters?.propertyTypes?.length === 1) {
		const propertyType = filters.propertyTypes[0];
		return await ctx.db
			.query("listings")
			.withIndex("by_marketplace_property_type_and_status", (q) =>
				q.eq("marketplacePropertyType", propertyType).eq("status", "published")
			)
			.collect();
	}

	if (filters?.mortgageTypes?.length === 1) {
		const mortgageType = filters.mortgageTypes[0];
		if (mortgageType === "First" || mortgageType === "Second") {
			return await ctx.db
				.query("listings")
				.withIndex("by_lien_position_and_status", (q) =>
					q
						.eq("lienPosition", mortgageType === "First" ? 1 : 2)
						.eq("status", "published")
				)
				.collect();
		}
	}

	return await ctx.db
		.query("listings")
		.withIndex("by_status", (q) => q.eq("status", "published"))
		.collect();
}

async function getSimilarMarketplaceListings(
	ctx: Pick<QueryCtx, "db" | "storage">,
	listing: ListingDoc
) {
	const candidates = await ctx.db
		.query("listings")
		.withIndex("by_marketplace_property_type_and_status", (q) =>
			q
				.eq("marketplacePropertyType", listing.marketplacePropertyType)
				.eq("status", "published")
		)
		.collect();

	return await Promise.all(
		candidates
			.filter((candidate) => candidate._id !== listing._id)
			.sort(compareMarketplaceListings)
			.slice(0, 3)
			.map(async (candidate) => ({
				heroImageUrl: await getHeroImageUrl(ctx, candidate.heroImages[0]),
				id: String(candidate._id),
				interestRate: candidate.interestRate,
				locationLabel: buildLocationLabel(candidate) ?? "",
				ltvRatio: candidate.ltvRatio,
				mortgageTypeLabel: lienPositionToMortgageType(candidate.lienPosition),
				principal: candidate.principal,
				propertyTypeLabel: candidate.marketplacePropertyType,
				title: candidate.title ?? "Mortgage Listing",
			}))
	);
}

export const listMarketplaceListings = listingQuery
	.input({
		cursor: v.optional(v.union(v.string(), v.null())),
		filters: v.optional(
			v.object({
				searchQuery: v.optional(v.string()),
				mortgageTypes: v.optional(
					v.array(
						v.union(v.literal("First"), v.literal("Second"), v.literal("Other"))
					)
				),
				propertyTypes: v.optional(
					v.array(marketplaceListingPropertyTypeValidator)
				),
				ltv: v.optional(
					v.object({
						max: v.optional(v.number()),
						min: v.optional(v.number()),
					})
				),
				interestRate: v.optional(
					v.object({
						max: v.optional(v.number()),
						min: v.optional(v.number()),
					})
				),
				principalAmount: v.optional(
					v.object({
						max: v.optional(v.number()),
						min: v.optional(v.number()),
					})
				),
				maturityDate: v.optional(
					v.object({
						end: v.optional(v.string()),
					})
				),
			})
		),
		numItems: v.optional(v.number()),
	})
	.handler(async (ctx, args) => {
		const candidates = await collectMarketplaceListingCandidates(
			ctx,
			args.filters
		);
		const filtered = candidates
			.filter((listing) => matchesMarketplaceFilters(listing, args.filters))
			.sort(compareMarketplaceListings);
		const paginated = paginateResults(
			filtered,
			args.cursor ?? null,
			args.numItems
		);
		const page = await attachMarketplaceAvailabilityToListings(
			ctx,
			paginated.page
		);

		return {
			continueCursor: paginated.continueCursor,
			isDone: paginated.isDone,
			page: await Promise.all(
				page.map(async ({ availability, listing }) => ({
					approximateLatitude: listing.approximateLatitude ?? null,
					approximateLongitude: listing.approximateLongitude ?? null,
					availability,
					displayOrder: listing.displayOrder ?? null,
					featured: listing.featured,
					heroImageUrl: await getHeroImageUrl(ctx, listing.heroImages[0]),
					id: String(listing._id),
					interestRate: listing.interestRate,
					locationLabel: buildLocationLabel(listing) ?? "",
					ltvRatio: listing.ltvRatio,
					marketplaceCopy: listing.marketplaceCopy ?? listing.description ?? "",
					maturityDate: listing.maturityDate,
					mortgageTypeLabel: lienPositionToMortgageType(listing.lienPosition),
					principal: listing.principal,
					propertyTypeLabel: listing.marketplacePropertyType,
					title: listing.title ?? "Mortgage Listing",
				}))
			),
		};
	})
	.public();

export const getMarketplaceListingDetail = listingQuery
	.input({ listingId: v.id("listings") })
	.handler(async (ctx, args) => {
		const listing = await ctx.db.get(args.listingId);
		if (!listing || listing.status !== "published") {
			return null;
		}

		const [
			investmentSummary,
			documents,
			appraisals,
			encumbrances,
			similarListings,
		] = await Promise.all([
			buildMarketplaceAvailabilitySummary(ctx, listing.mortgageId),
			readListingPublicDocuments(ctx, args.listingId),
			listing.propertyId
				? getListingAppraisalsByProperty(ctx, listing.propertyId)
				: Promise.resolve([]),
			listing.propertyId
				? getListingEncumbrancesByProperty(ctx, listing.propertyId)
				: Promise.resolve([]),
			getSimilarMarketplaceListings(ctx, listing),
		]);

		return {
			appraisals,
			documents,
			encumbrances,
			investment: {
				availableFractions: investmentSummary.availableFractions,
				investorCount: investmentSummary.totalInvestors,
				lockedPercent: investmentSummary.lockedPercent,
				soldPercent: investmentSummary.soldPercent,
				totalFractions: investmentSummary.totalFractions,
			},
			listing: {
				approximateLatitude: listing.approximateLatitude ?? null,
				approximateLongitude: listing.approximateLongitude ?? null,
				borrowerSignal: listing.borrowerSignal ?? null,
				heroImages: await Promise.all(
					listing.heroImages.map(async (image, index) => ({
						caption: image.caption ?? null,
						id: `${String(listing._id)}:${String(index)}`,
						url: await getHeroImageUrl(ctx, image),
					}))
				),
				id: String(listing._id),
				interestRate: listing.interestRate,
				locationLabel: buildLocationLabel(listing) ?? "",
				lienPosition: listing.lienPosition,
				ltvRatio: listing.ltvRatio,
				marketplaceCopy: listing.marketplaceCopy ?? null,
				maturityDate: listing.maturityDate,
				mortgageTypeLabel: lienPositionToMortgageType(listing.lienPosition),
				monthlyPayment: listing.monthlyPayment,
				paymentFrequency: listing.paymentFrequency,
				paymentHistory: listing.paymentHistory ?? null,
				principal: listing.principal,
				propertyTypeLabel: listing.marketplacePropertyType,
				rateType: listing.rateType,
				readOnly: true,
				summary:
					listing.marketplaceCopy ?? listing.description ?? "Mortgage Listing",
				termMonths: listing.termMonths,
				title: listing.title ?? "Mortgage Listing",
			},
			similarListings,
		};
	})
	.public();
