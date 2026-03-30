import type { Doc } from "../_generated/dataModel";

type FieldType = Doc<"fieldDefs">["fieldType"];
type FilterOperator = Doc<"viewFilters">["operator"];

const OPERATOR_MAP: Record<FieldType, readonly FilterOperator[]> = {
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

export function getValidOperators(
	fieldType: FieldType
): readonly FilterOperator[] {
	return OPERATOR_MAP[fieldType] ?? [];
}

export function isValidOperatorForFieldType(
	operator: FilterOperator,
	fieldType: FieldType
): boolean {
	const valid = OPERATOR_MAP[fieldType];
	return (
		valid !== undefined &&
		(valid as readonly string[]).includes(operator)
	);
}
