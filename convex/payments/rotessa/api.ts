import type {
	RecurringCollectionScheduleInput,
	RotessaTransactionReportRow,
} from "../recurringSchedules/types";
import {
	createRotessaClient,
	type RotessaClient,
	type RotessaClientConfigInput,
	type RotessaClientReporter,
	RotessaRequestError,
} from "./client";

function centsToRotessaAmount(cents: number) {
	return Number((cents / 100).toFixed(2));
}

function parseRotessaNumericId(value: string, resourceName: string) {
	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed)) {
		throw new RotessaRequestError({
			message: `Invalid Rotessa ${resourceName} id: "${value}"`,
			method: "GET",
			path: `/${resourceName}/{id}`,
		});
	}
	return parsed;
}

export interface RotessaApiClientOptions {
	apiKey?: string;
	baseUrl?: string;
	fetchImpl?: typeof fetch;
	reporter?: RotessaClientReporter;
	timeoutMs?: number;
}

interface LegacyRotessaTransactionReportQuery {
	endDate?: string;
	page?: number;
	startDate: string;
	status?: "All" | "Approved" | "Chargeback" | "Declined" | "Pending";
}

export class RotessaApiClient {
	private readonly client: RotessaClient;

	constructor(options: RotessaApiClientOptions = {}) {
		const config: RotessaClientConfigInput = {
			apiKey: options.apiKey,
			baseUrl: options.baseUrl,
			fetchFn: options.fetchImpl,
			reporter: options.reporter,
			timeoutMs: options.timeoutMs,
		};
		this.client = createRotessaClient(config);
	}

	async createTransactionSchedule(input: RecurringCollectionScheduleInput) {
		const basePayload = {
			amount: centsToRotessaAmount(input.amount),
			comment: input.comment ?? null,
			frequency: input.frequency,
			installments: input.installments,
			process_date: input.processDate,
		};

		if (input.customerId !== undefined) {
			return this.client.transactionSchedules.create({
				...basePayload,
				customer_id: input.customerId,
			});
		}

		if (input.customIdentifier) {
			return this.client.transactionSchedules.createWithCustomIdentifier({
				...basePayload,
				custom_identifier: input.customIdentifier,
			});
		}

		throw new RotessaRequestError({
			message:
				"Rotessa schedule creation requires either customerId or customIdentifier.",
			method: "POST",
			path: "/transaction_schedules",
		});
	}

	async deleteTransactionSchedule(scheduleId: string) {
		await this.client.transactionSchedules.delete(
			parseRotessaNumericId(scheduleId, "transaction_schedules")
		);
	}

	async getTransactionSchedule(scheduleId: string) {
		return this.client.transactionSchedules.get(
			parseRotessaNumericId(scheduleId, "transaction_schedules")
		);
	}

	async getTransactionReport(args: LegacyRotessaTransactionReportQuery) {
		const rows = await this.client.transactionReport.list({
			end_date: args.endDate,
			page: args.page ?? 1,
			start_date: args.startDate,
			status: args.status ?? "All",
		});

		return rows as RotessaTransactionReportRow[];
	}

	async findTransactionReportRow(args: {
		endDate: string;
		providerRef: string;
		startDate: string;
	}) {
		for (let page = 1; ; page += 1) {
			const rows = await this.getTransactionReport({
				endDate: args.endDate,
				page,
				startDate: args.startDate,
				status: "All",
			});
			const matched = rows.find(
				(row) =>
					row.transaction_number === args.providerRef ||
					String(row.id) === args.providerRef
			);
			if (matched) {
				return matched;
			}
			if (rows.length < 1000) {
				return null;
			}
		}
	}

	request<T>(
		method: "DELETE" | "GET" | "PATCH" | "POST",
		path: string,
		options?: {
			body?: unknown;
			pathParams?: Record<string, string | number>;
			query?: Record<string, string | number | boolean | null | undefined>;
			signal?: AbortSignal;
			timeoutMs?: number;
		}
	) {
		return this.client.request<T>(method, path, options);
	}
}
