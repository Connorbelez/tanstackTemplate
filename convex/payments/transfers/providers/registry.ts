/**
 * Transfer provider registry — DI factory for provider resolution.
 *
 * Resolves a TransferProvider by canonical provider code.
 * Phase 1: only "manual" is supported. Others throw.
 */

import type { TransferProvider } from "../interface";
import type { ProviderCode } from "../types";
import { ManualTransferProvider } from "./manual";

/** Resolves a TransferProvider by canonical provider code.
 *  Phase 1: only "manual" is supported. Others throw.
 */
export function getTransferProvider(
	providerCode: ProviderCode
): TransferProvider {
	switch (providerCode) {
		case "manual":
			return new ManualTransferProvider();
		default:
			throw new Error(
				`Transfer provider "${providerCode}" is not yet implemented. Phase 1 supports only "manual".`
			);
	}
}
