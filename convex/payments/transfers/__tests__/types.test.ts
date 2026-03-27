/**
 * Transfer types tests — validates that the TRANSFER_TYPE_TO_OBLIGATION_TYPE
 * mapping is exhaustive over ALL_TRANSFER_TYPES and maps obligation-backed
 * transfers to the expected obligation-type literals.
 */

import { describe, expect, it } from "vitest";
import type { ObligationType, TransferType } from "../types";
import { ALL_TRANSFER_TYPES, TRANSFER_TYPE_TO_OBLIGATION_TYPE } from "../types";

// Known obligation type literals — derived from the mapping at the time of writing.
const KNOWN_OBLIGATION_TYPES: readonly string[] = [
	"regular_interest",
	"principal_repayment",
	"late_fee",
	"arrears_cure",
] as const;

describe("TRANSFER_TYPE_TO_OBLIGATION_TYPE", () => {
	it("has a key for every entry in ALL_TRANSFER_TYPES (exhaustiveness)", () => {
		const mappingKeys = Object.keys(TRANSFER_TYPE_TO_OBLIGATION_TYPE);
		for (const transferType of ALL_TRANSFER_TYPES) {
			expect(mappingKeys).toContain(transferType);
		}
	});

	it("has no extra keys beyond ALL_TRANSFER_TYPES", () => {
		const allTypes = new Set<string>(ALL_TRANSFER_TYPES);
		for (const key of Object.keys(TRANSFER_TYPE_TO_OBLIGATION_TYPE)) {
			expect(allTypes.has(key)).toBe(true);
		}
	});

	it("every non-null value is a known obligation type literal", () => {
		for (const [key, value] of Object.entries(
			TRANSFER_TYPE_TO_OBLIGATION_TYPE
		)) {
			if (value !== null) {
				expect(
					KNOWN_OBLIGATION_TYPES,
					`Unexpected obligation type "${value}" for transfer type "${key}"`
				).toContain(value);
			}
		}
	});

	it("obligation-backed transfer types map to expected obligation types (snapshot)", () => {
		const expected: Record<string, ObligationType> = {
			borrower_interest_collection: "regular_interest",
			borrower_principal_collection: "principal_repayment",
			borrower_late_fee_collection: "late_fee",
			borrower_arrears_cure: "arrears_cure",
		};

		for (const [transferType, obligationType] of Object.entries(expected)) {
			expect(
				TRANSFER_TYPE_TO_OBLIGATION_TYPE[transferType as TransferType]
			).toBe(obligationType);
		}
	});

	it("non-obligation-backed transfer types map to null", () => {
		const expectedNull: TransferType[] = [
			"locking_fee_collection",
			"commitment_deposit_collection",
			"deal_principal_transfer",
			"lender_dispersal_payout",
			"lender_principal_return",
			"deal_seller_payout",
		];

		for (const transferType of expectedNull) {
			expect(
				TRANSFER_TYPE_TO_OBLIGATION_TYPE[transferType],
				`Expected "${transferType}" to map to null`
			).toBeNull();
		}
	});
});
