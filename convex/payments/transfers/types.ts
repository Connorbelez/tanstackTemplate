/**
 * Transfer domain types — pure TypeScript, no Convex imports, no runtime deps.
 *
 * Canonical source of truth for transfer directions, types, statuses,
 * counterparty kinds, and payment provider codes.
 */

// ── Direction ────────────────────────────────────────────────────────
export type TransferDirection = "inbound" | "outbound";

// ── Transfer Types ───────────────────────────────────────────────────
export const INBOUND_TRANSFER_TYPES = [
	"borrower_interest_collection",
	"borrower_principal_collection",
	"borrower_late_fee_collection",
	"borrower_arrears_cure",
	"locking_fee_collection",
	"commitment_deposit_collection",
	"deal_principal_transfer",
] as const;

export const OUTBOUND_TRANSFER_TYPES = [
	"lender_dispersal_payout",
	"lender_principal_return",
	"deal_seller_payout",
] as const;

export type InboundTransferType = (typeof INBOUND_TRANSFER_TYPES)[number];
export type OutboundTransferType = (typeof OUTBOUND_TRANSFER_TYPES)[number];
export type TransferType = InboundTransferType | OutboundTransferType;

export const ALL_TRANSFER_TYPES = [
	...INBOUND_TRANSFER_TYPES,
	...OUTBOUND_TRANSFER_TYPES,
] as const;

// ── Counterparty ─────────────────────────────────────────────────────
export type CounterpartyType = "borrower" | "lender" | "investor" | "trust";

// ── Provider Codes ───────────────────────────────────────────────────
export const PROVIDER_CODES = [
	"manual",
	"pad_vopay",
	"pad_rotessa",
	"eft_vopay",
	"e_transfer",
	"wire",
	"plaid_transfer",
] as const;

export type ProviderCode = (typeof PROVIDER_CODES)[number];

// ── Transfer Statuses ────────────────────────────────────────────────
export const TRANSFER_STATUSES = [
	"initiated",
	"pending",
	"processing",
	"confirmed",
	"failed",
	"cancelled",
	"reversed",
] as const;

export type TransferStatus = (typeof TRANSFER_STATUSES)[number];

/** Legacy statuses kept for backward compatibility with existing records. */
export const LEGACY_TRANSFER_STATUSES = ["approved", "completed"] as const;

export type LegacyTransferStatus = (typeof LEGACY_TRANSFER_STATUSES)[number];

/**
 * Union of current and legacy statuses — represents all values that may exist
 * in the database. Use this type for query return types / reads until the
 * ENG-190 migration has retired legacy rows.
 */
export type PersistedTransferStatus = TransferStatus | LegacyTransferStatus;

// ── Transfer Type → Obligation Type Mapping ─────────────────────────
/**
 * Maps each transfer type to its corresponding obligation type.
 * `null` means the transfer is not backed by an obligation
 * (e.g., locking fees, commitment deposits, disbursements).
 *
 * Used by the `publishTransferConfirmed` effect to determine
 * which Cash Ledger posting function to call.
 */
export const TRANSFER_TYPE_TO_OBLIGATION_TYPE = {
	// Inbound — obligation-backed
	borrower_interest_collection: "regular_interest",
	borrower_principal_collection: "principal_repayment",
	borrower_late_fee_collection: "late_fee",
	borrower_arrears_cure: "arrears_cure",
	// Inbound — not obligation-backed
	locking_fee_collection: null,
	commitment_deposit_collection: null,
	deal_principal_transfer: null,
	// Outbound — not obligation-backed
	lender_dispersal_payout: null,
	lender_principal_return: null,
	deal_seller_payout: null,
} as const satisfies Record<TransferType, string | null>;

/** Obligation types that are backed by transfer types. */
export type ObligationType = NonNullable<
	(typeof TRANSFER_TYPE_TO_OBLIGATION_TYPE)[TransferType]
>;

// ── Type Guards ──────────────────────────────────────────────────────
export function isInboundTransferType(
	value: string
): value is InboundTransferType {
	return (INBOUND_TRANSFER_TYPES as readonly string[]).includes(value);
}

export function isOutboundTransferType(
	value: string
): value is OutboundTransferType {
	return (OUTBOUND_TRANSFER_TYPES as readonly string[]).includes(value);
}
