/**
 * MockPADMethod — simulated Pre-Authorized Debit with configurable delay & failure.
 *
 * Initiating a payment returns `{ status: "pending" }` and schedules a
 * delayed settlement (or failure) via an injected ScheduleSettlementFn.
 * This keeps the class decoupled from Convex's ctx.scheduler — in tests
 * the scheduler is a `vi.fn()` spy; in production the caller passes
 * `ctx.scheduler.runAfter`.
 */

import type {
	CancelResult,
	ConfirmResult,
	InitiateParams,
	InitiateResult,
	PaymentMethod,
	StatusResult,
} from "./interface";

// ---------------------------------------------------------------------------
// Config & DI types
// ---------------------------------------------------------------------------

export interface MockPADConfig {
	/** Delay before settlement callback fires, in milliseconds. */
	delayMs: number;
	/** Probability of failure (0 = never fail, 1 = always fail). */
	failureRate: number;
}

export const DEFAULT_MOCK_PAD_CONFIG: MockPADConfig = {
	delayMs: 2000,
	failureRate: 0.1,
};

/**
 * Injected scheduler function — abstracts away ctx.scheduler.runAfter
 * so MockPADMethod can be instantiated without a Convex context.
 */
export type ScheduleSettlementFn = (
	delayMs: number,
	params: {
		providerRef: string;
		shouldFail: boolean;
		planEntryId: string;
	}
) => Promise<void>;

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class MockPADMethod implements PaymentMethod {
	private readonly config: MockPADConfig;
	private readonly scheduleSettlement: ScheduleSettlementFn;

	constructor(
		scheduleSettlement: ScheduleSettlementFn,
		config: Partial<MockPADConfig> = {}
	) {
		this.scheduleSettlement = scheduleSettlement;
		this.config = { ...DEFAULT_MOCK_PAD_CONFIG, ...config };
	}

	async initiate(params: InitiateParams): Promise<InitiateResult> {
		const providerRef = `mock_pad_${params.planEntryId}_${Date.now()}`;
		const shouldFail = Math.random() < this.config.failureRate;

		await this.scheduleSettlement(this.config.delayMs, {
			providerRef,
			shouldFail,
			planEntryId: params.planEntryId,
		});

		return {
			providerRef,
			status: "pending",
		};
	}

	async confirm(ref: string): Promise<ConfirmResult> {
		// In a real PAD provider this would poll the processor.
		// The mock simply echoes back — actual settlement arrives via the scheduler.
		return {
			providerRef: ref,
			settledAt: Date.now(),
		};
	}

	async cancel(_ref: string): Promise<CancelResult> {
		// Mock: cancellation always succeeds for pending items.
		return {
			cancelled: true,
		};
	}

	async getStatus(ref: string): Promise<StatusResult> {
		return {
			status: "pending",
			providerData: { providerRef: ref, method: "mock_pad" },
		};
	}
}
