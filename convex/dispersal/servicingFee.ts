/**
 * FairLend servicing fee: deducted once per settled payment period before
 * lender distribution, based on the mortgage principal rather than the amount
 * collected in that period.
 *
 * @see SPEC 1.6 §4.2
 */
import type { PaymentFrequency } from "../mortgages/paymentFrequency";
import { getPeriodsPerYear } from "../mortgages/paymentFrequency";

export function calculateServicingFee(
	annualServicingRate: number,
	principalCents: number,
	paymentFrequency: PaymentFrequency
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

	return Math.round(
		(annualServicingRate * principalCents) / getPeriodsPerYear(paymentFrequency)
	);
}
