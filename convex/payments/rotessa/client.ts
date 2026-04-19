import {
	ROTESSA_BASE_URLS,
	type RotessaApiErrorDetail,
	type RotessaCustomerCreate,
	type RotessaCustomerDetail,
	type RotessaCustomerListItem,
	type RotessaCustomerUpdate,
	type RotessaCustomerUpdateViaPost,
	type RotessaHttpMethod,
	type RotessaTransactionReportItem,
	type RotessaTransactionReportQuery,
	type RotessaTransactionSchedule,
	type RotessaTransactionScheduleCreateWithCustomerId,
	type RotessaTransactionScheduleCreateWithCustomIdentifier,
	type RotessaTransactionScheduleUpdate,
	type RotessaTransactionScheduleUpdateViaPost,
} from "./types";

const DEFAULT_TIMEOUT_MS = 15_000;

export type RotessaClientReporter = (
	error: RotessaApiError | RotessaRequestError
) => void;

export interface RotessaClientConfig {
	apiKey: string;
	baseUrl: string;
	fetchFn: typeof fetch;
	reporter?: RotessaClientReporter;
	timeoutMs: number;
}

export type RotessaClientConfigInput = Partial<
	Omit<RotessaClientConfig, "fetchFn"> & { fetchFn: typeof fetch }
>;

export interface RotessaRequestOptions {
	signal?: AbortSignal;
	timeoutMs?: number;
}

export class RotessaConfigError extends Error {
	name = "RotessaConfigError";
}

export class RotessaApiError extends Error {
	name = "RotessaApiError";
	status: number;
	method: RotessaHttpMethod;
	path: string;
	errors?: RotessaApiErrorDetail[];
	payload?: unknown;
	responseText?: string;

	constructor({
		message,
		status,
		method,
		path,
		errors,
		payload,
		responseText,
	}: {
		message: string;
		status: number;
		method: RotessaHttpMethod;
		path: string;
		errors?: RotessaApiErrorDetail[];
		payload?: unknown;
		responseText?: string;
	}) {
		super(message);
		this.status = status;
		this.method = method;
		this.path = path;
		this.errors = errors;
		this.payload = payload;
		this.responseText = responseText;
	}
}

export class RotessaRequestError extends Error {
	name = "RotessaRequestError";
	method: RotessaHttpMethod;
	path: string;
	cause?: unknown;

	constructor({
		message,
		method,
		path,
		cause,
	}: {
		message: string;
		method: RotessaHttpMethod;
		path: string;
		cause?: unknown;
	}) {
		super(message);
		this.method = method;
		this.path = path;
		this.cause = cause;
	}
}

function resolveConfig(
	input: RotessaClientConfigInput = {}
): RotessaClientConfig {
	const apiKey = input.apiKey ?? process.env.ROTESSA_API_KEY;
	if (!apiKey) {
		throw new RotessaConfigError(
			"Missing ROTESSA_API_KEY. Provide apiKey or set ROTESSA_API_KEY."
		);
	}

	const baseUrl =
		input.baseUrl ??
		process.env.ROTESSA_API_BASE_URL ??
		ROTESSA_BASE_URLS.production;

	const envTimeout =
		process.env.ROTESSA_TIMEOUT_MS &&
		Number.parseInt(process.env.ROTESSA_TIMEOUT_MS, 10);

	const timeoutMs =
		input.timeoutMs ??
		(typeof envTimeout === "number" && envTimeout > 0
			? envTimeout
			: DEFAULT_TIMEOUT_MS);

	const fetchFn = input.fetchFn ?? fetch;

	return {
		apiKey,
		baseUrl,
		timeoutMs,
		fetchFn,
		reporter: input.reporter,
	};
}

function normalizeBaseUrl(baseUrl: string) {
	return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
}

function applyPathParams(
	method: RotessaHttpMethod,
	path: string,
	params?: Record<string, string | number>
) {
	return path.replace(/\{(\w+)\}/g, (_match, key: string) => {
		const value = params?.[key];
		if (value === undefined || value === null) {
			throw new RotessaRequestError({
				message: `Missing path parameter: ${key}`,
				method,
				path,
			});
		}
		return encodeURIComponent(String(value));
	});
}

function buildUrl(
	baseUrl: string,
	path: string,
	query?: Record<string, string | number | boolean | null | undefined>
) {
	const normalizedBase = normalizeBaseUrl(baseUrl);
	const normalizedPath = path.startsWith("/") ? path : `/${path}`;
	const url = `${normalizedBase}${normalizedPath}`;

	if (!query) {
		return url;
	}

	const searchParams = new URLSearchParams();
	for (const [key, value] of Object.entries(query)) {
		if (value === undefined || value === null) {
			continue;
		}
		searchParams.append(key, String(value));
	}
	const queryString = searchParams.toString();
	return queryString ? `${url}?${queryString}` : url;
}

function safeParseJson(text: string) {
	if (!text) {
		return;
	}
	try {
		return JSON.parse(text) as unknown;
	} catch {
		return;
	}
}

async function readResponseBody(response: {
	json?: () => Promise<unknown>;
	text?: () => Promise<string>;
}) {
	if (typeof response.text === "function") {
		const text = await response.text();
		return {
			payload: safeParseJson(text),
			responseText: text,
		};
	}

	if (typeof response.json === "function") {
		const payload = await response.json();
		return {
			payload,
			responseText:
				typeof payload === "string" ? payload : JSON.stringify(payload ?? null),
		};
	}

	return {
		payload: undefined,
		responseText: "",
	};
}

function normalizeErrors(
	payload: unknown
): RotessaApiErrorDetail[] | undefined {
	if (!payload || typeof payload !== "object") {
		return;
	}
	const errors = (payload as { errors?: unknown }).errors;
	if (!Array.isArray(errors)) {
		return;
	}

	const normalized = errors
		.map((item) => {
			if (!item || typeof item !== "object") {
				return null;
			}
			const errorItem = item as Record<string, unknown>;
			const error_code = String(errorItem.error_code ?? "");
			const error_message = String(errorItem.error_message ?? "");
			if (!(error_code || error_message)) {
				return null;
			}
			return { error_code, error_message };
		})
		.filter(Boolean) as RotessaApiErrorDetail[];

	return normalized.length > 0 ? normalized : undefined;
}

function formatApiErrorMessage(args: {
	errors?: RotessaApiErrorDetail[];
	status: number;
	statusText?: string;
}) {
	const statusLabel = args.statusText
		? `${args.status} ${args.statusText}`
		: String(args.status);
	const details =
		args.errors && args.errors.length > 0
			? args.errors
					.map((item) =>
						item.error_code && item.error_message
							? `${item.error_code}: ${item.error_message}`
							: (item.error_message ??
								item.error_code ??
								"unknown Rotessa error")
					)
					.join("; ")
			: "unknown Rotessa error";

	return `Rotessa API request failed (${statusLabel}): ${details}`;
}

function reportError(
	reporter: RotessaClientReporter | undefined,
	error: RotessaApiError | RotessaRequestError
) {
	if (!reporter) {
		return;
	}
	try {
		reporter(error);
	} catch {
		// Avoid reporter failures breaking application flow.
	}
}

function normalizePathParamError(args: {
	error: unknown;
	method: RotessaHttpMethod;
	path: string;
}) {
	return args.error instanceof RotessaRequestError
		? args.error
		: new RotessaRequestError({
				message: "Invalid request path parameters.",
				method: args.method,
				path: args.path,
				cause: args.error,
			});
}

function attachExternalAbortSignal(args: {
	controller: AbortController;
	signal?: AbortSignal;
}) {
	const externalSignal = args.signal;
	if (!externalSignal) {
		return null;
	}

	if (externalSignal.aborted) {
		args.controller.abort((externalSignal as { reason?: unknown }).reason);
		return null;
	}

	const listener = () => {
		args.controller.abort((externalSignal as { reason?: unknown }).reason);
	};
	externalSignal.addEventListener("abort", listener, { once: true });

	return () => {
		externalSignal.removeEventListener("abort", listener);
	};
}

function buildRotessaApiError(args: {
	errors?: RotessaApiErrorDetail[];
	method: RotessaHttpMethod;
	path: string;
	payload: unknown;
	response: { status: number; statusText?: string };
	responseText: string;
}) {
	return new RotessaApiError({
		message: formatApiErrorMessage({
			errors: args.errors,
			status: args.response.status,
			statusText: args.response.statusText,
		}),
		status: args.response.status,
		method: args.method,
		path: args.path,
		errors: args.errors,
		payload: args.payload,
		responseText: args.responseText,
	});
}

function buildRotessaRequestError(args: {
	error: unknown;
	method: RotessaHttpMethod;
	path: string;
}) {
	const isAbort =
		args.error instanceof Error && args.error.name === "AbortError";
	return new RotessaRequestError({
		message: isAbort ? "Rotessa request timed out." : "Rotessa request failed.",
		method: args.method,
		path: args.path,
		cause: args.error,
	});
}

async function rotessaRequest<T>(
	config: RotessaClientConfig,
	method: RotessaHttpMethod,
	path: string,
	options: {
		pathParams?: Record<string, string | number>;
		query?: Record<string, string | number | boolean | null | undefined>;
		body?: unknown;
	} & RotessaRequestOptions = {}
): Promise<T> {
	let resolvedPath: string;
	try {
		resolvedPath = applyPathParams(method, path, options.pathParams);
	} catch (error) {
		const requestError = normalizePathParamError({ error, method, path });
		reportError(config.reporter, requestError);
		throw requestError;
	}

	const url = buildUrl(config.baseUrl, resolvedPath, options.query);
	const controller = new AbortController();
	const timeoutMs = options.timeoutMs ?? config.timeoutMs;
	const timeout = setTimeout(() => controller.abort(), timeoutMs);
	const detachExternalAbortListener = attachExternalAbortSignal({
		controller,
		signal: options.signal,
	});

	try {
		const response = await config.fetchFn(url, {
			method,
			headers: {
				Accept: "application/json",
				Authorization: `Token token="${config.apiKey}"`,
				"Content-Type": "application/json",
			},
			body:
				options.body !== undefined && method !== "GET"
					? JSON.stringify(options.body)
					: undefined,
			signal: controller.signal,
		});

		const { payload, responseText } = await readResponseBody(response);

		if (!response.ok) {
			const errors = normalizeErrors(payload);
			const error = buildRotessaApiError({
				errors,
				method,
				path: resolvedPath,
				payload,
				response: {
					status: response.status,
					statusText:
						"statusText" in response && typeof response.statusText === "string"
							? response.statusText
							: undefined,
				},
				responseText,
			});
			reportError(config.reporter, error);
			throw error;
		}

		return (payload ?? null) as T;
	} catch (error) {
		if (error instanceof RotessaApiError) {
			throw error;
		}
		const requestError = buildRotessaRequestError({
			error,
			method,
			path: resolvedPath,
		});
		reportError(config.reporter, requestError);
		throw requestError;
	} finally {
		clearTimeout(timeout);
		detachExternalAbortListener?.();
	}
}

export interface RotessaClient {
	customers: {
		list: () => Promise<RotessaCustomerListItem[]>;
		get: (id: number) => Promise<RotessaCustomerDetail>;
		getByCustomIdentifier: (
			customIdentifier: string
		) => Promise<RotessaCustomerDetail>;
		create: (payload: RotessaCustomerCreate) => Promise<RotessaCustomerDetail>;
		update: (
			id: number,
			payload: RotessaCustomerUpdate
		) => Promise<RotessaCustomerDetail>;
		updateViaPost: (
			payload: RotessaCustomerUpdateViaPost
		) => Promise<RotessaCustomerDetail>;
	};
	request: <T>(
		method: RotessaHttpMethod,
		path: string,
		options?: {
			pathParams?: Record<string, string | number>;
			query?: Record<string, string | number | boolean | null | undefined>;
			body?: unknown;
		} & RotessaRequestOptions
	) => Promise<T>;
	transactionReport: {
		list: (
			params: RotessaTransactionReportQuery
		) => Promise<RotessaTransactionReportItem[]>;
	};
	transactionSchedules: {
		get: (id: number) => Promise<RotessaTransactionSchedule>;
		create: (
			payload: RotessaTransactionScheduleCreateWithCustomerId
		) => Promise<RotessaTransactionSchedule>;
		createWithCustomIdentifier: (
			payload: RotessaTransactionScheduleCreateWithCustomIdentifier
		) => Promise<RotessaTransactionSchedule>;
		update: (
			id: number,
			payload: RotessaTransactionScheduleUpdate
		) => Promise<RotessaTransactionSchedule>;
		updateViaPost: (
			payload: RotessaTransactionScheduleUpdateViaPost
		) => Promise<RotessaTransactionSchedule>;
		delete: (id: number) => Promise<null>;
	};
}

export function createRotessaClient(
	configInput: RotessaClientConfigInput = {}
): RotessaClient {
	const config = resolveConfig(configInput);

	return {
		customers: {
			list: () =>
				rotessaRequest<RotessaCustomerListItem[]>(config, "GET", "/customers"),
			get: (id) =>
				rotessaRequest<RotessaCustomerDetail>(
					config,
					"GET",
					"/customers/{id}",
					{
						pathParams: { id },
					}
				),
			getByCustomIdentifier: (customIdentifier) =>
				rotessaRequest<RotessaCustomerDetail>(
					config,
					"POST",
					"/customers/show_with_custom_identifier",
					{ body: { custom_identifier: customIdentifier } }
				),
			create: (payload) =>
				rotessaRequest<RotessaCustomerDetail>(config, "POST", "/customers", {
					body: payload,
				}),
			update: (id, payload) =>
				rotessaRequest<RotessaCustomerDetail>(
					config,
					"PATCH",
					"/customers/{id}",
					{ pathParams: { id }, body: payload }
				),
			updateViaPost: (payload) =>
				rotessaRequest<RotessaCustomerDetail>(
					config,
					"POST",
					"/customers/update_via_post",
					{ body: payload }
				),
		},
		transactionSchedules: {
			get: (id) =>
				rotessaRequest<RotessaTransactionSchedule>(
					config,
					"GET",
					"/transaction_schedules/{id}",
					{ pathParams: { id } }
				),
			create: (payload: RotessaTransactionScheduleCreateWithCustomerId) =>
				rotessaRequest<RotessaTransactionSchedule>(
					config,
					"POST",
					"/transaction_schedules",
					{ body: payload }
				),
			createWithCustomIdentifier: (
				payload: RotessaTransactionScheduleCreateWithCustomIdentifier
			) =>
				rotessaRequest<RotessaTransactionSchedule>(
					config,
					"POST",
					"/transaction_schedules/create_with_custom_identifier",
					{ body: payload }
				),
			update: (id, payload) =>
				rotessaRequest<RotessaTransactionSchedule>(
					config,
					"PATCH",
					"/transaction_schedules/{id}",
					{ pathParams: { id }, body: payload }
				),
			updateViaPost: (payload) =>
				rotessaRequest<RotessaTransactionSchedule>(
					config,
					"POST",
					"/transaction_schedules/update_via_post",
					{ body: payload }
				),
			delete: (id) =>
				rotessaRequest<null>(config, "DELETE", "/transaction_schedules/{id}", {
					pathParams: { id },
				}),
		},
		transactionReport: {
			list: (params) => {
				const query: RotessaTransactionReportQuery = { ...params };
				const queryParams = {
					start_date: query.start_date,
					end_date: query.end_date,
					page: query.page,
					status: query.status,
					filter: query.filter,
				};
				return rotessaRequest<RotessaTransactionReportItem[]>(
					config,
					"GET",
					"/transaction_report",
					{ query: queryParams }
				);
			},
		},
		request: (method, path, options) =>
			rotessaRequest(config, method, path, options),
	};
}

let rotessaClient: RotessaClient | null = null;

function hasClientConfigOverrides(configInput: RotessaClientConfigInput) {
	return (
		configInput.apiKey !== undefined ||
		configInput.baseUrl !== undefined ||
		configInput.fetchFn !== undefined ||
		configInput.reporter !== undefined ||
		configInput.timeoutMs !== undefined
	);
}

export function getRotessaClient(
	configInput: RotessaClientConfigInput = {}
): RotessaClient {
	if (rotessaClient) {
		if (hasClientConfigOverrides(configInput)) {
			throw new RotessaConfigError(
				"Rotessa client already initialized; call resetRotessaClient() before re-configuring, or use createRotessaClient() for a scoped instance."
			);
		}
		return rotessaClient;
	}

	rotessaClient = createRotessaClient(configInput);
	return rotessaClient;
}

export function resetRotessaClient() {
	rotessaClient = null;
}
