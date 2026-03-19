/**
 * FairLend servicing fee: deducted monthly before lender distribution.
 * Formula: Math.round((annualServicingRate × principalCents) / 12)
 * Fixed monthly amount based on principal, NOT a % of collected payment.
 *
 * @see SPEC 1.6 §4.2
 */
export function calculateServicingFee(
	annualServicingRate: number,
	principalCents: number
): number {
	if (!Number.isFinite(annualServicingRate) || annualServicingRate < 0) {
		throw new Error(
			`calculateServicingFee: annualServicingRate must be a non-negative finite number, got ${annualServicingRate}`
		);
	}
	if (!Number.isSafeInteger(principalCents) || principalCents < 0) {
		throw new Error(
			`calculateServicingFee: principalCents must be a non-negative integer cent value, got ${principalCents}`
		);
	}

	return Math.round((annualServicingRate * principalCents) / 12);
}
