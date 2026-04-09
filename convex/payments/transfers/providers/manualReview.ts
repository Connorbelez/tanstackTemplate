import type {
	CancelResult,
	ConfirmResult,
	InitiateResult,
	StatusResult,
	TransferProvider,
	TransferRequestInput,
} from "../interface";

export class ManualReviewTransferProvider implements TransferProvider {
	async initiate(request: TransferRequestInput): Promise<InitiateResult> {
		return {
			providerRef: `manual_review_${request.transferType}_${crypto.randomUUID()}`,
			status: "pending",
		};
	}

	async confirm(ref: string): Promise<ConfirmResult> {
		return {
			providerRef: ref,
			providerData: { method: "manual_review" },
			settledAt: Date.now(),
		};
	}

	async cancel(_ref: string): Promise<CancelResult> {
		return { cancelled: true };
	}

	async getStatus(ref: string): Promise<StatusResult> {
		return {
			status: "pending",
			providerData: { providerRef: ref, method: "manual_review" },
		};
	}
}
