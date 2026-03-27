"use node";

import { createHmac, timingSafeEqual } from "node:crypto";
import { v } from "convex/values";
import { internalAction } from "../../_generated/server";

/**
 * Verify a Rotessa webhook signature (HMAC-SHA256).
 *
 * Rotessa sends the signature in the `X-Rotessa-Signature` header as a
 * hex-encoded HMAC-SHA256 digest of the raw request body.
 */
export function verifyRotessaSignature(
	body: string,
	signature: string,
	secret: string
): boolean {
	const expected = createHmac("sha256", secret).update(body).digest("hex");
	const sigBuffer = Buffer.from(signature, "hex");
	const expectedBuffer = Buffer.from(expected, "hex");

	if (sigBuffer.length !== expectedBuffer.length) {
		return false;
	}

	return timingSafeEqual(sigBuffer, expectedBuffer);
}

/**
 * Verify a Stripe webhook signature (`stripe-signature` header).
 *
 * The header format is `t=<timestamp>,v1=<signature>`.
 * The signed payload is `${timestamp}.${body}`, HMAC-SHA256 hex-encoded.
 * An optional tolerance (default 300 s / 5 min) rejects stale events.
 */
export function verifyStripeSignature(
	body: string,
	signatureHeader: string,
	secret: string,
	toleranceSeconds = 300
): boolean {
	const parts = parseStripeSignatureHeader(signatureHeader);
	if (!parts) {
		return false;
	}

	const { timestamp, signatures } = parts;

	// Timestamp tolerance check
	const now = Math.floor(Date.now() / 1000);
	if (Math.abs(now - timestamp) > toleranceSeconds) {
		return false;
	}

	const expectedPayload = `${timestamp}.${body}`;
	const expected = createHmac("sha256", secret)
		.update(expectedPayload)
		.digest("hex");
	const expectedBuffer = Buffer.from(expected, "hex");

	// Check if any v1 signature matches (Stripe may send multiple)
	return signatures.some((sig) => {
		const sigBuffer = Buffer.from(sig, "hex");
		if (sigBuffer.length !== expectedBuffer.length) {
			return false;
		}
		return timingSafeEqual(sigBuffer, expectedBuffer);
	});
}

// ── Internal helpers ─────────────────────────────────────────────────

interface ParsedStripeHeader {
	signatures: string[];
	timestamp: number;
}

function parseStripeSignatureHeader(header: string): ParsedStripeHeader | null {
	let timestamp: number | undefined;
	const signatures: string[] = [];

	for (const part of header.split(",")) {
		const [key, value] = part.split("=", 2);
		if (!(key && value)) {
			continue;
		}

		if (key.trim() === "t") {
			const parsed = Number.parseInt(value.trim(), 10);
			if (Number.isNaN(parsed)) {
				return null;
			}
			timestamp = parsed;
		} else if (key.trim() === "v1") {
			signatures.push(value.trim());
		}
	}

	if (timestamp === undefined || signatures.length === 0) {
		return null;
	}

	return { timestamp, signatures };
}

/**
 * Verify a VoPay webhook signature (HMAC-SHA256).
 *
 * VoPay sends the signature in the `X-VoPay-Signature` header as a
 * hex-encoded HMAC-SHA256 digest of the raw request body.
 *
 * This is a Phase 1 skeleton — the exact header name and encoding
 * will be confirmed when VoPay integration is finalized (ENG-185).
 */
export function verifyVoPaySignature(
	body: string,
	signature: string,
	secret: string
): boolean {
	const expected = createHmac("sha256", secret).update(body).digest("hex");
	const sigBuffer = Buffer.from(signature, "hex");
	const expectedBuffer = Buffer.from(expected, "hex");

	if (sigBuffer.length !== expectedBuffer.length) {
		return false;
	}

	return timingSafeEqual(sigBuffer, expectedBuffer);
}

// ── Verification result types ───────────────────────────────────────

export type VerificationResult =
	| { ok: true }
	| { ok: false; error: "missing_secret" }
	| { ok: false; error: "invalid_signature" };

// ── Internal Actions (callable from httpActions via ctx.runAction) ───

/**
 * Verify a Rotessa webhook signature via internalAction.
 * Runs in the Node.js runtime so it can use node:crypto.
 *
 * Returns a structured result distinguishing missing secrets from bad signatures.
 */
export const verifyRotessaSignatureAction = internalAction({
	args: {
		body: v.string(),
		signature: v.string(),
	},
	handler: async (_ctx, args): Promise<VerificationResult> => {
		const secret = process.env.ROTESSA_WEBHOOK_SECRET;
		if (!secret) {
			console.error("[Rotessa Webhook] ROTESSA_WEBHOOK_SECRET not configured");
			return { ok: false, error: "missing_secret" };
		}
		const valid = verifyRotessaSignature(args.body, args.signature, secret);
		return valid ? { ok: true } : { ok: false, error: "invalid_signature" };
	},
});

/**
 * Verify a Stripe webhook signature via internalAction.
 * Runs in the Node.js runtime so it can use node:crypto.
 *
 * Returns a structured result distinguishing missing secrets from bad signatures.
 */
export const verifyStripeSignatureAction = internalAction({
	args: {
		body: v.string(),
		signatureHeader: v.string(),
	},
	handler: async (_ctx, args): Promise<VerificationResult> => {
		const secret = process.env.STRIPE_WEBHOOK_SECRET;
		if (!secret) {
			console.error("[Stripe Webhook] STRIPE_WEBHOOK_SECRET not configured");
			return { ok: false, error: "missing_secret" };
		}
		const valid = verifyStripeSignature(
			args.body,
			args.signatureHeader,
			secret
		);
		return valid ? { ok: true } : { ok: false, error: "invalid_signature" };
	},
});

/**
 * Verify a VoPay webhook signature via internalAction.
 * Runs in the Node.js runtime so it can use node:crypto.
 *
 * Returns a structured result distinguishing missing secrets from bad signatures.
 */
export const verifyVoPaySignatureAction = internalAction({
	args: {
		body: v.string(),
		signature: v.string(),
	},
	handler: async (_ctx, args): Promise<VerificationResult> => {
		const secret = process.env.VOPAY_WEBHOOK_SECRET;
		if (!secret) {
			console.error("[VoPay Webhook] VOPAY_WEBHOOK_SECRET not configured");
			return { ok: false, error: "missing_secret" };
		}
		const valid = verifyVoPaySignature(args.body, args.signature, secret);
		return valid ? { ok: true } : { ok: false, error: "invalid_signature" };
	},
});
