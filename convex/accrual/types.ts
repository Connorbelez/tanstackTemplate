/**
 * Ledger identifiers are stored as plain string keys in the ownership ledger.
 * Keep these aliases explicit so accrual code does not leak Convex row IDs
 * into the public helper surface.
 */
export type LedgerLenderId = string;
export type LedgerMortgageId = string;

/**
 * Represents a lender's ownership stake in a mortgage for a date range.
 * Used by the accrual engine to calculate per-lender interest.
 */
export interface OwnershipPeriod {
	/** Ownership fraction, 0–1 (e.g. units / 10_000) */
	fraction: number;
	/** Inclusive start date, YYYY-MM-DD */
	fromDate: string;
	lenderId: LedgerLenderId;
	mortgageId: LedgerMortgageId;
	/** Inclusive end date, YYYY-MM-DD. null = still active */
	toDate: string | null;
}

/**
 * Result of computing accrued interest for a single lender on a single mortgage
 * over a query date range.
 */
export interface AccrualResult {
	accruedInterest: number;
	fromDate: string;
	lenderId: LedgerLenderId;
	mortgageId: LedgerMortgageId;
	periods: Array<{
		fraction: number;
		fromDate: string;
		/** Always resolved — query range is always closed */
		toDate: string;
	}>;
	toDate: string;
}

/**
 * A closed date range with inclusive start and end dates.
 */
export interface DateRange {
	/** YYYY-MM-DD */
	fromDate: string;
	/** YYYY-MM-DD */
	toDate: string;
}
