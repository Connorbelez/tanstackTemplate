/**
 * MockTransferProvider — controllable TransferProvider implementation for tests
 * and local development.
 *
 * Reference implementation notes for future provider authors:
 * - `initiate` is where real providers call external APIs and map provider
 *   responses into `InitiateResult`.
 * - `simulateWebhook` demonstrates how provider callbacks should be normalized
 *   before entering the transfer transition pipeline.
 * - Provider-specific error codes are normalized at the adapter boundary
 *   (`failureCode` here, mapped to transfer event payloads).
 * - Domain amounts remain cents; convert to provider-specific amount formats
 *   only inside the provider implementation before HTTP/API calls.
 */

import type {
	CancelResult,
	ConfirmResult,
	InitiateResult,
	StatusResult,
	TransferProvider,
	TransferRequestInput,
} from "../interface";

type MockTransferStatus =
	| "pending"
	| "confirmed"
	| "failed"
	| "reversed"
	| "cancelled";

export type MockMode = "immediate" | "async" | "fail" | "reversal";
export type MockWebhookEvent = "confirmed" | "failed" | "reversed";

type MockProviderCode = "mock_pad" | "mock_eft";
type MockWebhookStatus = "completed" | "failed" | "returned";
type MappedTransferEvent =
	| "FUNDS_SETTLED"
	| "TRANSFER_FAILED"
	| "TRANSFER_REVERSED";

export interface MockTransferProviderConfig {
	autoDispatchModeWebhook: boolean;
	defaultFailureCode: string;
	defaultLatencyMs: number;
	defaultMode: MockMode;
	dispatchWebhook?: (payload: MockWebhookPayload) => Promise<void> | void;
	now: () => number;
	randomUUID: () => string;
	sleep: (ms: number) => Promise<void>;
}

export interface MockTransferState {
	amount: number;
	createdAt: number;
	failureCode: string;
	latencyMs: number;
	mode: MockMode;
	providerCode: MockProviderCode;
	providerRef: string;
	status: MockTransferStatus;
}

export interface MockWebhookPayload {
	amount: number;
	eventId: string;
	mappedTransferEvent: MappedTransferEvent;
	provider: MockProviderCode;
	providerEventId: string;
	rawBody: string;
	reason?: string;
	status: MockWebhookStatus;
	timestamp: string;
	transactionId: string;
}

const DEFAULT_CONFIG: MockTransferProviderConfig = {
	autoDispatchModeWebhook: false,
	defaultFailureCode: "NSF",
	defaultLatencyMs: 0,
	defaultMode: "async",
	dispatchWebhook: undefined,
	now: () => Date.now(),
	randomUUID: () => crypto.randomUUID(),
	sleep: (ms: number) =>
		new Promise((resolve) => {
			setTimeout(resolve, ms);
		}),
};

function isMockMode(value: unknown): value is MockMode {
	return (
		value === "immediate" ||
		value === "async" ||
		value === "fail" ||
		value === "reversal"
	);
}

function isMockProviderCode(value: string): value is MockProviderCode {
	return value === "mock_pad" || value === "mock_eft";
}

function asString(
	record: Record<string, unknown> | undefined,
	key: string
): string | undefined {
	const value = record?.[key];
	return typeof value === "string" ? value : undefined;
}

function asNonNegativeNumber(
	record: Record<string, unknown> | undefined,
	key: string
): number | undefined {
	const value = record?.[key];
	return typeof value === "number" && Number.isFinite(value) && value >= 0
		? value
		: undefined;
}

function assertNever(value: never): never {
	throw new Error(`Unhandled mock webhook event: ${String(value)}`);
}

function toWebhookStatus(event: MockWebhookEvent): MockWebhookStatus {
	switch (event) {
		case "confirmed":
			return "completed";
		case "failed":
			return "failed";
		case "reversed":
			return "returned";
		default:
			return assertNever(event);
	}
}

function toMappedTransferEvent(event: MockWebhookEvent): MappedTransferEvent {
	switch (event) {
		case "confirmed":
			return "FUNDS_SETTLED";
		case "failed":
			return "TRANSFER_FAILED";
		case "reversed":
			return "TRANSFER_REVERSED";
		default:
			return assertNever(event);
	}
}

export class MockTransferProvider implements TransferProvider {
	private readonly config: MockTransferProviderConfig;
	private readonly state = new Map<string, MockTransferState>();

	constructor(config: Partial<MockTransferProviderConfig> = {}) {
		this.config = { ...DEFAULT_CONFIG, ...config };

		if (!isMockMode(this.config.defaultMode)) {
			throw new Error(
				`MockTransferProvider: invalid defaultMode "${String(this.config.defaultMode)}"`
			);
		}
		if (
			!Number.isFinite(this.config.defaultLatencyMs) ||
			this.config.defaultLatencyMs < 0
		) {
			throw new Error(
				`MockTransferProvider: defaultLatencyMs must be a non-negative finite number, got ${String(this.config.defaultLatencyMs)}`
			);
		}
	}

	async initiate(request: TransferRequestInput): Promise<InitiateResult> {
		if (!isMockProviderCode(request.providerCode)) {
			throw new Error(
				`MockTransferProvider expects providerCode "mock_pad" or "mock_eft", got "${request.providerCode}".`
			);
		}

		const metadata = request.metadata;
		const mode =
			(isMockMode(metadata?.mockMode) ? metadata.mockMode : undefined) ??
			this.config.defaultMode;
		const failureCode =
			asString(metadata, "mockFailureCode") ?? this.config.defaultFailureCode;
		const latencyMs =
			asNonNegativeNumber(metadata, "mockLatencyMs") ??
			this.config.defaultLatencyMs;

		const providerRef = `${request.providerCode}_${request.transferType}_${this.config.randomUUID()}`;
		const createdAt = this.config.now();
		const status: MockTransferStatus =
			mode === "immediate" ? "confirmed" : "pending";

		this.state.set(providerRef, {
			amount: request.amount,
			createdAt,
			failureCode,
			latencyMs,
			mode,
			providerCode: request.providerCode,
			providerRef,
			status,
		});

		if (this.config.autoDispatchModeWebhook && mode !== "immediate") {
			await this.autoDispatchModeWebhook(providerRef, mode);
		}

		return {
			providerRef,
			status: mode === "immediate" ? "confirmed" : "pending",
		};
	}

	async confirm(providerRef: string): Promise<ConfirmResult> {
		const transfer = this.requireTransfer(providerRef);

		if (transfer.status === "failed") {
			throw new Error(`Cannot confirm failed transfer "${providerRef}".`);
		}
		if (transfer.status === "reversed") {
			throw new Error(`Cannot confirm reversed transfer "${providerRef}".`);
		}
		if (transfer.status === "cancelled") {
			throw new Error(`Cannot confirm cancelled transfer "${providerRef}".`);
		}

		transfer.status = "confirmed";
		return {
			providerRef,
			settledAmount: transfer.amount,
			settledAt: this.config.now(),
			providerData: {
				mode: transfer.mode,
				providerCode: transfer.providerCode,
			},
		};
	}

	async cancel(providerRef: string): Promise<CancelResult> {
		const transfer = this.state.get(providerRef);
		if (!transfer) {
			return { cancelled: false };
		}

		if (transfer.status !== "pending") {
			return { cancelled: false };
		}

		transfer.status = "cancelled";
		return { cancelled: true };
	}

	async getStatus(providerRef: string): Promise<StatusResult> {
		const transfer = this.state.get(providerRef);
		if (!transfer) {
			return {
				status: "unknown",
				providerData: { providerRef },
			};
		}

		return {
			status: transfer.status,
			providerData: {
				failureCode:
					transfer.status === "failed" ? transfer.failureCode : undefined,
				mode: transfer.mode,
				providerCode: transfer.providerCode,
				providerRef: transfer.providerRef,
			},
		};
	}

	async simulateWebhook(
		providerRef: string,
		event: MockWebhookEvent
	): Promise<MockWebhookPayload> {
		const transfer = this.requireTransfer(providerRef);
		const now = this.config.now();
		const eventId = `mock_evt_${this.config.randomUUID()}`;

		if (transfer.latencyMs > 0) {
			await this.config.sleep(transfer.latencyMs);
		}

		let reason: string | undefined;
		switch (event) {
			case "confirmed":
				transfer.status = "confirmed";
				break;
			case "failed":
				transfer.status = "failed";
				reason = transfer.failureCode;
				break;
			case "reversed":
				transfer.status = "reversed";
				reason = "Simulated reversal";
				break;
			default:
				assertNever(event);
		}

		const status = toWebhookStatus(event);
		const timestamp = new Date(now).toISOString();
		const rawEvent = {
			amount: transfer.amount,
			event_id: eventId,
			reason,
			status,
			timestamp,
			transaction_id: providerRef,
		};

		const payload: MockWebhookPayload = {
			amount: transfer.amount,
			eventId,
			mappedTransferEvent: toMappedTransferEvent(event),
			provider: transfer.providerCode,
			providerEventId: eventId,
			rawBody: JSON.stringify(rawEvent),
			reason,
			status,
			timestamp,
			transactionId: providerRef,
		};

		await this.config.dispatchWebhook?.(payload);
		return payload;
	}

	getInternalState(providerRef: string): MockTransferState | undefined {
		const transfer = this.state.get(providerRef);
		return transfer ? { ...transfer } : undefined;
	}

	reset(): void {
		this.state.clear();
	}

	private async autoDispatchModeWebhook(
		providerRef: string,
		mode: MockMode
	): Promise<void> {
		if (mode === "async") {
			return;
		}
		if (mode === "fail") {
			await this.simulateWebhook(providerRef, "failed");
			return;
		}

		// reversal mode: confirm first, then emit reversal
		await this.simulateWebhook(providerRef, "confirmed");
		await this.simulateWebhook(providerRef, "reversed");
	}

	private requireTransfer(providerRef: string): MockTransferState {
		const transfer = this.state.get(providerRef);
		if (!transfer) {
			throw new Error(
				`MockTransferProvider: unknown providerRef "${providerRef}".`
			);
		}
		return transfer;
	}
}
