/**
 * Commitment deposit collection tests — pure domain logic validation.
 *
 * Covers inbound transfer taxonomy, obligation-type mapping, idempotency key
 * generation, config validation, provider-code defaults, and metadata shape.
 */

import { describe, expect, it } from "vitest";
import {
	buildCommitmentDepositIdempotencyKey,
	buildCommitmentDepositMetadata,
	getCommitmentDepositValidationError,
	resolveCommitmentDepositProviderCode,
} from "../depositCollection.logic";
import {
	INBOUND_TRANSFER_TYPES,
	isInboundTransferType,
	TRANSFER_TYPE_TO_OBLIGATION_TYPE,
} from "../types";

const COMMITMENT_DEPOSIT_KEY_RE = /^commitment-deposit:.+$/;

describe("commitment_deposit_collection transfer type taxonomy", () => {
	it("TRANSFER_TYPE_TO_OBLIGATION_TYPE maps commitment_deposit_collection to null", () => {
		expect(
			TRANSFER_TYPE_TO_OBLIGATION_TYPE.commitment_deposit_collection
		).toBeNull();
	});

	it("INBOUND_TRANSFER_TYPES includes commitment_deposit_collection", () => {
		expect(
			(INBOUND_TRANSFER_TYPES as readonly string[]).includes(
				"commitment_deposit_collection"
			)
		).toBe(true);
	});

	it("isInboundTransferType recognizes commitment_deposit_collection", () => {
		expect(isInboundTransferType("commitment_deposit_collection")).toBe(true);
	});

	it("has the same null obligation mapping as locking_fee_collection", () => {
		expect(TRANSFER_TYPE_TO_OBLIGATION_TYPE.commitment_deposit_collection).toBe(
			TRANSFER_TYPE_TO_OBLIGATION_TYPE.locking_fee_collection
		);
	});
});

describe("commitment deposit idempotency key format", () => {
	it("uses dealId-only shape", () => {
		const key = buildCommitmentDepositIdempotencyKey("deal_abc123", undefined);
		expect(key).toBe("commitment-deposit:deal_abc123");
		expect(key).toMatch(COMMITMENT_DEPOSIT_KEY_RE);
	});

	it("uses applicationId-only shape", () => {
		const key = buildCommitmentDepositIdempotencyKey(undefined, "app_xyz789");
		expect(key).toBe("commitment-deposit:app_xyz789");
		expect(key).toMatch(COMMITMENT_DEPOSIT_KEY_RE);
	});

	it("includes both deal and application when both are provided", () => {
		const key = buildCommitmentDepositIdempotencyKey(
			"deal_abc123",
			"app_xyz789"
		);
		expect(key).toBe("commitment-deposit:deal_abc123:application:app_xyz789");
		expect(key).toMatch(COMMITMENT_DEPOSIT_KEY_RE);
	});

	it("is deterministic for the same input", () => {
		const key1 = buildCommitmentDepositIdempotencyKey("deal_abc123", undefined);
		const key2 = buildCommitmentDepositIdempotencyKey("deal_abc123", undefined);
		expect(key1).toBe(key2);
	});

	it("produces different keys for different deal references", () => {
		const key1 = buildCommitmentDepositIdempotencyKey("deal_abc123", undefined);
		const key2 = buildCommitmentDepositIdempotencyKey("deal_def456", undefined);
		expect(key1).not.toBe(key2);
	});

	it("produces different keys for same deal with different applications", () => {
		const key1 = buildCommitmentDepositIdempotencyKey("deal_abc", "app_1");
		const key2 = buildCommitmentDepositIdempotencyKey("deal_abc", "app_2");
		expect(key1).not.toBe(key2);
	});

	it("throws when neither deal nor application is provided", () => {
		expect(() =>
			buildCommitmentDepositIdempotencyKey(undefined, undefined)
		).toThrow();
	});
});

describe("commitment deposit config validation", () => {
	it("requires at least one of dealId or applicationId", () => {
		const err = getCommitmentDepositValidationError({ amount: 10_000 });
		expect(err).toContain("dealId or applicationId");
	});

	it("accepts dealId alone", () => {
		expect(
			getCommitmentDepositValidationError({
				dealId: "deal_123",
				amount: 10_000,
			})
		).toBeNull();
	});

	it("accepts applicationId alone", () => {
		expect(
			getCommitmentDepositValidationError({
				applicationId: "app_456",
				amount: 10_000,
			})
		).toBeNull();
	});

	it("accepts both dealId and applicationId", () => {
		expect(
			getCommitmentDepositValidationError({
				dealId: "deal_123",
				applicationId: "app_456",
				amount: 10_000,
			})
		).toBeNull();
	});

	it("rejects zero amount", () => {
		const err = getCommitmentDepositValidationError({
			dealId: "deal_123",
			amount: 0,
		});
		expect(err).toContain("positive integer");
	});

	it("rejects negative amount", () => {
		expect(
			getCommitmentDepositValidationError({ dealId: "deal_123", amount: -500 })
		).not.toBeNull();
	});

	it("rejects float amount", () => {
		expect(
			getCommitmentDepositValidationError({ dealId: "deal_123", amount: 100.5 })
		).not.toBeNull();
	});

	it("accepts positive integer amount", () => {
		expect(
			getCommitmentDepositValidationError({
				dealId: "deal_123",
				amount: 250_000,
			})
		).toBeNull();
	});

	it("accepts 1 as the smallest valid amount", () => {
		expect(
			getCommitmentDepositValidationError({ dealId: "deal_123", amount: 1 })
		).toBeNull();
	});
});

describe("commitment deposit provider code default", () => {
	it('defaults undefined provider to "manual"', () => {
		expect(resolveCommitmentDepositProviderCode(undefined)).toBe("manual");
	});

	it("preserves an explicit provider code", () => {
		expect(resolveCommitmentDepositProviderCode("wire")).toBe("wire");
	});
});

describe("commitment deposit metadata shape", () => {
	it("includes applicationId when provided", () => {
		const metadata = buildCommitmentDepositMetadata("app_xyz789");
		expect(metadata).toEqual({ applicationId: "app_xyz789" });
	});

	it("returns undefined when applicationId is not provided", () => {
		expect(buildCommitmentDepositMetadata(undefined)).toBeUndefined();
	});
});

describe("commitment deposit cash ledger routing", () => {
	it("commitment_deposit_collection has no obligation type (like locking_fee_collection)", () => {
		expect(
			TRANSFER_TYPE_TO_OBLIGATION_TYPE.commitment_deposit_collection
		).toBeNull();
		expect(TRANSFER_TYPE_TO_OBLIGATION_TYPE.locking_fee_collection).toBeNull();
	});

	it("both are inbound transfer types", () => {
		const inboundTypes = INBOUND_TRANSFER_TYPES as readonly string[];
		expect(inboundTypes).toContain("commitment_deposit_collection");
		expect(inboundTypes).toContain("locking_fee_collection");
	});
});
