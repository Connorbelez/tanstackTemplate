export const CASH_ACCOUNT_FAMILIES = [
	"BORROWER_RECEIVABLE",
	"CASH_CLEARING",
	"TRUST_CASH",
	"UNAPPLIED_CASH",
	"LENDER_PAYABLE",
	"SERVICING_REVENUE",
	"WRITE_OFF",
	"SUSPENSE",
	"CONTROL",
] as const;

export type CashAccountFamily = (typeof CASH_ACCOUNT_FAMILIES)[number];

export const CASH_ENTRY_TYPES = [
	"OBLIGATION_ACCRUED",
	"CASH_RECEIVED",
	"CASH_APPLIED",
	"LENDER_PAYABLE_CREATED",
	"SERVICING_FEE_RECOGNIZED",
	"LENDER_PAYOUT_SENT",
	"OBLIGATION_WAIVED",
	"OBLIGATION_WRITTEN_OFF",
	"REVERSAL",
	"CORRECTION",
	"SUSPENSE_ESCALATED",
] as const;

export type CashEntryType = (typeof CASH_ENTRY_TYPES)[number];

export const CONTROL_SUBACCOUNTS = [
	"ACCRUAL",
	"ALLOCATION",
	"SETTLEMENT",
	"WAIVER",
] as const;

export type ControlSubaccount = (typeof CONTROL_SUBACCOUNTS)[number];

interface FamilyConstraint {
	credit: readonly CashAccountFamily[];
	debit: readonly CashAccountFamily[];
}

const ALL_FAMILIES: readonly CashAccountFamily[] = CASH_ACCOUNT_FAMILIES;

export const CASH_ENTRY_TYPE_FAMILY_MAP: Record<
	CashEntryType,
	FamilyConstraint
> = {
	OBLIGATION_ACCRUED: {
		debit: ["BORROWER_RECEIVABLE"],
		credit: ["CONTROL"],
	},
	CASH_RECEIVED: {
		debit: ["TRUST_CASH", "CASH_CLEARING", "UNAPPLIED_CASH"],
		credit: ["BORROWER_RECEIVABLE", "UNAPPLIED_CASH"],
	},
	CASH_APPLIED: {
		debit: ["CONTROL", "UNAPPLIED_CASH"],
		credit: ["CONTROL", "BORROWER_RECEIVABLE"],
	},
	LENDER_PAYABLE_CREATED: {
		debit: ["CONTROL"],
		credit: ["LENDER_PAYABLE"],
	},
	SERVICING_FEE_RECOGNIZED: {
		debit: ["CONTROL"],
		credit: ["SERVICING_REVENUE"],
	},
	LENDER_PAYOUT_SENT: {
		debit: ["LENDER_PAYABLE"],
		credit: ["TRUST_CASH"],
	},
	OBLIGATION_WAIVED: {
		debit: ["CONTROL"],
		credit: ["BORROWER_RECEIVABLE"],
	},
	OBLIGATION_WRITTEN_OFF: {
		debit: ["WRITE_OFF"],
		credit: ["BORROWER_RECEIVABLE"],
	},
	REVERSAL: {
		debit: ALL_FAMILIES,
		credit: ALL_FAMILIES,
	},
	CORRECTION: {
		debit: ALL_FAMILIES,
		credit: ALL_FAMILIES,
	},
	SUSPENSE_ESCALATED: {
		debit: ["SUSPENSE"],
		credit: ["BORROWER_RECEIVABLE"],
	},
};

// ── Transient subaccounts (track intermediate accounting states) ─
// These subaccounts represent in-flight obligations that should eventually
// resolve. Use getControlBalancesByPostingGroup to monitor their balances
// within a posting group. Non-zero balances indicate pending work, not errors.
// WAIVER is NOT transient — it's monotonically increasing (cumulative waivers).
export const TRANSIENT_SUBACCOUNTS: ReadonlySet<ControlSubaccount> = new Set([
	"ACCRUAL",
	"ALLOCATION",
	"SETTLEMENT",
]);

// ── Entry-Type → CONTROL Subaccount Mapping ──
// Maps entry types to the CONTROL subaccount they use (if any).
// Centralizes what was previously hardcoded in each integration function.
export const ENTRY_TYPE_CONTROL_SUBACCOUNT: Partial<
	Record<CashEntryType, ControlSubaccount>
> = {
	OBLIGATION_ACCRUED: "ACCRUAL",
	CASH_APPLIED: "SETTLEMENT",
	LENDER_PAYABLE_CREATED: "ALLOCATION",
	SERVICING_FEE_RECOGNIZED: "ALLOCATION",
	OBLIGATION_WAIVED: "WAIVER",
};

export const CREDIT_NORMAL_FAMILIES: ReadonlySet<CashAccountFamily> = new Set([
	"LENDER_PAYABLE",
	"SERVICING_REVENUE",
]);

// CONTROL and BORROWER_RECEIVABLE are allowed to go negative in balance checks
// for non-reversal entry types. Reversals/corrections/suspense-escalations are
// already excluded from balance checks (Tech Design §9.1 Step 5).
export const NEGATIVE_BALANCE_EXEMPT_FAMILIES: ReadonlySet<CashAccountFamily> =
	new Set(["CONTROL", "BORROWER_RECEIVABLE"]);
