/**
 * ManualTransferProvider — immediate confirmation, no external API.
 *
 * Used for manually-recorded transfers (both inbound and outbound) where the
 * operator confirms settlement at the time of entry.
 *
 * This is the canonical manual provider implementation for the transfer
 * domain. It mirrors the existing ManualPaymentMethod pattern while keeping
 * new work on the `TransferProvider` boundary.
 */

import type {
	CancelResult,
	ConfirmResult,
	InitiateResult,
	StatusResult,
	TransferProvider,
	TransferRequestInput,
} from "../interface";
import { OUTBOUND_TRANSFER_TYPES } from "../types";

function isOutboundManualProviderRef(ref: string) {
	return OUTBOUND_TRANSFER_TYPES.some((transferType) =>
		ref.startsWith(`manual_${transferType}_`)
	);
}

export class ManualTransferProvider implements TransferProvider {
	async initiate(request: TransferRequestInput): Promise<InitiateResult> {
		const settledAt = request.manualSettlement?.settlementOccurredAt;
		const providerData = request.manualSettlement
			? {
					method: "manual",
					manualSettlement: request.manualSettlement,
				}
			: { method: "manual" };
		return {
			providerRef: `manual_${request.transferType}_${crypto.randomUUID()}`,
			// Inbound manual entries assert receipt at initiation time. Outbound
			// manual entries require a separate admin confirmation step after the
			// transfer is initiated.
			status: request.direction === "outbound" ? "pending" : "confirmed",
			providerData,
			settledAt,
		};
	}

	async confirm(ref: string): Promise<ConfirmResult> {
		// Manual transfers are confirmed at initiation — this is a no-op lookup.
		return {
			providerRef: ref,
			settledAt: Date.now(),
			providerData: { method: "manual" },
		};
	}

	async cancel(_ref: string): Promise<CancelResult> {
		return { cancelled: true };
	}

	async getStatus(ref: string): Promise<StatusResult> {
		return {
			status: isOutboundManualProviderRef(ref) ? "pending" : "confirmed",
			providerData: { providerRef: ref, method: "manual" },
		};
	}
}
