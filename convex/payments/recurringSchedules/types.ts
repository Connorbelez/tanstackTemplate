import type { Id } from "../../_generated/dataModel";
import type { ProviderCode } from "../transfers/types";

export const COLLECTION_EXECUTION_MODES = [
	"app_owned",
	"provider_managed",
] as const;

export type CollectionExecutionMode =
	(typeof COLLECTION_EXECUTION_MODES)[number];

export const EXTERNAL_COLLECTION_SCHEDULE_STATUSES = [
	"draft",
	"activating",
	"activation_failed",
	"active",
	"sync_error",
	"cancelling",
	"cancelled",
	"completed",
] as const;

export type ExternalCollectionScheduleStatus =
	(typeof EXTERNAL_COLLECTION_SCHEDULE_STATUSES)[number];

export const EXTERNAL_OCCURRENCE_CHANNELS = ["webhook", "poller"] as const;

export type ExternalOccurrenceChannel =
	(typeof EXTERNAL_OCCURRENCE_CHANNELS)[number];

export const ROTESSA_FINANCIAL_TRANSACTION_STATUSES = [
	"Future",
	"Pending",
	"Approved",
	"Declined",
	"Chargeback",
] as const;

export type RotessaFinancialTransactionStatus =
	(typeof ROTESSA_FINANCIAL_TRANSACTION_STATUSES)[number];

export interface RecurringCollectionScheduleInput {
	amount: number;
	bankAccountId: Id<"bankAccounts">;
	comment?: string;
	customerId?: number;
	customIdentifier?: string;
	frequency:
		| "Once"
		| "Weekly"
		| "Every Other Week"
		| "Monthly"
		| "Every Other Month"
		| "Quarterly"
		| "Semi-Annually"
		| "Yearly";
	installments?: number;
	processDate: string;
	providerCode: Extract<ProviderCode, "pad_rotessa">;
}

export interface NormalizedExternalCollectionOccurrenceEvent {
	amount?: number;
	externalOccurrenceOrdinal?: number;
	externalOccurrenceRef?: string;
	externalScheduleRef: string;
	mappedTransferEvent:
		| "PROCESSING_UPDATE"
		| "FUNDS_SETTLED"
		| "TRANSFER_FAILED"
		| "TRANSFER_REVERSED";
	occurredAt?: number;
	providerCode: Extract<ProviderCode, "pad_rotessa">;
	providerData?: Record<string, unknown>;
	providerRef?: string;
	rawProviderReason?: string;
	rawProviderStatus: string;
	receivedVia: ExternalOccurrenceChannel;
	scheduledDate?: string;
}

export interface RecurringCollectionScheduleProvider {
	cancelSchedule(externalScheduleRef: string): Promise<{
		cancelled: boolean;
		providerData?: Record<string, unknown>;
	}>;
	createSchedule(input: RecurringCollectionScheduleInput): Promise<{
		externalScheduleRef: string;
		providerData?: Record<string, unknown>;
		status: "pending" | "active";
	}>;
	getScheduleStatus(externalScheduleRef: string): Promise<{
		providerData?: Record<string, unknown>;
		status: string;
	}>;
	pollOccurrenceUpdates(args: {
		endDate?: string;
		externalScheduleRef: string;
		maxEvents?: number;
		sinceCursor?: string;
		startDate: string;
	}): Promise<{
		events: NormalizedExternalCollectionOccurrenceEvent[];
		nextCursor?: string;
		providerData?: Record<string, unknown>;
	}>;
}

export interface RotessaTransactionReportRow {
	account_number: string | number | null;
	amount: string;
	comment: string | null;
	created_at: string;
	custom_identifier: string | null;
	customer_id: number;
	earliest_approval_date: string | null;
	id: number;
	institution_number: string | null;
	process_date: string;
	settlement_date: string | null;
	status: RotessaFinancialTransactionStatus;
	status_reason: string | null;
	transaction_number: string | null;
	transaction_schedule_id: number;
	transit_number: string | null;
	updated_at: string | null;
}
