import type { Id } from "../_generated/dataModel";

export const MAX_HEALING_ATTEMPTS = 3;

export interface HealingCandidate {
	amount: number;
	mortgageId: Id<"mortgages">;
	obligationId: Id<"obligations">;
	settledAt: number | undefined;
}

export interface HealingResult {
	candidatesFound: number;
	checkedAt: number;
	escalated: number;
	retriggered: number;
}
