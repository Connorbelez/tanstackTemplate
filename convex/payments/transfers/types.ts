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

/**
 * Composite key for provider capability lookup.
 * Used by the Provider Capability Registry (ENG-215) to map
 * (transferType, direction) pairs to enabled providers.
 *
 * Only semantically valid combinations are allowed:
 * - inbound transfer types with 'inbound'
 * - outbound transfer types with 'outbound'
 *
 * Example: 'borrower_interest_collection:inbound'
 */
export type ProviderCapabilityKey =
	| `${InboundTransferType}:inbound`
	| `${OutboundTransferType}:outbound`;

export const ALL_TRANSFER_TYPES = [
	...INBOUND_TRANSFER_TYPES,
	...OUTBOUND_TRANSFER_TYPES,
] as const;

// ── Counterparty ─────────────────────────────────────────────────────
export type CounterpartyType = "borrower" | "lender" | "investor" | "trust";

/**
 * Branded ID aliases to document ID-space boundaries:
 * - DomainEntityId: FairLend domain/entity identifier
 * - AuthPrincipalId: WorkOS auth identifier
 */
export type DomainEntityId = string & { readonly __brand: "DomainEntityId" };
export type AuthPrincipalId = string & { readonly __brand: "AuthPrincipalId" };

/** Thrown when a WorkOS auth ID is used where a domain entity ID is required. */
export class InvalidDomainEntityIdError extends Error {
	readonly fieldName: string;
	readonly value: string;

	constructor(fieldName: string, value: string) {
		super(
			`${fieldName} contains a WorkOS auth ID (${value.slice(
				0,
				12
			)}...). Expected a domain entity ID.`
		);
		this.name = "InvalidDomainEntityIdError";
		this.fieldName = fieldName;
		this.value = value;
		Object.setPrototypeOf(this, new.target.prototype);
	}
}

const WORKOS_AUTH_ID_PATTERN =
	/^(?:user|org|om|session|token)_[A-Za-z0-9]{20,}$/;

export function isWorkosAuthPrincipalId(
	value: string
): value is AuthPrincipalId {
	return WORKOS_AUTH_ID_PATTERN.test(value);
}

export function assertDomainEntityId(
	value: string,
	fieldName: string
): asserts value is DomainEntityId {
	if (isWorkosAuthPrincipalId(value)) {
		throw new InvalidDomainEntityIdError(fieldName, value);
	}
}

/** Converts a string into a branded domain entity ID after validation. */
export function toDomainEntityId(
	value: string,
	fieldName: string
): DomainEntityId {
	assertDomainEntityId(value, fieldName);
	return value;
}

// ── Provider Codes ───────────────────────────────────────────────────
export const PROVIDER_CODES = [
	"manual",
	"manual_review",
	"mock_pad",
	"mock_eft",
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

/**
 * Persisted transfer status at the query boundary.
 *
 * Includes legacy persisted values while historical rows are still tolerated
 * by webhook and reversal handlers.
 */
export type LegacyTransferStatus = "approved" | "completed";
export type PersistedTransferStatus = TransferStatus | LegacyTransferStatus;

// ── Transfer Type → Obligation Type Mapping ─────────────────────────
/**
 * Maps each transfer type to its corresponding obligation type.
 * `null` means the transfer is not backed by an obligation
 * (e.g., locking fees, commitment deposits, disbursements).
 *
 * Preparatory constant for ENG-194 (transfer effect handlers).
 * Will be consumed by the transfer-confirmed effect to determine
 * which Cash Ledger posting function to call.
 */
/** Known obligation-type literal values for compile-time typo protection. */
const OBLIGATION_TYPE_VALUES = [
	"regular_interest",
	"principal_repayment",
	"late_fee",
	"arrears_cure",
] as const;

type ObligationTypeValue = (typeof OBLIGATION_TYPE_VALUES)[number];

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
} as const satisfies Record<TransferType, ObligationTypeValue | null>;

/** Obligation types that are backed by transfer types. */
export type ObligationType = NonNullable<
	(typeof TRANSFER_TYPE_TO_OBLIGATION_TYPE)[TransferType]
>;

/**
 * Reverse lookup used by the Phase M2a collection-attempt bridge.
 * Only obligation-backed inbound transfer types participate.
 */
export const OBLIGATION_TYPE_TO_TRANSFER_TYPE = {
	regular_interest: "borrower_interest_collection",
	principal_repayment: "borrower_principal_collection",
	late_fee: "borrower_late_fee_collection",
	arrears_cure: "borrower_arrears_cure",
} as const satisfies Record<ObligationType, InboundTransferType>;

export const DEFAULT_OBLIGATION_TRANSFER_TYPE: InboundTransferType =
	"borrower_interest_collection";

export function obligationTypeToTransferType(
	obligationType: string | undefined
): InboundTransferType {
	if (!obligationType) {
		return DEFAULT_OBLIGATION_TRANSFER_TYPE;
	}

	return (
		OBLIGATION_TYPE_TO_TRANSFER_TYPE[obligationType as ObligationType] ??
		DEFAULT_OBLIGATION_TRANSFER_TYPE
	);
}

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
