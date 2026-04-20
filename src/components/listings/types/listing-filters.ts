export type MortgageType = "First" | "Second" | "Other";

export type PropertyType = "Detached Home" | "Duplex" | "Condo" | "Commercial";

export interface FilterMetricItem {
	apr?: number;
	ltv?: number;
	principal?: number;
}

export interface FilterState {
	interestRateRange: [number, number];
	loanAmountMax: number;
	loanAmountMin: number;
	loanAmountRange: [number, number];
	ltvRange: [number, number];
	maturityDate?: Date;
	mortgageTypes: MortgageType[];
	propertyTypes: PropertyType[];
	searchQuery: string;
}

export const FILTER_BOUNDS = {
	ltvRange: [30, 80] as [number, number],
	interestRateRange: [3, 15] as [number, number],
	loanAmountRange: [0, 5_000_000] as [number, number],
	loanAmountMin: 0,
	loanAmountMax: 5_000_000,
} as const;

export const DEFAULT_FILTERS: FilterState = {
	ltvRange: FILTER_BOUNDS.ltvRange,
	interestRateRange: FILTER_BOUNDS.interestRateRange,
	loanAmountRange: FILTER_BOUNDS.loanAmountRange,
	loanAmountMin: FILTER_BOUNDS.loanAmountMin,
	loanAmountMax: FILTER_BOUNDS.loanAmountMax,
	mortgageTypes: [],
	propertyTypes: [],
	searchQuery: "",
	maturityDate: undefined,
};
