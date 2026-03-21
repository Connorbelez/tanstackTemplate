import type { Doc } from "../_generated/dataModel";

export type PaymentFrequency = Doc<"mortgages">["paymentFrequency"];

export const PERIODS_PER_YEAR: Record<PaymentFrequency, number> = {
	monthly: 12,
	bi_weekly: 26,
	accelerated_bi_weekly: 26,
	weekly: 52,
};

export function getPeriodsPerYear(paymentFrequency: string): number {
	const periodsPerYear = PERIODS_PER_YEAR[paymentFrequency as PaymentFrequency];
	if (!periodsPerYear) {
		throw new Error(`Unknown payment frequency: ${paymentFrequency}`);
	}
	return periodsPerYear;
}
