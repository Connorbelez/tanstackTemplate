import { describe, expect, it } from "vitest";
import type { ProviderCode } from "../../transfers/types";
import { isPadProvider, requiresBankAccountValidation } from "../types";
import {
	validateAccountFormat,
	validateBankAccountRecord,
} from "../validation";

// ── T-010: Provider helper tests ─────────────────────────────────────

describe("requiresBankAccountValidation", () => {
	it.each([
		"pad_vopay",
		"pad_rotessa",
		"eft_vopay",
		"mock_pad",
		"mock_eft",
	] as const)("returns true for %s", (provider) => {
		expect(requiresBankAccountValidation(provider)).toBe(true);
	});

	it.each([
		"manual",
		"e_transfer",
		"wire",
		"plaid_transfer",
	] as const)("returns false for %s", (provider) => {
		expect(requiresBankAccountValidation(provider)).toBe(false);
	});
});

describe("isPadProvider", () => {
	it.each([
		"pad_vopay",
		"pad_rotessa",
		"mock_pad",
	] as const)("returns true for %s", (provider) => {
		expect(isPadProvider(provider)).toBe(true);
	});

	it.each([
		"eft_vopay",
		"mock_eft",
		"manual",
		"e_transfer",
		"wire",
		"plaid_transfer",
	] as const)("returns false for %s", (provider) => {
		expect(isPadProvider(provider)).toBe(false);
	});
});

// ── T-009: Validation logic tests ────────────────────────────────────

describe("validateBankAccountRecord", () => {
	const padProvider: ProviderCode = "pad_vopay";
	const eftProvider: ProviderCode = "eft_vopay";

	it("returns valid when status is 'validated' and mandate is 'active' for PAD provider", () => {
		const result = validateBankAccountRecord(
			{ status: "validated", mandateStatus: "active" },
			padProvider
		);
		expect(result).toEqual({ valid: true });
	});

	it("returns BANK_ACCOUNT_NOT_VALIDATED when status is 'pending_validation'", () => {
		const result = validateBankAccountRecord(
			{ status: "pending_validation", mandateStatus: "active" },
			padProvider
		);
		expect(result.valid).toBe(false);
		expect(result.errorCode).toBe("BANK_ACCOUNT_NOT_VALIDATED");
	});

	it("returns BANK_ACCOUNT_NOT_VALIDATED when status is 'revoked'", () => {
		const result = validateBankAccountRecord(
			{ status: "revoked", mandateStatus: "active" },
			padProvider
		);
		expect(result.valid).toBe(false);
		expect(result.errorCode).toBe("BANK_ACCOUNT_NOT_VALIDATED");
	});

	it("returns BANK_ACCOUNT_NOT_VALIDATED when status is 'rejected'", () => {
		const result = validateBankAccountRecord(
			{ status: "rejected", mandateStatus: "active" },
			padProvider
		);
		expect(result.valid).toBe(false);
		expect(result.errorCode).toBe("BANK_ACCOUNT_NOT_VALIDATED");
	});

	it("returns MANDATE_NOT_ACTIVE when PAD provider and mandate is 'revoked'", () => {
		const result = validateBankAccountRecord(
			{ status: "validated", mandateStatus: "revoked" },
			padProvider
		);
		expect(result.valid).toBe(false);
		expect(result.errorCode).toBe("MANDATE_NOT_ACTIVE");
	});

	it("returns MANDATE_NOT_ACTIVE when PAD provider and mandate is 'pending'", () => {
		const result = validateBankAccountRecord(
			{ status: "validated", mandateStatus: "pending" },
			padProvider
		);
		expect(result.valid).toBe(false);
		expect(result.errorCode).toBe("MANDATE_NOT_ACTIVE");
	});

	it("returns MANDATE_NOT_ACTIVE when PAD provider and mandate is 'not_required'", () => {
		const result = validateBankAccountRecord(
			{ status: "validated", mandateStatus: "not_required" },
			padProvider
		);
		expect(result.valid).toBe(false);
		expect(result.errorCode).toBe("MANDATE_NOT_ACTIVE");
	});

	it("passes for EFT provider even with non-active mandate", () => {
		const result = validateBankAccountRecord(
			{ status: "validated", mandateStatus: "revoked" },
			eftProvider
		);
		expect(result).toEqual({ valid: true });
	});

	it("returns INVALID_ACCOUNT_FORMAT for bad institution number", () => {
		for (const bad of ["12", "1234", "abc"]) {
			const result = validateBankAccountRecord(
				{
					status: "validated",
					mandateStatus: "active",
					institutionNumber: bad,
				},
				padProvider
			);
			expect(result.valid).toBe(false);
			expect(result.errorCode).toBe("INVALID_ACCOUNT_FORMAT");
		}
	});

	it("returns INVALID_ACCOUNT_FORMAT for bad transit number", () => {
		for (const bad of ["1234", "123456", "abcde"]) {
			const result = validateBankAccountRecord(
				{
					status: "validated",
					mandateStatus: "active",
					institutionNumber: "123",
					transitNumber: bad,
				},
				padProvider
			);
			expect(result.valid).toBe(false);
			expect(result.errorCode).toBe("INVALID_ACCOUNT_FORMAT");
		}
	});

	it("passes when institution and transit are undefined", () => {
		const result = validateBankAccountRecord(
			{ status: "validated", mandateStatus: "active" },
			padProvider
		);
		expect(result).toEqual({ valid: true });
	});

	it("passes when institution is '123' and transit is '12345'", () => {
		const result = validateBankAccountRecord(
			{
				status: "validated",
				mandateStatus: "active",
				institutionNumber: "123",
				transitNumber: "12345",
			},
			padProvider
		);
		expect(result).toEqual({ valid: true });
	});
});

describe("validateAccountFormat", () => {
	it("returns valid when both undefined", () => {
		expect(validateAccountFormat(undefined, undefined)).toEqual({
			valid: true,
		});
	});

	it("returns valid when both are valid ('123', '12345')", () => {
		expect(validateAccountFormat("123", "12345")).toEqual({ valid: true });
	});

	it("returns INVALID_ACCOUNT_FORMAT for institution '12' (too short)", () => {
		const result = validateAccountFormat("12", "12345");
		expect(result.valid).toBe(false);
		expect(result.errorCode).toBe("INVALID_ACCOUNT_FORMAT");
	});

	it("returns INVALID_ACCOUNT_FORMAT for institution '1234' (too long)", () => {
		const result = validateAccountFormat("1234", "12345");
		expect(result.valid).toBe(false);
		expect(result.errorCode).toBe("INVALID_ACCOUNT_FORMAT");
	});

	it("returns INVALID_ACCOUNT_FORMAT for institution 'abc' (non-digits)", () => {
		const result = validateAccountFormat("abc", "12345");
		expect(result.valid).toBe(false);
		expect(result.errorCode).toBe("INVALID_ACCOUNT_FORMAT");
	});

	it("returns INVALID_ACCOUNT_FORMAT for transit '1234' (too short)", () => {
		const result = validateAccountFormat("123", "1234");
		expect(result.valid).toBe(false);
		expect(result.errorCode).toBe("INVALID_ACCOUNT_FORMAT");
	});

	it("returns INVALID_ACCOUNT_FORMAT for transit '123456' (too long)", () => {
		const result = validateAccountFormat("123", "123456");
		expect(result.valid).toBe(false);
		expect(result.errorCode).toBe("INVALID_ACCOUNT_FORMAT");
	});

	it("checks institution first when both are invalid (error mentions institution)", () => {
		const result = validateAccountFormat("xx", "yyyyyy");
		expect(result.valid).toBe(false);
		expect(result.errorCode).toBe("INVALID_ACCOUNT_FORMAT");
		expect(result.errorMessage).toContain("Institution");
	});
});
