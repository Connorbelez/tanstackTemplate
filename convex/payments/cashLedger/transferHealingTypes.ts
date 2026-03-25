import type { Id } from "../../_generated/dataModel";

export const MAX_TRANSFER_HEALING_ATTEMPTS = 3;

export interface TransferHealingCandidate {
	amount: number;
	confirmedAt: number;
	direction: "inbound" | "outbound";
	lenderId?: Id<"lenders">;
	mortgageId?: Id<"mortgages">;
	obligationId?: Id<"obligations">;
	transferRequestId: Id<"transferRequests">;
}

export interface TransferHealingResult {
	candidatesFound: number;
	checkedAt: number;
	escalated: number;
	retriggered: number;
	skipped: number;
}
