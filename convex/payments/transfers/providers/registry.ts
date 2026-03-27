/**
 * Transfer provider registry — DI factory for provider resolution.
 *
 * Resolves a TransferProvider by canonical provider code.
 * Phase 1: manual + mock providers are supported. Real providers throw.
 */

import type { TransferProvider } from "../interface";
import type { ProviderCode } from "../types";
import { ManualTransferProvider } from "./manual";
import { MockTransferProvider } from "./mock";

function areMockProvidersEnabled(): boolean {
	if (process.env.NODE_ENV !== "production") {
		return true;
	}
	return process.env.ENABLE_MOCK_PROVIDERS === "true";
}

/** Resolves a TransferProvider by canonical provider code.
 *  Phase 1: manual + mock providers are supported. Others throw.
 */
export function getTransferProvider(
	providerCode: ProviderCode
): TransferProvider {
	switch (providerCode) {
		case "manual":
			return new ManualTransferProvider();
		case "mock_pad":
		case "mock_eft":
			if (!areMockProvidersEnabled()) {
				throw new Error(
					'Mock transfer providers are disabled in production. Set ENABLE_MOCK_PROVIDERS="true" to opt in.'
				);
			}
			return new MockTransferProvider();
		default:
			throw new Error(
				`Transfer provider "${providerCode}" is not yet implemented. ` +
					'Phase 1 supports "manual", "mock_pad", and "mock_eft".'
			);
	}
}
