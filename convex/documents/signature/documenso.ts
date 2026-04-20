import type { Id } from "../../_generated/dataModel";
import type {
	SignatureEnvelopeStatus,
	SignatureRecipientStatus,
} from "../contracts";
import type {
	SignatureProvider,
	SignatureProviderCreateEnvelopeInput,
	SignatureProviderCreateEnvelopeResult,
	SignatureProviderDownloadCompletedArtifactsInput,
	SignatureProviderDownloadCompletedArtifactsResult,
	SignatureProviderField,
	SignatureProviderRecipientInput,
	SignatureProviderSyncEnvelopeResult,
} from "./provider";

const DEFAULT_DOCUMENSO_API_BASE_URL = "https://app.documenso.com/api/v2";
const DEFAULT_DOCUMENSO_APP_BASE_URL = "https://app.documenso.com";
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_SIGNING_URL_TTL_MS = 15 * 60 * 1000;
const DOCUMENSO_API_SUFFIX_RE = /\/api\/v2\/?$/;

export interface DocumensoSignatureProviderFactoryOptions {
	fetchFn?: typeof fetch;
	getStorageBlob: (storageId: Id<"_storage">) => Promise<Blob | null>;
	now?: () => number;
}

interface DocumensoConfig {
	apiBaseUrl: string;
	apiKey: string;
	appBaseUrl: string;
	fetchFn: typeof fetch;
	getStorageBlob: (storageId: Id<"_storage">) => Promise<Blob | null>;
	now: () => number;
	timeoutMs: number;
}

interface DocumensoEnvelopeResponse {
	completedAt?: string | null;
	envelopeItems?: DocumensoEnvelopeItemResponse[];
	id: string;
	recipients?: DocumensoRecipientResponse[];
	status: string;
	updatedAt?: string | null;
}

interface DocumensoEnvelopeItemResponse {
	id: string;
	name?: string | null;
	type?: string | null;
}

interface DocumensoRecipientResponse {
	email: string;
	id: number | string;
	name: string;
	readStatus?: string | null;
	role?: string | null;
	sendStatus?: string | null;
	signedAt?: string | null;
	signingOrder?: number | null;
	signingStatus?: string | null;
	signingUrl?: string | null;
	token?: string | null;
}

interface DocumensoDistributeEnvelopeResponse {
	id: string;
	recipients?: DocumensoRecipientResponse[];
	success: boolean;
}

interface DocumensoCreateEnvelopeResponse {
	id: string;
}

export class DocumensoConfigError extends Error {
	name = "DocumensoConfigError";
}

export class DocumensoApiError extends Error {
	name = "DocumensoApiError";
	method: string;
	path: string;
	responseText?: string;
	status: number;

	constructor(args: {
		message: string;
		method: string;
		path: string;
		responseText?: string;
		status: number;
	}) {
		super(args.message);
		this.method = args.method;
		this.path = args.path;
		this.responseText = args.responseText;
		this.status = args.status;
	}
}

export class DocumensoRequestError extends Error {
	name = "DocumensoRequestError";
	cause?: unknown;
	method: string;
	path: string;

	constructor(args: {
		cause?: unknown;
		message: string;
		method: string;
		path: string;
	}) {
		super(args.message);
		this.cause = args.cause;
		this.method = args.method;
		this.path = args.path;
	}
}

function resolveConfig(
	input: DocumensoSignatureProviderFactoryOptions
): DocumensoConfig {
	const apiKey =
		process.env.DOCUMENSO_API_TOKEN ?? process.env.DOCUMENSO_API_KEY;
	if (!apiKey) {
		throw new DocumensoConfigError(
			"Missing DOCUMENSO_API_TOKEN or DOCUMENSO_API_KEY. Configure the Documenso API credential before creating signature envelopes."
		);
	}

	const apiBaseUrl =
		process.env.DOCUMENSO_API_BASE_URL ?? DEFAULT_DOCUMENSO_API_BASE_URL;
	const appBaseUrl =
		(process.env.DOCUMENSO_APP_BASE_URL ??
			apiBaseUrl.replace(DOCUMENSO_API_SUFFIX_RE, "")) ||
		DEFAULT_DOCUMENSO_APP_BASE_URL;
	const timeoutMs =
		process.env.DOCUMENSO_TIMEOUT_MS &&
		Number.parseInt(process.env.DOCUMENSO_TIMEOUT_MS, 10) > 0
			? Number.parseInt(process.env.DOCUMENSO_TIMEOUT_MS, 10)
			: DEFAULT_TIMEOUT_MS;

	return {
		apiBaseUrl,
		apiKey,
		appBaseUrl,
		fetchFn: input.fetchFn ?? fetch,
		getStorageBlob: input.getStorageBlob,
		now: input.now ?? Date.now,
		timeoutMs,
	};
}

function buildApiUrl(config: DocumensoConfig, path: string) {
	const normalizedBase = config.apiBaseUrl.endsWith("/")
		? config.apiBaseUrl.slice(0, -1)
		: config.apiBaseUrl;
	const normalizedPath = path.startsWith("/") ? path : `/${path}`;
	return `${normalizedBase}${normalizedPath}`;
}

function sanitizeFileName(value: string) {
	const cleaned = value.trim().replace(/[^a-z0-9._-]+/gi, "-");
	return cleaned.length > 0 ? cleaned : "document";
}

function parseTimestamp(value: string | null | undefined) {
	if (!value) {
		return undefined;
	}

	const parsed = Date.parse(value);
	return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeSigningUrl(
	config: DocumensoConfig,
	recipient: DocumensoRecipientResponse | undefined
) {
	if (!recipient) {
		return undefined;
	}

	if (recipient.signingUrl) {
		return recipient.signingUrl;
	}

	if (!recipient.token) {
		return undefined;
	}

	return `${config.appBaseUrl}/sign/${recipient.token}`;
}

function mapDocumensoRecipientStatus(
	recipient: DocumensoRecipientResponse
): SignatureRecipientStatus {
	const signingStatus = recipient.signingStatus?.toUpperCase();
	if (signingStatus === "SIGNED") {
		return "signed";
	}
	if (signingStatus === "REJECTED") {
		return "declined";
	}

	return recipient.readStatus?.toUpperCase() === "OPENED"
		? "opened"
		: "pending";
}

function mapDocumensoEnvelopeStatus(
	envelopeStatus: string,
	recipients: DocumensoRecipientResponse[]
): SignatureEnvelopeStatus {
	switch (envelopeStatus.toUpperCase()) {
		case "DRAFT":
			return "draft";
		case "PENDING":
			return recipients.some(
				(recipient) => recipient.signingStatus?.toUpperCase() === "SIGNED"
			)
				? "partially_signed"
				: "sent";
		case "COMPLETED":
			return "completed";
		case "REJECTED":
			return "declined";
		case "CANCELLED":
		case "VOIDED":
			return "voided";
		default:
			return "provider_error";
	}
}

function toDocumensoField(field: SignatureProviderField) {
	return {
		identifier: field.identifier ?? 0,
		type: field.type,
		page: field.pageNumber,
		positionX: field.positionX,
		positionY: field.positionY,
		width: field.width,
		height: field.height,
		required: field.required,
		...(field.fieldMeta ? { fieldMeta: field.fieldMeta } : {}),
	};
}

function toCreateRecipientPayload(recipient: SignatureProviderRecipientInput) {
	return {
		email: recipient.email,
		name: recipient.name,
		role: recipient.providerRole,
		signingOrder: recipient.signingOrder,
		fields: recipient.fields.map(toDocumensoField),
	};
}

function matchProviderRecipient(
	input: SignatureProviderRecipientInput,
	providerRecipients: DocumensoRecipientResponse[]
) {
	return providerRecipients.find((recipient) => {
		const recipientRole = recipient.role?.toUpperCase();
		return (
			recipient.email.toLowerCase() === input.email.toLowerCase() &&
			recipientRole === input.providerRole &&
			recipient.signingOrder === input.signingOrder
		);
	});
}

async function readResponseText(response: Response) {
	try {
		return await response.text();
	} catch {
		return "";
	}
}

async function requestJson<T>(
	config: DocumensoConfig,
	path: string,
	init: RequestInit
): Promise<T> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
	const method = init.method ?? "GET";

	try {
		const response = await config.fetchFn(buildApiUrl(config, path), {
			...init,
			headers: {
				Authorization: config.apiKey,
				...(init.headers ?? {}),
			},
			signal: controller.signal,
		});
		const responseText = await readResponseText(response);

		if (!response.ok) {
			throw new DocumensoApiError({
				message: `Documenso ${method} ${path} failed with status ${response.status}`,
				method,
				path,
				responseText,
				status: response.status,
			});
		}

		return JSON.parse(responseText) as T;
	} catch (error) {
		if (error instanceof DocumensoApiError) {
			throw error;
		}

		throw new DocumensoRequestError({
			cause: error,
			message: `Documenso ${method} ${path} request failed`,
			method,
			path,
		});
	} finally {
		clearTimeout(timeout);
	}
}

async function requestBytes(
	config: DocumensoConfig,
	path: string,
	init: RequestInit
): Promise<ArrayBuffer> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
	const method = init.method ?? "GET";

	try {
		const response = await config.fetchFn(buildApiUrl(config, path), {
			...init,
			headers: {
				Authorization: config.apiKey,
				...(init.headers ?? {}),
			},
			signal: controller.signal,
		});

		if (!response.ok) {
			const responseText = await readResponseText(response);
			throw new DocumensoApiError({
				message: `Documenso ${method} ${path} failed with status ${response.status}`,
				method,
				path,
				responseText,
				status: response.status,
			});
		}

		return response.arrayBuffer();
	} catch (error) {
		if (error instanceof DocumensoApiError) {
			throw error;
		}

		throw new DocumensoRequestError({
			cause: error,
			message: `Documenso ${method} ${path} request failed`,
			method,
			path,
		});
	} finally {
		clearTimeout(timeout);
	}
}

async function getEnvelope(
	config: DocumensoConfig,
	providerEnvelopeId: string
) {
	return requestJson<DocumensoEnvelopeResponse>(
		config,
		`/envelope/${encodeURIComponent(providerEnvelopeId)}`,
		{ method: "GET" }
	);
}

async function getRecipient(
	config: DocumensoConfig,
	providerRecipientId: string
) {
	return requestJson<DocumensoRecipientResponse>(
		config,
		`/envelope/recipient/${encodeURIComponent(providerRecipientId)}`,
		{ method: "GET" }
	);
}

function buildCreateEnvelopePayload(
	input: SignatureProviderCreateEnvelopeInput
) {
	return {
		type: "DOCUMENT",
		title: input.title,
		externalId: String(input.generatedDocumentId),
		recipients: input.recipients.map(toCreateRecipientPayload),
	};
}

async function createAndOptionallyDistributeEnvelope(
	config: DocumensoConfig,
	input: SignatureProviderCreateEnvelopeInput
): Promise<{
	distributionError?: string;
	envelopeId: string;
	recipients: DocumensoRecipientResponse[];
	status: "draft" | "sent";
}> {
	const pdfBlob = await config.getStorageBlob(input.pdfStorageId);
	if (!pdfBlob) {
		throw new DocumensoRequestError({
			message: `Stored PDF ${input.pdfStorageId} could not be loaded for Documenso envelope creation`,
			method: "POST",
			path: "/envelope/create",
		});
	}

	const formData = new FormData();
	formData.append("payload", JSON.stringify(buildCreateEnvelopePayload(input)));
	formData.append("files", pdfBlob, `${sanitizeFileName(input.title)}.pdf`);

	const createResponse = await requestJson<DocumensoCreateEnvelopeResponse>(
		config,
		"/envelope/create",
		{
			method: "POST",
			body: formData,
		}
	);

	const createdEnvelope = await getEnvelope(config, createResponse.id);

	try {
		const distributeResponse =
			await requestJson<DocumensoDistributeEnvelopeResponse>(
				config,
				"/envelope/distribute",
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						envelopeId: createResponse.id,
					}),
				}
			);

		return {
			envelopeId: createResponse.id,
			recipients:
				distributeResponse.recipients ?? createdEnvelope.recipients ?? [],
			status: "sent",
		};
	} catch (error) {
		return {
			distributionError: error instanceof Error ? error.message : String(error),
			envelopeId: createResponse.id,
			recipients: createdEnvelope.recipients ?? [],
			status: "draft",
		};
	}
}

function isCertificateEnvelopeItem(item: DocumensoEnvelopeItemResponse) {
	const haystack = `${item.name ?? ""} ${item.type ?? ""}`.toLowerCase();
	return haystack.includes("certificate");
}

function getPrimaryEnvelopeItem(items: DocumensoEnvelopeItemResponse[]) {
	return items.find((item) => !isCertificateEnvelopeItem(item)) ?? items[0];
}

async function tryDownloadOptionalArtifact(
	config: DocumensoConfig,
	path: string
) {
	try {
		return await requestBytes(config, path, { method: "GET" });
	} catch (error) {
		if (
			error instanceof DocumensoApiError &&
			(error.status === 400 || error.status === 404)
		) {
			return undefined;
		}

		throw error;
	}
}

export function createDocumensoSignatureProvider(
	input: DocumensoSignatureProviderFactoryOptions
): SignatureProvider {
	const config = resolveConfig(input);

	return {
		async createEnvelope(
			args: SignatureProviderCreateEnvelopeInput
		): Promise<SignatureProviderCreateEnvelopeResult> {
			const created = await createAndOptionallyDistributeEnvelope(config, args);

			return {
				lastError: created.distributionError,
				providerEnvelopeId: created.envelopeId,
				recipients: args.recipients.map((recipient) => {
					const providerRecipient = matchProviderRecipient(
						recipient,
						created.recipients
					);

					return {
						platformRole: recipient.platformRole,
						providerRecipientId: providerRecipient
							? String(providerRecipient.id)
							: undefined,
						signingUrl: normalizeSigningUrl(config, providerRecipient),
						token: providerRecipient?.token ?? undefined,
					};
				}),
				status: created.status,
			};
		},

		async createEmbeddedSigningSession(input) {
			const recipient = await getRecipient(config, input.providerRecipientId);
			const url = normalizeSigningUrl(config, recipient);
			if (!url) {
				throw new DocumensoRequestError({
					message: `Documenso recipient ${input.providerRecipientId} does not have a signing token or signing URL`,
					method: "GET",
					path: `/envelope/recipient/${input.providerRecipientId}`,
				});
			}

			return {
				// Documenso's v2 docs expose a signing token, not an explicit expiry.
				// Treat this as a refresh window for the portal and allow the backend
				// to mint a fresh URL on demand.
				expiresAt: config.now() + DEFAULT_SIGNING_URL_TTL_MS,
				url,
			};
		},

		async syncEnvelope(input): Promise<SignatureProviderSyncEnvelopeResult> {
			const envelope = await getEnvelope(config, input.providerEnvelopeId);
			const recipients = envelope.recipients ?? [];

			return {
				envelopeStatus: mapDocumensoEnvelopeStatus(envelope.status, recipients),
				recipients: recipients.map((recipient) => ({
					declinedAt:
						recipient.signingStatus?.toUpperCase() === "REJECTED"
							? parseTimestamp(envelope.updatedAt)
							: undefined,
					openedAt:
						recipient.readStatus?.toUpperCase() === "OPENED"
							? parseTimestamp(envelope.updatedAt)
							: undefined,
					providerRecipientId: String(recipient.id),
					signedAt: parseTimestamp(recipient.signedAt),
					status: mapDocumensoRecipientStatus(recipient),
				})),
			};
		},

		async downloadCompletedArtifacts(
			input: SignatureProviderDownloadCompletedArtifactsInput
		): Promise<SignatureProviderDownloadCompletedArtifactsResult> {
			const envelope = await getEnvelope(config, input.providerEnvelopeId);
			if (envelope.status.toUpperCase() !== "COMPLETED") {
				throw new DocumensoRequestError({
					message: `Documenso envelope ${input.providerEnvelopeId} is ${envelope.status}, expected COMPLETED before downloading signed artifacts`,
					method: "GET",
					path: `/envelope/${encodeURIComponent(input.providerEnvelopeId)}`,
				});
			}

			const envelopeItems = envelope.envelopeItems ?? [];
			const primaryEnvelopeItem = getPrimaryEnvelopeItem(envelopeItems);
			if (!primaryEnvelopeItem) {
				throw new DocumensoRequestError({
					message: `Documenso envelope ${input.providerEnvelopeId} did not include any envelope items for completed artifact download`,
					method: "GET",
					path: `/envelope/${encodeURIComponent(input.providerEnvelopeId)}`,
				});
			}

			const finalPdfBytes = await requestBytes(
				config,
				`/envelope/item/${encodeURIComponent(primaryEnvelopeItem.id)}/download?version=signed`,
				{ method: "GET" }
			);

			const certificateEnvelopeItem = envelopeItems.find(
				isCertificateEnvelopeItem
			);
			const completionCertificateBytes = certificateEnvelopeItem
				? await tryDownloadOptionalArtifact(
						config,
						`/envelope/item/${encodeURIComponent(certificateEnvelopeItem.id)}/download`
					)
				: await tryDownloadOptionalArtifact(
						config,
						`/envelope/item/${encodeURIComponent(primaryEnvelopeItem.id)}/download?version=certificate`
					);

			return {
				completionCertificateBytes,
				finalPdfBytes,
			};
		},
	};
}
