import type { Id } from "../_generated/dataModel";

// ── Calculation details (mirrors calculationDetailsValidator) ────
export interface CalculationDetails {
	distributableAmount: number;
	feeCashApplied?: number;
	feeCode?: "servicing" | "late_fee" | "nsf";
	feeDue?: number;
	feeReceivable?: number;
	mortgageFeeId?: Id<"mortgageFees">;
	ownershipFraction: number;
	ownershipUnits: number;
	policyVersion?: number;
	rawAmount: number;
	roundedAmount: number;
	servicingFee: number;
	settledAmount: number;
	sourceObligationType?: string;
	totalUnits: number;
}

// ── Dispersal entry (per-lender per-obligation) ─────────────────
export interface DispersalEntry {
	_id: Id<"dispersalEntries">;
	amount: number;
	calculationDetails: CalculationDetails;
	createdAt: number;
	dispersalDate: string;
	feeCode?: "servicing" | "late_fee" | "nsf";
	idempotencyKey: string;
	lenderAccountId: Id<"ledger_accounts">;
	lenderId: Id<"lenders">;
	mortgageFeeId?: Id<"mortgageFees">;
	mortgageId: Id<"mortgages">;
	obligationId: Id<"obligations">;
	paymentMethod?: string;
	payoutEligibleAfter?: string;
	// Compatibility field only. Canonical servicing fee totals live on
	// servicingFeeEntries and calculationDetails.servicingFee.
	servicingFeeDeducted: number;
	status: "pending" | "eligible" | "disbursed" | "failed";
}

// ── Servicing fee entry (FairLend revenue per payment) ──────────
export interface ServicingFeeEntry {
	_id: Id<"servicingFeeEntries">;
	amount: number;
	annualRate: number;
	createdAt: number;
	date: string;
	feeCashApplied?: number;
	feeCode?: "servicing" | "late_fee" | "nsf";
	feeDue?: number;
	feeReceivable?: number;
	mortgageFeeId?: Id<"mortgageFees">;
	mortgageId: Id<"mortgages">;
	obligationId: Id<"obligations">;
	policyVersion?: number;
	principalBalance: number;
	sourceObligationType?: string;
}
