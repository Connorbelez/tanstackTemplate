import { type Infer, v } from "convex/values";
import {
	MORTGAGE_DOCUMENT_SIGNATORY_ROLES,
	SUPPORTED_DEAL_DOCUMENT_VARIABLE_KEYS,
} from "../../src/lib/document-engine/contracts";

export const mortgageDocumentBlueprintClassValidator = v.union(
	v.literal("public_static"),
	v.literal("private_static"),
	v.literal("private_templated_non_signable"),
	v.literal("private_templated_signable")
);

export const mortgageDocumentSourceKindValidator = v.union(
	v.literal("asset"),
	v.literal("template_version")
);

export const mortgageDocumentBlueprintStatusValidator = v.union(
	v.literal("active"),
	v.literal("archived")
);

export const mortgageDocumentTemplateSnapshotMetaValidator = v.object({
	containsSignableFields: v.boolean(),
	requiredPlatformRoles: v.array(v.string()),
	requiredVariableKeys: v.array(v.string()),
	sourceGroupId: v.optional(v.id("documentTemplateGroups")),
	sourceGroupName: v.optional(v.string()),
	templateName: v.string(),
});

export const mortgageDocumentValidationSummaryValidator = v.object({
	containsSignableFields: v.boolean(),
	requiredPlatformRoles: v.array(v.string()),
	requiredVariableKeys: v.array(v.string()),
	unsupportedPlatformRoles: v.array(v.string()),
	unsupportedVariableKeys: v.array(v.string()),
});

export type MortgageDocumentBlueprintClass = Infer<
	typeof mortgageDocumentBlueprintClassValidator
>;

export type MortgageDocumentSourceKind = Infer<
	typeof mortgageDocumentSourceKindValidator
>;

export type MortgageDocumentBlueprintStatus = Infer<
	typeof mortgageDocumentBlueprintStatusValidator
>;

export type MortgageDocumentValidationSummary = Infer<
	typeof mortgageDocumentValidationSummaryValidator
>;

export const dealDocumentPackageStatusValidator = v.union(
	v.literal("pending"),
	v.literal("ready"),
	v.literal("partial_failure"),
	v.literal("failed"),
	v.literal("archived")
);

export const signatureProviderCodeValidator = v.literal("documenso");

export const signatureProviderRoleValidator = v.union(
	v.literal("SIGNER"),
	v.literal("APPROVER"),
	v.literal("VIEWER")
);

export const signatureEnvelopeStatusValidator = v.union(
	v.literal("draft"),
	v.literal("sent"),
	v.literal("partially_signed"),
	v.literal("completed"),
	v.literal("declined"),
	v.literal("voided"),
	v.literal("provider_error")
);

export const signatureRecipientStatusValidator = v.union(
	v.literal("pending"),
	v.literal("opened"),
	v.literal("signed"),
	v.literal("declined")
);

export const generatedDocumentSigningStatusValidator = v.union(
	v.literal("not_applicable"),
	v.literal("draft"),
	v.literal("sent"),
	v.literal("partially_signed"),
	v.literal("completed"),
	v.literal("declined"),
	v.literal("voided"),
	v.literal("provider_error")
);

export const dealDocumentInstanceKindValidator = v.union(
	v.literal("static_reference"),
	v.literal("generated")
);

export const dealDocumentInstanceStatusValidator = v.union(
	v.literal("available"),
	v.literal("generation_failed"),
	v.literal("signature_pending_recipient_resolution"),
	v.literal("signature_draft"),
	v.literal("signature_sent"),
	v.literal("signature_partially_signed"),
	v.literal("signature_declined"),
	v.literal("signature_voided"),
	v.literal("signed"),
	v.literal("archived")
);

export const dealDocumentSourceBlueprintSnapshotValidator = v.object({
	category: v.optional(v.string()),
	class: mortgageDocumentBlueprintClassValidator,
	description: v.optional(v.string()),
	displayName: v.string(),
	displayOrder: v.number(),
	packageKey: v.optional(v.string()),
	packageLabel: v.optional(v.string()),
	templateId: v.optional(v.id("documentTemplates")),
	templateVersion: v.optional(v.number()),
});

export const dealPackageBlueprintSnapshotValidator = v.object({
	assetId: v.optional(v.id("documentAssets")),
	sourceBlueprintId: v.optional(v.id("mortgageDocumentBlueprints")),
	sourceBlueprintSnapshot: dealDocumentSourceBlueprintSnapshotValidator,
});

export type DealDocumentPackageStatus = Infer<
	typeof dealDocumentPackageStatusValidator
>;

export type SignatureProviderCode = Infer<
	typeof signatureProviderCodeValidator
>;

export type SignatureProviderRole = Infer<
	typeof signatureProviderRoleValidator
>;

export type SignatureEnvelopeStatus = Infer<
	typeof signatureEnvelopeStatusValidator
>;

export type SignatureRecipientStatus = Infer<
	typeof signatureRecipientStatusValidator
>;

export type GeneratedDocumentSigningStatus = Infer<
	typeof generatedDocumentSigningStatusValidator
>;

export type DealDocumentInstanceKind = Infer<
	typeof dealDocumentInstanceKindValidator
>;

export type DealDocumentInstanceStatus = Infer<
	typeof dealDocumentInstanceStatusValidator
>;

export type DealDocumentSourceBlueprintSnapshot = Infer<
	typeof dealDocumentSourceBlueprintSnapshotValidator
>;

export type DealPackageBlueprintSnapshot = Infer<
	typeof dealPackageBlueprintSnapshotValidator
>;

export const ALLOWED_MORTGAGE_SIGNATORY_PLATFORM_ROLES =
	MORTGAGE_DOCUMENT_SIGNATORY_ROLES;

export const SUPPORTED_MORTGAGE_DOCUMENT_VARIABLE_KEYS =
	SUPPORTED_DEAL_DOCUMENT_VARIABLE_KEYS;

export function isAllowedMortgageSignatoryPlatformRole(role: string) {
	return (
		ALLOWED_MORTGAGE_SIGNATORY_PLATFORM_ROLES as readonly string[]
	).includes(role);
}

export function isSupportedMortgageDocumentVariableKey(key: string) {
	return (
		SUPPORTED_MORTGAGE_DOCUMENT_VARIABLE_KEYS as readonly string[]
	).includes(key);
}

export function isPublicMortgageDocumentClass(
	documentClass: MortgageDocumentBlueprintClass
) {
	return documentClass === "public_static";
}

export function isStaticMortgageDocumentClass(
	documentClass: MortgageDocumentBlueprintClass
) {
	return (
		documentClass === "public_static" || documentClass === "private_static"
	);
}

export function isTemplatedMortgageDocumentClass(
	documentClass: MortgageDocumentBlueprintClass
) {
	return !isStaticMortgageDocumentClass(documentClass);
}
