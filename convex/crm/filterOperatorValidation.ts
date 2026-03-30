import {
	type FieldType,
	type FilterOperator,
	OPERATOR_MAP,
} from "./filterConstants";

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
	return valid?.includes(operator) ?? false;
}
