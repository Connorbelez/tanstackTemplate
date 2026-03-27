/**
 * PaymentMethodAdapter — bridges existing PaymentMethod implementations
 * to the TransferProvider interface.
 *
 * Temporary adapter for Phase M2a migration. Once all consumers are migrated
 * to TransferProvider directly, this adapter can be removed.
 */

import type { InitiateParams, PaymentMethod } from "../../methods/interface";
import type {
	CancelResult,
	ConfirmResult,
	InitiateResult,
	StatusResult,
	TransferProvider,
	TransferRequestInput,
} from "../interface";

export class PaymentMethodAdapter implements TransferProvider {
	private readonly inner: PaymentMethod;

	constructor(inner: PaymentMethod) {
		this.inner = inner;
	}

	async initiate(request: TransferRequestInput): Promise<InitiateResult> {
		if (request.direction !== "inbound") {
			throw new Error(
				"PaymentMethodAdapter only supports inbound transfers. " +
					`Received direction="${request.direction}". ` +
					"Use a native TransferProvider for outbound transfers."
			);
		}

		if (request.counterpartyType !== "borrower") {
			throw new Error(
				"PaymentMethodAdapter only supports borrower counterparties. " +
					`Received counterpartyType="${request.counterpartyType}". ` +
					"Use a native TransferProvider for non-borrower counterparties."
			);
		}

		const params: InitiateParams = {
			amount: request.amount,
			borrowerId: request.counterpartyId,
			mortgageId: String(request.references.mortgageId ?? ""),
			planEntryId: String(request.references.planEntryId ?? ""),
			method: request.providerCode,
			metadata: request.metadata,
		};
		return this.inner.initiate(params);
	}

	async confirm(ref: string): Promise<ConfirmResult> {
		return this.inner.confirm(ref);
	}

	async cancel(ref: string): Promise<CancelResult> {
		return this.inner.cancel(ref);
	}

	async getStatus(ref: string): Promise<StatusResult> {
		return this.inner.getStatus(ref);
	}
}
