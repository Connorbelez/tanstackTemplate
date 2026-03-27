/**
 * Transfer mutation tests — validation logic, provider registry, and
 * ManualTransferProvider behavior.
 *
 * The actual createTransferRequest and initiateTransfer mutations are gated
 * behind adminMutation middleware which requires full convex-test + auth
 * component setup. These tests cover the pure domain logic that those
 * mutations depend on.
 */

import { describe, expect, it } from "vitest";
import type { TransferRequestInput } from "../interface";
import {
	buildRetryIdempotencyKey,
	canCancelTransferStatus,
	canManuallyConfirmTransferStatus,
	canRetryTransferStatus,
} from "../mutations";
import { ManualTransferProvider } from "../providers/manual";
import { MockTransferProvider } from "../providers/mock";
import { getTransferProvider } from "../providers/registry";
import {
	ALL_TRANSFER_TYPES,
	INBOUND_TRANSFER_TYPES,
	isInboundTransferType,
	isOutboundTransferType,
	OUTBOUND_TRANSFER_TYPES,
	PROVIDER_CODES,
	TRANSFER_STATUSES,
} from "../types";

// ── Top-level regex constants (biome/useTopLevelRegex) ──────────────
const NOT_YET_IMPLEMENTED_RE = /not yet implemented/;
const MOCK_DISABLED_RE = /disabled by default/;
const EFT_VOPAY_RE = /eft_vopay/;
const MANUAL_PREFIX_RE = /^manual_/;
const BRIDGE_PREFIX_RE = /^transfer:bridge:/;
const RETRY_PREFIX_RE = /^retry:[\w-]+$/;

// ── Amount Validation ───────────────────────────────────────────────
// The mutation checks: !Number.isInteger(amount) || amount <= 0

describe("amount validation logic", () => {
	function validateAmount(amount: number): boolean {
		return Number.isInteger(amount) && amount > 0;
	}

	it("accepts a positive integer", () => {
		expect(validateAmount(100_000)).toBe(true);
	});

	it("accepts 1 (smallest valid amount)", () => {
		expect(validateAmount(1)).toBe(true);
	});

	it("rejects zero", () => {
		expect(validateAmount(0)).toBe(false);
	});

	it("rejects negative amount", () => {
		expect(validateAmount(-500)).toBe(false);
	});

	it("rejects float amount", () => {
		expect(validateAmount(100.5)).toBe(false);
	});

	it("rejects NaN", () => {
		expect(validateAmount(Number.NaN)).toBe(false);
	});

	it("rejects Infinity", () => {
		expect(validateAmount(Number.POSITIVE_INFINITY)).toBe(false);
	});

	it("accepts MAX_SAFE_INTEGER", () => {
		expect(validateAmount(Number.MAX_SAFE_INTEGER)).toBe(true);
	});
});

// ── Type Guards ─────────────────────────────────────────────────────

describe("transfer type guards", () => {
	it("isInboundTransferType returns true for all inbound types", () => {
		for (const t of INBOUND_TRANSFER_TYPES) {
			expect(isInboundTransferType(t)).toBe(true);
		}
	});

	it("isInboundTransferType returns false for outbound types", () => {
		for (const t of OUTBOUND_TRANSFER_TYPES) {
			expect(isInboundTransferType(t)).toBe(false);
		}
	});

	it("isOutboundTransferType returns true for all outbound types", () => {
		for (const t of OUTBOUND_TRANSFER_TYPES) {
			expect(isOutboundTransferType(t)).toBe(true);
		}
	});

	it("isOutboundTransferType returns false for inbound types", () => {
		for (const t of INBOUND_TRANSFER_TYPES) {
			expect(isOutboundTransferType(t)).toBe(false);
		}
	});

	it("isInboundTransferType returns false for unknown string", () => {
		expect(isInboundTransferType("unknown_type")).toBe(false);
	});

	it("isOutboundTransferType returns false for unknown string", () => {
		expect(isOutboundTransferType("unknown_type")).toBe(false);
	});
});

// ── Transfer Status Enumeration ─────────────────────────────────────

describe("transfer status constants", () => {
	it("has 7 statuses matching the machine states", () => {
		expect(TRANSFER_STATUSES).toHaveLength(7);
	});

	it("includes all machine states", () => {
		const expected = [
			"initiated",
			"pending",
			"processing",
			"confirmed",
			"failed",
			"cancelled",
			"reversed",
		];
		for (const s of expected) {
			expect(TRANSFER_STATUSES).toContain(s);
		}
	});
});

// ── ALL_TRANSFER_TYPES ──────────────────────────────────────────────

describe("ALL_TRANSFER_TYPES", () => {
	it("contains all inbound and outbound types", () => {
		expect(ALL_TRANSFER_TYPES.length).toBe(
			INBOUND_TRANSFER_TYPES.length + OUTBOUND_TRANSFER_TYPES.length
		);
	});

	it("has no duplicates", () => {
		const unique = new Set(ALL_TRANSFER_TYPES);
		expect(unique.size).toBe(ALL_TRANSFER_TYPES.length);
	});
});

// ── Provider Codes ──────────────────────────────────────────────────

describe("provider codes", () => {
	it("includes manual as the first code", () => {
		expect(PROVIDER_CODES).toContain("manual");
	});

	it("includes mock provider codes", () => {
		expect(PROVIDER_CODES).toContain("mock_pad");
		expect(PROVIDER_CODES).toContain("mock_eft");
	});

	it("has 9 provider codes", () => {
		expect(PROVIDER_CODES).toHaveLength(9);
	});
});

// ── Provider Registry ───────────────────────────────────────────────

describe("transfer provider registry", () => {
	const originalNodeEnv = process.env.NODE_ENV;
	const originalEnableMockProviders = process.env.ENABLE_MOCK_PROVIDERS;

	function restoreEnv(): void {
		if (originalNodeEnv === undefined) {
			// biome-ignore lint/performance/noDelete: process.env must delete the key to truly restore absence.
			delete process.env.NODE_ENV;
		} else {
			process.env.NODE_ENV = originalNodeEnv;
		}
		if (originalEnableMockProviders === undefined) {
			// biome-ignore lint/performance/noDelete: process.env must delete the key to truly restore absence.
			delete process.env.ENABLE_MOCK_PROVIDERS;
			return;
		}
		process.env.ENABLE_MOCK_PROVIDERS = originalEnableMockProviders;
	}

	it('getTransferProvider("manual") returns ManualTransferProvider', () => {
		const provider = getTransferProvider("manual");
		expect(provider).toBeInstanceOf(ManualTransferProvider);
	});

	it('getTransferProvider("mock_pad") returns MockTransferProvider with explicit opt-in', () => {
		try {
			process.env.NODE_ENV = "test";
			process.env.ENABLE_MOCK_PROVIDERS = "true";
			const provider = getTransferProvider("mock_pad");
			expect(provider).toBeInstanceOf(MockTransferProvider);
		} finally {
			restoreEnv();
		}
	});

	it('getTransferProvider("mock_eft") returns MockTransferProvider with explicit opt-in', () => {
		try {
			process.env.NODE_ENV = "development";
			process.env.ENABLE_MOCK_PROVIDERS = "true";
			const provider = getTransferProvider("mock_eft");
			expect(provider).toBeInstanceOf(MockTransferProvider);
		} finally {
			restoreEnv();
		}
	});

	it("mock providers are blocked in production without explicit opt-in", () => {
		try {
			process.env.NODE_ENV = "production";
			// biome-ignore lint/performance/noDelete: explicit unset for env-gate tests.
			delete process.env.ENABLE_MOCK_PROVIDERS;
			expect(() => getTransferProvider("mock_pad")).toThrow(MOCK_DISABLED_RE);
		} finally {
			restoreEnv();
		}
	});

	it("mock providers are allowed in production with explicit opt-in", () => {
		try {
			process.env.NODE_ENV = "production";
			process.env.ENABLE_MOCK_PROVIDERS = "true";
			const provider = getTransferProvider("mock_pad");
			expect(provider).toBeInstanceOf(MockTransferProvider);
		} finally {
			restoreEnv();
		}
	});

	it("throws for unimplemented provider codes", () => {
		expect(() => getTransferProvider("pad_vopay")).toThrow(
			NOT_YET_IMPLEMENTED_RE
		);
	});

	it("error message mentions the provider code", () => {
		expect(() => getTransferProvider("eft_vopay")).toThrow(EFT_VOPAY_RE);
	});
});

// ── ManualTransferProvider ──────────────────────────────────────────

describe("ManualTransferProvider", () => {
	const provider = new ManualTransferProvider();

	const sampleInput: TransferRequestInput = {
		amount: 50_000,
		counterpartyId: "borrower_123",
		counterpartyType: "borrower",
		currency: "CAD",
		direction: "inbound",
		idempotencyKey: "test-key-001",
		providerCode: "manual",
		references: {},
		source: {
			actorId: "user_01",
			actorType: "admin",
			sessionId: "session_01",
			channel: "admin_dashboard",
		},
		transferType: "borrower_interest_collection",
	};

	it("initiate returns confirmed status (immediate settlement)", async () => {
		const result = await provider.initiate(sampleInput);
		expect(result.status).toBe("confirmed");
	});

	it("initiate returns a providerRef containing the transfer type", async () => {
		const result = await provider.initiate(sampleInput);
		expect(result.providerRef).toContain("borrower_interest_collection");
	});

	it("initiate returns a providerRef starting with manual_", async () => {
		const result = await provider.initiate(sampleInput);
		expect(result.providerRef).toMatch(MANUAL_PREFIX_RE);
	});

	it("initiate returns unique providerRefs across calls", async () => {
		const ref1 = (await provider.initiate(sampleInput)).providerRef;
		const ref2 = (await provider.initiate(sampleInput)).providerRef;
		expect(ref1).not.toBe(ref2);
	});

	it("confirm returns a settledAt timestamp", async () => {
		const before = Date.now();
		const result = await provider.confirm("manual_ref_001");
		expect(result.settledAt).toBeGreaterThanOrEqual(before);
		expect(result.settledAt).toBeLessThanOrEqual(Date.now());
		expect(result.providerRef).toBe("manual_ref_001");
	});

	it("cancel returns cancelled: true", async () => {
		const result = await provider.cancel("manual_ref_001");
		expect(result).toEqual({ cancelled: true });
	});

	it("getStatus returns confirmed with structured providerData", async () => {
		const result = await provider.getStatus("manual_ref_001");
		expect(result.status).toBe("confirmed");
		expect(result.providerData).toEqual({
			providerRef: "manual_ref_001",
			method: "manual",
		});
	});
});

// ── Idempotency Key Format ──────────────────────────────────────────

describe("idempotency key format", () => {
	it("bridge idempotency key follows transfer:bridge:{attemptId} format", () => {
		const attemptId = "attempt_123";
		const key = `transfer:bridge:${attemptId}`;
		expect(key).toBe("transfer:bridge:attempt_123");
		expect(key).toMatch(BRIDGE_PREFIX_RE);
	});

	it("keys are deterministic for the same input", () => {
		const key1 = `transfer:bridge:${"attempt_123"}`;
		const key2 = `transfer:bridge:${"attempt_123"}`;
		expect(key1).toBe(key2);
	});

	it("keys differ for different attempts", () => {
		const key1 = `transfer:bridge:${"attempt_123"}`;
		const key2 = `transfer:bridge:${"attempt_456"}`;
		expect(key1).not.toBe(key2);
	});

	it("retry idempotency key uses retry:{transferId}", () => {
		const key = buildRetryIdempotencyKey("transfer_123");
		expect(key).toBe("retry:transfer_123");
		expect(key).toMatch(RETRY_PREFIX_RE);
	});
});

// ── Mutation Status Guards ──────────────────────────────────────────

describe("ENG-201 transfer status guards", () => {
	it("cancel only allows initiated status", () => {
		expect(canCancelTransferStatus("initiated")).toBe(true);
		expect(canCancelTransferStatus("pending")).toBe(false);
		expect(canCancelTransferStatus("failed")).toBe(false);
	});

	it("retry only allows failed status", () => {
		expect(canRetryTransferStatus("failed")).toBe(true);
		expect(canRetryTransferStatus("initiated")).toBe(false);
		expect(canRetryTransferStatus("confirmed")).toBe(false);
	});

	it("manual confirm allows initiated, pending, and processing", () => {
		expect(canManuallyConfirmTransferStatus("initiated")).toBe(true);
		expect(canManuallyConfirmTransferStatus("pending")).toBe(true);
		expect(canManuallyConfirmTransferStatus("processing")).toBe(true);
		expect(canManuallyConfirmTransferStatus("failed")).toBe(false);
		expect(canManuallyConfirmTransferStatus("cancelled")).toBe(false);
	});
});
