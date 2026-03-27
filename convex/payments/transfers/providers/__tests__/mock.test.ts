import { describe, expect, it } from "vitest";
import type { TransferRequestInput } from "../../interface";
import {
	MockTransferProvider,
	type MockTransferProviderConfig,
	type MockWebhookPayload,
} from "../mock";

const MOCK_PAD_PROVIDER_REF_RE = /^mock_pad_/;

function makeInput(
	overrides: Partial<TransferRequestInput> = {}
): TransferRequestInput {
	return {
		amount: 50_000,
		counterpartyId: "borrower_123",
		counterpartyType: "borrower",
		currency: "CAD",
		direction: "inbound",
		idempotencyKey: "mock-transfer-001",
		providerCode: "mock_pad",
		references: {},
		source: {
			actorId: "user_01",
			actorType: "admin",
			channel: "admin_dashboard",
		},
		transferType: "borrower_interest_collection",
		...overrides,
	};
}

function createProvider(
	config: Partial<MockTransferProviderConfig> = {}
): MockTransferProvider {
	return new MockTransferProvider({
		defaultMode: "async",
		defaultFailureCode: "NSF",
		defaultLatencyMs: 0,
		now: () => 1_700_000_000_000,
		randomUUID: () => "uuid-1234",
		sleep: async () => undefined,
		autoDispatchModeWebhook: false,
		...config,
	});
}

describe("MockTransferProvider", () => {
	it("immediate mode returns confirmed at initiate", async () => {
		const provider = createProvider({ defaultMode: "immediate" });
		const result = await provider.initiate(makeInput());

		expect(result.status).toBe("confirmed");
		expect(result.providerRef).toMatch(MOCK_PAD_PROVIDER_REF_RE);
		expect(provider.getInternalState(result.providerRef)?.status).toBe(
			"confirmed"
		);
	});

	it("async mode returns pending and confirm settles", async () => {
		const provider = createProvider({ defaultMode: "async" });
		const initiated = await provider.initiate(makeInput());

		expect(initiated.status).toBe("pending");
		expect(provider.getInternalState(initiated.providerRef)?.status).toBe(
			"pending"
		);

		const confirmed = await provider.confirm(initiated.providerRef);
		expect(confirmed.providerRef).toBe(initiated.providerRef);
		expect(confirmed.settledAmount).toBe(50_000);
		expect(provider.getInternalState(initiated.providerRef)?.status).toBe(
			"confirmed"
		);
	});

	it("fail mode simulates failed webhook with configured failure code", async () => {
		const dispatched: MockWebhookPayload[] = [];
		const provider = createProvider({
			defaultMode: "fail",
			dispatchWebhook: async (payload) => {
				dispatched.push(payload);
			},
		});

		const initiated = await provider.initiate(makeInput());
		expect(initiated.status).toBe("pending");

		const payload = await provider.simulateWebhook(
			initiated.providerRef,
			"failed"
		);
		expect(payload.mappedTransferEvent).toBe("TRANSFER_FAILED");
		expect(payload.reason).toBe("NSF");
		expect(dispatched).toHaveLength(1);

		const status = await provider.getStatus(initiated.providerRef);
		expect(status.status).toBe("failed");
		expect(status.providerData).toMatchObject({
			failureCode: "NSF",
			mode: "fail",
		});
	});

	it("reversal mode supports confirm then reversal webhook sequence", async () => {
		const dispatched: MockWebhookPayload[] = [];
		const provider = createProvider({
			defaultMode: "reversal",
			dispatchWebhook: (payload) => {
				dispatched.push(payload);
			},
		});

		const initiated = await provider.initiate(makeInput());
		expect(initiated.status).toBe("pending");

		const confirmed = await provider.simulateWebhook(
			initiated.providerRef,
			"confirmed"
		);
		expect(confirmed.mappedTransferEvent).toBe("FUNDS_SETTLED");

		const reversed = await provider.simulateWebhook(
			initiated.providerRef,
			"reversed"
		);
		expect(reversed.mappedTransferEvent).toBe("TRANSFER_REVERSED");
		expect(dispatched).toHaveLength(2);
		expect(provider.getInternalState(initiated.providerRef)?.status).toBe(
			"reversed"
		);
	});

	it("metadata can override mode, failure code, and latency", async () => {
		const sleeps: number[] = [];
		const provider = createProvider({
			defaultMode: "immediate",
			sleep: async (ms) => {
				sleeps.push(ms);
			},
		});

		const initiated = await provider.initiate(
			makeInput({
				metadata: {
					mockMode: "fail",
					mockFailureCode: "INVALID_ACCOUNT",
					mockLatencyMs: 25,
				},
			})
		);

		expect(initiated.status).toBe("pending");
		const payload = await provider.simulateWebhook(
			initiated.providerRef,
			"failed"
		);
		expect(payload.reason).toBe("INVALID_ACCOUNT");
		expect(sleeps).toContain(25);
	});

	it("autoDispatchModeWebhook emits mode-specific webhook events on initiate", async () => {
		const dispatched: MockWebhookPayload[] = [];
		const provider = createProvider({
			defaultMode: "fail",
			autoDispatchModeWebhook: true,
			dispatchWebhook: (payload) => {
				dispatched.push(payload);
			},
		});

		const initiated = await provider.initiate(makeInput());
		expect(initiated.status).toBe("pending");
		expect(dispatched).toHaveLength(1);
		expect(dispatched[0].mappedTransferEvent).toBe("TRANSFER_FAILED");
		expect(provider.getInternalState(initiated.providerRef)?.status).toBe(
			"failed"
		);
	});

	it("cancel returns true only for pending transfer", async () => {
		const provider = createProvider({ defaultMode: "async" });
		const initiated = await provider.initiate(makeInput());

		expect(await provider.cancel(initiated.providerRef)).toEqual({
			cancelled: true,
		});
		expect(await provider.cancel(initiated.providerRef)).toEqual({
			cancelled: false,
		});
		expect(await provider.cancel("unknown_ref")).toEqual({ cancelled: false });
	});

	it("getStatus for unknown providerRef returns unknown", async () => {
		const provider = createProvider();
		const status = await provider.getStatus("missing_ref");
		expect(status.status).toBe("unknown");
	});

	it("reset clears internal state", async () => {
		const provider = createProvider();
		const initiated = await provider.initiate(makeInput());
		expect(provider.getInternalState(initiated.providerRef)).toBeDefined();
		provider.reset();
		expect(provider.getInternalState(initiated.providerRef)).toBeUndefined();
	});
});
