export type RotessaHttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

export const ROTESSA_BASE_URLS = {
	production: "https://api.rotessa.com/v1",
	sandbox: "https://sandbox-api.rotessa.com/v1",
} as const;

export type RotessaBaseUrlKey = keyof typeof ROTESSA_BASE_URLS;

export const ROTESSA_CUSTOMER_TYPES = ["Personal", "Business"] as const;
export type RotessaCustomerType = (typeof ROTESSA_CUSTOMER_TYPES)[number];

export const ROTESSA_BANK_ACCOUNT_TYPES = ["Savings", "Checking"] as const;
export type RotessaBankAccountType =
	(typeof ROTESSA_BANK_ACCOUNT_TYPES)[number];

export const ROTESSA_AUTHORIZATION_TYPES = ["In Person", "Online"] as const;
export type RotessaAuthorizationType =
	(typeof ROTESSA_AUTHORIZATION_TYPES)[number];

export const ROTESSA_SCHEDULE_FREQUENCIES = [
	"Once",
	"Weekly",
	"Every Other Week",
	"Monthly",
	"Every Other Month",
	"Quarterly",
	"Semi-Annually",
	"Yearly",
] as const;
export type RotessaScheduleFrequency =
	(typeof ROTESSA_SCHEDULE_FREQUENCIES)[number];

export const ROTESSA_TRANSACTION_STATUSES = [
	"Future",
	"Pending",
	"Approved",
	"Declined",
	"Chargeback",
] as const;
export type RotessaTransactionStatus =
	(typeof ROTESSA_TRANSACTION_STATUSES)[number];

export const ROTESSA_STATUS_REASONS = [
	"NSF",
	"Payment Stopped/Recalled",
	"Edit Reject",
	"Funds Not Cleared",
	"Account Closed",
	"Invalid/Incorrect Account No.",
	"Account Not Found",
	"Account Frozen",
	"Agreement Revoked",
	"No Debit Allowed",
] as const;
export type RotessaStatusReason = (typeof ROTESSA_STATUS_REASONS)[number];

export const ROTESSA_REPORT_STATUS_FILTERS = [
	"All",
	"Pending",
	"Approved",
	"Declined",
	"Chargeback",
] as const;
export type RotessaReportStatusFilter =
	(typeof ROTESSA_REPORT_STATUS_FILTERS)[number];

export interface RotessaAddress {
	address_1?: string | null;
	address_2?: string | null;
	city?: string | null;
	id?: number;
	postal_code?: string | null;
	province_code?: string | null;
}

export type RotessaAddressInput = Omit<RotessaAddress, "id">;

export interface RotessaCustomerListItem {
	active: boolean;
	bank_name: string | null;
	created_at: string;
	custom_identifier: string | null;
	customer_type: RotessaCustomerType | null;
	email: string;
	home_phone: string | null;
	id: number;
	identifier: string | null;
	name: string;
	phone: string | null;
	updated_at: string;
}

export interface RotessaFinancialTransaction {
	account_number?: string | number | null;
	amount: string;
	bank_name?: string | null;
	id: number;
	institution_number?: string | number | null;
	process_date: string;
	status: RotessaTransactionStatus;
	status_reason: RotessaStatusReason | null;
	transaction_schedule_id: number;
	transit_number?: string | number | null;
}

export interface RotessaTransactionSchedule {
	amount: string;
	comment: string | null;
	created_at: string;
	financial_transactions?: RotessaFinancialTransaction[];
	frequency: RotessaScheduleFrequency;
	id: number;
	installments: number | null;
	next_process_date?: string | null;
	process_date: string;
	updated_at: string;
}

export type RotessaCustomerDetail = RotessaCustomerListItem & {
	account_number: string | null;
	address: RotessaAddress | null;
	authorization_type: RotessaAuthorizationType | null;
	bank_account_type: RotessaBankAccountType | null;
	institution_number: string | null;
	routing_number: string | null;
	transit_number: string | null;
	transaction_schedules: RotessaTransactionSchedule[];
	financial_transactions: RotessaFinancialTransaction[];
};

export interface RotessaCustomerCreateBase {
	address?: RotessaAddressInput;
	authorization_type: RotessaAuthorizationType;
	bank_name?: string | null;
	custom_identifier?: string | null;
	customer_type?: RotessaCustomerType;
	email: string;
	home_phone?: string | null;
	name: string;
	phone?: string | null;
}

interface RotessaCustomerCanadaBank {
	account_number: string;
	bank_account_type?: RotessaBankAccountType;
	institution_number: string;
	routing_number?: string;
	transit_number: string;
}

interface RotessaCustomerUsBank {
	account_number: string;
	bank_account_type: RotessaBankAccountType;
	institution_number?: string;
	routing_number: string;
	transit_number?: string;
}

export type RotessaCustomerCreate = RotessaCustomerCreateBase &
	(RotessaCustomerCanadaBank | RotessaCustomerUsBank);

export type RotessaCustomerUpdate = Partial<
	RotessaCustomerCreateBase & RotessaCustomerCanadaBank & RotessaCustomerUsBank
>;

export type RotessaCustomerUpdateViaPost = RotessaCustomerUpdate & {
	id: number;
};

export interface RotessaTransactionScheduleCreateBase {
	amount: number | string;
	comment?: string | null;
	frequency: RotessaScheduleFrequency;
	installments?: number | null;
	process_date: string;
}

export type RotessaTransactionScheduleCreateWithCustomerId =
	RotessaTransactionScheduleCreateBase & {
		customer_id: number;
	};

export type RotessaTransactionScheduleCreateWithCustomIdentifier =
	RotessaTransactionScheduleCreateBase & {
		custom_identifier: string;
	};

export type RotessaTransactionScheduleCreate =
	| RotessaTransactionScheduleCreateWithCustomerId
	| RotessaTransactionScheduleCreateWithCustomIdentifier;

export interface RotessaTransactionScheduleUpdate {
	amount?: number | string;
	comment?: string | null;
}

export type RotessaTransactionScheduleUpdateViaPost =
	RotessaTransactionScheduleUpdate & {
		id: number;
	};

export interface RotessaTransactionReportItem {
	account_number: string | number | null;
	amount: string;
	bank_name?: string | null;
	comment: string | null;
	created_at: string | null;
	custom_identifier: string | null;
	customer_id: number;
	earliest_approval_date: string | null;
	id: number;
	institution_number: string | number | null;
	process_date: string;
	settlement_date: string | null;
	status: RotessaTransactionStatus;
	status_reason: RotessaStatusReason | null;
	transaction_number: string | number | null;
	transaction_schedule_id: number;
	transit_number: string | number | null;
	updated_at: string | null;
}

export interface RotessaTransactionReportQuery {
	end_date?: string;
	filter?: RotessaReportStatusFilter;
	page?: number;
	start_date: string;
	status?: RotessaReportStatusFilter;
}

export interface RotessaApiErrorDetail {
	error_code: string;
	error_message: string;
}

export interface RotessaApiErrorPayload {
	errors: RotessaApiErrorDetail[];
}

export type RotessaParamType =
	| "string"
	| "number"
	| "boolean"
	| "object"
	| "array";

export interface RotessaParamSpec {
	description?: string;
	fields?: Record<string, RotessaParamSpec>;
	options?: readonly string[];
	required: boolean;
	type: RotessaParamType;
}

export interface RotessaEndpointParams {
	body?: Record<string, RotessaParamSpec>;
	path?: Record<string, RotessaParamSpec>;
	query?: Record<string, RotessaParamSpec>;
}

export interface RotessaEndpointSpec {
	method: RotessaHttpMethod;
	notes?: string[];
	params?: RotessaEndpointParams;
	path: string;
}

export interface RotessaManifest {
	customers: {
		list: RotessaEndpointSpec;
		get: RotessaEndpointSpec;
		getByCustomIdentifier: RotessaEndpointSpec;
		create: RotessaEndpointSpec;
		update: RotessaEndpointSpec;
		updateViaPost: RotessaEndpointSpec;
	};
	transactionReport: {
		list: RotessaEndpointSpec;
	};
	transactionSchedules: {
		get: RotessaEndpointSpec;
		create: RotessaEndpointSpec;
		createWithCustomIdentifier: RotessaEndpointSpec;
		update: RotessaEndpointSpec;
		updateViaPost: RotessaEndpointSpec;
		delete: RotessaEndpointSpec;
	};
}
