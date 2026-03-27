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
