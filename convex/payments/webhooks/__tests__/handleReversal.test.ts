import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyRotessaSignature, verifyStripeSignature } from "../verification";

// ── Test helpers ─────────────────────────────────────────────────────

function createTestRotessaSignature(body: string, secret: string): string {
	return createHmac("sha256", secret).update(body).digest("hex");
}

function createTestStripeSignature(
	body: string,
	secret: string,
	timestamp?: number
): string {
	const ts = timestamp ?? Math.floor(Date.now() / 1000);
	return `t=${ts},v1=${createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex")}`;
}

// ── Tests ────────────────────────────────────────────────────────────

describe("verifyRotessaSignature", () => {
	const SECRET = "test-rotessa-secret-key";
	const BODY = JSON.stringify({
		event_type: "transaction.nsf",
		data: { transaction_id: "txn_001", amount: 150.0 },
	});

	it("returns true for valid HMAC-SHA256 signature", () => {
		const signature = createTestRotessaSignature(BODY, SECRET);
		expect(verifyRotessaSignature(BODY, signature, SECRET)).toBe(true);
	});

	it("returns false for invalid signature", () => {
		const wrongSignature = createTestRotessaSignature(BODY, "wrong-secret");
		expect(verifyRotessaSignature(BODY, wrongSignature, SECRET)).toBe(false);
	});

	it("returns false for empty signature", () => {
		// An empty string produces a zero-length buffer, which won't match the
		// 32-byte expected buffer. The length check causes an early return false.
		expect(verifyRotessaSignature(BODY, "", SECRET)).toBe(false);
	});

	it("returns false when body has been tampered with", () => {
		const signature = createTestRotessaSignature(BODY, SECRET);
		const tamperedBody = `${BODY} extra`;
		expect(verifyRotessaSignature(tamperedBody, signature, SECRET)).toBe(false);
	});

	it("returns true for different valid body+signature pairs", () => {
		const body2 = '{"event_type":"transaction.returned"}';
		const sig2 = createTestRotessaSignature(body2, SECRET);
		expect(verifyRotessaSignature(body2, sig2, SECRET)).toBe(true);
	});
});

describe("verifyStripeSignature", () => {
	const SECRET = "whsec_test_stripe_secret";
	const BODY = JSON.stringify({
		id: "evt_123",
		type: "charge.refunded",
		data: { object: { id: "ch_abc", amount: 5000 } },
	});

	it("returns true for valid stripe-signature header", () => {
		const header = createTestStripeSignature(BODY, SECRET);
		expect(verifyStripeSignature(BODY, header, SECRET)).toBe(true);
	});

	it("returns false for invalid signature", () => {
		const header = createTestStripeSignature(BODY, "wrong-secret");
		expect(verifyStripeSignature(BODY, header, SECRET)).toBe(false);
	});

	it("returns false for expired timestamp beyond tolerance", () => {
		// Timestamp from 10 minutes ago, with 5 min tolerance
		const staleTimestamp = Math.floor(Date.now() / 1000) - 600;
		const header = createTestStripeSignature(BODY, SECRET, staleTimestamp);
		expect(verifyStripeSignature(BODY, header, SECRET, 300)).toBe(false);
	});

	it("handles missing v1= prefix gracefully", () => {
		const ts = Math.floor(Date.now() / 1000);
		// Header with no v1= component
		const header = `t=${ts}`;
		expect(verifyStripeSignature(BODY, header, SECRET)).toBe(false);
	});

	it("returns false for missing timestamp", () => {
		const sig = createHmac("sha256", SECRET)
			.update(`12345.${BODY}`)
			.digest("hex");
		// Header with no t= component
		const header = `v1=${sig}`;
		expect(verifyStripeSignature(BODY, header, SECRET)).toBe(false);
	});

	it("returns false for completely malformed header", () => {
		expect(verifyStripeSignature(BODY, "garbage-header", SECRET)).toBe(false);
	});

	it("accepts timestamp within tolerance", () => {
		// Timestamp from 2 minutes ago, tolerance 5 minutes
		const recentTimestamp = Math.floor(Date.now() / 1000) - 120;
		const header = createTestStripeSignature(BODY, SECRET, recentTimestamp);
		expect(verifyStripeSignature(BODY, header, SECRET, 300)).toBe(true);
	});

	it("returns false for future timestamp beyond tolerance", () => {
		// Timestamp 10 minutes in the future
		const futureTimestamp = Math.floor(Date.now() / 1000) + 600;
		const header = createTestStripeSignature(BODY, SECRET, futureTimestamp);
		expect(verifyStripeSignature(BODY, header, SECRET, 300)).toBe(false);
	});

	it("returns false for empty header string", () => {
		expect(verifyStripeSignature(BODY, "", SECRET)).toBe(false);
	});
});
