/**
 * Transfer provider registry — DI factory for provider resolution.
 *
 * Resolves a TransferProvider by canonical provider code.
 * Phase 1: manual + mock providers are supported. Real providers throw.
 */

import type { TransferProvider } from "../interface";
import { areMockTransferProvidersEnabled } from "../mockProviders";
import type { ProviderCode } from "../types";
import { ManualTransferProvider } from "./manual";
import { ManualReviewTransferProvider } from "./manualReview";
import { MockTransferProvider } from "./mock";
import { RotessaTransferProvider } from "./rotessa";

/** Resolves a TransferProvider by canonical provider code.
 *  Phase 1: manual + mock providers are supported. Others throw.
 */
export function getTransferProvider(
	providerCode: ProviderCode
): TransferProvider {
	switch (providerCode) {
		case "manual":
			return new ManualTransferProvider();
		case "manual_review":
			return new ManualReviewTransferProvider();
		case "mock_pad":
		case "mock_eft":
			if (!areMockTransferProvidersEnabled()) {
				throw new Error(
					'Mock transfer providers are disabled by default. Set ENABLE_MOCK_PROVIDERS="true" to opt in.'
				);
			}
			return new MockTransferProvider();
		case "pad_rotessa":
			return new RotessaTransferProvider();
		default:
			throw new Error(
				`Transfer provider "${providerCode}" is not yet implemented. ` +
					'Phase 1 supports "manual", "manual_review", "mock_pad", "mock_eft", and read-only "pad_rotessa" status retrieval.'
			);
	}
}
