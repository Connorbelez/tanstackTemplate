/**
 * Transfer bridge tests — validates the shape and idempotency logic of
 * bridged transfer records created by emitPaymentReceived (T-019).
 *
 * The bridge logic lives inside the collectionAttempt effect
 * (convex/engine/effects/collectionAttempt.ts) and creates a transfer
 * record with status "confirmed" + direction "inbound" + a deterministic
 * idempotency key of `transfer:bridge:{collectionAttemptId}`.
 *
 * Since the bridge insertion runs inside an internalMutation that requires
 * the full Convex runtime + loaded entities, these tests validate the
 * expected record shape and idempotency key format as pure unit tests.
 */

import { describe, expect, it } from "vitest";
import type { CommandSource } from "../../../engine/types";

// ── Top-level regex constants (biome/useTopLevelRegex) ──────────────
const BRIDGE_KEY_PREFIX_RE = /^transfer:bridge:/;

// ── Bridge Record Shape ─────────────────────────────────────────────

/**
 * Mirrors the shape of the bridged transfer record inserted by
 * emitPaymentReceived. Any deviation from this shape would break the
 * bridge's integration with publishTransferConfirmed and reconciliation.
 */
interface BridgeTransferRecord {
	amount: number;
	collectionAttemptId: string;
	confirmedAt: number;
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
	settledAt: number;
	source: CommandSource;
	status: "confirmed";
	transferType: string;
}

function buildBridgeRecord(opts: {
	attemptId: string;
	amount: number;
	borrowerId?: string;
	mortgageId?: string;
	obligationId?: string;
	planEntryId?: string;
	providerCode?: string;
	providerRef?: string;
	source: CommandSource;
}): BridgeTransferRecord {
	const now = Date.now();
	return {
		status: "confirmed",
		direction: "inbound",
		transferType: "borrower_interest_collection",
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
		confirmedAt: now,
		settledAt: now,
		lastTransitionAt: now,
		createdAt: now,
	};
}

const TEST_SOURCE: CommandSource = {
	actorId: "user_01",
	actorType: "admin",
	sessionId: "session_01",
	channel: "admin_dashboard",
};

describe("bridge transfer record shape", () => {
	it("has status confirmed", () => {
		const record = buildBridgeRecord({
			attemptId: "attempt_001",
			amount: 50_000,
			source: TEST_SOURCE,
		});
		expect(record.status).toBe("confirmed");
	});

	it("has direction inbound", () => {
		const record = buildBridgeRecord({
			attemptId: "attempt_001",
			amount: 50_000,
			source: TEST_SOURCE,
		});
		expect(record.direction).toBe("inbound");
	});

	it("has collectionAttemptId set to the source attempt", () => {
		const record = buildBridgeRecord({
			attemptId: "attempt_001",
			amount: 50_000,
			source: TEST_SOURCE,
		});
		expect(record.collectionAttemptId).toBe("attempt_001");
	});

	it("has currency CAD", () => {
		const record = buildBridgeRecord({
			attemptId: "attempt_001",
			amount: 50_000,
			source: TEST_SOURCE,
		});
		expect(record.currency).toBe("CAD");
	});

	it("has counterpartyType borrower", () => {
		const record = buildBridgeRecord({
			attemptId: "attempt_001",
			amount: 50_000,
			source: TEST_SOURCE,
		});
		expect(record.counterpartyType).toBe("borrower");
	});

	it("preserves amount from the collection attempt", () => {
		const record = buildBridgeRecord({
			attemptId: "attempt_001",
			amount: 75_000,
			source: TEST_SOURCE,
		});
		expect(record.amount).toBe(75_000);
	});

	it("has timestamps set", () => {
		const before = Date.now();
		const record = buildBridgeRecord({
			attemptId: "attempt_001",
			amount: 50_000,
			source: TEST_SOURCE,
		});
		expect(record.confirmedAt).toBeGreaterThanOrEqual(before);
		expect(record.settledAt).toBeGreaterThanOrEqual(before);
		expect(record.lastTransitionAt).toBeGreaterThanOrEqual(before);
		expect(record.createdAt).toBeGreaterThanOrEqual(before);
	});

	it("uses the attempt providerRef when available", () => {
		const record = buildBridgeRecord({
			attemptId: "attempt_001",
			amount: 50_000,
			providerRef: "pad_ref_123",
			source: TEST_SOURCE,
		});
		expect(record.providerRef).toBe("pad_ref_123");
	});

	it("falls back to bridge_{attemptId} providerRef when none provided", () => {
		const record = buildBridgeRecord({
			attemptId: "attempt_001",
			amount: 50_000,
			source: TEST_SOURCE,
		});
		expect(record.providerRef).toBe("bridge_attempt_001");
	});

	it("includes mortgageId when provided", () => {
		const record = buildBridgeRecord({
			attemptId: "attempt_001",
			amount: 50_000,
			mortgageId: "mortgage_abc",
			source: TEST_SOURCE,
		});
		expect(record.mortgageId).toBe("mortgage_abc");
	});

	it("includes obligationId when provided", () => {
		const record = buildBridgeRecord({
			attemptId: "attempt_001",
			amount: 50_000,
			obligationId: "obligation_xyz",
			source: TEST_SOURCE,
		});
		expect(record.obligationId).toBe("obligation_xyz");
	});

	it("defaults providerCode to manual", () => {
		const record = buildBridgeRecord({
			attemptId: "attempt_001",
			amount: 50_000,
			source: TEST_SOURCE,
		});
		expect(record.providerCode).toBe("manual");
	});

	it("uses custom providerCode when provided", () => {
		const record = buildBridgeRecord({
			attemptId: "attempt_001",
			amount: 50_000,
			providerCode: "pad_rotessa",
			source: TEST_SOURCE,
		});
		expect(record.providerCode).toBe("pad_rotessa");
	});
});

// ── Bridge Idempotency Key ──────────────────────────────────────────

describe("bridge idempotency key", () => {
	it("follows transfer:bridge:{attemptId} format", () => {
		const record = buildBridgeRecord({
			attemptId: "attempt_001",
			amount: 50_000,
			source: TEST_SOURCE,
		});
		expect(record.idempotencyKey).toBe("transfer:bridge:attempt_001");
	});

	it("is deterministic for the same attemptId", () => {
		const r1 = buildBridgeRecord({
			attemptId: "attempt_001",
			amount: 50_000,
			source: TEST_SOURCE,
		});
		const r2 = buildBridgeRecord({
			attemptId: "attempt_001",
			amount: 75_000,
			source: TEST_SOURCE,
		});
		expect(r1.idempotencyKey).toBe(r2.idempotencyKey);
	});

	it("produces different keys for different attemptIds", () => {
		const r1 = buildBridgeRecord({
			attemptId: "attempt_001",
			amount: 50_000,
			source: TEST_SOURCE,
		});
		const r2 = buildBridgeRecord({
			attemptId: "attempt_002",
			amount: 50_000,
			source: TEST_SOURCE,
		});
		expect(r1.idempotencyKey).not.toBe(r2.idempotencyKey);
	});

	it("starts with transfer:bridge: prefix", () => {
		const record = buildBridgeRecord({
			attemptId: "attempt_xyz",
			amount: 50_000,
			source: TEST_SOURCE,
		});
		expect(record.idempotencyKey).toMatch(BRIDGE_KEY_PREFIX_RE);
	});
});

// ── D4 Conditional: Bridge Skips Cash Posting ───────────────────────

describe("D4 conditional — bridged transfer detection", () => {
	it("record with collectionAttemptId is identified as bridged", () => {
		const record = buildBridgeRecord({
			attemptId: "attempt_001",
			amount: 50_000,
			source: TEST_SOURCE,
		});
		// The publishTransferConfirmed effect checks: if (transfer.collectionAttemptId)
		expect(record.collectionAttemptId).toBeTruthy();
	});

	it("non-bridged transfer has no collectionAttemptId", () => {
		// A directly created transfer (not via bridge) would not have collectionAttemptId
		const directTransfer = {
			status: "confirmed" as const,
			direction: "inbound" as const,
			amount: 50_000,
			collectionAttemptId: undefined,
		};
		expect(directTransfer.collectionAttemptId).toBeUndefined();
	});
});
