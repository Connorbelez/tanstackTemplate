import type { Doc } from "../_generated/dataModel";

type FieldType = Doc<"fieldDefs">["fieldType"];

export type ValueTableName =
	| "recordValuesText"
	| "recordValuesNumber"
	| "recordValuesBoolean"
	| "recordValuesDate"
	| "recordValuesSelect"
	| "recordValuesMultiSelect"
	| "recordValuesRichText"
	| "recordValuesUserRef";

export function fieldTypeToTable(fieldType: FieldType): ValueTableName {
	switch (fieldType) {
		case "text":
		case "email":
		case "phone":
		case "url":
			return "recordValuesText";
		case "number":
		case "currency":
		case "percentage":
			return "recordValuesNumber";
		case "boolean":
			return "recordValuesBoolean";
		case "date":
		case "datetime":
			return "recordValuesDate";
		case "select":
			return "recordValuesSelect";
		case "multi_select":
			return "recordValuesMultiSelect";
		case "rich_text":
			return "recordValuesRichText";
		case "user_ref":
			return "recordValuesUserRef";
		default: {
			const _exhaustive: never = fieldType;
			throw new Error(`Unknown field type: ${_exhaustive}`);
		}
	}
}
