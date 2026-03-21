import type { Doc } from "../_generated/dataModel";

export type PaymentFrequency = Doc<"mortgages">["paymentFrequency"];

export const PERIODS_PER_YEAR: Record<PaymentFrequency, number> = {
	monthly: 12,
	bi_weekly: 26,
	accelerated_bi_weekly: 26,
	weekly: 52,
};

export function isPaymentFrequency(value: string): value is PaymentFrequency {
	return value in PERIODS_PER_YEAR;
}

export function getPeriodsPerYear(
	paymentFrequency: PaymentFrequency | string,
): number {
	if (!isPaymentFrequency(paymentFrequency)) {
		throw new Error(`Unknown payment frequency: ${paymentFrequency}`);
	}
	return PERIODS_PER_YEAR[paymentFrequency];
}
