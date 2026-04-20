import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../convex/_generated/api";
import type { MortgageType, PropertyType } from "./types/listing-filters";

export const MARKETPLACE_SORT_KEYS = [
	"featured",
	"publishedAt",
	"interestRate",
	"ltv",
	"principalAmount",
	"viewCount",
] as const;

export const MARKETPLACE_MORTGAGE_TYPES = [
	"First",
	"Second",
	"Other",
] as const satisfies readonly MortgageType[];

export const MARKETPLACE_PROPERTY_TYPES = [
	"Detached Home",
	"Duplex",
	"Condo",
	"Commercial",
] as const satisfies readonly PropertyType[];

export type MarketplaceSortKey = (typeof MARKETPLACE_SORT_KEYS)[number];

export interface MarketplaceListingsSearchState {
	ltvMax?: number;
	ltvMin?: number;
	maturityBefore?: string;
	mortgageTypes?: MortgageType[];
	principalMax?: number;
	principalMin?: number;
	propertyTypes?: PropertyType[];
	q?: string;
	rateMax?: number;
	rateMin?: number;
	sort?: MarketplaceSortKey;
}

export type MarketplaceListingsSnapshot = FunctionReturnType<
	typeof api.listings.marketplace.listMarketplaceListings
>;

export type MarketplaceListingsSnapshotItem =
	MarketplaceListingsSnapshot["page"][number];

export type MarketplaceListingDetailSnapshot = FunctionReturnType<
	typeof api.listings.marketplace.getMarketplaceListingDetail
>;

export interface MarketplaceListingCardItem {
	address: string;
	apr: number;
	availablePercent: number;
	id: string;
	imageSrc?: string;
	lat: number;
	lng: number;
	lockedPercent: number;
	ltv: number;
	maturityDate: Date;
	mortgageType: MortgageType;
	principal: number;
	propertyType: PropertyType;
	soldPercent: number;
	title: string;
}
