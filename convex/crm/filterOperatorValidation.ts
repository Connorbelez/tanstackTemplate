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
	const operators = OPERATOR_MAP[fieldType];
	if (operators === undefined) {
		throw new Error(
			`No operators defined for field type "${fieldType}". Update OPERATOR_MAP in filterOperatorValidation.ts.`
		);
	}
	return operators;
}

export function isValidOperatorForFieldType(
	operator: FilterOperator,
	fieldType: FieldType
): boolean {
	const valid: readonly FilterOperator[] | undefined = OPERATOR_MAP[fieldType];
	return valid !== undefined && valid.includes(operator);
}
