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
	"SUSPENSE_ROUTED",
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
		credit: ["BORROWER_RECEIVABLE", "CASH_CLEARING", "UNAPPLIED_CASH"],
	},
	// ENG-223: Phase 2+ sweep (sweepCashClearingToTrust) will need TRUST_CASH
	// in debit and CASH_CLEARING in credit here. Current constraints only cover
	// the obligation-applied path. Update when async providers are integrated.
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
	SUSPENSE_ROUTED: {
		debit: ["SUSPENSE"],
		credit: ["CASH_CLEARING", "TRUST_CASH", "UNAPPLIED_CASH"],
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
	"CASH_CLEARING",
	"LENDER_PAYABLE",
	"SERVICING_REVENUE",
	"UNAPPLIED_CASH",
]);

// CONTROL and BORROWER_RECEIVABLE are allowed to go negative in balance checks
// for non-reversal entry types. Reversals/corrections/suspense-escalations are
// already excluded from balance checks (Tech Design §9.1 Step 5).
export const NEGATIVE_BALANCE_EXEMPT_FAMILIES: ReadonlySet<CashAccountFamily> =
	new Set(["CONTROL", "BORROWER_RECEIVABLE"]);

// ── Balance Pair Types ─────────────────────────────────────────────
// Shared shape for debit/credit balance pairs used across hashChain,
// postEntry, and nudge. SerializedBalancePair for Convex validator boundaries
// (BigInt cannot cross the Convex wire format).

export interface BalancePair {
	credit: bigint;
	debit: bigint;
}

export interface SerializedBalancePair {
	credit: string;
	debit: string;
}

// ── Idempotency Key Convention ──────────────────────────────────────
// All cash ledger journal entries use the prefix `cash-ledger:` followed
// by a kebab-case entry type and source identifiers:
//   cash-ledger:{entry-type}:{source-id}
//   cash-ledger:{entry-type}:{source-type}:{source-id}

export const IDEMPOTENCY_KEY_PREFIX = "cash-ledger:" as const;

/**
 * Build a standardised idempotency key for cash ledger entries.
 *
 * @param entryType  Kebab-case operation name (e.g. "obligation-accrued", "cash-received")
 * @param segments   One or more source identifiers (e.g. sourceType, sourceId)
 * @returns          `cash-ledger:{entryType}:{segments joined by ":"}`
 */
export function buildIdempotencyKey(
	entryType: string,
	...segments: string[]
): string {
	if (segments.length === 0) {
		throw new Error("buildIdempotencyKey requires at least one segment");
	}
	return `${IDEMPOTENCY_KEY_PREFIX}${entryType}:${segments.join(":")}`;
}
