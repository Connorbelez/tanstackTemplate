"use client";

import type { ReactNode } from "react";
import { cn } from "#/lib/utils";
import type {
	NormalizedFieldDefinition,
	UnifiedRecord,
} from "../../../../convex/crm/types";
import { FieldRenderer } from "./FieldRenderer";

export interface DetailSectionDefinition {
	readonly description?: string;
	readonly fieldNames: readonly string[];
	readonly title: string;
}

interface DetailSectionWithFields extends DetailSectionDefinition {
	readonly fields: readonly NormalizedFieldDefinition[];
}

interface SectionedRecordDetailsProps {
	readonly emptyState?: ReactNode;
	readonly fields: readonly NormalizedFieldDefinition[];
	readonly highlightFieldNames?: readonly string[];
	readonly record: UnifiedRecord;
	readonly sections: readonly DetailSectionDefinition[];
}

function hasRenderableFieldValue(value: unknown): boolean {
	return value !== undefined && value !== null && value !== "";
}

function resolveRenderableFields(args: {
	fieldLookup: ReadonlyMap<string, NormalizedFieldDefinition>;
	fieldNames: readonly string[];
	record: UnifiedRecord;
}): NormalizedFieldDefinition[] {
	return args.fieldNames.flatMap((fieldName) => {
		const field = args.fieldLookup.get(fieldName);
		if (!field) {
			return [];
		}

		return hasRenderableFieldValue(args.record.fields[field.name])
			? [field]
			: [];
	});
}

function getDetailSectionKey(section: DetailSectionDefinition): string {
	return [
		section.title,
		section.description ?? "",
		section.fieldNames.join("|"),
	].join("::");
}

function DetailFieldGrid({
	className,
	fields,
	record,
}: {
	readonly className?: string;
	readonly fields: readonly NormalizedFieldDefinition[];
	readonly record: UnifiedRecord;
}) {
	return (
		<div className={cn("grid gap-3 md:grid-cols-2", className)}>
			{fields.map((field) => (
				<FieldRenderer
					field={field}
					key={field.name}
					value={record.fields[field.name]}
				/>
			))}
		</div>
	);
}

export function SectionedRecordDetails({
	emptyState = null,
	fields,
	highlightFieldNames,
	record,
	sections,
}: SectionedRecordDetailsProps) {
	const fieldLookup = new Map(
		fields.map((field) => [field.name, field] as const)
	);
	const highlightedFields = highlightFieldNames
		? resolveRenderableFields({
				fieldLookup,
				fieldNames: highlightFieldNames,
				record,
			})
		: [];
	const consumedNames = new Set(highlightedFields.map((field) => field.name));
	const renderedSections = sections.flatMap<DetailSectionWithFields>(
		(section) => {
			const sectionFields = resolveRenderableFields({
				fieldLookup,
				fieldNames: section.fieldNames,
				record,
			}).filter((field) => !consumedNames.has(field.name));

			for (const field of sectionFields) {
				consumedNames.add(field.name);
			}

			return sectionFields.length > 0
				? [
						{
							...section,
							fields: sectionFields,
						},
					]
				: [];
		}
	);
	const remainingFields = fields.filter(
		(field) =>
			!consumedNames.has(field.name) &&
			hasRenderableFieldValue(record.fields[field.name])
	);

	if (
		highlightedFields.length === 0 &&
		renderedSections.length === 0 &&
		remainingFields.length === 0
	) {
		return emptyState;
	}

	return (
		<div className="space-y-6">
			{highlightedFields.length > 0 ? (
				<div className="grid gap-3 md:grid-cols-3">
					{highlightedFields.map((field) => (
						<FieldRenderer
							className="h-full border-border/70 bg-background/80"
							field={field}
							key={field.name}
							value={record.fields[field.name]}
						/>
					))}
				</div>
			) : null}

			{renderedSections.map((section) => (
				<section
					className="space-y-3 rounded-xl border border-border/70 bg-muted/10 p-4"
					key={getDetailSectionKey(section)}
				>
					<div className="space-y-1">
						<h3 className="font-medium text-sm tracking-[0.02em]">
							{section.title}
						</h3>
						{section.description ? (
							<p className="text-muted-foreground text-sm">
								{section.description}
							</p>
						) : null}
					</div>
					<DetailFieldGrid fields={section.fields} record={record} />
				</section>
			))}

			{remainingFields.length > 0 ? (
				<section className="space-y-3">
					<div>
						<h3 className="font-medium text-sm tracking-[0.02em]">
							Additional Details
						</h3>
						<p className="text-muted-foreground text-sm">
							Remaining populated fields on this record.
						</p>
					</div>
					<DetailFieldGrid fields={remainingFields} record={record} />
				</section>
			) : null}
		</div>
	);
}
