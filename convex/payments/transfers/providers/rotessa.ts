import { RotessaApiClient } from "../../rotessa/api";
import { buildRotessaTransferStatusResult } from "../../rotessa/financialTransactions";
import type {
	CancelResult,
	ConfirmResult,
	InitiateResult,
	StatusResult,
	TransferProvider,
	TransferRequestInput,
} from "../interface";

export class RotessaTransferProvider implements TransferProvider {
	private readonly apiClient: RotessaApiClient;

	constructor(apiClient = new RotessaApiClient()) {
		this.apiClient = apiClient;
	}

	async cancel(_providerRef: string): Promise<CancelResult> {
		throw new Error(
			"pad_rotessa transfer cancellation is not implemented in v1."
		);
	}

	async confirm(_providerRef: string): Promise<ConfirmResult> {
		throw new Error(
			"pad_rotessa manual confirmation is not implemented in v1."
		);
	}

	async getStatus(providerRef: string): Promise<StatusResult> {
		const today = new Date();
		const startDate = new Date(today);
		startDate.setDate(startDate.getDate() - 14);
		const endDate = new Date(today);
		endDate.setDate(endDate.getDate() + 3);

		const matched = await this.apiClient.findTransactionReportRow({
			startDate: startDate.toISOString().slice(0, 10),
			endDate: endDate.toISOString().slice(0, 10),
			providerRef,
		});
		if (!matched) {
			throw new Error(
				`Rotessa transaction "${providerRef}" was not found in the transaction report window.`
			);
		}

		return buildRotessaTransferStatusResult(matched);
	}

	async initiate(_request: TransferRequestInput): Promise<InitiateResult> {
		throw new Error(
			"pad_rotessa does not support app-owned monthly initiateTransfer in v1. Use the recurring schedule activation flow instead."
		);
	}
}
