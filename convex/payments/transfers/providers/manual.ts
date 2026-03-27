/**
 * ManualTransferProvider — immediate confirmation, no external API.
 *
 * Used for manually-recorded transfers (both inbound and outbound) where the
 * operator confirms settlement at the time of entry.
 *
 * Mirrors the existing ManualPaymentMethod pattern but uses the
 * TransferProvider interface for the transfer domain.
 */

import type {
	CancelResult,
	ConfirmResult,
	InitiateResult,
	StatusResult,
	TransferProvider,
	TransferRequestInput,
} from "../interface";

export class ManualTransferProvider implements TransferProvider {
	async initiate(request: TransferRequestInput): Promise<InitiateResult> {
		// Generate provider ref using transfer type + UUID for uniqueness
		return {
			providerRef: `manual_${request.transferType}_${crypto.randomUUID()}`,
			status: "confirmed", // Immediate confirmation — operator asserts settlement at entry time
		};
	}

	async confirm(ref: string): Promise<ConfirmResult> {
		// Manual transfers are confirmed at initiation — this is a no-op lookup.
		return {
			providerRef: ref,
			settledAt: Date.now(),
		};
	}

	async cancel(_ref: string): Promise<CancelResult> {
		return { cancelled: true };
	}

	async getStatus(ref: string): Promise<StatusResult> {
		return {
			status: "confirmed",
			providerData: { providerRef: ref, method: "manual" },
		};
	}
}
