export const DEFAULT_PAYOUT_FREQUENCY = "monthly" as const;
export const MINIMUM_PAYOUT_CENTS = 100; // $1.00 minimum to prevent micro-payouts

export type PayoutFrequency = "monthly" | "bi_weekly" | "weekly" | "on_demand";

export function isPayoutDue(
	frequency: PayoutFrequency,
	lastPayoutDate: string | undefined,
	today: string
): boolean {
	if (frequency === "on_demand") {
		return false;
	}
	if (!lastPayoutDate) {
		return true;
	}

	const last = new Date(lastPayoutDate);
	const now = new Date(today);
	const daysSinceLastPayout = Math.floor(
		(now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24)
	);

	switch (frequency) {
		case "weekly":
			return daysSinceLastPayout >= 7;
		case "bi_weekly":
			return daysSinceLastPayout >= 14;
		case "monthly":
			return daysSinceLastPayout >= 28;
		default:
			return false;
	}
}
