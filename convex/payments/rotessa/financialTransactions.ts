import type {
	NormalizedExternalCollectionOccurrenceEvent,
	RotessaTransactionReportRow,
} from "../recurringSchedules/types";
import type { InitiateResult, StatusResult } from "../transfers/interface";
import type { ProviderCode } from "../transfers/types";

function parseRotessaTimestamp(value: string | null | undefined) {
	if (!value) {
		return undefined;
	}
	const parsed = Date.parse(value);
	return Number.isNaN(parsed) ? undefined : parsed;
}

function parseRotessaAmountToCents(amount: string) {
	const parsed = Number(amount);
	if (!Number.isFinite(parsed)) {
		throw new Error(`Rotessa invalid provider amount: "${amount}"`);
	}
	return Math.round((parsed + Number.EPSILON) * 100);
}

export function mapRotessaFinancialStatusToTransferEvent(
	status: RotessaTransactionReportRow["status"]
):
	| NormalizedExternalCollectionOccurrenceEvent["mappedTransferEvent"]
	| undefined {
	switch (status) {
		case "Future":
		case "Pending":
			return "PROCESSING_UPDATE";
		case "Approved":
			return "FUNDS_SETTLED";
		case "Declined":
			return "TRANSFER_FAILED";
		case "Chargeback":
			return "TRANSFER_REVERSED";
		default:
			return undefined;
	}
}

export function mapRotessaFinancialStatusToTransferStatus(
	status: RotessaTransactionReportRow["status"]
): StatusResult["status"] {
	switch (status) {
		case "Future":
			return "pending";
		case "Pending":
			return "processing";
		case "Approved":
			return "confirmed";
		case "Declined":
			return "failed";
		case "Chargeback":
			return "reversed";
		default:
			return "pending";
	}
}

export function buildRotessaTransferStatusResult(
	row: RotessaTransactionReportRow
): StatusResult {
	return {
		status: mapRotessaFinancialStatusToTransferStatus(row.status),
		providerData: {
			rotessaFinancialTransactionId: row.id,
			rotessaScheduleId: row.transaction_schedule_id,
			rotessaTransactionNumber: row.transaction_number,
			rotessaTransactionStatus: row.status,
			statusReason: row.status_reason,
			processDate: row.process_date,
			settlementDate: row.settlement_date,
			earliestApprovalDate: row.earliest_approval_date,
		},
	};
}

export function buildRotessaProviderInitiateUnsupported(): InitiateResult {
	throw new Error(
		"pad_rotessa does not support app-owned monthly initiateTransfer in v1. Use the recurring schedule activation flow instead."
	);
}

export function buildNormalizedOccurrenceFromRotessaRow(args: {
	externalScheduleRef: string;
	providerCode?: ProviderCode;
	receivedVia: "poller" | "webhook";
	row: RotessaTransactionReportRow;
}): NormalizedExternalCollectionOccurrenceEvent | null {
	const mappedTransferEvent = mapRotessaFinancialStatusToTransferEvent(
		args.row.status
	);
	if (!mappedTransferEvent) {
		return null;
	}

	return {
		amount: parseRotessaAmountToCents(args.row.amount),
		externalOccurrenceRef: `rotessa_financial_transaction:${args.row.id}`,
		externalScheduleRef: args.externalScheduleRef,
		mappedTransferEvent,
		occurredAt:
			parseRotessaTimestamp(args.row.updated_at) ??
			parseRotessaTimestamp(args.row.settlement_date) ??
			parseRotessaTimestamp(args.row.created_at),
		providerCode: (args.providerCode ?? "pad_rotessa") as Extract<
			ProviderCode,
			"pad_rotessa"
		>,
		providerData: {
			rotessaFinancialTransactionId: args.row.id,
			rotessaScheduleId: args.row.transaction_schedule_id,
			rotessaTransactionNumber: args.row.transaction_number,
			rotessaTransactionStatus: args.row.status,
			statusReason: args.row.status_reason,
			processDate: args.row.process_date,
			settlementDate: args.row.settlement_date,
			earliestApprovalDate: args.row.earliest_approval_date,
		},
		providerRef: args.row.transaction_number ?? String(args.row.id),
		rawProviderReason: args.row.status_reason ?? undefined,
		rawProviderStatus: args.row.status,
		receivedVia: args.receivedVia,
		scheduledDate: args.row.process_date,
	};
}
