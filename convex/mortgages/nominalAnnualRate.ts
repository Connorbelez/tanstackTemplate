/**
 * Normalizes `mortgages.interestRate` to a **nominal annual decimal** (e.g. 0.0725 = 7.25%/yr).
 *
 * Canonical admin + marketplace inputs use **percentage points** (7.25 means 7.25%/year).
 * Some legacy seeds and payment harnesses stored the same nominal rate as a **decimal**
 * (0.0725 or 0.08).
 */
export function mortgageNominalAnnualRateToDecimal(
	interestRate: number
): number {
	if (!Number.isFinite(interestRate) || interestRate <= 0) {
		return interestRate;
	}

	// Treat small positive values as already-decimal annual rates (typical <= 0.35 ≈ 35%/yr).
	if (interestRate < 1) {
		return interestRate;
	}

	return interestRate / 100;
}
