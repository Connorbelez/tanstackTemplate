import { addBusinessDays } from "../lib/businessDays";

export interface HoldPeriodConfig {
	/** Number of business days to hold before payout eligibility */
	holdBusinessDays: number;
}

/** Default hold periods by payment method (Tech Design §5.5) */
export const HOLD_PERIOD_BY_METHOD: Record<string, HoldPeriodConfig> = {
	manual: { holdBusinessDays: 0 },
	manual_review: { holdBusinessDays: 0 },
	mock_pad: { holdBusinessDays: 5 },
	rotessa_pad: { holdBusinessDays: 5 },
	stripe_ach: { holdBusinessDays: 7 },
};

/** Fallback for unknown methods — conservative 5 business days */
export const DEFAULT_HOLD_PERIOD: HoldPeriodConfig = { holdBusinessDays: 5 };

/**
 * Resolve the hold period for a payment method.
 * Falls back to DEFAULT_HOLD_PERIOD for unrecognized methods.
 */
export function getHoldPeriod(method: string): HoldPeriodConfig {
	return HOLD_PERIOD_BY_METHOD[method] ?? DEFAULT_HOLD_PERIOD;
}

/**
 * Calculate the earliest payout-eligible date for a dispersal entry.
 * @param dispersalDate YYYY-MM-DD when dispersal was created
 * @param method Payment method string (e.g. "rotessa_pad", "manual")
 * @returns YYYY-MM-DD of earliest eligible payout date
 */
export function calculatePayoutEligibleDate(
	dispersalDate: string,
	method: string
): string {
	const { holdBusinessDays } = getHoldPeriod(method);
	return addBusinessDays(dispersalDate, holdBusinessDays);
}
