import type { Id } from "../../_generated/dataModel";
import type {
	DealDocumentInstanceStatus,
	GeneratedDocumentSigningStatus,
	SignatureEnvelopeStatus,
	SignatureProviderCode,
	SignatureProviderRole,
	SignatureRecipientStatus,
} from "../contracts";
import {
	createDocumensoSignatureProvider,
	type DocumensoSignatureProviderFactoryOptions,
} from "./documenso";

export interface SignatureFieldMeta {
	helpText?: string;
	placeholder?: string;
	readOnly?: boolean;
}

export interface SignatureProviderField {
	fieldMeta?: SignatureFieldMeta;
	height: number;
	identifier?: number | string;
	pageNumber: number;
	positionX: number;
	positionY: number;
	required: boolean;
	type: string;
	width: number;
}

export interface SignatureProviderRecipientInput {
	email: string;
	fields: SignatureProviderField[];
	name: string;
	platformRole: string;
	providerRole: SignatureProviderRole;
	signingOrder: number;
}

export interface SignatureProviderCreateEnvelopeInput {
	dealId: Id<"deals">;
	generatedDocumentId: Id<"generatedDocuments">;
	metadata?: Record<string, string>;
	pdfStorageId: Id<"_storage">;
	recipients: SignatureProviderRecipientInput[];
	title: string;
}

export interface SignatureProviderCreateEnvelopeResult {
	lastError?: string;
	providerEnvelopeId: string;
	recipients: Array<{
		platformRole: string;
		providerRecipientId?: string;
		signingUrl?: string;
		token?: string;
	}>;
	status: "draft" | "sent";
}

export interface SignatureProviderCreateEmbeddedSigningSessionInput {
	providerEnvelopeId: string;
	providerRecipientId: string;
}

export interface SignatureProviderCreateEmbeddedSigningSessionResult {
	expiresAt: number;
	url: string;
}

export interface SignatureProviderSyncEnvelopeInput {
	providerEnvelopeId: string;
}

export interface SignatureProviderSyncEnvelopeResult {
	envelopeStatus: SignatureEnvelopeStatus;
	recipients: Array<{
		openedAt?: number;
		providerRecipientId: string;
		signedAt?: number;
		status: SignatureRecipientStatus;
		declinedAt?: number;
	}>;
}

export interface SignatureProviderDownloadCompletedArtifactsInput {
	providerEnvelopeId: string;
}

export interface SignatureProviderDownloadCompletedArtifactsResult {
	completionCertificateBytes?: ArrayBuffer;
	finalPdfBytes: ArrayBuffer;
}

export interface SignatureProvider {
	createEmbeddedSigningSession(
		input: SignatureProviderCreateEmbeddedSigningSessionInput
	): Promise<SignatureProviderCreateEmbeddedSigningSessionResult>;
	createEnvelope(
		input: SignatureProviderCreateEnvelopeInput
	): Promise<SignatureProviderCreateEnvelopeResult>;
	downloadCompletedArtifacts(
		input: SignatureProviderDownloadCompletedArtifactsInput
	): Promise<SignatureProviderDownloadCompletedArtifactsResult>;
	syncEnvelope(
		input: SignatureProviderSyncEnvelopeInput
	): Promise<SignatureProviderSyncEnvelopeResult>;
}

export type SignatureProviderFactoryOptions =
	DocumensoSignatureProviderFactoryOptions;

export function getSignatureProvider(
	code: SignatureProviderCode,
	options: SignatureProviderFactoryOptions
): SignatureProvider {
	switch (code) {
		case "documenso":
			return createDocumensoSignatureProvider(options);
		default:
			throw new Error(`Unsupported signature provider: ${String(code)}`);
	}
}

export function mapEnvelopeStatusToGeneratedDocumentSigningStatus(
	status: SignatureEnvelopeStatus
): GeneratedDocumentSigningStatus {
	switch (status) {
		case "draft":
			return "draft";
		case "sent":
			return "sent";
		case "partially_signed":
			return "partially_signed";
		case "completed":
			return "completed";
		case "declined":
			return "declined";
		case "voided":
			return "voided";
		case "provider_error":
			return "provider_error";
		default:
			throw new Error(`Unsupported signature envelope status: ${status}`);
	}
}

export function mapEnvelopeStatusToDealDocumentInstanceStatus(
	status: SignatureEnvelopeStatus
): DealDocumentInstanceStatus {
	switch (status) {
		case "draft":
			return "signature_draft";
		case "sent":
			return "signature_sent";
		case "partially_signed":
			return "signature_partially_signed";
		case "completed":
			return "signed";
		case "declined":
			return "signature_declined";
		case "voided":
			return "signature_voided";
		case "provider_error":
			return "generation_failed";
		default:
			throw new Error(`Unsupported signature envelope status: ${status}`);
	}
}
