/**
 * ManualPaymentMethod — immediate confirmation, no external API.
 *
 * Used for manually-recorded payments (e.g. cash, cheque, bank draft)
 * where the operator confirms receipt at the time of entry.
 */

import type {
	CancelResult,
	ConfirmResult,
	InitiateParams,
	InitiateResult,
	PaymentMethod,
	StatusResult,
} from "./interface";

export class ManualPaymentMethod implements PaymentMethod {
	async initiate(params: InitiateParams): Promise<InitiateResult> {
		return {
			providerRef: `manual_${params.planEntryId}_${Date.now()}`,
			status: "confirmed",
		};
	}

	async confirm(ref: string): Promise<ConfirmResult> {
		// Manual payments are confirmed at initiation — this is a no-op lookup.
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
