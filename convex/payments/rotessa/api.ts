import type {
	RecurringCollectionScheduleInput,
	RotessaTransactionReportRow,
} from "../recurringSchedules/types";

const DEFAULT_ROTESSA_API_BASE_URL = "https://api.rotessa.com/v1";

interface RotessaErrorItem {
	error_code?: string;
	error_message?: string;
}

interface RotessaErrorResponse {
	errors?: RotessaErrorItem[];
}

interface RotessaScheduleResponse {
	amount: string;
	comment: string | null;
	created_at: string;
	financial_transactions: unknown[];
	frequency: string;
	id: number;
	installments: number | null;
	next_process_date: string | null;
	process_date: string;
	updated_at: string;
}

function trimTrailingSlash(value: string) {
	return value.endsWith("/") ? value.slice(0, -1) : value;
}

function readRotessaConfig(args?: { apiKey?: string; baseUrl?: string }) {
	const apiKey = args?.apiKey ?? process.env.ROTESSA_API_KEY;
	if (!apiKey) {
		throw new Error(
			"ROTESSA_API_KEY is required to use Rotessa providers in production."
		);
	}

	return {
		apiKey,
		baseUrl: trimTrailingSlash(
			args?.baseUrl ??
				process.env.ROTESSA_API_BASE_URL ??
				DEFAULT_ROTESSA_API_BASE_URL
		),
	};
}

function buildRotessaAuthHeader(apiKey: string) {
	return `Token token="${apiKey}"`;
}

function formatRotessaErrors(payload: RotessaErrorResponse | undefined) {
	const errors = payload?.errors ?? [];
	if (errors.length === 0) {
		return "unknown Rotessa error";
	}

	return errors
		.map((item) =>
			item.error_code && item.error_message
				? `${item.error_code}: ${item.error_message}`
				: (item.error_message ?? item.error_code ?? "unknown Rotessa error")
		)
		.join("; ");
}

function centsToRotessaAmount(cents: number) {
	return Number((cents / 100).toFixed(2));
}

export interface RotessaApiClientOptions {
	apiKey?: string;
	baseUrl?: string;
	fetchImpl?: typeof fetch;
	timeoutMs?: number;
}

const DEFAULT_ROTESSA_TIMEOUT_MS = 15_000;

export class RotessaApiClient {
	private readonly apiKey: string;
	private readonly baseUrl: string;
	private readonly fetchImpl: typeof fetch;
	private readonly timeoutMs: number;

	constructor(options: RotessaApiClientOptions = {}) {
		const config = readRotessaConfig(options);
		this.apiKey = config.apiKey;
		this.baseUrl = config.baseUrl;
		this.fetchImpl = options.fetchImpl ?? fetch;
		this.timeoutMs = options.timeoutMs ?? DEFAULT_ROTESSA_TIMEOUT_MS;
		if (typeof this.fetchImpl !== "function") {
			throw new Error("A global fetch implementation is required.");
		}
	}

	private async request<T>(
		path: string,
		args?: {
			body?: Record<string, unknown>;
			method?: "DELETE" | "GET" | "PATCH" | "POST";
			query?: Record<string, string | number | undefined>;
			timeoutMs?: number;
		}
	): Promise<T> {
		const url = new URL(`${this.baseUrl}${path}`);
		for (const [key, value] of Object.entries(args?.query ?? {})) {
			if (value === undefined) {
				continue;
			}
			url.searchParams.set(key, String(value));
		}

		const timeoutMs = args?.timeoutMs ?? this.timeoutMs;
		const controller = new AbortController();
		const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

		let response: Response;
		try {
			response = await this.fetchImpl(url.toString(), {
				method: args?.method ?? "GET",
				headers: {
					Authorization: buildRotessaAuthHeader(this.apiKey),
					"Content-Type": "application/json",
				},
				body: args?.body ? JSON.stringify(args.body) : undefined,
				signal: controller.signal,
			});
		} catch (error) {
			clearTimeout(timeoutHandle);
			if (
				error instanceof Error &&
				(error.name === "AbortError" || controller.signal.aborted)
			) {
				throw new Error(`Rotessa API request timed out after ${timeoutMs}ms.`);
			}
			throw error;
		}
		clearTimeout(timeoutHandle);

		if (!response.ok) {
			let payload: RotessaErrorResponse | undefined;
			try {
				payload = (await response.json()) as RotessaErrorResponse;
			} catch {
				payload = undefined;
			}
			throw new Error(
				`Rotessa API request failed (${response.status} ${response.statusText}): ${formatRotessaErrors(
					payload
				)}`
			);
		}

		if (response.status === 204) {
			return undefined as T;
		}

		return (await response.json()) as T;
	}

	async createTransactionSchedule(
		input: RecurringCollectionScheduleInput
	): Promise<RotessaScheduleResponse> {
		const body = {
			...(input.customerId !== undefined
				? { customer_id: input.customerId }
				: { custom_identifier: input.customIdentifier }),
			amount: centsToRotessaAmount(input.amount),
			frequency: input.frequency,
			process_date: input.processDate,
			installments: input.installments,
			comment: input.comment,
		};
		const path =
			input.customerId !== undefined
				? "/transaction_schedules"
				: "/transaction_schedules/create_with_custom_identifier";

		return this.request<RotessaScheduleResponse>(path, {
			method: "POST",
			body,
		});
	}

	async deleteTransactionSchedule(scheduleId: string) {
		await this.request<void>(`/transaction_schedules/${scheduleId}`, {
			method: "DELETE",
		});
	}

	async getTransactionSchedule(scheduleId: string) {
		return this.request<RotessaScheduleResponse>(
			`/transaction_schedules/${scheduleId}`
		);
	}

	async getTransactionReport(args: {
		endDate?: string;
		page?: number;
		startDate: string;
		status?: "All" | "Approved" | "Chargeback" | "Declined" | "Pending";
	}) {
		return this.request<RotessaTransactionReportRow[]>("/transaction_report", {
			method: "GET",
			query: {
				start_date: args.startDate,
				end_date: args.endDate,
				status: args.status ?? "All",
				page: args.page ?? 1,
			},
		});
	}

	async findTransactionReportRow(args: {
		endDate: string;
		providerRef: string;
		startDate: string;
	}) {
		for (let page = 1; ; page += 1) {
			const rows = await this.getTransactionReport({
				startDate: args.startDate,
				endDate: args.endDate,
				status: "All",
				page,
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
}
