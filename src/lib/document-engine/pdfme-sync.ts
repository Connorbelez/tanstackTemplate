import type { Schema, Template } from "@pdfme/common";
import type { InterpolableSchema } from "./pdfme-plugins/interpolable-field";
import type { SignableSchema } from "./pdfme-plugins/signable-field";
import type { FieldConfig, FieldMeta, SignableType } from "./types";

type PdfmeFieldSchema = InterpolableSchema | SignableSchema;

// ── Helpers: fieldMeta ──────────────────────────────────────────────

function buildFieldMeta(
	s: InterpolableSchema | SignableSchema
): FieldMeta | undefined {
	const meta: FieldMeta = {};
	if (s.placeholder) {
		meta.placeholder = s.placeholder;
	}
	if (s.helpText) {
		meta.helpText = s.helpText;
	}
	if (s.fieldReadOnly) {
		meta.readOnly = s.fieldReadOnly;
	}
	return Object.keys(meta).length > 0 ? meta : undefined;
}

function mergeFieldMeta(
	pdfmeSchema: PdfmeFieldSchema,
	existing?: FieldMeta
): FieldMeta | undefined {
	const merged: FieldMeta = {
		placeholder:
			pdfmeSchema.placeholder !== undefined && pdfmeSchema.placeholder !== ""
				? pdfmeSchema.placeholder
				: (existing?.placeholder ?? undefined),
		helpText:
			pdfmeSchema.helpText !== undefined && pdfmeSchema.helpText !== ""
				? pdfmeSchema.helpText
				: (existing?.helpText ?? undefined),
		readOnly: pdfmeSchema.fieldReadOnly ?? existing?.readOnly,
	};
	return Object.values(merged).some((v) => v !== undefined)
		? merged
		: undefined;
}

// ── Helpers: position ───────────────────────────────────────────────

function extractPosition(schema: Schema, pageIdx: number) {
	return {
		page: pageIdx,
		x: schema.position.x,
		y: schema.position.y,
		width: schema.width,
		height: schema.height,
	};
}

// ── Helpers: FieldConfig → pdfme schema ─────────────────────────────

function fieldToInterpolableSchema(field: FieldConfig): InterpolableSchema {
	return {
		name: field.id,
		type: "interpolableField",
		content: field.variableKey
			? `{{${field.variableKey}}}`
			: (field.label ?? ""),
		position: { x: field.position.x, y: field.position.y },
		width: field.position.width,
		height: field.position.height,
		readOnly: false,
		required: field.required ?? true,
		fieldKind: "interpolable",
		variableKey: field.variableKey ?? "",
		fieldLabel: field.label ?? "",
		placeholder: field.fieldMeta?.placeholder ?? "",
		helpText: field.fieldMeta?.helpText ?? "",
		fieldReadOnly: field.fieldMeta?.readOnly ?? false,
	};
}

function fieldToSignableSchema(field: FieldConfig): SignableSchema {
	return {
		name: field.id,
		type: "signableField",
		content: field.signableType ?? "SIGNATURE",
		position: { x: field.position.x, y: field.position.y },
		width: field.position.width,
		height: field.position.height,
		readOnly: false,
		required: field.required ?? true,
		fieldKind: "signable",
		signableType: field.signableType ?? "SIGNATURE",
		platformRole: field.signatoryPlatformRole ?? "",
		fieldLabel: field.label ?? "",
		placeholder: field.fieldMeta?.placeholder ?? "",
		helpText: field.fieldMeta?.helpText ?? "",
		fieldReadOnly: field.fieldMeta?.readOnly ?? false,
	};
}

// ── Helpers: pdfme schema → FieldConfig ─────────────────────────────

function schemaToFieldConfig(
	schema: Schema,
	pageIdx: number
): FieldConfig | null {
	const pdfmeSchema = schema as PdfmeFieldSchema;
	const base = {
		id: schema.name,
		position: extractPosition(schema, pageIdx),
		label: pdfmeSchema.fieldLabel || undefined,
		required: schema.required,
	};

	if (schema.type === "interpolableField") {
		const s = schema as InterpolableSchema;
		const fieldMeta = buildFieldMeta(s);
		return {
			...base,
			type: "interpolable",
			variableKey: s.variableKey || undefined,
			...(fieldMeta ? { fieldMeta } : {}),
		};
	}

	if (schema.type === "signableField") {
		const s = schema as SignableSchema;
		const fieldMeta = buildFieldMeta(s);
		return {
			...base,
			type: "signable",
			signableType: (s.signableType as SignableType) || undefined,
			signatoryPlatformRole: s.platformRole || undefined,
			...(fieldMeta ? { fieldMeta } : {}),
		};
	}

	return null;
}

// ── Helpers: merge existing FieldConfig with updated pdfme schema ───

function mergeExistingField(
	existing: FieldConfig,
	schema: Schema,
	pageIdx: number
): FieldConfig {
	const pdfmeSchema = schema as PdfmeFieldSchema;
	const mergedMeta = mergeFieldMeta(pdfmeSchema, existing.fieldMeta);

	const base: FieldConfig = {
		...existing,
		position: extractPosition(schema, pageIdx),
		label:
			pdfmeSchema.fieldLabel !== ""
				? pdfmeSchema.fieldLabel || existing.label
				: undefined,
		required: schema.required ?? existing.required,
		...(mergedMeta ? { fieldMeta: mergedMeta } : {}),
	};

	if (existing.type === "interpolable") {
		const newKey = (pdfmeSchema as InterpolableSchema).variableKey;
		base.variableKey =
			newKey !== undefined ? newKey || undefined : existing.variableKey;
	}

	if (existing.type === "signable") {
		const newSignableType = (pdfmeSchema as SignableSchema).signableType;
		const newPlatformRole = (pdfmeSchema as SignableSchema).platformRole;
		base.signableType =
			(newSignableType as SignableType) || existing.signableType;
		base.signatoryPlatformRole =
			newPlatformRole !== undefined
				? newPlatformRole || undefined
				: existing.signatoryPlatformRole;
	}

	return base;
}

// ── FieldConfig[] → pdfme Schema[][] ────────────────────────────────

export function fieldConfigsToPdfmeSchemas(
	fields: FieldConfig[],
	pageCount: number
): Schema[][] {
	const pages: Schema[][] = Array.from({ length: pageCount }, () => []);

	for (const field of fields) {
		const pageIdx = field.position.page;
		if (pageIdx < 0 || pageIdx >= pageCount) {
			continue;
		}

		const schema =
			field.type === "interpolable"
				? fieldToInterpolableSchema(field)
				: fieldToSignableSchema(field);
		pages[pageIdx].push(schema);
	}

	return pages;
}

// ── pdfme Schema[][] → FieldConfig[] ────────────────────────────────

export function pdfmeSchemasToFieldConfigs(schemas: Schema[][]): FieldConfig[] {
	const fields: FieldConfig[] = [];
	for (let pageIdx = 0; pageIdx < schemas.length; pageIdx++) {
		for (const schema of schemas[pageIdx]) {
			const field = schemaToFieldConfig(schema, pageIdx);
			if (field) {
				fields.push(field);
			}
		}
	}
	return fields;
}

// ── Merge pdfme changes with existing FieldConfig[] ─────────────────

export function mergePdfmeUpdate(
	existingFields: FieldConfig[],
	newSchemas: Schema[][]
): FieldConfig[] {
	const existingMap = new Map(existingFields.map((f) => [f.id, f]));
	const merged: FieldConfig[] = [];

	for (let pageIdx = 0; pageIdx < newSchemas.length; pageIdx++) {
		for (const schema of newSchemas[pageIdx]) {
			const existing = existingMap.get(schema.name);
			if (existing) {
				merged.push(mergeExistingField(existing, schema, pageIdx));
			} else {
				const field = schemaToFieldConfig(schema, pageIdx);
				if (field) {
					merged.push(field);
				}
			}
		}
	}

	return merged;
}

// ── Build a full pdfme Template for Designer or Generator ───────────

export function buildPdfmeTemplate(
	basePdf: string | ArrayBuffer,
	fields: FieldConfig[],
	pageCount: number
): Template {
	return {
		basePdf,
		schemas: fieldConfigsToPdfmeSchemas(fields, pageCount),
	};
}
