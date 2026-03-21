import type { Id } from "../_generated/dataModel";

// ── Calculation details (mirrors calculationDetailsValidator) ────
export interface CalculationDetails {
	distributableAmount: number;
	ownershipFraction: number;
	ownershipUnits: number;
	rawAmount: number;
	roundedAmount: number;
	servicingFee: number;
	settledAmount: number;
	totalUnits: number;
}

// ── Dispersal entry (per-lender per-obligation) ─────────────────
export interface DispersalEntry {
	_id: Id<"dispersalEntries">;
	amount: number;
	calculationDetails: CalculationDetails;
	createdAt: number;
	dispersalDate: string;
	idempotencyKey: string;
	lenderAccountId: Id<"ledger_accounts">;
	lenderId: Id<"lenders">;
	mortgageId: Id<"mortgages">;
	obligationId: Id<"obligations">;
	// Compatibility field only. Canonical servicing fee totals live on
	// servicingFeeEntries and calculationDetails.servicingFee.
	servicingFeeDeducted: number;
	status: "pending";
}

// ── Servicing fee entry (FairLend revenue per payment) ──────────
export interface ServicingFeeEntry {
	_id: Id<"servicingFeeEntries">;
	amount: number;
	annualRate: number;
	createdAt: number;
	date: string;
	mortgageId: Id<"mortgages">;
	obligationId: Id<"obligations">;
	principalBalance: number;
}
