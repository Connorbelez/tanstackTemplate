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

// ── Link Cardinalities (3 types) ──
export const cardinalityValidator = v.union(
	v.literal("one_to_one"),
	v.literal("one_to_many"),
	v.literal("many_to_many")
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
