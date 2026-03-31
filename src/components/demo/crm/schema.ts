import type { Doc } from "../../../../convex/_generated/dataModel";

export type CrmFieldType = Doc<"fieldDefs">["fieldType"];

export interface CrmSelectOptionDraft {
	color: string;
	id: string;
	label: string;
	value: string;
}

export interface CrmFieldDraft {
	description: string;
	fieldType: CrmFieldType;
	id: string;
	isRequired: boolean;
	isUnique: boolean;
	label: string;
	name: string;
	options: CrmSelectOptionDraft[];
}

export const CRM_FIELD_TYPE_OPTIONS: Array<{
	description: string;
	label: string;
	value: CrmFieldType;
}> = [
	{
		description: "Single-line text for titles, names, and notes.",
		label: "Text",
		value: "text",
	},
	{
		description: "Integer or decimal numeric values.",
		label: "Number",
		value: "number",
	},
	{
		description: "True or false values.",
		label: "Boolean",
		value: "boolean",
	},
	{
		description: "Date-only timestamps stored in Unix milliseconds.",
		label: "Date",
		value: "date",
	},
	{
		description: "Date and time timestamps stored in Unix milliseconds.",
		label: "Datetime",
		value: "datetime",
	},
	{
		description: "Choose a single value from a controlled list.",
		label: "Select",
		value: "select",
	},
	{
		description: "Choose multiple values from a controlled list.",
		label: "Multi-select",
		value: "multi_select",
	},
	{
		description: "Email address with format validation.",
		label: "Email",
		value: "email",
	},
	{
		description: "Phone number with loose formatting validation.",
		label: "Phone",
		value: "phone",
	},
	{
		description: "External URL validated by the platform URL parser.",
		label: "URL",
		value: "url",
	},
	{
		description: "Currency numeric value.",
		label: "Currency",
		value: "currency",
	},
	{
		description: "Percentage numeric value.",
		label: "Percentage",
		value: "percentage",
	},
	{
		description: "Multi-line rich text stored as a string.",
		label: "Rich text",
		value: "rich_text",
	},
	{
		description: "Arbitrary user identifier string.",
		label: "User reference",
		value: "user_ref",
	},
] as const;

export const CRM_OPTION_COLORS = [
	"sky",
	"emerald",
	"amber",
	"rose",
	"violet",
	"slate",
] as const;
