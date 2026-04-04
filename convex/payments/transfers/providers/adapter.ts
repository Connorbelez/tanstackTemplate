/**
 * PaymentMethodAdapter — temporary bridge from legacy `PaymentMethod`
 * implementations to the canonical `TransferProvider` contract.
 *
 * This adapter exists to preserve compatibility during migration. New inbound
 * provider work should target `TransferProvider` directly rather than adding
 * fresh `PaymentMethod` implementations.
 */

import {
	type InitiateParams,
	isLegacyPaymentMethodCode,
	LEGACY_PAYMENT_METHOD_CODES,
	type PaymentMethod,
} from "../../methods/interface";
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

		if (!isLegacyPaymentMethodCode(request.providerCode)) {
			throw new Error(
				"PaymentMethodAdapter only supports legacy compatibility provider codes. " +
					`Received providerCode="${request.providerCode}". ` +
					`Supported codes: ${LEGACY_PAYMENT_METHOD_CODES.join(", ")}. ` +
					"Use a native TransferProvider for canonical provider codes."
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
