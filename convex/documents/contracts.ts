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
