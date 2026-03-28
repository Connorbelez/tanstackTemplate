/**
 * T-006: Cash ledger bridge mapping — all transfer types → correct entry type + debit/credit accounts
 * T-007: Idempotency key convention — transfer receipts, payouts, reversals follow format
 *
 * Pure unit tests validating the mapping from transfer types to cash ledger
 * entry types and account families, plus idempotency key format conventions.
 */

import { describe, expect, it } from "vitest";
import { inboundTransferCreditFamily } from "../../cashLedger/integrations";
import {
	buildIdempotencyKey,
	CASH_ENTRY_TYPE_FAMILY_MAP,
	type CashAccountFamily,
	type CashEntryType,
	IDEMPOTENCY_KEY_PREFIX,
} from "../../cashLedger/types";
import {
	ALL_TRANSFER_TYPES,
	INBOUND_TRANSFER_TYPES,
	type InboundTransferType,
	OUTBOUND_TRANSFER_TYPES,
	type OutboundTransferType,
	TRANSFER_TYPE_TO_OBLIGATION_TYPE,
	type TransferType,
} from "../types";

// ── T-006: Cash Ledger Bridge Mapping ────────────────────────────────────

interface CashLedgerMapping {
	creditFamily: CashAccountFamily;
	debitFamily: CashAccountFamily;
	entryType: CashEntryType;
}

/**
 * Derives the expected cash ledger mapping for a given transfer type and direction.
 */
function getCashLedgerMapping(
	transferType: TransferType,
	direction: "inbound" | "outbound"
): CashLedgerMapping {
	if (direction === "inbound") {
		const creditFamily = inboundTransferCreditFamily(transferType);
		return {
			entryType: "CASH_RECEIVED",
			debitFamily: "TRUST_CASH",
			creditFamily,
		};
	}
	// outbound
	return {
		entryType: "LENDER_PAYOUT_SENT",
		debitFamily: "LENDER_PAYABLE",
		creditFamily: "TRUST_CASH",
	};
}

describe("T-006: Cash ledger bridge mapping — transfer type → entry type + accounts", () => {
	describe("all 10 transfer types are accounted for", () => {
		it("covers all transfer types", () => {
			expect(ALL_TRANSFER_TYPES).toHaveLength(10);
			expect(INBOUND_TRANSFER_TYPES).toHaveLength(7);
			expect(OUTBOUND_TRANSFER_TYPES).toHaveLength(3);
		});
	});

	describe("inbound obligation-backed transfers → CASH_RECEIVED, debit TRUST_CASH, credit BORROWER_RECEIVABLE", () => {
		const obligationBackedTypes: InboundTransferType[] = [
			"borrower_interest_collection",
			"borrower_principal_collection",
			"borrower_late_fee_collection",
			"borrower_arrears_cure",
		];

		for (const transferType of obligationBackedTypes) {
			it(`${transferType} → CASH_RECEIVED (TRUST_CASH / BORROWER_RECEIVABLE)`, () => {
				// Verify this type IS obligation-backed
				expect(TRANSFER_TYPE_TO_OBLIGATION_TYPE[transferType]).not.toBeNull();

				const mapping = getCashLedgerMapping(transferType, "inbound");
				expect(mapping.entryType).toBe("CASH_RECEIVED");
				expect(mapping.debitFamily).toBe("TRUST_CASH");
				expect(mapping.creditFamily).toBe("BORROWER_RECEIVABLE");
			});
		}
	});

	describe("inbound non-obligation transfers (fees) → CASH_RECEIVED, debit TRUST_CASH, credit UNAPPLIED_CASH", () => {
		const feeTypes: InboundTransferType[] = [
			"locking_fee_collection",
			"commitment_deposit_collection",
		];

		for (const transferType of feeTypes) {
			it(`${transferType} → CASH_RECEIVED (TRUST_CASH / UNAPPLIED_CASH)`, () => {
				// Verify this type is NOT obligation-backed
				expect(TRANSFER_TYPE_TO_OBLIGATION_TYPE[transferType]).toBeNull();

				const mapping = getCashLedgerMapping(transferType, "inbound");
				expect(mapping.entryType).toBe("CASH_RECEIVED");
				expect(mapping.debitFamily).toBe("TRUST_CASH");
				expect(mapping.creditFamily).toBe("UNAPPLIED_CASH");
			});
		}
	});

	describe("inbound non-obligation transfers (deal) → CASH_RECEIVED, debit TRUST_CASH, credit CASH_CLEARING", () => {
		it("deal_principal_transfer → CASH_RECEIVED (TRUST_CASH / CASH_CLEARING)", () => {
			const transferType: InboundTransferType = "deal_principal_transfer";

			// Verify this type is NOT obligation-backed
			expect(TRANSFER_TYPE_TO_OBLIGATION_TYPE[transferType]).toBeNull();

			const mapping = getCashLedgerMapping(transferType, "inbound");
			expect(mapping.entryType).toBe("CASH_RECEIVED");
			expect(mapping.debitFamily).toBe("TRUST_CASH");
			expect(mapping.creditFamily).toBe("CASH_CLEARING");
		});
	});

	describe("outbound transfers → LENDER_PAYOUT_SENT, debit LENDER_PAYABLE, credit TRUST_CASH", () => {
		const outboundTypes: OutboundTransferType[] = [
			"lender_dispersal_payout",
			"lender_principal_return",
			"deal_seller_payout",
		];

		for (const transferType of outboundTypes) {
			it(`${transferType} → LENDER_PAYOUT_SENT (LENDER_PAYABLE / TRUST_CASH)`, () => {
				// Verify this type is NOT obligation-backed
				expect(TRANSFER_TYPE_TO_OBLIGATION_TYPE[transferType]).toBeNull();

				const mapping = getCashLedgerMapping(transferType, "outbound");
				expect(mapping.entryType).toBe("LENDER_PAYOUT_SENT");
				expect(mapping.debitFamily).toBe("LENDER_PAYABLE");
				expect(mapping.creditFamily).toBe("TRUST_CASH");
			});
		}
	});

	describe("CASH_ENTRY_TYPE_FAMILY_MAP constraint validation", () => {
		it("CASH_RECEIVED allows TRUST_CASH as debit", () => {
			const constraint = CASH_ENTRY_TYPE_FAMILY_MAP.CASH_RECEIVED;
			expect(constraint.debit).toContain("TRUST_CASH");
		});

		it("CASH_RECEIVED allows BORROWER_RECEIVABLE as credit", () => {
			const constraint = CASH_ENTRY_TYPE_FAMILY_MAP.CASH_RECEIVED;
			expect(constraint.credit).toContain("BORROWER_RECEIVABLE");
		});

		it("CASH_RECEIVED allows UNAPPLIED_CASH as credit", () => {
			const constraint = CASH_ENTRY_TYPE_FAMILY_MAP.CASH_RECEIVED;
			expect(constraint.credit).toContain("UNAPPLIED_CASH");
		});

		it("CASH_RECEIVED allows CASH_CLEARING as credit", () => {
			const constraint = CASH_ENTRY_TYPE_FAMILY_MAP.CASH_RECEIVED;
			expect(constraint.credit).toContain("CASH_CLEARING");
		});

		it("LENDER_PAYOUT_SENT allows LENDER_PAYABLE as debit", () => {
			const constraint = CASH_ENTRY_TYPE_FAMILY_MAP.LENDER_PAYOUT_SENT;
			expect(constraint.debit).toContain("LENDER_PAYABLE");
		});

		it("LENDER_PAYOUT_SENT allows TRUST_CASH as credit", () => {
			const constraint = CASH_ENTRY_TYPE_FAMILY_MAP.LENDER_PAYOUT_SENT;
			expect(constraint.credit).toContain("TRUST_CASH");
		});

		it("REVERSAL allows all families for both debit and credit", () => {
			const constraint = CASH_ENTRY_TYPE_FAMILY_MAP.REVERSAL;
			expect(constraint.debit).toContain("TRUST_CASH");
			expect(constraint.debit).toContain("BORROWER_RECEIVABLE");
			expect(constraint.debit).toContain("LENDER_PAYABLE");
			expect(constraint.credit).toContain("TRUST_CASH");
			expect(constraint.credit).toContain("BORROWER_RECEIVABLE");
			expect(constraint.credit).toContain("LENDER_PAYABLE");
		});
	});

	describe("every mapping respects the family constraint matrix", () => {
		for (const transferType of INBOUND_TRANSFER_TYPES) {
			it(`${transferType} (inbound) debit/credit families are in CASH_RECEIVED constraints`, () => {
				const mapping = getCashLedgerMapping(transferType, "inbound");
				const constraint = CASH_ENTRY_TYPE_FAMILY_MAP[mapping.entryType];
				expect(
					(constraint.debit as readonly string[]).includes(mapping.debitFamily)
				).toBe(true);
				expect(
					(constraint.credit as readonly string[]).includes(
						mapping.creditFamily
					)
				).toBe(true);
			});
		}

		for (const transferType of OUTBOUND_TRANSFER_TYPES) {
			it(`${transferType} (outbound) debit/credit families are in LENDER_PAYOUT_SENT constraints`, () => {
				const mapping = getCashLedgerMapping(transferType, "outbound");
				const constraint = CASH_ENTRY_TYPE_FAMILY_MAP[mapping.entryType];
				expect(
					(constraint.debit as readonly string[]).includes(mapping.debitFamily)
				).toBe(true);
				expect(
					(constraint.credit as readonly string[]).includes(
						mapping.creditFamily
					)
				).toBe(true);
			});
		}
	});

	describe("obligation-backed classification is correct", () => {
		it("exactly 4 transfer types are obligation-backed", () => {
			const obligationBacked = ALL_TRANSFER_TYPES.filter(
				(t) => TRANSFER_TYPE_TO_OBLIGATION_TYPE[t] !== null
			);
			expect(obligationBacked).toHaveLength(4);
		});

		it("obligation-backed types map to expected obligation types", () => {
			expect(
				TRANSFER_TYPE_TO_OBLIGATION_TYPE.borrower_interest_collection
			).toBe("regular_interest");
			expect(
				TRANSFER_TYPE_TO_OBLIGATION_TYPE.borrower_principal_collection
			).toBe("principal_repayment");
			expect(
				TRANSFER_TYPE_TO_OBLIGATION_TYPE.borrower_late_fee_collection
			).toBe("late_fee");
			expect(TRANSFER_TYPE_TO_OBLIGATION_TYPE.borrower_arrears_cure).toBe(
				"arrears_cure"
			);
		});

		it("non-obligation-backed types map to null", () => {
			const nonObligationTypes: TransferType[] = [
				"locking_fee_collection",
				"commitment_deposit_collection",
				"deal_principal_transfer",
				"lender_dispersal_payout",
				"lender_principal_return",
				"deal_seller_payout",
			];
			for (const t of nonObligationTypes) {
				expect(TRANSFER_TYPE_TO_OBLIGATION_TYPE[t]).toBeNull();
			}
		});
	});
});

// ── T-007: Idempotency Key Convention ────────────────────────────────────

describe("T-007: Idempotency key convention — transfer receipts, payouts, reversals", () => {
	const fakeTransferRequestId = "transfer-req-abc123";

	describe("buildIdempotencyKey basics", () => {
		it("prefix is 'cash-ledger:'", () => {
			expect(IDEMPOTENCY_KEY_PREFIX).toBe("cash-ledger:");
		});

		it("builds key with single segment", () => {
			const key = buildIdempotencyKey("cash-received", "some-id");
			expect(key).toBe("cash-ledger:cash-received:some-id");
		});

		it("builds key with multiple segments", () => {
			const key = buildIdempotencyKey("cash-received", "transfer", "some-id");
			expect(key).toBe("cash-ledger:cash-received:transfer:some-id");
		});

		it("throws when no segments are provided", () => {
			expect(() => buildIdempotencyKey("cash-received")).toThrow(
				"buildIdempotencyKey requires at least one segment"
			);
		});
	});

	describe("transfer cash receipt idempotency key", () => {
		it("follows format: cash-ledger:cash-received:transfer:{transferRequestId}", () => {
			const key = buildIdempotencyKey(
				"cash-received",
				"transfer",
				fakeTransferRequestId
			);
			expect(key).toBe(
				`cash-ledger:cash-received:transfer:${fakeTransferRequestId}`
			);
		});

		it("starts with the canonical prefix", () => {
			const key = buildIdempotencyKey(
				"cash-received",
				"transfer",
				fakeTransferRequestId
			);
			expect(key.startsWith(IDEMPOTENCY_KEY_PREFIX)).toBe(true);
		});
	});

	describe("transfer payout idempotency key", () => {
		it("follows format: cash-ledger:lender-payout-sent:transfer:{transferRequestId}", () => {
			const key = buildIdempotencyKey(
				"lender-payout-sent",
				"transfer",
				fakeTransferRequestId
			);
			expect(key).toBe(
				`cash-ledger:lender-payout-sent:transfer:${fakeTransferRequestId}`
			);
		});

		it("starts with the canonical prefix", () => {
			const key = buildIdempotencyKey(
				"lender-payout-sent",
				"transfer",
				fakeTransferRequestId
			);
			expect(key.startsWith(IDEMPOTENCY_KEY_PREFIX)).toBe(true);
		});
	});

	describe("transfer reversal idempotency key", () => {
		it("follows format: cash-ledger:reversal:transfer:{transferRequestId}", () => {
			const key = buildIdempotencyKey(
				"reversal",
				"transfer",
				fakeTransferRequestId
			);
			expect(key).toBe(
				`cash-ledger:reversal:transfer:${fakeTransferRequestId}`
			);
		});

		it("starts with the canonical prefix", () => {
			const key = buildIdempotencyKey(
				"reversal",
				"transfer",
				fakeTransferRequestId
			);
			expect(key.startsWith(IDEMPOTENCY_KEY_PREFIX)).toBe(true);
		});
	});

	describe("idempotency key uniqueness", () => {
		it("different transfer request IDs produce different keys", () => {
			const key1 = buildIdempotencyKey(
				"cash-received",
				"transfer",
				"transfer-001"
			);
			const key2 = buildIdempotencyKey(
				"cash-received",
				"transfer",
				"transfer-002"
			);
			expect(key1).not.toBe(key2);
		});

		it("different entry types for same transfer produce different keys", () => {
			const cashReceivedKey = buildIdempotencyKey(
				"cash-received",
				"transfer",
				fakeTransferRequestId
			);
			const payoutKey = buildIdempotencyKey(
				"lender-payout-sent",
				"transfer",
				fakeTransferRequestId
			);
			const reversalKey = buildIdempotencyKey(
				"reversal",
				"transfer",
				fakeTransferRequestId
			);
			expect(cashReceivedKey).not.toBe(payoutKey);
			expect(cashReceivedKey).not.toBe(reversalKey);
			expect(payoutKey).not.toBe(reversalKey);
		});
	});
});
