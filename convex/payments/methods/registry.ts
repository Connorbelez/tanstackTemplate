/**
 * Payment method registry — legacy compatibility lookup for `PaymentMethod`.
 *
 * Prefer the transfer-domain provider registry for new inbound work:
 * `convex/payments/transfers/providers/registry.ts`
 *
 * This registry remains in place so older collection flows can keep running
 * while the repo converges on `TransferProvider` as the canonical contract.
 *
 * Simple tier:
 *   `getPaymentMethod("manual")` — returns ManualPaymentMethod with a no-op
 *   scheduler. Safe for methods that never schedule; throws at runtime if
 *   MockPADMethod attempts to schedule.
 *
 * Full DI tier:
 *   `createPaymentMethodRegistry({ scheduleSettlement })` — returns a lookup
 *   function pre-wired with the caller's scheduler. Required for MockPADMethod
 *   in production.
 */

import { ConvexError } from "convex/values";
import type { PaymentMethod } from "./interface";
import { ManualPaymentMethod } from "./manual";
import {
	type MockPADConfig,
	MockPADMethod,
	type ScheduleSettlementFn,
} from "./mockPAD";

// ---------------------------------------------------------------------------
// DI config
// ---------------------------------------------------------------------------

export interface PaymentMethodRegistryConfig {
	mockPADConfig?: Partial<MockPADConfig>;
	scheduleSettlement: ScheduleSettlementFn;
}

// ---------------------------------------------------------------------------
// No-op scheduler — explodes if actually invoked
// ---------------------------------------------------------------------------

const noopScheduler: ScheduleSettlementFn = async () => {
	throw new ConvexError(
		"Cannot schedule settlement without a scheduler. " +
			"Use createPaymentMethodRegistry() to inject one."
	);
};

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

function buildMethod(
	method: string,
	scheduleSettlement: ScheduleSettlementFn,
	mockPADConfig?: Partial<MockPADConfig>
): PaymentMethod {
	switch (method) {
		case "manual":
			return new ManualPaymentMethod();
		case "mock_pad":
			return new MockPADMethod(scheduleSettlement, mockPADConfig);
		default:
			throw new ConvexError(`Unknown payment method: "${method}"`);
	}
}

// ---------------------------------------------------------------------------
// Public API — simple lookup
// ---------------------------------------------------------------------------

/**
 * Quick lookup for payment methods that don't need a scheduler (e.g. manual).
 * If a method tries to schedule, it throws at call-time with a clear message.
 */
export function getPaymentMethod(method: string): PaymentMethod {
	return buildMethod(method, noopScheduler);
}

// ---------------------------------------------------------------------------
// Public API — full DI
// ---------------------------------------------------------------------------

/**
 * Creates a registry function pre-wired with a scheduler and optional config.
 * Use this in production Convex actions/mutations where `ctx.scheduler` is available.
 */
export function createPaymentMethodRegistry(
	config: PaymentMethodRegistryConfig
): (method: string) => PaymentMethod {
	return (method: string) =>
		buildMethod(method, config.scheduleSettlement, config.mockPADConfig);
}
