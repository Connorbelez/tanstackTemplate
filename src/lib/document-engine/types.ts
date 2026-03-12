import type { Schema, Template } from "@pdfme/common";
import type { Doc, Id } from "../../../convex/_generated/dataModel";

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

// ── Domain roles (the known 6) — used for color/label lookup type narrowing ──
export const DOMAIN_ROLES = [
	"fairlend_broker",
	"lender_lawyer",
	"lender",
	"seller_lawyer",
	"borrower_lawyer",
	"borrower",
] as const;

export type DomainRole = (typeof DOMAIN_ROLES)[number];

// Keep PlatformRole as alias for backward compat in color maps
export type PlatformRole = DomainRole;

export function isDomainRole(role: string): role is DomainRole {
	return (DOMAIN_ROLES as readonly string[]).includes(role);
}

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
