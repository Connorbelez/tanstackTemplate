import type { Schema, Template } from "@pdfme/common";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import type {
	DEMO_DOCUMENT_SIGNATORY_ROLE_OPTIONS,
	DocumentSignatoryRoleOption,
} from "./contracts";

// ── Re-exported document types for convenience ────────────────────
export type BasePdf = Doc<"documentBasePdfs">;
export type SystemVariable = Doc<"systemVariables">;
export type DocumentTemplate = Doc<"documentTemplates">;
export type TemplateVersion = Doc<"documentTemplateVersions">;
export type TemplateGroup = Doc<"documentTemplateGroups">;

// ── Variable types (mirrors convex validator) ─────────────────────
export type VariableType =
	| "string"
	| "currency"
	| "date"
	| "percentage"
	| "integer"
	| "boolean";

export type DemoDocumentSignatoryRole =
	(typeof DEMO_DOCUMENT_SIGNATORY_ROLE_OPTIONS)[number]["value"];

export type PlatformRole = DemoDocumentSignatoryRole;

export type DocumentRolePalette = DocumentSignatoryRoleOption;

// Shared signatory config interface (matches validator shape)
export interface SignatoryConfig {
	label?: string;
	order: number;
	platformRole: string;
	role: "signatory" | "approver" | "viewer";
}

// ── Signable field types (Documenso) ──────────────────────────────
export type SignableType =
	| "SIGNATURE"
	| "INITIALS"
	| "NAME"
	| "EMAIL"
	| "DATE"
	| "TEXT"
	| "NUMBER"
	| "RADIO"
	| "CHECKBOX"
	| "DROPDOWN";

// ── Field position / config (shared by designer + components) ────
export interface FieldPosition {
	height: number;
	page: number;
	width: number;
	x: number;
	y: number;
}

export interface FieldMeta {
	helpText?: string;
	placeholder?: string;
	readOnly?: boolean;
}

export interface FieldConfig {
	fieldMeta?: FieldMeta;
	id: string;
	label?: string;
	position: FieldPosition;
	required?: boolean;
	signableType?: SignableType;
	signatoryPlatformRole?: string;
	type: "interpolable" | "signable";
	variableKey?: string;
}

// ── Format options ────────────────────────────────────────────────
export interface FormatOptions {
	booleanFalseLabel?: string;
	booleanTrueLabel?: string;
	currencyCode?: string;
	dateFormat?: string;
	decimalPlaces?: number;
}

// ── Documenso config output (nested: fields inside recipients) ───
export interface DocumensoFieldForRecipient {
	fieldMeta?: FieldMeta;
	height: number;
	pageNumber: number;
	positionX: number;
	positionY: number;
	required: boolean;
	type: string;
	width: number;
}

export interface DocumensoRecipient {
	email: string;
	fields: DocumensoFieldForRecipient[];
	name: string;
	role: "SIGNER" | "APPROVER" | "VIEWER";
	signingOrder: number;
}

export interface DocumensoConfig {
	recipients: DocumensoRecipient[];
}

// ── Generation result ─────────────────────────────────────────────
export interface GenerationResult {
	documensoConfig: DocumensoConfig;
	pdfRef: Id<"_storage">;
	templateVersionUsed: number;
}

// ── pdfme types ──────────────────────────────────────────────────
export type PdfmeSchema = Schema;
export type PdfmeTemplate = Template;
