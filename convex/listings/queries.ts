import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { DatabaseReader } from "../_generated/server";
import { adminQuery, authedQuery } from "../fluent";
import { getAccountLenderId } from "../ledger/accountOwnership";
import { getPostedBalance } from "../ledger/accounts";
import { TOTAL_SUPPLY } from "../ledger/constants";
import {
	listingPropertyTypeValidator,
	listingStatusValidator,
} from "./validators";

const DEFAULT_PAGE_SIZE = 20;
const FILTERED_LISTING_SCAN_LIMIT = 250;
const MAX_PAGE_SIZE = 50;
const OFFSET_CURSOR_PREFIX = "offset:";
const OFFSET_CURSOR_PATTERN = /^\d+$/;
const MIC_LENDER_ID_PATTERN = /(^|[_@.+-])mic([_@.+-]|$)/i;
const TRANSACTION_ENTRY_TYPES = new Set([
	"SHARES_ISSUED",
	"SHARES_TRANSFERRED",
	"SHARES_COMMITTED",
	"SHARES_REDEEMED",
] as const);

type ListingDoc = Doc<"listings">;

interface ListingAvailability {
	availableFractions: number;
	micPosition: {
		balance: number;
		hasPosition: boolean;
		inferred: boolean;
		lenderId: string | null;
	};
	percentageSold: number;
	totalFractions: number;
	totalInvestors: number;
}

type ListingSortField =
	| "interestRate"
	| "ltv"
	| "principalAmount"
	| "publishedAt"
	| "viewCount";

type SortDirection = "asc" | "desc";

interface PublishedListingFilters {
	city?: string;
	interestRate?: { max?: number; min?: number };
	lienPosition?: number;
	ltv?: { max?: number; min?: number };
	maturityDate?: { end?: string; start?: string };
	principalAmount?: { max?: number; min?: number };
	propertyType?: ListingDoc["propertyType"];
	province?: string;
}

function isTransactionEntryType(
	entryType: Doc<"ledger_journal_entries">["entryType"]
): entryType is
	| "SHARES_ISSUED"
	| "SHARES_TRANSFERRED"
	| "SHARES_COMMITTED"
	| "SHARES_REDEEMED" {
	return TRANSACTION_ENTRY_TYPES.has(
		entryType as
			| "SHARES_ISSUED"
			| "SHARES_TRANSFERRED"
			| "SHARES_COMMITTED"
			| "SHARES_REDEEMED"
	);
}

function isTransactionHistoryEntry(
	entry: Doc<"ledger_journal_entries">
): entry is Doc<"ledger_journal_entries"> & {
	entryType:
		| "SHARES_ISSUED"
		| "SHARES_TRANSFERRED"
		| "SHARES_COMMITTED"
		| "SHARES_REDEEMED";
} {
	return isTransactionEntryType(entry.entryType);
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

function hasPublishedFilters(
	filters: PublishedListingFilters | undefined
): boolean {
	return Boolean(
		filters?.city ??
			filters?.province ??
			filters?.propertyType ??
			filters?.lienPosition ??
			filters?.interestRate?.min ??
			filters?.interestRate?.max ??
			filters?.ltv?.min ??
			filters?.ltv?.max ??
			filters?.principalAmount?.min ??
			filters?.principalAmount?.max ??
			filters?.maturityDate?.start ??
			filters?.maturityDate?.end
	);
}

function toSafeNumber(value: bigint, label: string): number {
	if (
		value > BigInt(Number.MAX_SAFE_INTEGER) ||
		value < BigInt(Number.MIN_SAFE_INTEGER)
	) {
		throw new ConvexError(`${label} exceeds Number safe integer range`);
	}

	return Number(value);
}

function amountToNumber(value: number | bigint, label: string): number {
	if (typeof value === "bigint") {
		return toSafeNumber(value, label);
	}

	if (!Number.isFinite(value)) {
		throw new ConvexError(`${label} must be a finite number`);
	}

	return value;
}

function roundToTwoDecimals(value: number): number {
	return Math.round(value * 100) / 100;
}

function isMicLenderId(lenderId: string): boolean {
	return MIC_LENDER_ID_PATTERN.test(lenderId);
}

function compareMaybeNumber(
	left: number | undefined,
	right: number | undefined,
	direction: SortDirection
) {
	if (left === right) {
		return 0;
	}
	if (left === undefined) {
		return 1;
	}
	if (right === undefined) {
		return -1;
	}

	return direction === "asc" ? left - right : right - left;
}

function compareListings(
	left: ListingDoc,
	right: ListingDoc,
	field: ListingSortField,
	direction: SortDirection
) {
	let primary = 0;

	switch (field) {
		case "interestRate":
			primary = compareMaybeNumber(
				left.interestRate,
				right.interestRate,
				direction
			);
			break;
		case "ltv":
			primary = compareMaybeNumber(left.ltvRatio, right.ltvRatio, direction);
			break;
		case "principalAmount":
			primary = compareMaybeNumber(left.principal, right.principal, direction);
			break;
		case "publishedAt":
			primary = compareMaybeNumber(
				left.publishedAt,
				right.publishedAt,
				direction
			);
			break;
		case "viewCount":
			primary = compareMaybeNumber(left.viewCount, right.viewCount, direction);
			break;
		default:
			primary = 0;
	}

	if (primary !== 0) {
		return primary;
	}

	const createdAtCompare = compareMaybeNumber(
		left.createdAt,
		right.createdAt,
		"desc"
	);
	if (createdAtCompare !== 0) {
		return createdAtCompare;
	}

	return String(left._id).localeCompare(String(right._id));
}

function listingMatchesPublishedFilters(
	listing: ListingDoc,
	filters: PublishedListingFilters | undefined
) {
	if (!filters) {
		return true;
	}

	return [
		filters.propertyType === undefined ||
			listing.propertyType === filters.propertyType,
		filters.city === undefined || listing.city === filters.city,
		filters.province === undefined || listing.province === filters.province,
		filters.lienPosition === undefined ||
			listing.lienPosition === filters.lienPosition,
		filters.interestRate?.min === undefined ||
			listing.interestRate >= filters.interestRate.min,
		filters.interestRate?.max === undefined ||
			listing.interestRate <= filters.interestRate.max,
		filters.ltv?.min === undefined || listing.ltvRatio >= filters.ltv.min,
		filters.ltv?.max === undefined || listing.ltvRatio <= filters.ltv.max,
		filters.principalAmount?.min === undefined ||
			listing.principal >= filters.principalAmount.min,
		filters.principalAmount?.max === undefined ||
			listing.principal <= filters.principalAmount.max,
		filters.maturityDate?.start === undefined ||
			listing.maturityDate >= filters.maturityDate.start,
		filters.maturityDate?.end === undefined ||
			listing.maturityDate <= filters.maturityDate.end,
	].every(Boolean);
}

function getTransactionEventType(
	entryType:
		| "SHARES_ISSUED"
		| "SHARES_TRANSFERRED"
		| "SHARES_COMMITTED"
		| "SHARES_REDEEMED"
) {
	if (entryType === "SHARES_TRANSFERRED" || entryType === "SHARES_COMMITTED") {
		return "transfer";
	}
	if (entryType === "SHARES_REDEEMED") {
		return "redemption";
	}
	return "purchase";
}

async function getListingByIdOrNull(
	ctx: { db: Pick<DatabaseReader, "get"> },
	listingId: Id<"listings">
) {
	return await ctx.db.get(listingId);
}

async function collectPublishedListingCandidates(
	ctx: { db: Pick<DatabaseReader, "query"> },
	filters: PublishedListingFilters | undefined
): Promise<ListingDoc[]> {
	const takeBoundedResults = async (query: {
		take(limit: number): Promise<ListingDoc[]>;
	}) => {
		const page = await query.take(FILTERED_LISTING_SCAN_LIMIT + 1);
		if (page.length > FILTERED_LISTING_SCAN_LIMIT) {
			throw new ConvexError(
				"Listing filter combination is too broad; add more filters or use a supported indexed sort"
			);
		}

		return page;
	};

	if (filters?.city) {
		return await takeBoundedResults(
			ctx.db
				.query("listings")
				.withIndex("by_city_and_status", (q) =>
					q.eq("city", filters.city as string).eq("status", "published")
				)
		);
	}

	if (filters?.province) {
		return await takeBoundedResults(
			ctx.db
				.query("listings")
				.withIndex("by_province_and_status", (q) =>
					q.eq("province", filters.province as string).eq("status", "published")
				)
		);
	}

	if (filters?.propertyType) {
		return await takeBoundedResults(
			ctx.db
				.query("listings")
				.withIndex("by_property_type_and_status", (q) =>
					q
						.eq(
							"propertyType",
							filters.propertyType as ListingDoc["propertyType"]
						)
						.eq("status", "published")
				)
		);
	}

	if (filters?.lienPosition !== undefined) {
		return await takeBoundedResults(
			ctx.db
				.query("listings")
				.withIndex("by_lien_position_and_status", (q) =>
					q
						.eq("lienPosition", filters.lienPosition as number)
						.eq("status", "published")
				)
		);
	}

	return await takeBoundedResults(
		ctx.db
			.query("listings")
			.withIndex("by_status", (q) => q.eq("status", "published"))
	);
}

async function paginateListingsBySortField(
	ctx: { db: Pick<DatabaseReader, "query"> },
	args: {
		cursor: string | null | undefined;
		numItems: number | undefined;
		sortDirection: SortDirection;
		sortField: ListingSortField;
		status: ListingDoc["status"];
	}
) {
	const paginationOpts = {
		cursor: args.cursor ?? null,
		numItems: normalizePageSize(args.numItems),
	};

	switch (args.sortField) {
		case "interestRate":
			return await ctx.db
				.query("listings")
				.withIndex("by_interest_rate", (q) => q.eq("status", args.status))
				.order(args.sortDirection)
				.paginate(paginationOpts);
		case "ltv":
			return await ctx.db
				.query("listings")
				.withIndex("by_ltv", (q) => q.eq("status", args.status))
				.order(args.sortDirection)
				.paginate(paginationOpts);
		case "principalAmount":
			return await ctx.db
				.query("listings")
				.withIndex("by_principal", (q) => q.eq("status", args.status))
				.order(args.sortDirection)
				.paginate(paginationOpts);
		case "publishedAt":
			return await ctx.db
				.query("listings")
				.withIndex("by_published_at", (q) => q.eq("status", args.status))
				.order(args.sortDirection)
				.paginate(paginationOpts);
		case "viewCount":
			return await ctx.db
				.query("listings")
				.withIndex("by_status_and_view_count", (q) =>
					q.eq("status", args.status)
				)
				.order(args.sortDirection)
				.paginate(paginationOpts);
		default:
			throw new ConvexError("Unsupported listing sort field");
	}
}

async function buildListingAvailability(
	ctx: { db: Pick<DatabaseReader, "query"> },
	mortgageId: Id<"mortgages"> | undefined
): Promise<ListingAvailability | null> {
	if (!mortgageId) {
		return null;
	}

	const accounts = await ctx.db
		.query("ledger_accounts")
		.withIndex("by_type_and_mortgage", (q) =>
			q.eq("type", "POSITION").eq("mortgageId", String(mortgageId))
		)
		.collect();

	const positions = accounts
		.map((account) => ({
			accountId: account._id,
			balance: getPostedBalance(account),
			lenderId: getAccountLenderId(account),
		}))
		.filter(
			(
				position
			): position is {
				accountId: Id<"ledger_accounts">;
				balance: bigint;
				lenderId: string;
			} => position.balance > 0n && position.lenderId !== undefined
		);

	const inferredMicPosition =
		positions.find((position) => isMicLenderId(position.lenderId)) ?? null;
	const availableFractions = inferredMicPosition
		? toSafeNumber(inferredMicPosition.balance, "availableFractions")
		: 0;
	const soldUnits = positions
		.filter((position) => position.lenderId !== inferredMicPosition?.lenderId)
		.reduce((total, position) => total + position.balance, 0n);
	const totalInvestors = positions.filter(
		(position) => position.lenderId !== inferredMicPosition?.lenderId
	).length;
	const totalFractions = toSafeNumber(TOTAL_SUPPLY, "totalFractions");

	return {
		availableFractions,
		micPosition: {
			balance: availableFractions,
			hasPosition: availableFractions > 0,
			inferred: inferredMicPosition !== null,
			lenderId: inferredMicPosition?.lenderId ?? null,
		},
		percentageSold: roundToTwoDecimals(
			(toSafeNumber(soldUnits, "soldUnits") / totalFractions) * 100
		),
		totalFractions,
		totalInvestors,
	};
}

async function attachAvailabilityToListings(
	ctx: Parameters<typeof buildListingAvailability>[0],
	listings: ListingDoc[]
) {
	const mortgageIds = [
		...new Set(
			listings
				.map((listing) => listing.mortgageId)
				.filter(
					(mortgageId): mortgageId is Id<"mortgages"> =>
						mortgageId !== undefined
				)
		),
	];

	const availabilityByMortgageId = new Map<
		Id<"mortgages">,
		ListingAvailability | null
	>();

	await Promise.all(
		mortgageIds.map(async (mortgageId) => {
			availabilityByMortgageId.set(
				mortgageId,
				await buildListingAvailability(ctx, mortgageId)
			);
		})
	);

	return listings.map((listing) => ({
		...listing,
		availability:
			listing.mortgageId === undefined
				? null
				: (availabilityByMortgageId.get(listing.mortgageId) ?? null),
	}));
}

export const getListingById = authedQuery
	.input({ listingId: v.id("listings") })
	.handler(async (ctx, args) => {
		return await getListingByIdOrNull(ctx, args.listingId);
	})
	.public();

export const getListingWithAvailability = authedQuery
	.input({ listingId: v.id("listings") })
	.handler(async (ctx, args) => {
		const listing = await getListingByIdOrNull(ctx, args.listingId);
		if (!listing) {
			return null;
		}

		return {
			availability: await buildListingAvailability(ctx, listing.mortgageId),
			listing,
		};
	})
	.public();

export const listPublishedListings = authedQuery
	.input({
		cursor: v.optional(v.union(v.string(), v.null())),
		filters: v.optional(
			v.object({
				city: v.optional(v.string()),
				interestRate: v.optional(
					v.object({
						max: v.optional(v.number()),
						min: v.optional(v.number()),
					})
				),
				lienPosition: v.optional(v.number()),
				ltv: v.optional(
					v.object({
						max: v.optional(v.number()),
						min: v.optional(v.number()),
					})
				),
				maturityDate: v.optional(
					v.object({
						end: v.optional(v.string()),
						start: v.optional(v.string()),
					})
				),
				principalAmount: v.optional(
					v.object({
						max: v.optional(v.number()),
						min: v.optional(v.number()),
					})
				),
				propertyType: v.optional(listingPropertyTypeValidator),
				province: v.optional(v.string()),
			})
		),
		numItems: v.optional(v.number()),
		sort: v.optional(
			v.object({
				direction: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
				field: v.union(
					v.literal("interestRate"),
					v.literal("ltv"),
					v.literal("principalAmount"),
					v.literal("publishedAt"),
					v.literal("viewCount")
				),
			})
		),
	})
	.handler(async (ctx, args) => {
		const sortField = args.sort?.field ?? "publishedAt";
		const sortDirection = args.sort?.direction ?? "desc";
		if (!hasPublishedFilters(args.filters)) {
			const paginated = await paginateListingsBySortField(ctx, {
				cursor: args.cursor,
				numItems: args.numItems,
				sortDirection,
				sortField,
				status: "published",
			});

			return {
				...paginated,
				page: await attachAvailabilityToListings(ctx, paginated.page),
			};
		}

		const candidates = await collectPublishedListingCandidates(
			ctx,
			args.filters
		);
		const filtered = candidates.filter((listing) =>
			listingMatchesPublishedFilters(listing, args.filters)
		);
		filtered.sort((left, right) =>
			compareListings(left, right, sortField, sortDirection)
		);

		const paginated = paginateResults(
			filtered,
			args.cursor ?? null,
			args.numItems
		);

		return {
			...paginated,
			page: await attachAvailabilityToListings(ctx, paginated.page),
		};
	})
	.public();

export const listListingsForAdmin = adminQuery
	.input({
		cursor: v.optional(v.union(v.string(), v.null())),
		numItems: v.optional(v.number()),
		sort: v.optional(
			v.object({
				direction: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
				field: v.union(
					v.literal("interestRate"),
					v.literal("ltv"),
					v.literal("principalAmount"),
					v.literal("publishedAt"),
					v.literal("viewCount")
				),
			})
		),
		status: v.optional(listingStatusValidator),
	})
	.handler(async (ctx, args) => {
		if (args.status === undefined) {
			throw new ConvexError(
				"status is required to list listings for admin without scanning the entire table"
			);
		}

		const sortField = args.sort?.field ?? "publishedAt";
		const sortDirection = args.sort?.direction ?? "desc";
		const paginated = await paginateListingsBySortField(ctx, {
			cursor: args.cursor,
			numItems: args.numItems,
			sortDirection,
			sortField,
			status: args.status,
		});

		return {
			...paginated,
			page: await attachAvailabilityToListings(ctx, paginated.page),
		};
	})
	.public();

export const getListingByMortgage = authedQuery
	.input({ mortgageId: v.id("mortgages") })
	.handler(async (ctx, args) => {
		return await ctx.db
			.query("listings")
			.withIndex("by_mortgage", (q) => q.eq("mortgageId", args.mortgageId))
			.unique();
	})
	.public();

export const getListingAppraisals = authedQuery
	.input({ propertyId: v.id("properties") })
	.handler(async (ctx, args) => {
		const appraisals = await ctx.db
			.query("appraisals")
			.withIndex("by_property", (q) => q.eq("propertyId", args.propertyId))
			.collect();

		const appraisalsWithComparables = await Promise.all(
			appraisals.map(async (appraisal) => {
				const comparables = await ctx.db
					.query("appraisalComparables")
					.withIndex("by_appraisal", (q) => q.eq("appraisalId", appraisal._id))
					.collect();

				comparables.sort((left, right) => left.sortOrder - right.sortOrder);

				return {
					...appraisal,
					comparables,
				};
			})
		);

		appraisalsWithComparables.sort((left, right) => {
			const byEffectiveDate = right.effectiveDate.localeCompare(
				left.effectiveDate
			);
			if (byEffectiveDate !== 0) {
				return byEffectiveDate;
			}

			return right.createdAt - left.createdAt;
		});

		return appraisalsWithComparables;
	})
	.public();

export const getListingEncumbrances = authedQuery
	.input({ propertyId: v.id("properties") })
	.handler(async (ctx, args) => {
		const encumbrances = await ctx.db
			.query("priorEncumbrances")
			.withIndex("by_property", (q) => q.eq("propertyId", args.propertyId))
			.collect();

		encumbrances.sort((left, right) => {
			if (left.priority !== right.priority) {
				return left.priority - right.priority;
			}

			return right.createdAt - left.createdAt;
		});

		return encumbrances;
	})
	.public();

export const getListingTransactionHistory = authedQuery
	.input({
		mortgageId: v.optional(v.id("mortgages")),
	})
	.handler(async (ctx, args) => {
		if (!args.mortgageId) {
			return [];
		}

		const entries = await ctx.db
			.query("ledger_journal_entries")
			.withIndex("by_mortgage_and_time", (q) =>
				q.eq("mortgageId", String(args.mortgageId))
			)
			.collect();

		const relevantEntries = entries.filter(isTransactionHistoryEntry);
		relevantEntries.sort((left, right) => {
			const timestampDelta = right.timestamp - left.timestamp;
			if (timestampDelta !== 0) {
				return timestampDelta;
			}

			return (
				amountToNumber(right.sequenceNumber, "sequenceNumber") -
				amountToNumber(left.sequenceNumber, "sequenceNumber")
			);
		});

		const accountIds = new Set<Id<"ledger_accounts">>();
		for (const entry of relevantEntries) {
			accountIds.add(entry.debitAccountId);
			accountIds.add(entry.creditAccountId);
		}

		const accountMap = new Map<Id<"ledger_accounts">, Doc<"ledger_accounts">>();
		await Promise.all(
			[...accountIds].map(async (accountId) => {
				const account = await ctx.db.get(accountId);
				if (account) {
					accountMap.set(accountId, account);
				}
			})
		);

		return relevantEntries.map((entry) => {
			const toAccount = accountMap.get(entry.debitAccountId);
			const fromAccount = accountMap.get(entry.creditAccountId);

			return {
				_id: entry._id,
				amount: amountToNumber(entry.amount, "journal entry amount"),
				effectiveDate: entry.effectiveDate,
				entryType: entry.entryType,
				eventType: getTransactionEventType(entry.entryType),
				fromAccountId: entry.creditAccountId,
				fromLenderId: fromAccount
					? (getAccountLenderId(fromAccount) ?? null)
					: null,
				reason: entry.reason ?? null,
				sequenceNumber: amountToNumber(entry.sequenceNumber, "sequenceNumber"),
				timestamp: entry.timestamp,
				toAccountId: entry.debitAccountId,
				toLenderId: toAccount ? (getAccountLenderId(toAccount) ?? null) : null,
			};
		});
	})
	.public();
