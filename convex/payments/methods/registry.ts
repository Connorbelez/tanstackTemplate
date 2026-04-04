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
import {
	isLegacyPaymentMethodCode,
	LEGACY_PAYMENT_METHOD_CODES,
	type LegacyPaymentMethodCode,
	type PaymentMethod,
} from "./interface";
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
	method: LegacyPaymentMethodCode,
	scheduleSettlement: ScheduleSettlementFn,
	mockPADConfig?: Partial<MockPADConfig>
): PaymentMethod {
	switch (method) {
		case "manual":
			return new ManualPaymentMethod();
		case "mock_pad":
			return new MockPADMethod(scheduleSettlement, mockPADConfig);
		default: {
			const exhaustiveCheck: never = method;
			void exhaustiveCheck;
			throw new ConvexError("Unknown legacy payment method");
		}
	}
}

function assertLegacyPaymentMethodCode(
	method: string
): asserts method is LegacyPaymentMethodCode {
	if (isLegacyPaymentMethodCode(method)) {
		return;
	}

	throw new ConvexError(
		`Unknown legacy payment method: "${method}". ` +
			`PaymentMethod compatibility supports only ${LEGACY_PAYMENT_METHOD_CODES.map((code) => `"${code}"`).join(", ")}. ` +
			"Use TransferProvider and the transfer-domain provider registry for new inbound work."
	);
}

// ---------------------------------------------------------------------------
// Public API — simple lookup
// ---------------------------------------------------------------------------

/**
 * Quick lookup for payment methods that don't need a scheduler (e.g. manual).
 * If a method tries to schedule, it throws at call-time with a clear message.
 *
 * @deprecated Compatibility-only registry. New inbound provider resolution must
 * use the transfer-domain provider registry.
 */
export function getPaymentMethod(method: string): PaymentMethod {
	assertLegacyPaymentMethodCode(method);
	return buildMethod(method, noopScheduler);
}

// ---------------------------------------------------------------------------
// Public API — full DI
// ---------------------------------------------------------------------------

/**
 * Creates a registry function pre-wired with a scheduler and optional config.
 * Use this in production Convex actions/mutations where `ctx.scheduler` is available.
 *
 * @deprecated Compatibility-only registry. New inbound provider resolution must
 * use the transfer-domain provider registry.
 */
export function createPaymentMethodRegistry(
	config: PaymentMethodRegistryConfig
): (method: string) => PaymentMethod {
	return (method: string) => {
		assertLegacyPaymentMethodCode(method);
		return buildMethod(method, config.scheduleSettlement, config.mockPADConfig);
	};
}
