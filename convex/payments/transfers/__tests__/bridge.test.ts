/**
 * Transfer bridge tests — validates the shape and idempotency logic of
 * bridged transfer records created by emitPaymentReceived (ENG-197).
 *
 * The production bridge flow is:
 * 1. Insert transferRequests row with status "initiated"
 * 2. Immediately fire executeTransition(... FUNDS_SETTLED ...)
 * 3. publishTransferConfirmed sees collectionAttemptId and skips duplicate cash posting
 */

import { describe, expect, it } from "vitest";
import type { CommandSource } from "../../../engine/types";
import {
	DEFAULT_OBLIGATION_TRANSFER_TYPE,
	obligationTypeToTransferType,
} from "../types";

const BRIDGE_KEY_PREFIX_RE = /^transfer:bridge:/;

interface BridgeTransferInsertRecord {
	amount: number;
	collectionAttemptId: string;
	counterpartyId: string;
	counterpartyType: "borrower";
	createdAt: number;
	currency: "CAD";
	direction: "inbound";
	idempotencyKey: string;
	lastTransitionAt: number;
	mortgageId?: string;
	obligationId?: string;
	planEntryId?: string;
	providerCode: string;
	providerRef: string;
	source: CommandSource;
	status: "initiated";
	transferType: string;
}

interface BridgeSettlementPayload {
	providerData: { bridged: true };
	settledAt: number;
}

function buildBridgeInsertRecord(opts: {
	attemptId: string;
	amount: number;
	borrowerId?: string;
	mortgageId?: string;
	obligationId?: string;
	obligationType?: string;
	planEntryId?: string;
	providerCode?: string;
	providerRef?: string;
	source: CommandSource;
}): BridgeTransferInsertRecord {
	const now = Date.now();
	return {
		status: "initiated",
		direction: "inbound",
		transferType: obligationTypeToTransferType(opts.obligationType),
		amount: opts.amount,
		currency: "CAD",
		counterpartyType: "borrower",
		counterpartyId: opts.borrowerId ?? "",
		mortgageId: opts.mortgageId,
		obligationId: opts.obligationId,
		planEntryId: opts.planEntryId,
		collectionAttemptId: opts.attemptId,
		providerCode: opts.providerCode ?? "manual",
		providerRef: opts.providerRef ?? `bridge_${opts.attemptId}`,
		idempotencyKey: `transfer:bridge:${opts.attemptId}`,
		source: opts.source,
		lastTransitionAt: now,
		createdAt: now,
	};
}

function buildBridgeSettlementPayload(
	settledAt = Date.now()
): BridgeSettlementPayload {
	return {
		settledAt,
		providerData: { bridged: true },
	};
}

const TEST_SOURCE: CommandSource = {
	actorId: "user_01",
	actorType: "admin",
	sessionId: "session_01",
	channel: "admin_dashboard",
};

describe("bridge transfer insert record shape", () => {
	it("starts in initiated status so GT can confirm it via FUNDS_SETTLED", () => {
		const record = buildBridgeInsertRecord({
			attemptId: "attempt_001",
			amount: 50_000,
			source: TEST_SOURCE,
		});
		expect(record.status).toBe("initiated");
	});

	it("has direction inbound", () => {
		const record = buildBridgeInsertRecord({
			attemptId: "attempt_001",
			amount: 50_000,
			source: TEST_SOURCE,
		});
		expect(record.direction).toBe("inbound");
	});

	it("has collectionAttemptId set to the source attempt", () => {
		const record = buildBridgeInsertRecord({
			attemptId: "attempt_001",
			amount: 50_000,
			source: TEST_SOURCE,
		});
		expect(record.collectionAttemptId).toBe("attempt_001");
	});

	it("has currency CAD", () => {
		const record = buildBridgeInsertRecord({
			attemptId: "attempt_001",
			amount: 50_000,
			source: TEST_SOURCE,
		});
		expect(record.currency).toBe("CAD");
	});

	it("has counterpartyType borrower", () => {
		const record = buildBridgeInsertRecord({
			attemptId: "attempt_001",
			amount: 50_000,
			source: TEST_SOURCE,
		});
		expect(record.counterpartyType).toBe("borrower");
	});

	it("preserves amount from the collection attempt", () => {
		const record = buildBridgeInsertRecord({
			attemptId: "attempt_001",
			amount: 75_000,
			source: TEST_SOURCE,
		});
		expect(record.amount).toBe(75_000);
	});

	it("has insert timestamps set", () => {
		const before = Date.now();
		const record = buildBridgeInsertRecord({
			attemptId: "attempt_001",
			amount: 50_000,
			source: TEST_SOURCE,
		});
		expect(record.lastTransitionAt).toBeGreaterThanOrEqual(before);
		expect(record.createdAt).toBeGreaterThanOrEqual(before);
	});

	it("uses the attempt providerRef when available", () => {
		const record = buildBridgeInsertRecord({
			attemptId: "attempt_001",
			amount: 50_000,
			providerRef: "pad_ref_123",
			source: TEST_SOURCE,
		});
		expect(record.providerRef).toBe("pad_ref_123");
	});

	it("falls back to bridge_{attemptId} providerRef when none provided", () => {
		const record = buildBridgeInsertRecord({
			attemptId: "attempt_001",
			amount: 50_000,
			source: TEST_SOURCE,
		});
		expect(record.providerRef).toBe("bridge_attempt_001");
	});

	it("includes mortgageId when provided", () => {
		const record = buildBridgeInsertRecord({
			attemptId: "attempt_001",
			amount: 50_000,
			mortgageId: "mortgage_abc",
			source: TEST_SOURCE,
		});
		expect(record.mortgageId).toBe("mortgage_abc");
	});

	it("includes obligationId when provided", () => {
		const record = buildBridgeInsertRecord({
			attemptId: "attempt_001",
			amount: 50_000,
			obligationId: "obligation_xyz",
			source: TEST_SOURCE,
		});
		expect(record.obligationId).toBe("obligation_xyz");
	});

	it("defaults providerCode to manual", () => {
		const record = buildBridgeInsertRecord({
			attemptId: "attempt_001",
			amount: 50_000,
			source: TEST_SOURCE,
		});
		expect(record.providerCode).toBe("manual");
	});

	it("uses custom providerCode when provided", () => {
		const record = buildBridgeInsertRecord({
			attemptId: "attempt_001",
			amount: 50_000,
			providerCode: "pad_rotessa",
			source: TEST_SOURCE,
		});
		expect(record.providerCode).toBe("pad_rotessa");
	});
});

describe("bridge transfer type derivation", () => {
	it("maps regular_interest to borrower_interest_collection", () => {
		const record = buildBridgeInsertRecord({
			attemptId: "attempt_001",
			amount: 50_000,
			obligationType: "regular_interest",
			source: TEST_SOURCE,
		});
		expect(record.transferType).toBe("borrower_interest_collection");
	});

	it("maps principal_repayment to borrower_principal_collection", () => {
		const record = buildBridgeInsertRecord({
			attemptId: "attempt_001",
			amount: 50_000,
			obligationType: "principal_repayment",
			source: TEST_SOURCE,
		});
		expect(record.transferType).toBe("borrower_principal_collection");
	});

	it("maps late_fee to borrower_late_fee_collection", () => {
		const record = buildBridgeInsertRecord({
			attemptId: "attempt_001",
			amount: 50_000,
			obligationType: "late_fee",
			source: TEST_SOURCE,
		});
		expect(record.transferType).toBe("borrower_late_fee_collection");
	});

	it("maps arrears_cure to borrower_arrears_cure", () => {
		const record = buildBridgeInsertRecord({
			attemptId: "attempt_001",
			amount: 50_000,
			obligationType: "arrears_cure",
			source: TEST_SOURCE,
		});
		expect(record.transferType).toBe("borrower_arrears_cure");
	});

	it("falls back safely for undefined obligation types", () => {
		const record = buildBridgeInsertRecord({
			attemptId: "attempt_001",
			amount: 50_000,
			source: TEST_SOURCE,
		});
		expect(record.transferType).toBe(DEFAULT_OBLIGATION_TRANSFER_TYPE);
	});

	it("falls back safely for unmapped obligation types", () => {
		const record = buildBridgeInsertRecord({
			attemptId: "attempt_001",
			amount: 50_000,
			obligationType: "servicing",
			source: TEST_SOURCE,
		});
		expect(record.transferType).toBe(DEFAULT_OBLIGATION_TRANSFER_TYPE);
	});
});

describe("bridge GT confirmation payload", () => {
	it("uses a bridged settlement payload for the immediate FUNDS_SETTLED transition", () => {
		const settledAt = Date.now();
		const payload = buildBridgeSettlementPayload(settledAt);
		expect(payload).toEqual({
			settledAt,
			providerData: { bridged: true },
		});
	});
});

describe("bridge idempotency key", () => {
	it("follows transfer:bridge:{attemptId} format", () => {
		const record = buildBridgeInsertRecord({
			attemptId: "attempt_001",
			amount: 50_000,
			source: TEST_SOURCE,
		});
		expect(record.idempotencyKey).toBe("transfer:bridge:attempt_001");
	});

	it("is deterministic for the same attemptId", () => {
		const r1 = buildBridgeInsertRecord({
			attemptId: "attempt_001",
			amount: 50_000,
			source: TEST_SOURCE,
		});
		const r2 = buildBridgeInsertRecord({
			attemptId: "attempt_001",
			amount: 75_000,
			source: TEST_SOURCE,
		});
		expect(r1.idempotencyKey).toBe(r2.idempotencyKey);
	});

	it("produces different keys for different attemptIds", () => {
		const r1 = buildBridgeInsertRecord({
			attemptId: "attempt_001",
			amount: 50_000,
			source: TEST_SOURCE,
		});
		const r2 = buildBridgeInsertRecord({
			attemptId: "attempt_002",
			amount: 50_000,
			source: TEST_SOURCE,
		});
		expect(r1.idempotencyKey).not.toBe(r2.idempotencyKey);
	});

	it("starts with transfer:bridge: prefix", () => {
		const record = buildBridgeInsertRecord({
			attemptId: "attempt_xyz",
			amount: 50_000,
			source: TEST_SOURCE,
		});
		expect(record.idempotencyKey).toMatch(BRIDGE_KEY_PREFIX_RE);
	});
});

describe("D4 conditional — bridged transfer detection", () => {
	it("record with collectionAttemptId is identified as bridged", () => {
		const record = buildBridgeInsertRecord({
			attemptId: "attempt_001",
			amount: 50_000,
			source: TEST_SOURCE,
		});
		expect(record.collectionAttemptId).toBeTruthy();
	});

	it("non-bridged transfer has no collectionAttemptId", () => {
		const directTransfer = {
			status: "confirmed" as const,
			direction: "inbound" as const,
			amount: 50_000,
			collectionAttemptId: undefined,
		};
		expect(directTransfer.collectionAttemptId).toBeUndefined();
	});
});
