import { v } from "convex/values";

// ── Field Types (14 types) ──
export const fieldTypeValidator = v.union(
	v.literal("text"),
	v.literal("number"),
	v.literal("boolean"),
	v.literal("date"),
	v.literal("datetime"),
	v.literal("select"),
	v.literal("multi_select"),
	v.literal("email"),
	v.literal("phone"),
	v.literal("url"),
	v.literal("currency"),
	v.literal("percentage"),
	v.literal("rich_text"),
	v.literal("user_ref")
);

// ── Link Cardinalities (3 types) ──
export const cardinalityValidator = v.union(
	v.literal("one_to_one"),
	v.literal("one_to_many"),
	v.literal("many_to_many")
);

// ── Capabilities (6 types) ──
export const capabilityValidator = v.union(
	v.literal("table"),
	v.literal("kanban"),
	v.literal("calendar"),
	v.literal("group_by"),
	v.literal("aggregate"),
	v.literal("sort")
);

// ── View Types (3 types) ──
export const viewTypeValidator = v.union(
	v.literal("table"),
	v.literal("kanban"),
	v.literal("calendar")
);

export const viewLayoutMessagesValidator = v.object({
	table: v.optional(v.string()),
	kanban: v.optional(v.string()),
	calendar: v.optional(v.string()),
});

// ── Normalized Field Contracts ──
export const normalizedFieldKindValidator = v.union(
	v.literal("primitive"),
	v.literal("single_select"),
	v.literal("multi_select"),
	v.literal("user"),
	v.literal("relation"),
	v.literal("computed")
);

export const aggregateFnValidator = v.union(
	v.literal("count"),
	v.literal("sum"),
	v.literal("avg"),
	v.literal("min"),
	v.literal("max")
);

export const editabilityModeValidator = v.union(
	v.literal("editable"),
	v.literal("read_only"),
	v.literal("computed")
);

export const fieldRendererHintValidator = v.union(
	v.literal("text"),
	v.literal("number"),
	v.literal("currency"),
	v.literal("percentage"),
	v.literal("date"),
	v.literal("datetime"),
	v.literal("select"),
	v.literal("multi_select"),
	v.literal("boolean"),
	v.literal("rich_text"),
	v.literal("user_ref"),
	v.literal("relation"),
	v.literal("computed")
);

export const layoutEligibilityRuleValidator = v.object({
	enabled: v.boolean(),
	reason: v.optional(v.string()),
});

export const layoutEligibilityValidator = v.object({
	table: layoutEligibilityRuleValidator,
	kanban: layoutEligibilityRuleValidator,
	calendar: layoutEligibilityRuleValidator,
	groupBy: layoutEligibilityRuleValidator,
});

export const aggregationEligibilityValidator = v.object({
	enabled: v.boolean(),
	reason: v.optional(v.string()),
	supportedFunctions: v.array(aggregateFnValidator),
});

export const relationMetadataValidator = v.object({
	cardinality: cardinalityValidator,
	relationName: v.optional(v.string()),
	targetFieldName: v.optional(v.string()),
	targetObjectDefId: v.optional(v.id("objectDefs")),
});

export const computedFieldMetadataValidator = v.object({
	expressionKey: v.optional(v.string()),
	sourceFieldNames: v.optional(v.array(v.string())),
});

export const editabilityMetadataValidator = v.object({
	mode: editabilityModeValidator,
	reason: v.optional(v.string()),
});

export const aggregatePresetValidator = v.object({
	fieldDefId: v.id("fieldDefs"),
	fn: aggregateFnValidator,
	label: v.optional(v.string()),
});

// ── Entity Kinds ──
export const entityKindValidator = v.union(
	v.literal("record"),
	v.literal("native")
);

// ── Filter Operators ──
export const filterOperatorValidator = v.union(
	v.literal("contains"),
	v.literal("equals"),
	v.literal("starts_with"),
	v.literal("eq"),
	v.literal("gt"),
	v.literal("lt"),
	v.literal("gte"),
	v.literal("lte"),
	v.literal("before"),
	v.literal("after"),
	v.literal("between"),
	v.literal("is"),
	v.literal("is_not"),
	v.literal("is_any_of"),
	v.literal("is_true"),
	v.literal("is_false")
);

// ── Logical Operators ──
export const logicalOperatorValidator = v.union(
	v.literal("and"),
	v.literal("or")
);

// ── Select Option (reused in fieldDefs) ──
export const selectOptionValidator = v.object({
	value: v.string(),
	label: v.string(),
	color: v.string(),
	order: v.number(),
});
