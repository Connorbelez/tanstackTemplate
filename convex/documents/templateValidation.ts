import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
	ALLOWED_MORTGAGE_SIGNATORY_PLATFORM_ROLES,
	isSupportedMortgageDocumentVariableKey,
	type MortgageDocumentBlueprintClass,
	type MortgageDocumentValidationSummary,
} from "./contracts";

export async function loadPinnedTemplateSnapshot(
	ctx: Pick<QueryCtx | MutationCtx, "db">,
	args: {
		templateId: Id<"documentTemplates">;
		templateVersion?: number;
	}
) {
	const template = await ctx.db.get(args.templateId);
	if (!(template && "draft" in template)) {
		throw new ConvexError("Template not found");
	}

	let versionDoc: Doc<"documentTemplateVersions"> | null;
	if (args.templateVersion !== undefined) {
		const requestedVersion = args.templateVersion;
		versionDoc = await ctx.db
			.query("documentTemplateVersions")
			.withIndex("by_template", (query) =>
				query.eq("templateId", args.templateId).eq("version", requestedVersion)
			)
			.first();
	} else {
		versionDoc = await ctx.db
			.query("documentTemplateVersions")
			.withIndex("by_template", (query) =>
				query.eq("templateId", args.templateId)
			)
			.order("desc")
			.first();
	}

	if (!(versionDoc && "snapshot" in versionDoc)) {
		throw new ConvexError("Template has no published version");
	}

	return {
		snapshot: versionDoc.snapshot,
		template,
		templateVersion: versionDoc.version,
	};
}

export function buildMortgageDocumentValidationSummary(args: {
	documentClass: MortgageDocumentBlueprintClass;
	snapshot: Doc<"documentTemplateVersions">["snapshot"];
}): MortgageDocumentValidationSummary {
	const requiredVariableKeys = [
		...new Set(
			args.snapshot.fields
				.filter(
					(field): field is typeof field & { variableKey: string } =>
						field.type === "interpolable" &&
						typeof field.variableKey === "string"
				)
				.map((field) => field.variableKey)
		),
	];
	const requiredPlatformRoles = [
		...new Set(
			args.snapshot.signatories.map((signatory) => signatory.platformRole)
		),
	];
	const containsSignableFields = args.snapshot.fields.some(
		(field) => field.type === "signable"
	);
	const supportedRoles = new Set<string>(
		ALLOWED_MORTGAGE_SIGNATORY_PLATFORM_ROLES
	);
	const unsupportedPlatformRoles = requiredPlatformRoles.filter(
		(role) => !supportedRoles.has(role)
	);
	const unsupportedVariableKeys = requiredVariableKeys.filter(
		(key) => !isSupportedMortgageDocumentVariableKey(key)
	);

	if (
		args.documentClass === "private_templated_non_signable" &&
		containsSignableFields
	) {
		throw new ConvexError(
			"Non-signable private templated drafts cannot contain signable fields."
		);
	}

	if (args.documentClass === "private_templated_signable") {
		if (!containsSignableFields) {
			throw new ConvexError(
				"Signable private templated drafts must contain at least one signable field."
			);
		}
		if (requiredPlatformRoles.length === 0) {
			throw new ConvexError(
				"Signable private templated drafts must contain at least one platform role."
			);
		}
	}

	if (unsupportedVariableKeys.length > 0) {
		throw new ConvexError(
			`Template uses unsupported deal variables: ${unsupportedVariableKeys.join(", ")}`
		);
	}

	if (unsupportedPlatformRoles.length > 0) {
		throw new ConvexError(
			`Template uses unsupported signatory roles: ${unsupportedPlatformRoles.join(", ")}`
		);
	}

	return {
		containsSignableFields,
		requiredPlatformRoles,
		requiredVariableKeys,
		unsupportedPlatformRoles,
		unsupportedVariableKeys,
	};
}
