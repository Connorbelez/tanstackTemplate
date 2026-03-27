/**
 * Bank Account domain types — pure TypeScript, no Convex imports, no runtime deps.
 *
 * Canonical source of truth for bank account statuses, mandate statuses,
 * validation results, and provider-level helpers (ENG-205).
 */

import type { ProviderCode } from "../transfers/types";

// ── Bank Account Status ─────────────────────────────────────────────
export const BANK_ACCOUNT_STATUSES = [
	"pending_validation",
	"validated",
	"revoked",
	"rejected",
] as const;

export type BankAccountStatus = (typeof BANK_ACCOUNT_STATUSES)[number];

// ── Mandate Status ──────────────────────────────────────────────────
export const MANDATE_STATUSES = [
	"not_required",
	"pending",
	"active",
	"revoked",
] as const;

export type MandateStatus = (typeof MANDATE_STATUSES)[number];

// ── Validation Method ───────────────────────────────────────────────
export const VALIDATION_METHODS = [
	"manual",
	"micro_deposit",
	"provider_verified",
] as const;

export type ValidationMethod = (typeof VALIDATION_METHODS)[number];

// ── Pre-Transfer Validation Result ──────────────────────────────────
export type BankAccountValidationErrorCode =
	| "BANK_ACCOUNT_NOT_FOUND"
	| "BANK_ACCOUNT_NOT_VALIDATED"
	| "MANDATE_NOT_ACTIVE"
	| "INVALID_ACCOUNT_FORMAT";

export type BankAccountValidationResult =
	| { valid: true }
	| {
			valid: false;
			errorCode: BankAccountValidationErrorCode;
			errorMessage: string;
	  };

// ── Provider Helpers ────────────────────────────────────────────────

/**
 * Subset of providers that use Pre-Authorized Debit (PAD) and therefore
 * also require an active mandate before pulling funds.
 */
export const PAD_PROVIDERS: ReadonlySet<ProviderCode> = new Set<ProviderCode>([
	"pad_vopay",
	"pad_rotessa",
	"mock_pad",
]);

/** EFT-only providers that require bank validation but not mandate checks. */
const EFT_ONLY_PROVIDERS: ReadonlySet<ProviderCode> = new Set<ProviderCode>([
	"eft_vopay",
	"mock_eft",
]);

/**
 * Provider codes that require a validated bank account before a transfer
 * can be initiated. Derived from PAD + EFT providers to encode the
 * subset invariant: PAD_PROVIDERS ⊂ BANK_VALIDATION_REQUIRED_PROVIDERS.
 */
export const BANK_VALIDATION_REQUIRED_PROVIDERS: ReadonlySet<ProviderCode> =
	new Set<ProviderCode>([...PAD_PROVIDERS, ...EFT_ONLY_PROVIDERS]);

/**
 * Returns `true` when the given provider requires a validated bank
 * account before a transfer can proceed.
 */
export function requiresBankAccountValidation(
	providerCode: ProviderCode
): boolean {
	return BANK_VALIDATION_REQUIRED_PROVIDERS.has(providerCode);
}

/**
 * Returns `true` when the given provider is a PAD provider and
 * therefore also needs an active mandate check.
 */
export function isPadProvider(providerCode: ProviderCode): boolean {
	return PAD_PROVIDERS.has(providerCode);
}
