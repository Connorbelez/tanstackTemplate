import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { internalAction } from "../_generated/server";
import { documentGenerateAction, documentUploadMutation } from "../fluent";

// ── Types for generation results ──────────────────────────────────

interface DocumensoFieldForRecipient {
	fieldMeta?: {
		helpText?: string;
		placeholder?: string;
		readOnly?: boolean;
	};
	height: number;
	pageNumber: number;
	positionX: number;
	positionY: number;
	required: boolean;
	type: string;
	width: number;
}

interface DocumensoRecipient {
	email: string;
	fields: DocumensoFieldForRecipient[];
	name: string;
	platformRole: string;
	role: "SIGNER" | "APPROVER" | "VIEWER";
	signingOrder: number;
}

interface GenerationSuccess {
	documensoConfig: {
		recipients: DocumensoRecipient[];
	};
	missingVariables: string[];
	pdfRef: Id<"_storage">;
	success: true;
	templateVersionUsed: number;
}

interface GenerationMissing {
	documensoConfig: null;
	missingVariables: string[];
	pdfRef: null;
	success: false;
	templateVersionUsed: number;
}

type GenerationResult = GenerationSuccess | GenerationMissing;

// ── Field/signatory types mirroring the schema ────────────────────

interface FieldConfig {
	fieldMeta?: {
		helpText?: string;
		placeholder?: string;
		readOnly?: boolean;
	};
	id: string;
	label?: string;
	position: {
		height: number;
		page: number;
		width: number;
		x: number;
		y: number;
	};
	required?: boolean;
	signableType?: string;
	signatoryPlatformRole?: string;
	type: "interpolable" | "signable";
	variableKey?: string;
}

interface SignatoryConfig {
	order: number;
	platformRole: string;
	role: string;
}

interface PageDimension {
	height: number;
	page: number;
	width: number;
}

// ── Validation helpers ───────────────────────────────────────────

const BOOLEAN_VALUES = new Set(["true", "false", "1", "0", "yes", "no"]);

function isValidForType(value: string, varType: string): boolean {
	switch (varType) {
		case "currency":
		case "percentage":
			return !Number.isNaN(Number.parseFloat(value));
		case "integer": {
			const num = Number(value);
			return !Number.isNaN(num) && Number.isInteger(num);
		}
		case "date":
			return !Number.isNaN(Date.parse(value));
		case "boolean":
			return BOOLEAN_VALUES.has(value.toLowerCase());
		default:
			return true;
	}
}

function validateVariableTypes(
	requiredKeys: string[],
	variables: Record<string, string>,
	variableMap: Map<string, Doc<"systemVariables">>
): void {
	const typeErrors: string[] = [];
	for (const key of requiredKeys) {
		const variable = variableMap.get(key);
		if (!variable) {
			continue;
		}
		if (!isValidForType(variables[key], variable.type)) {
			typeErrors.push(
				`"${key}": expected ${variable.type}, got "${variables[key]}"`
			);
		}
	}
	if (typeErrors.length > 0) {
		throw new ConvexError(
			`Variable type validation failed: ${typeErrors.join("; ")}`
		);
	}
}

function validateSignatoryMappings(
	signatories: SignatoryConfig[],
	signatoryMapping: Array<{
		platformRole: string;
		name: string;
		email: string;
	}>
): Map<string, (typeof signatoryMapping)[number]> {
	const roleMap = new Map(signatoryMapping.map((s) => [s.platformRole, s]));
	const missingMappings: string[] = [];
	const invalidMappings: string[] = [];
	for (const sig of signatories) {
		const mapping = roleMap.get(sig.platformRole);
		if (mapping) {
			if (!mapping.name.trim()) {
				invalidMappings.push(`"${sig.platformRole}": name is empty`);
			}
			if (!mapping.email.trim()) {
				invalidMappings.push(`"${sig.platformRole}": email is empty`);
			}
		} else {
			missingMappings.push(sig.platformRole);
		}
	}
	if (missingMappings.length > 0 || invalidMappings.length > 0) {
		const parts: string[] = [];
		if (missingMappings.length > 0) {
			parts.push(`missing mappings for: ${missingMappings.join(", ")}`);
		}
		if (invalidMappings.length > 0) {
			parts.push(invalidMappings.join("; "));
		}
		throw new ConvexError(
			`Signatory mapping validation failed: ${parts.join("; ")}`
		);
	}
	return roleMap;
}

async function verifyPdfIntegrity(
	pdfBytes: Uint8Array,
	expectedHash: string
): Promise<void> {
	const hashBuffer = await crypto.subtle.digest(
		"SHA-256",
		pdfBytes.buffer as ArrayBuffer
	);
	const currentHash = Array.from(new Uint8Array(hashBuffer))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
	if (currentHash !== expectedHash) {
		throw new ConvexError(
			"PDF integrity check failed: base PDF has been modified since this template version was published"
		);
	}
}

// ── Format variable values (shared between prepare + generate) ───

async function formatVariableValues(
	requiredKeys: string[],
	variables: Record<string, string>,
	variableMap: Map<string, Doc<"systemVariables">>
): Promise<Record<string, string>> {
	const { formatValue } = await import(
		"../../src/lib/document-engine/formatting"
	);

	const formattedValues: Record<string, string> = {};
	for (const key of requiredKeys) {
		const variable = variableMap.get(key);
		if (variable) {
			formattedValues[key] = formatValue(
				variables[key],
				variable.type as Parameters<typeof formatValue>[1],
				variable.formatOptions ?? undefined
			);
		} else {
			formattedValues[key] = variables[key];
		}
	}
	return formattedValues;
}

// ── PDF generation with pdf-lib (server-side fallback) ───────────

async function generatePdfWithPdfLib(
	pdfBytes: Uint8Array,
	fields: FieldConfig[],
	formattedValues: Record<string, string>
): Promise<Uint8Array> {
	const { PDFDocument, rgb, StandardFonts } = await import("pdf-lib");
	const pdfDoc = await PDFDocument.load(pdfBytes);
	const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

	const pageCount = pdfDoc.getPageCount();
	for (const field of fields) {
		if (field.type === "interpolable" && field.variableKey) {
			const value = formattedValues[field.variableKey] ?? "";
			if (field.position.page < 0 || field.position.page >= pageCount) {
				throw new Error(
					`Field "${field.variableKey}" references invalid page ${field.position.page} (document has ${pageCount} pages)`
				);
			}
			const page = pdfDoc.getPage(field.position.page);
			const fontSize = Math.min(field.position.height * 0.7, 12);

			page.drawText(value, {
				x: field.position.x,
				y:
					page.getHeight() -
					field.position.y -
					field.position.height +
					fontSize * 0.3,
				size: fontSize,
				font,
				color: rgb(0, 0, 0),
			});
		}
	}

	const generatedBytes = await pdfDoc.save();
	return new Uint8Array(generatedBytes);
}

// ── Documenso config builder ────────────────────────────────────

function buildDocumensoConfig(
	snapshot: { fields: FieldConfig[]; signatories: SignatoryConfig[] },
	signatoryRoleMap: Map<
		string,
		{ platformRole: string; name: string; email: string }
	>,
	pageDimensions: PageDimension[]
): { recipients: DocumensoRecipient[] } {
	const pageDimMap = new Map(
		pageDimensions.map((d: PageDimension) => [d.page, d])
	);

	// Group fields by signatory platform role
	const fieldsByRole = new Map<string, DocumensoFieldForRecipient[]>();

	for (const field of snapshot.fields) {
		if (field.type !== "signable" || !field.signatoryPlatformRole) {
			continue;
		}

		const pageDim = pageDimMap.get(field.position.page) ?? {
			width: 612,
			height: 792,
		};

		const docField: DocumensoFieldForRecipient = {
			type: field.signableType ?? "SIGNATURE",
			pageNumber: field.position.page + 1,
			positionX: (field.position.x / pageDim.width) * 100,
			positionY: (field.position.y / pageDim.height) * 100,
			width: (field.position.width / pageDim.width) * 100,
			height: (field.position.height / pageDim.height) * 100,
			required: field.required ?? true,
			...(field.fieldMeta ? { fieldMeta: field.fieldMeta } : {}),
		};

		const existing = fieldsByRole.get(field.signatoryPlatformRole) ?? [];
		existing.push(docField);
		fieldsByRole.set(field.signatoryPlatformRole, existing);
	}

	// Build recipients with nested fields (spec-aligned)
	const recipients: DocumensoRecipient[] = snapshot.signatories.map(
		(sig: SignatoryConfig) => {
			const mapping = signatoryRoleMap.get(sig.platformRole);

			let docRole: "SIGNER" | "APPROVER" | "VIEWER" = "VIEWER";
			if (sig.role === "signatory") {
				docRole = "SIGNER";
			} else if (sig.role === "approver") {
				docRole = "APPROVER";
			}

			return {
				name: mapping?.name ?? "",
				email: mapping?.email ?? "",
				platformRole: sig.platformRole,
				role: docRole,
				signingOrder: sig.order,
				fields: fieldsByRole.get(sig.platformRole) ?? [],
			};
		}
	);

	return { recipients };
}

// ── Client-side generation: prepare (validate + format) ──────────
// Returns everything the browser needs to run pdfme generate() locally.

const signatoryMappingArg = v.array(
	v.object({
		platformRole: v.string(),
		name: v.string(),
		email: v.string(),
	})
);

export const prepareGeneration = documentGenerateAction
	.input({
		templateId: v.id("documentTemplates"),
		pinnedVersion: v.optional(v.number()),
		variables: v.record(v.string(), v.string()),
		signatoryMapping: signatoryMappingArg,
	})
	.handler(
		async (
			ctx,
			args
		): Promise<
			| {
					success: false;
					missingVariables: string[];
					templateVersionUsed: number;
			  }
			| {
					success: true;
					missingVariables: string[];
					templateVersionUsed: number;
					basePdfUrl: string;
					basePdfHash: string;
					fields: FieldConfig[];
					pageDimensions: PageDimension[];
					formattedValues: Record<string, string>;
					documensoConfig: { recipients: DocumensoRecipient[] };
			  }
		> => {
			// Load template, version, base PDF, and variables in one query
			const data = await ctx.runQuery(
				internal.documentEngine.generationHelpers.prepareGenerationData,
				{
					templateId: args.templateId,
					pinnedVersion: args.pinnedVersion,
				}
			);
			if (!data) {
				throw new ConvexError("Template, version, or base PDF not found");
			}

			const snapshot = data.snapshot as {
				fields: FieldConfig[];
				signatories: SignatoryConfig[];
			};
			const variableMap = new Map(
				data.allVariables.map((sysVar: Doc<"systemVariables">) => [
					sysVar.key,
					sysVar,
				])
			);

			// Validate variable presence
			const requiredKeys = snapshot.fields
				.filter((f) => f.type === "interpolable" && f.variableKey)
				.map((f) => f.variableKey as string);

			const missingKeys = requiredKeys.filter(
				(key) => !(key in args.variables)
			);
			if (missingKeys.length > 0) {
				return {
					success: false as const,
					missingVariables: missingKeys,
					templateVersionUsed: data.version,
				};
			}

			// Validate variable types (REQ-93)
			validateVariableTypes(
				requiredKeys,
				args.variables,
				variableMap as Map<string, Doc<"systemVariables">>
			);

			// Validate signatory mappings
			const signatoryRoleMap = validateSignatoryMappings(
				snapshot.signatories,
				args.signatoryMapping
			);

			// Format values
			const formattedValues = await formatVariableValues(
				requiredKeys,
				args.variables,
				variableMap as Map<string, Doc<"systemVariables">>
			);

			// Build Documenso config
			const documensoConfig = buildDocumensoConfig(
				snapshot,
				signatoryRoleMap,
				data.basePdf.pageDimensions as PageDimension[]
			);

			return {
				success: true as const,
				missingVariables: [] as string[],
				templateVersionUsed: data.version,
				basePdfUrl: data.basePdfUrl,
				basePdfHash: data.basePdfHash,
				fields: snapshot.fields,
				pageDimensions: data.basePdf.pageDimensions,
				formattedValues,
				documensoConfig,
			};
		}
	)
	.public();

// ── Upload URL for client-generated PDFs ────────────────────────

export const generateUploadUrl = documentUploadMutation
	.input({})
	.handler(async (ctx) => {
		return await ctx.storage.generateUploadUrl();
	})
	.public();

// ── Core generation logic (internal, used by group action) ───────
// Uses pdf-lib only — pdfme runs client-side for single templates.

export const generateSingleTemplate = internalAction({
	args: {
		templateId: v.id("documentTemplates"),
		pinnedVersion: v.optional(v.number()),
		variables: v.record(v.string(), v.string()),
		signatoryMapping: signatoryMappingArg,
	},
	handler: async (ctx, args): Promise<GenerationResult> => {
		// 1. Load template + version
		const template = await ctx.runQuery(
			internal.documentEngine.generationHelpers.getTemplateWithVersion,
			{
				templateId: args.templateId,
				pinnedVersion: args.pinnedVersion,
			}
		);
		if (!template) {
			throw new ConvexError("Template or version not found");
		}

		const snapshot = template.snapshot as {
			fields: FieldConfig[];
			signatories: SignatoryConfig[];
		};
		const basePdf = template.basePdf as Doc<"documentBasePdfs">;
		const expectedHash = template.basePdfHash as string;

		// 2. Load base PDF + integrity check
		const pdfBlob = await ctx.storage.get(basePdf.fileRef);
		if (!pdfBlob) {
			throw new ConvexError("Base PDF file not found in storage");
		}
		const pdfBytes = new Uint8Array(await pdfBlob.arrayBuffer());
		await verifyPdfIntegrity(pdfBytes, expectedHash);

		// 3. Validate variable presence
		const allVariables: Doc<"systemVariables">[] = await ctx.runQuery(
			internal.documentEngine.generationHelpers.getAllVariables,
			{}
		);
		const variableMap = new Map(
			allVariables.map((variable) => [variable.key, variable])
		);

		const requiredKeys: string[] = snapshot.fields
			.filter((f: FieldConfig) => f.type === "interpolable" && f.variableKey)
			.map((f: FieldConfig) => f.variableKey as string);

		const missingKeys = requiredKeys.filter(
			(key: string) => !(key in args.variables)
		);
		if (missingKeys.length > 0) {
			return {
				success: false,
				missingVariables: missingKeys,
				pdfRef: null,
				templateVersionUsed: template.version as number,
				documensoConfig: null,
			};
		}

		// 3b. Variable type validation (REQ-93)
		validateVariableTypes(requiredKeys, args.variables, variableMap);

		// 3c. Signatory mapping validation
		const signatoryRoleMap = validateSignatoryMappings(
			snapshot.signatories,
			args.signatoryMapping
		);

		// 4. Format variable values
		const formattedValues = await formatVariableValues(
			requiredKeys,
			args.variables,
			variableMap
		);

		// 5. Generate PDF with pdf-lib (server-side)
		const generatedBytes = await generatePdfWithPdfLib(
			pdfBytes,
			snapshot.fields,
			formattedValues
		);

		const pdfRef = await ctx.storage.store(
			new Blob([generatedBytes as BlobPart], { type: "application/pdf" })
		);

		// 6. Build Documenso config with nested fields-inside-recipients
		const documensoConfig = buildDocumensoConfig(
			snapshot,
			signatoryRoleMap,
			basePdf.pageDimensions as PageDimension[]
		);

		return {
			success: true,
			missingVariables: [],
			pdfRef,
			templateVersionUsed: template.version as number,
			documensoConfig,
		};
	},
});

// ── Public actions ────────────────────────────────────────────────

export const generateFromTemplate = documentGenerateAction
	.input({
		templateId: v.id("documentTemplates"),
		pinnedVersion: v.optional(v.number()),
		variables: v.record(v.string(), v.string()),
		signatoryMapping: signatoryMappingArg,
	})
	.handler(async (ctx, args): Promise<GenerationResult> => {
		return await ctx.runAction(
			internal.documentEngine.generation.generateSingleTemplate,
			args
		);
	})
	.public();

export const generateFromGroup = documentGenerateAction
	.input({
		groupId: v.id("documentTemplateGroups"),
		variables: v.record(v.string(), v.string()),
		signatoryMapping: signatoryMappingArg,
	})
	.handler(
		async (
			ctx,
			args
		): Promise<{
			documents: Array<
				{ templateId: Id<"documentTemplates"> } & GenerationResult
			>;
		}> => {
			const group = await ctx.runQuery(
				internal.documentEngine.generationHelpers.getGroup,
				{ groupId: args.groupId }
			);
			if (!group) {
				throw new ConvexError("Group not found");
			}

			type GroupDoc = NonNullable<typeof group>;
			const sortedRefs = [...(group as GroupDoc).templateRefs].sort(
				(a, b) => a.order - b.order
			);

			// Pre-validate all templates have published versions (REQ-98)
			const failures = await ctx.runQuery(
				internal.documentEngine.generationHelpers.validateGroupTemplates,
				{ templateRefs: sortedRefs }
			);
			if (failures.length > 0) {
				throw new ConvexError(
					`Group pre-validation failed: ${failures.map((failure: { templateId: string; reason: string }) => failure.reason).join("; ")}`
				);
			}

			const results: Array<
				{ templateId: Id<"documentTemplates"> } & GenerationResult
			> = [];
			for (const ref of sortedRefs) {
				const result: GenerationResult = await ctx.runAction(
					internal.documentEngine.generation.generateSingleTemplate,
					{
						templateId: ref.templateId,
						pinnedVersion: ref.pinnedVersion as number | undefined,
						variables: args.variables,
						signatoryMapping: args.signatoryMapping,
					}
				);
				results.push({ templateId: ref.templateId, ...result });
			}

			return { documents: results };
		}
	)
	.public();
