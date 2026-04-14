"use client";

import { CheckCheck, ExternalLink, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "#/components/ui/badge";
import type { Doc } from "../../../../convex/_generated/dataModel";
import type {
	EntityViewAdapterContract,
	NormalizedFieldDefinition,
	UnifiedRecord,
} from "../../../../convex/crm/types";

type ObjectDef = Pick<Doc<"objectDefs">, "nativeTable" | "singularLabel">;

function renderEmptyValue() {
	return <span className="text-muted-foreground">—</span>;
}

function formatScalarValue(value: unknown) {
	if (value === null || value === undefined) {
		return "—";
	}

	if (typeof value === "number") {
		return Number.isInteger(value)
			? new Intl.NumberFormat("en-US").format(value)
			: new Intl.NumberFormat("en-US", {
					maximumFractionDigits: 2,
				}).format(value);
	}

	if (typeof value === "boolean") {
		return value ? "True" : "False";
	}

	return String(value);
}

function getOption(
	field: Pick<NormalizedFieldDefinition, "options">,
	value: string
) {
	return field.options?.find((option) => option.value === value);
}

function renderSelectValue(field: NormalizedFieldDefinition, value: unknown) {
	if (typeof value !== "string") {
		return renderEmptyValue();
	}

	const option = getOption(field, value);
	return (
		<Badge
			style={
				option?.color
					? {
							backgroundColor: option.color,
							color: "#ffffff",
						}
					: undefined
			}
			variant={option?.color ? "outline" : "secondary"}
		>
			{option?.label ?? value}
		</Badge>
	);
}

function renderMultiSelectValue(
	field: NormalizedFieldDefinition,
	value: unknown
): ReactNode {
	const values = Array.isArray(value)
		? value.filter((entry): entry is string => typeof entry === "string")
		: [];
	if (values.length === 0) {
		return renderEmptyValue();
	}

	return (
		<div className="flex flex-wrap gap-1.5">
			{values.map((entry) => {
				const option = getOption(field, entry);
				return (
					<Badge
						key={entry}
						style={
							option?.color
								? {
										backgroundColor: option.color,
										color: "#ffffff",
									}
								: undefined
						}
						variant={option?.color ? "outline" : "secondary"}
					>
						{option?.label ?? entry}
					</Badge>
				);
			})}
		</div>
	);
}

function renderLinkValue(
	fieldType: NormalizedFieldDefinition["fieldType"],
	value: unknown
) {
	if (typeof value !== "string" || value.trim().length === 0) {
		return renderEmptyValue();
	}

	if (fieldType === "email") {
		return (
			<a
				className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
				href={`mailto:${value}`}
			>
				{value}
			</a>
		);
	}

	if (fieldType === "url") {
		let safeUrl: string | undefined;
		try {
			const parsed = new URL(value);
			if (parsed.protocol === "http:" || parsed.protocol === "https:") {
				safeUrl = parsed.toString();
			}
		} catch {
			safeUrl = undefined;
		}

		if (!safeUrl) {
			return <span className="break-all">{value}</span>;
		}

		return (
			<a
				className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
				href={safeUrl}
				rel="noopener noreferrer"
				target="_blank"
			>
				<span className="truncate">{value}</span>
				<ExternalLink className="size-3.5" />
			</a>
		);
	}

	return (
		<span className="inline-flex items-center gap-1.5">
			<UserRound className="size-3.5 text-muted-foreground" />
			{value}
		</span>
	);
}

export function renderAdminFieldValue(
	field: NormalizedFieldDefinition,
	value: unknown
): ReactNode {
	if (value === undefined || value === null || value === "") {
		return renderEmptyValue();
	}

	switch (field.fieldType) {
		case "boolean":
			if (typeof value !== "boolean") {
				return renderEmptyValue();
			}
			return (
				<Badge variant={value ? "default" : "outline"}>
					{value ? <CheckCheck className="size-3" /> : null}
					{value ? "True" : "False"}
				</Badge>
			);
		case "select":
			return renderSelectValue(field, value);
		case "multi_select":
			return renderMultiSelectValue(field, value);
		case "currency":
			if (typeof value !== "number") {
				return renderEmptyValue();
			}
			return value.toLocaleString("en-US", {
				style: "currency",
				currency: "USD",
				maximumFractionDigits: 2,
			});
		case "percentage":
			if (typeof value !== "number") {
				return renderEmptyValue();
			}
			return `${value.toLocaleString("en-US", {
				maximumFractionDigits: 2,
			})}%`;
		case "date":
		case "datetime": {
			const date = new Date(String(value));
			if (Number.isNaN(date.getTime())) {
				return formatScalarValue(value);
			}
			return date.toLocaleString();
		}
		case "email":
		case "url":
		case "user_ref":
			return renderLinkValue(field.fieldType, value);
		default:
			return formatScalarValue(value);
	}
}

export function getAdminRecordTitle(args: {
	adapterContract: Pick<EntityViewAdapterContract, "titleFieldName">;
	fields: readonly NormalizedFieldDefinition[];
	record: UnifiedRecord;
}) {
	const preferredFieldName = args.adapterContract.titleFieldName;
	if (preferredFieldName) {
		const preferredValue = args.record.fields[preferredFieldName];
		if (
			typeof preferredValue === "string" &&
			preferredValue.trim().length > 0
		) {
			return preferredValue;
		}
	}

	for (const field of args.fields) {
		const value = args.record.fields[field.name];
		if (typeof value === "string" && value.trim().length > 0) {
			return value;
		}
	}

	return args.record._id;
}

export function getAdminRecordSupportingText(
	record: Pick<UnifiedRecord, "_kind" | "createdAt">,
	objectDef: ObjectDef
) {
	const createdLabel = new Date(record.createdAt).toLocaleDateString();
	if (record._kind === "native") {
		return `${objectDef.nativeTable ?? objectDef.singularLabel} • native • ${createdLabel}`;
	}

	return `${objectDef.singularLabel} • custom • ${createdLabel}`;
}

export function createKanbanFieldOptions(
	fields: readonly NormalizedFieldDefinition[]
) {
	return fields
		.filter(
			(field) =>
				field.fieldType === "select" && field.layoutEligibility.kanban.enabled
		)
		.sort((left, right) => left.displayOrder - right.displayOrder)
		.map((field) => ({
			fieldDefId: field.fieldDefId,
			label: field.label,
		}))
		.filter(
			(
				option
			): option is {
				fieldDefId: NonNullable<NormalizedFieldDefinition["fieldDefId"]>;
				label: string;
			} => option.fieldDefId !== undefined
		);
}
