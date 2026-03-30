/**
 * Shared filter constants used by both Convex backend and React frontend.
 * No imports from _generated/ or server modules — safe for client-side use.
 */

// ── Field Types ─────────────────────────────────────────────────────

export type FieldType =
	| "text"
	| "number"
	| "boolean"
	| "date"
	| "datetime"
	| "select"
	| "multi_select"
	| "email"
	| "phone"
	| "url"
	| "currency"
	| "percentage"
	| "rich_text"
	| "user_ref";

// ── Filter Operators ────────────────────────────────────────────────

export type FilterOperator =
	| "contains"
	| "equals"
	| "starts_with"
	| "eq"
	| "gt"
	| "lt"
	| "gte"
	| "lte"
	| "before"
	| "after"
	| "between"
	| "is"
	| "is_not"
	| "is_any_of"
	| "is_true"
	| "is_false";

// ── Logical Operators ───────────────────────────────────────────────

export type LogicalOperator = "and" | "or";

// ── Operator → Field Type Mapping ───────────────────────────────────

export const OPERATOR_MAP: Record<FieldType, readonly FilterOperator[]> = {
	// Text-like types
	text: ["contains", "equals", "starts_with"],
	email: ["contains", "equals", "starts_with"],
	phone: ["contains", "equals", "starts_with"],
	url: ["contains", "equals", "starts_with"],
	rich_text: ["contains", "equals", "starts_with"],
	// Numeric types
	number: ["eq", "gt", "lt", "gte", "lte"],
	currency: ["eq", "gt", "lt", "gte", "lte"],
	percentage: ["eq", "gt", "lt", "gte", "lte"],
	// Date types
	date: ["before", "after", "between"],
	datetime: ["before", "after", "between"],
	// Select types
	select: ["is", "is_not", "is_any_of"],
	multi_select: ["is", "is_not", "is_any_of"],
	// Boolean
	boolean: ["is_true", "is_false"],
	// User ref
	user_ref: ["is", "is_not"],
};

// ── Human-Readable Operator Labels ──────────────────────────────────

export const OPERATOR_LABELS: Record<FilterOperator, string> = {
	contains: "contains",
	equals: "equals",
	starts_with: "starts with",
	eq: "equals",
	gt: "greater than",
	lt: "less than",
	gte: "at least",
	lte: "at most",
	before: "before",
	after: "after",
	between: "between",
	is: "is",
	is_not: "is not",
	is_any_of: "is any of",
	is_true: "is true",
	is_false: "is false",
};

/** Boolean operators that require no value input. */
export const VALUELESS_OPERATORS = new Set<FilterOperator>([
	"is_true",
	"is_false",
]);
