import {
	CheckCheck,
	CircleDashed,
	ExternalLink,
	UserRound,
} from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "#/components/ui/badge";
import { cn } from "#/lib/utils";
import type { Doc } from "../../../../convex/_generated/dataModel";
import type { CrmDemoRecordKind } from "./types";
import { formatFieldValue } from "./utils";

type FieldDef = Doc<"fieldDefs">;

const OPTION_COLOR_CLASS: Record<string, string> = {
	amber: "border-amber-500/25 bg-amber-500/10 text-amber-700",
	blue: "border-blue-500/25 bg-blue-500/10 text-blue-700",
	emerald: "border-emerald-500/25 bg-emerald-500/10 text-emerald-700",
	fuchsia: "border-fuchsia-500/25 bg-fuchsia-500/10 text-fuchsia-700",
	green: "border-green-500/25 bg-green-500/10 text-green-700",
	indigo: "border-indigo-500/25 bg-indigo-500/10 text-indigo-700",
	orange: "border-orange-500/25 bg-orange-500/10 text-orange-700",
	red: "border-red-500/25 bg-red-500/10 text-red-700",
	rose: "border-rose-500/25 bg-rose-500/10 text-rose-700",
	sky: "border-sky-500/25 bg-sky-500/10 text-sky-700",
	slate: "border-slate-500/25 bg-slate-500/10 text-slate-700",
	violet: "border-violet-500/25 bg-violet-500/10 text-violet-700",
	yellow: "border-yellow-500/25 bg-yellow-500/10 text-yellow-700",
};

function getOption(field: FieldDef, value: string) {
	return field.options?.find((option) => option.value === value);
}

function renderEmptyState() {
	return <span className="text-muted-foreground">—</span>;
}

function renderOptionBadge(label: string, color?: string) {
	return (
		<span
			className={cn(
				"inline-flex items-center rounded-full border px-2 py-0.5 font-medium text-xs",
				OPTION_COLOR_CLASS[color ?? "slate"] ?? OPTION_COLOR_CLASS.slate
			)}
		>
			{label}
		</span>
	);
}

function renderSelectValue(field: FieldDef, value: unknown) {
	if (typeof value !== "string") {
		return renderEmptyState();
	}

	const option = getOption(field, value);
	return renderOptionBadge(option?.label ?? value, option?.color);
}

function renderMultiSelectValue(field: FieldDef, value: unknown) {
	const values = Array.isArray(value)
		? value.filter((item): item is string => typeof item === "string")
		: [];
	if (values.length === 0) {
		return renderEmptyState();
	}

	return (
		<div className="flex flex-wrap gap-1.5">
			{values.map((item) => {
				const option = getOption(field, item);
				return (
					<span key={item}>
						{renderOptionBadge(option?.label ?? item, option?.color)}
					</span>
				);
			})}
		</div>
	);
}

function renderNumericValue(
	fieldType: FieldDef["fieldType"],
	value: unknown
): ReactNode {
	if (typeof value !== "number") {
		return renderEmptyState();
	}

	if (fieldType === "currency") {
		return value.toLocaleString("en-US", {
			style: "currency",
			currency: "USD",
			maximumFractionDigits: 2,
		});
	}

	if (fieldType === "percentage") {
		return `${value.toLocaleString("en-US", {
			maximumFractionDigits: 2,
		})}%`;
	}

	return formatFieldValue({ fieldType, options: undefined }, value);
}

function renderLinkValue(
	fieldType: FieldDef["fieldType"],
	value: unknown
): ReactNode {
	if (fieldType === "email") {
		return (
			<a
				className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
				href={`mailto:${String(value)}`}
			>
				{String(value)}
			</a>
		);
	}

	if (fieldType === "url") {
		const rawValue = String(value);
		let safeUrl: string | undefined;

		try {
			const parsedUrl = new URL(rawValue);
			if (parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:") {
				safeUrl = parsedUrl.toString();
			}
		} catch {
			safeUrl = undefined;
		}

		if (!safeUrl) {
			return <span className="break-all">{rawValue}</span>;
		}

		return (
			<a
				className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
				href={safeUrl}
				rel="noopener noreferrer"
				target="_blank"
			>
				<span className="truncate">{rawValue}</span>
				<ExternalLink className="size-3" />
			</a>
		);
	}

	return (
		<span className="inline-flex items-center gap-1.5">
			<UserRound className="size-3.5 text-muted-foreground" />
			{String(value)}
		</span>
	);
}

export function renderFieldValue(field: FieldDef, value: unknown): ReactNode {
	if (value === undefined || value === null || value === "") {
		return renderEmptyState();
	}

	if (field.fieldType === "boolean") {
		return (
			<Badge variant={value === true ? "default" : "outline"}>
				{value === true ? <CheckCheck className="size-3" /> : null}
				{value === true ? "True" : "False"}
			</Badge>
		);
	}

	if (field.fieldType === "select") {
		return renderSelectValue(field, value);
	}

	if (field.fieldType === "multi_select") {
		return renderMultiSelectValue(field, value);
	}

	if (field.fieldType === "currency" || field.fieldType === "percentage") {
		return renderNumericValue(field.fieldType, value);
	}

	if (
		field.fieldType === "email" ||
		field.fieldType === "url" ||
		field.fieldType === "user_ref"
	) {
		return renderLinkValue(field.fieldType, value);
	}

	return formatFieldValue(field, value);
}

export function getRecordTitle(
	record: { _id: string; fields: Record<string, unknown> },
	fields: FieldDef[]
): string {
	const preferredField = fields.find((field) =>
		["text", "email", "phone", "url", "user_ref"].includes(field.fieldType)
	);
	const preferredValue = preferredField
		? record.fields[preferredField.name]
		: undefined;

	if (typeof preferredValue === "string" && preferredValue.trim()) {
		return preferredValue;
	}

	for (const field of fields) {
		const value = record.fields[field.name];
		if (typeof value === "string" && value.trim()) {
			return value;
		}
	}

	return record._id;
}

export function getRecordSupportingText(
	record: { _kind: CrmDemoRecordKind; createdAt: number },
	objectDef: Pick<Doc<"objectDefs">, "nativeTable" | "singularLabel">
): string {
	const createdLabel = new Date(record.createdAt).toLocaleDateString();
	if (record._kind === "native") {
		return `${objectDef.nativeTable ?? objectDef.singularLabel} • native • ${createdLabel}`;
	}

	return `${objectDef.singularLabel} • custom • ${createdLabel}`;
}

export function renderSourceBadge(recordKind: CrmDemoRecordKind) {
	return (
		<Badge variant={recordKind === "native" ? "secondary" : "outline"}>
			{recordKind === "native" ? "Native Adapter" : "EAV Storage"}
		</Badge>
	);
}

export function renderEmptyRecordState(label: string, title?: string) {
	return (
		<div className="flex items-start gap-2 text-muted-foreground text-sm">
			<CircleDashed className="mt-0.5 size-4 shrink-0" />
			<div className="space-y-1">
				{title ? <p className="font-medium text-foreground">{title}</p> : null}
				<p>{label}</p>
			</div>
		</div>
	);
}
