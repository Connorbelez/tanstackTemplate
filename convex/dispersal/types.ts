import type { Id } from "../_generated/dataModel";

// ── Calculation details (mirrors calculationDetailsValidator) ────
export type CalculationDetails = {
	settledAmount: number;
	servicingFee: number;
	distributableAmount: number;
	ownershipUnits: number;
	totalUnits: number;
	ownershipFraction: number;
	rawAmount: number;
	roundedAmount: number;
};

// ── Dispersal entry (per-lender per-obligation) ─────────────────
export type DispersalEntry = {
	_id: Id<"dispersalEntries">;
	mortgageId: Id<"mortgages">;
	lenderId: Id<"lenders">;
	lenderAccountId: Id<"ledger_accounts">;
	amount: number;
	dispersalDate: string;
	obligationId: Id<"obligations">;
	servicingFeeDeducted: number;
	status: "pending";
	idempotencyKey: string;
	calculationDetails: CalculationDetails;
	createdAt: number;
};

// ── Servicing fee entry (FairLend revenue per payment) ──────────
export type ServicingFeeEntry = {
	_id: Id<"servicingFeeEntries">;
	mortgageId: Id<"mortgages">;
	obligationId: Id<"obligations">;
	amount: number;
	annualRate: number;
	principalBalance: number;
	date: string;
	createdAt: number;
};
