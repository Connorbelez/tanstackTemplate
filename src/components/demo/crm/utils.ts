import { ConvexError } from "convex/values";
import type { Doc } from "../../../../convex/_generated/dataModel";
import type { CrmFieldDraft, CrmFieldType } from "./schema";

type FieldDef = Doc<"fieldDefs">;

export function extractCrmErrorMessage(error: unknown): string {
	if (error instanceof ConvexError) {
		return typeof error.data === "string"
			? error.data
			: JSON.stringify(error.data);
	}

	if (error instanceof Error) {
		return error.message;
	}

	return String(error);
}

export function slugifyCrmName(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "");
}

export function supportsOptions(fieldType: CrmFieldType): boolean {
	return fieldType === "select" || fieldType === "multi_select";
}

function formatDateFieldValue(
	fieldType: "date" | "datetime",
	value: unknown
): string {
	if (typeof value !== "number") {
		return "—";
	}

	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return "—";
	}

	return fieldType === "datetime"
		? date.toLocaleString()
		: date.toLocaleDateString();
}

function formatSelectFieldValue(
	options: FieldDef["options"],
	value: unknown
): string {
	if (typeof value !== "string") {
		return "—";
	}

	return options?.find((option) => option.value === value)?.label ?? value;
}

function formatMultiSelectFieldValue(
	options: FieldDef["options"],
	value: unknown
): string {
	if (!Array.isArray(value)) {
		return "—";
	}

	return value
		.map((item) => {
			if (typeof item !== "string") {
				return "";
			}

			return options?.find((option) => option.value === item)?.label ?? item;
		})
		.filter(Boolean)
		.join(", ");
}

export function formatFieldValue(
	field: Pick<FieldDef, "fieldType" | "options">,
	value: unknown
): string {
	if (value === undefined || value === null || value === "") {
		return "—";
	}

	if (field.fieldType === "boolean") {
		return value === true ? "True" : "False";
	}

	if (field.fieldType === "date" || field.fieldType === "datetime") {
		return formatDateFieldValue(field.fieldType, value);
	}

	if (field.fieldType === "select") {
		return formatSelectFieldValue(field.options, value);
	}

	if (field.fieldType === "multi_select") {
		return formatMultiSelectFieldValue(field.options, value);
	}

	if (typeof value === "number") {
		return value.toLocaleString();
	}

	if (Array.isArray(value)) {
		return value.join(", ");
	}

	return String(value);
}

export function toDateInputValue(
	fieldType: CrmFieldType,
	value: unknown
): string {
	if (typeof value !== "number") {
		return "";
	}

	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return "";
	}

	if (fieldType === "datetime") {
		const year = date.getFullYear();
		const month = `${date.getMonth() + 1}`.padStart(2, "0");
		const day = `${date.getDate()}`.padStart(2, "0");
		const hours = `${date.getHours()}`.padStart(2, "0");
		const minutes = `${date.getMinutes()}`.padStart(2, "0");
		return `${year}-${month}-${day}T${hours}:${minutes}`;
	}

	return date.toISOString().slice(0, 10);
}

export function fromDateInputValue(
	fieldType: CrmFieldType,
	value: string
): number | undefined {
	if (!value) {
		return undefined;
	}

	if (fieldType === "datetime") {
		const milliseconds = new Date(value).getTime();
		return Number.isNaN(milliseconds) ? undefined : milliseconds;
	}

	const milliseconds = new Date(`${value}T00:00:00`).getTime();
	return Number.isNaN(milliseconds) ? undefined : milliseconds;
}

export function createFieldDraft(): CrmFieldDraft {
	const id = crypto.randomUUID();
	return {
		description: "",
		fieldType: "text",
		id,
		isRequired: false,
		isUnique: false,
		label: "",
		name: "",
		options: [],
	};
}

export function estimateEavReadCount(
	fields: Pick<FieldDef, "fieldType">[],
	rowCount: number
): number {
	const uniqueTables = new Set(
		fields.map((field) => {
			switch (field.fieldType) {
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
					const exhaustiveCheck: never = field.fieldType;
					return exhaustiveCheck;
				}
			}
		})
	);

	return 3 + uniqueTables.size + rowCount * (1 + uniqueTables.size);
}

export function hasUnifiedRecordShape(value: unknown): boolean {
	if (!value || typeof value !== "object") {
		return false;
	}

	const record = value as Record<string, unknown>;
	return (
		typeof record._id === "string" &&
		(record._kind === "record" || record._kind === "native") &&
		typeof record.createdAt === "number" &&
		typeof record.updatedAt === "number" &&
		typeof record.objectDefId === "string" &&
		typeof record.fields === "object" &&
		record.fields !== null &&
		!Array.isArray(record.fields)
	);
}
