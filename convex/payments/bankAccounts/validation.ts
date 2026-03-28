/**
 * Bank account pre-transfer validation — internal query + pure helpers.
 *
 * The `validateBankAccountForTransfer` internalQuery is called by
 * `initiateTransfer` (an action) via `ctx.runQuery()` to gate transfers
 * behind a valid bank account + mandate check (ENG-205).
 *
 * Pure helper functions are exported separately for unit testing.
 */

import { v } from "convex/values";
import { internalQuery } from "../../_generated/server";
import type { ProviderCode } from "../transfers/types";
import {
	counterpartyTypeValidator,
	providerCodeValidator,
} from "../transfers/validators";
import {
	type BankAccountValidationResult,
	isPadProvider,
	requiresBankAccountValidation,
} from "./types";

// Top-level regex constants (biome/useTopLevelRegex)
const INSTITUTION_RE = /^\d{3}$/;
const TRANSIT_RE = /^\d{5}$/;

// ── Pure Helpers (exported for unit testing) ────────────────────────

/** Pure format validation of institution and transit numbers. */
export function validateAccountFormat(
	institutionNumber: string | undefined,
	transitNumber: string | undefined
): BankAccountValidationResult {
	if (
		institutionNumber !== undefined &&
		!INSTITUTION_RE.test(institutionNumber)
	) {
		return {
			valid: false,
			errorCode: "INVALID_ACCOUNT_FORMAT",
			errorMessage: `Institution number must be exactly 3 digits, got "${institutionNumber}"`,
		};
	}
	if (transitNumber !== undefined && !TRANSIT_RE.test(transitNumber)) {
		return {
			valid: false,
			errorCode: "INVALID_ACCOUNT_FORMAT",
			errorMessage: `Transit number must be exactly 5 digits, got "${transitNumber}"`,
		};
	}
	return { valid: true };
}

/** Pure validation of a bank account record against a provider code. */
export function validateBankAccountRecord(
	bankAccount: {
		status: string;
		mandateStatus: string;
		institutionNumber?: string;
		transitNumber?: string;
	},
	providerCode: ProviderCode
): BankAccountValidationResult {
	// Step 4: status must be "validated"
	if (bankAccount.status !== "validated") {
		return {
			valid: false,
			errorCode: "BANK_ACCOUNT_NOT_VALIDATED",
			errorMessage: `Bank account status is "${bankAccount.status}", expected "validated"`,
		};
	}

	// Step 5: PAD providers require active mandate
	if (isPadProvider(providerCode) && bankAccount.mandateStatus !== "active") {
		return {
			valid: false,
			errorCode: "MANDATE_NOT_ACTIVE",
			errorMessage: `PAD mandate status is "${bankAccount.mandateStatus}", expected "active"`,
		};
	}

	// Step 6: format validation (institution / transit numbers)
	return validateAccountFormat(
		bankAccount.institutionNumber,
		bankAccount.transitNumber
	);
}

// ── Internal Query ──────────────────────────────────────────────────

/**
 * Validates that a counterparty has a bank account in good standing
 * for the given provider before a transfer is initiated.
 *
 * Called from `initiateTransfer` (action) via `ctx.runQuery()`.
 */
export const validateBankAccountForTransfer = internalQuery({
	args: {
		counterpartyType: counterpartyTypeValidator,
		counterpartyId: v.string(),
		providerCode: providerCodeValidator,
	},
	handler: async (ctx, args): Promise<BankAccountValidationResult> => {
		// Step 1: skip providers that don't need bank validation
		if (!requiresBankAccountValidation(args.providerCode)) {
			return { valid: true };
		}

		// Step 2-3: look up all bank accounts for this owner
		const bankAccounts = await ctx.db
			.query("bankAccounts")
			.withIndex("by_owner", (q) =>
				q
					.eq("ownerType", args.counterpartyType)
					.eq("ownerId", args.counterpartyId)
			)
			.collect();

		if (bankAccounts.length === 0) {
			return {
				valid: false,
				errorCode: "BANK_ACCOUNT_NOT_FOUND",
				errorMessage: `No bank account found for ${args.counterpartyType} "${args.counterpartyId}"`,
			};
		}

		// Steps 4-6: check if ANY account satisfies the provider requirements.
		// Phase 2+ will resolve the specific account via bankAccountRef.
		const results = bankAccounts.map((account) =>
			validateBankAccountRecord(account, args.providerCode)
		);
		return results.find((r) => r.valid) ?? results[0];
	},
});
