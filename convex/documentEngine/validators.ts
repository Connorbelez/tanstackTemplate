import { v } from "convex/values";

// ── Platform roles (who receives a document) ──────────────────────
export const platformRoleValidator = v.string();

// ── Signatory action roles ────────────────────────────────────────
export const signatoryRoleValidator = v.union(
	v.literal("signatory"),
	v.literal("approver"),
	v.literal("viewer")
);

// ── Documenso signable field types ────────────────────────────────
export const signableTypeValidator = v.union(
	v.literal("SIGNATURE"),
	v.literal("INITIALS"),
	v.literal("NAME"),
	v.literal("EMAIL"),
	v.literal("DATE"),
	v.literal("TEXT"),
	v.literal("NUMBER"),
	v.literal("RADIO"),
	v.literal("CHECKBOX"),
	v.literal("DROPDOWN")
);

// ── System variable types ─────────────────────────────────────────
export const variableTypeValidator = v.union(
	v.literal("string"),
	v.literal("currency"),
	v.literal("date"),
	v.literal("percentage"),
	v.literal("integer"),
	v.literal("boolean")
);

// ── Format options for variable rendering ─────────────────────────
export const formatOptionsValidator = v.optional(
	v.object({
		currencyCode: v.optional(v.string()),
		dateFormat: v.optional(v.string()),
		decimalPlaces: v.optional(v.number()),
		booleanTrueLabel: v.optional(v.string()),
		booleanFalseLabel: v.optional(v.string()),
	})
);

// ── Page dimensions from PDF ──────────────────────────────────────
export const pageDimensionValidator = v.object({
	page: v.number(),
	width: v.number(),
	height: v.number(),
});

// ── Field position on a PDF page ──────────────────────────────────
export const fieldPositionValidator = v.object({
	page: v.number(),
	x: v.number(),
	y: v.number(),
	width: v.number(),
	height: v.number(),
});

// ── A single field in the template draft ──────────────────────────
export const fieldConfigValidator = v.object({
	id: v.string(),
	type: v.union(v.literal("interpolable"), v.literal("signable")),
	position: fieldPositionValidator,
	// Interpolable fields
	variableKey: v.optional(v.string()),
	// Signable fields
	signableType: v.optional(signableTypeValidator),
	signatoryPlatformRole: v.optional(platformRoleValidator),
	// Common
	label: v.optional(v.string()),
	required: v.optional(v.boolean()),
	fieldMeta: v.optional(
		v.object({
			placeholder: v.optional(v.string()),
			readOnly: v.optional(v.boolean()),
			helpText: v.optional(v.string()),
		})
	),
});

// ── A signatory attached to a template ────────────────────────────
export const signatoryConfigValidator = v.object({
	platformRole: platformRoleValidator,
	role: signatoryRoleValidator,
	order: v.number(),
	label: v.optional(v.string()),
});

// ── Data model entity field ───────────────────────────────────────
export const entityFieldValidator = v.object({
	name: v.string(),
	label: v.string(),
	type: v.string(),
	optional: v.boolean(),
});

export const entitySourceValidator = v.union(
	v.literal("schema"),
	v.literal("custom")
);

// ── Template draft state (stored on the template + in timeline) ───
export const draftStateValidator = v.object({
	fields: v.array(fieldConfigValidator),
	signatories: v.array(signatoryConfigValidator),
	pdfmeSchema: v.optional(v.any()),
});
