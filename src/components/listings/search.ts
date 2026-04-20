import {
	MARKETPLACE_MORTGAGE_TYPES,
	MARKETPLACE_PROPERTY_TYPES,
	MARKETPLACE_SORT_KEYS,
	type MarketplaceListingsSearchState,
} from "./marketplace-types";

function parseCsvEnum<T extends string>(
	value: unknown,
	allowed: readonly T[]
): T[] | undefined {
	const allowedSet = new Set(allowed);
	let values: string[] = [];
	if (typeof value === "string") {
		values = value
			.split(",")
			.map((entry) => entry.trim())
			.filter((entry) => entry.length > 0);
	} else if (Array.isArray(value)) {
		values = value.filter(
			(entry): entry is string => typeof entry === "string"
		);
	}

	const parsed = values.filter((entry): entry is T =>
		allowedSet.has(entry as T)
	);
	return parsed.length > 0 ? parsed : undefined;
}

function parseNumber(value: unknown) {
	if (typeof value !== "string" && typeof value !== "number") {
		return undefined;
	}

	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : undefined;
}

function parseSort(value: unknown): MarketplaceListingsSearchState["sort"] {
	return MARKETPLACE_SORT_KEYS.includes(
		value as (typeof MARKETPLACE_SORT_KEYS)[number]
	)
		? (value as MarketplaceListingsSearchState["sort"])
		: "featured";
}

export function parseMarketplaceListingsSearch(
	search: Record<string, unknown>
): MarketplaceListingsSearchState {
	return {
		maturityBefore:
			typeof search.maturityBefore === "string" &&
			search.maturityBefore.trim().length > 0
				? search.maturityBefore.trim()
				: undefined,
		mortgageTypes: parseCsvEnum(
			search.mortgageTypes,
			MARKETPLACE_MORTGAGE_TYPES
		),
		principalMax: parseNumber(search.principalMax),
		principalMin: parseNumber(search.principalMin),
		propertyTypes: parseCsvEnum(
			search.propertyTypes,
			MARKETPLACE_PROPERTY_TYPES
		),
		q:
			typeof search.q === "string" && search.q.trim().length > 0
				? search.q.trim()
				: undefined,
		rateMax: parseNumber(search.rateMax),
		rateMin: parseNumber(search.rateMin),
		sort: parseSort(search.sort),
		ltvMax: parseNumber(search.ltvMax),
		ltvMin: parseNumber(search.ltvMin),
	};
}

export function cleanMarketplaceListingsSearch(
	search: MarketplaceListingsSearchState
): Partial<MarketplaceListingsSearchState> {
	return Object.fromEntries(
		Object.entries(search).filter(([, value]) => {
			if (value === undefined || value === null) {
				return false;
			}
			if (typeof value === "string") {
				return value.trim().length > 0;
			}
			if (Array.isArray(value)) {
				return value.length > 0;
			}
			return true;
		})
	) as Partial<MarketplaceListingsSearchState>;
}
