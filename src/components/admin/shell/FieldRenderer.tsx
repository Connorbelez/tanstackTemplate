"use client";

import { Badge } from "#/components/ui/badge";
import { cn } from "#/lib/utils";
import type { Doc } from "../../../../convex/_generated/dataModel";

type FieldType = Doc<"fieldDefs">["fieldType"];

export interface FieldRendererProps {
	readonly className?: string;
	readonly fieldType?: FieldType;
	readonly label: string;
	readonly value: unknown;
}

export function FieldRenderer({
	className,
	fieldType,
	label,
	value,
}: FieldRendererProps) {
	return (
		<div className={cn("space-y-2 rounded-lg border bg-card p-4", className)}>
			<p className="font-medium text-muted-foreground text-xs uppercase tracking-[0.16em]">
				{label}
			</p>
			<div className="min-h-6">{renderFieldValue(value, fieldType)}</div>
		</div>
	);
}

function getArrayItemKey(item: unknown, seenKeys: Map<string, number>): string {
	const baseKey =
		typeof item === "string" ? item : (JSON.stringify(item) ?? String(item));
	const nextCount = (seenKeys.get(baseKey) ?? 0) + 1;
	seenKeys.set(baseKey, nextCount);
	return `${baseKey}-${nextCount}`;
}

function renderFieldValue(value: unknown, fieldType?: FieldType) {
	if (value === null || value === undefined || value === "") {
		return <p className="text-muted-foreground text-sm">No value</p>;
	}

	if (Array.isArray(value)) {
		if (value.length === 0) {
			return <p className="text-muted-foreground text-sm">No values</p>;
		}

		const seenKeys = new Map<string, number>();
		return (
			<div className="flex flex-wrap gap-2">
				{value.map((item) => (
					<Badge key={getArrayItemKey(item, seenKeys)} variant="secondary">
						{formatScalarValue(item, fieldType)}
					</Badge>
				))}
			</div>
		);
	}

	if (fieldType === "boolean" || typeof value === "boolean") {
		return (
			<Badge variant={value === true ? "default" : "secondary"}>
				{value === true ? "Yes" : "No"}
			</Badge>
		);
	}

	if (typeof value === "object") {
		return (
			<pre className="overflow-x-auto rounded-md bg-muted/50 p-3 text-xs">
				{JSON.stringify(value, null, 2)}
			</pre>
		);
	}

	return <p className="text-sm">{formatScalarValue(value, fieldType)}</p>;
}

function formatScalarValue(value: unknown, fieldType?: FieldType): string {
	if (value === null || value === undefined) {
		return "No value";
	}

	if (
		fieldType === "date" &&
		(typeof value === "number" || typeof value === "string")
	) {
		const date = new Date(value);
		if (!Number.isNaN(date.getTime())) {
			return date.toLocaleString();
		}
	}

	if (typeof value === "number") {
		return Number.isInteger(value)
			? new Intl.NumberFormat("en-US").format(value)
			: new Intl.NumberFormat("en-US", {
					maximumFractionDigits: 2,
				}).format(value);
	}

	if (typeof value === "string") {
		return value;
	}

	if (typeof value === "boolean") {
		return value ? "Yes" : "No";
	}

	return String(value);
}
