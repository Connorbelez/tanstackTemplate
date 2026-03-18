/**
 * FairLend servicing fee: deducted monthly before lender distribution.
 * Formula: (annualServicingRate × principalBalance) / 12
 * Fixed monthly amount based on principal, NOT a % of collected payment.
 *
 * @see SPEC 1.6 §4.2
 */
export function calculateServicingFee(
	annualServicingRate: number,
	principalBalance: number
): number {
	return (
		Math.round(((annualServicingRate * principalBalance) / 12) * 100) / 100
	);
}
