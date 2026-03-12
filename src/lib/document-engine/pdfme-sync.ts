import type { Schema, Template } from "@pdfme/common";
import type { InterpolableSchema } from "./pdfme-plugins/interpolable-field";
import type { SignableSchema } from "./pdfme-plugins/signable-field";
import type { FieldConfig, PlatformRole, SignableType } from "./types";

type PdfmeFieldSchema = InterpolableSchema | SignableSchema;

// ── FieldConfig[] → pdfme Schema[][] ────────────────────────────
// Groups our flat field list into pdfme's per-page 2D array format.
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

		if (field.type === "interpolable") {
			const schema: InterpolableSchema = {
				name: field.id,
				type: "interpolableField",
				content: field.variableKey
					? `{{${field.variableKey}}}`
					: (field.label ?? ""),
				position: { x: field.position.x, y: field.position.y },
				width: field.position.width,
				height: field.position.height,
				readOnly: false,
				fieldKind: "interpolable",
				variableKey: field.variableKey ?? "",
				fieldLabel: field.label ?? "",
			};
			pages[pageIdx].push(schema);
		} else {
			const schema: SignableSchema = {
				name: field.id,
				type: "signableField",
				content: field.signableType ?? "SIGNATURE",
				position: { x: field.position.x, y: field.position.y },
				width: field.position.width,
				height: field.position.height,
				readOnly: false,
				fieldKind: "signable",
				signableType: field.signableType ?? "SIGNATURE",
				platformRole: field.signatoryPlatformRole ?? "",
				fieldLabel: field.label ?? "",
			};
			pages[pageIdx].push(schema);
		}
	}

	return pages;
}

// ── pdfme Schema[][] → FieldConfig[] ────────────────────────────
// Flattens pdfme's 2D array back to our flat field list.
export function pdfmeSchemasToFieldConfigs(schemas: Schema[][]): FieldConfig[] {
	const fields: FieldConfig[] = [];

	for (let pageIdx = 0; pageIdx < schemas.length; pageIdx++) {
		for (const schema of schemas[pageIdx]) {
			const pdfmeSchema = schema as PdfmeFieldSchema;
			const base = {
				id: schema.name,
				position: {
					page: pageIdx,
					x: schema.position.x,
					y: schema.position.y,
					width: schema.width,
					height: schema.height,
				},
				label: pdfmeSchema.fieldLabel || undefined,
				required: schema.required,
			};

			if (schema.type === "interpolableField") {
				const s = schema as InterpolableSchema;
				fields.push({
					...base,
					type: "interpolable",
					variableKey: s.variableKey || undefined,
				});
			} else if (schema.type === "signableField") {
				const s = schema as SignableSchema;
				fields.push({
					...base,
					type: "signable",
					signableType: (s.signableType as SignableType) || undefined,
					signatoryPlatformRole: (s.platformRole as PlatformRole) || undefined,
				});
			}
		}
	}

	return fields;
}

// ── Merge pdfme changes with existing FieldConfig[] ─────────────
// When pdfme fires onChangeTemplate, position/size may have changed.
// We merge those geometric changes while preserving business props
// (fieldMeta, required, etc.) that our sidebar manages.
export function mergePdfmeUpdate(
	existingFields: FieldConfig[],
	newSchemas: Schema[][]
): FieldConfig[] {
	const existingMap = new Map(existingFields.map((f) => [f.id, f]));
	const merged: FieldConfig[] = [];

	for (let pageIdx = 0; pageIdx < newSchemas.length; pageIdx++) {
		for (const schema of newSchemas[pageIdx]) {
			const pdfmeSchema = schema as PdfmeFieldSchema;
			const existing = existingMap.get(schema.name);

			if (existing) {
				// Existing field — merge position from pdfme, keep business props
				merged.push({
					...existing,
					position: {
						page: pageIdx,
						x: schema.position.x,
						y: schema.position.y,
						width: schema.width,
						height: schema.height,
					},
					label: pdfmeSchema.fieldLabel || existing.label,
				});
			} else {
				// New field from pdfme — convert fully
				const base = {
					id: schema.name,
					position: {
						page: pageIdx,
						x: schema.position.x,
						y: schema.position.y,
						width: schema.width,
						height: schema.height,
					},
					label: pdfmeSchema.fieldLabel || undefined,
					required: true,
				};

				if (schema.type === "interpolableField") {
					const s = schema as InterpolableSchema;
					merged.push({
						...base,
						type: "interpolable",
						variableKey: s.variableKey || undefined,
					});
				} else if (schema.type === "signableField") {
					const s = schema as SignableSchema;
					merged.push({
						...base,
						type: "signable",
						signableType: (s.signableType as SignableType) || undefined,
						signatoryPlatformRole:
							(s.platformRole as PlatformRole) || undefined,
					});
				}
			}
		}
	}

	return merged;
}

// ── Build a full pdfme Template for Designer or Generator ───────
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
