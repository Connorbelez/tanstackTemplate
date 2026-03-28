import { afterEach, describe, expect, it, vi } from "vitest";
import { ManualTransferProvider } from "../manual";
import { MockTransferProvider } from "../mock";
import { getTransferProvider } from "../registry";

const NOT_YET_IMPLEMENTED_RE = /not yet implemented/;
const MOCK_PROVIDERS_DISABLED_RE = /Mock transfer providers are disabled/;

// ── T-004: Provider registry resolution ─────────────────────────────────

describe("Provider registry — resolution", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it('resolves "manual" to ManualTransferProvider', () => {
		const provider = getTransferProvider("manual");
		expect(provider).toBeInstanceOf(ManualTransferProvider);
	});

	it('resolves "mock_pad" to MockTransferProvider when mocks enabled', () => {
		vi.stubEnv("ENABLE_MOCK_PROVIDERS", "true");
		const provider = getTransferProvider("mock_pad");
		expect(provider).toBeInstanceOf(MockTransferProvider);
	});

	it('resolves "mock_eft" to MockTransferProvider when mocks enabled', () => {
		vi.stubEnv("ENABLE_MOCK_PROVIDERS", "true");
		const provider = getTransferProvider("mock_eft");
		expect(provider).toBeInstanceOf(MockTransferProvider);
	});

	it("throws for unknown/unimplemented provider codes", () => {
		const unimplementedCodes = [
			"pad_vopay",
			"pad_rotessa",
			"eft_vopay",
			"e_transfer",
			"wire",
			"plaid_transfer",
		] as const;

		for (const code of unimplementedCodes) {
			expect(
				() => getTransferProvider(code),
				`expected "${code}" to throw`
			).toThrow(NOT_YET_IMPLEMENTED_RE);
		}
	});

	it("error message for unimplemented provider includes the provider code", () => {
		expect(() => getTransferProvider("pad_vopay")).toThrow(
			'Transfer provider "pad_vopay" is not yet implemented'
		);
	});

	it("each call returns a fresh instance (no singleton caching)", () => {
		const a = getTransferProvider("manual");
		const b = getTransferProvider("manual");
		expect(a).not.toBe(b);
	});
});

// ── T-005: Mock provider environment gating ─────────────────────────────

describe("Provider registry — mock provider environment gating", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("mock_pad throws when ENABLE_MOCK_PROVIDERS is unset", () => {
		vi.stubEnv("ENABLE_MOCK_PROVIDERS", "");
		expect(() => getTransferProvider("mock_pad")).toThrow(
			MOCK_PROVIDERS_DISABLED_RE
		);
	});

	it("mock_eft throws when ENABLE_MOCK_PROVIDERS is unset", () => {
		vi.stubEnv("ENABLE_MOCK_PROVIDERS", "");
		expect(() => getTransferProvider("mock_eft")).toThrow(
			MOCK_PROVIDERS_DISABLED_RE
		);
	});

	it('mock_pad throws when ENABLE_MOCK_PROVIDERS is "false"', () => {
		vi.stubEnv("ENABLE_MOCK_PROVIDERS", "false");
		expect(() => getTransferProvider("mock_pad")).toThrow(
			MOCK_PROVIDERS_DISABLED_RE
		);
	});

	it('mock_pad succeeds when ENABLE_MOCK_PROVIDERS is "true"', () => {
		vi.stubEnv("ENABLE_MOCK_PROVIDERS", "true");
		const provider = getTransferProvider("mock_pad");
		expect(provider).toBeInstanceOf(MockTransferProvider);
	});

	it('mock_eft succeeds when ENABLE_MOCK_PROVIDERS is "true"', () => {
		vi.stubEnv("ENABLE_MOCK_PROVIDERS", "true");
		const provider = getTransferProvider("mock_eft");
		expect(provider).toBeInstanceOf(MockTransferProvider);
	});

	it("error message instructs to set ENABLE_MOCK_PROVIDERS", () => {
		vi.stubEnv("ENABLE_MOCK_PROVIDERS", "");
		expect(() => getTransferProvider("mock_pad")).toThrow(
			'Set ENABLE_MOCK_PROVIDERS="true" to opt in'
		);
	});

	it("manual provider is not affected by ENABLE_MOCK_PROVIDERS setting", () => {
		vi.stubEnv("ENABLE_MOCK_PROVIDERS", "");
		const provider = getTransferProvider("manual");
		expect(provider).toBeInstanceOf(ManualTransferProvider);
	});
});
