/**
 * FairLend servicing fee: deducted once per settled payment period before
 * lender distribution, based on the mortgage principal rather than the amount
 * collected in that period.
 *
 * The fee is calculated pre-disbursement during `createDispersalEntries` and
 * only applies to `regular_interest` obligation settlements. The principal
 * basis is the current outstanding balance (`mortgage.principal`) at settlement
 * time, so fees decrease proportionally as the borrower repays principal —
 * standard amortizing mortgage servicing behavior.
 *
 * @see SPEC 1.6 §4.2
 * @see ENG-217 — confirms current outstanding principal as fee basis
 */
import type { PaymentFrequency } from "../mortgages/paymentFrequency";
import { getPeriodsPerYear } from "../mortgages/paymentFrequency";

/**
 * Compute the per-period servicing fee owed to FairLend for a single
 * settlement period.
 *
 * @param annualServicingRate - Annual rate (e.g., 0.01 for 1%).
 * @param principalCents - Current outstanding principal in cents at time of
 *   settlement. This is the CURRENT principal balance (`mortgage.principal`),
 *   not the original loan amount. As principal is repaid, the servicing fee
 *   decreases proportionally.
 *   Decision: ENG-217 — chose current outstanding principal per standard
 *   mortgage servicing practice.
 * @param paymentFrequency - Payment frequency determines periods per year
 *   (e.g., monthly = 12, bi-weekly = 26).
 * @returns Per-period servicing fee in integer cents (rounded).
 */
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
