import type { Doc } from "../_generated/dataModel";
import type { TableFooterAggregateResult, UnifiedRecord } from "./types";
import type { ViewColumnDefinition } from "./viewState";

type FieldDef = Doc<"fieldDefs">;

function summarizeNumericColumn(
	column: ViewColumnDefinition,
	values: unknown[]
): TableFooterAggregateResult[] {
	const numericValues = values.filter(
		(value): value is number => typeof value === "number"
	);
	if (numericValues.length === 0) {
		return [];
	}

	const summary =
		column.fieldType === "percentage"
			? numericValues.reduce((sum, value) => sum + value, 0) /
				numericValues.length
			: numericValues.reduce((sum, value) => sum + value, 0);

	return [
		{
			fieldDefId: column.fieldDefId,
			fieldName: column.name,
			label: column.label,
			summary,
		},
	];
}

function summarizeTemporalColumn(
	column: ViewColumnDefinition,
	values: unknown[]
): TableFooterAggregateResult[] {
	const numericValues = values.filter(
		(value): value is number => typeof value === "number"
	);
	if (numericValues.length === 0) {
		return [];
	}

	const prefersLatest =
		column.name.toLowerCase().includes("mostrecent") ||
		column.label.toLowerCase().includes("most recent");
	const summary = prefersLatest
		? Math.max(...numericValues)
		: Math.min(...numericValues);

	return [
		{
			fieldDefId: column.fieldDefId,
			fieldName: column.name,
			label: column.label,
			summary,
		},
	];
}

function summarizeSelectColumn(
	column: ViewColumnDefinition,
	fieldDef: FieldDef,
	values: unknown[]
): TableFooterAggregateResult[] {
	const counts = new Map<string, number>();
	for (const value of values) {
		if (typeof value !== "string") {
			continue;
		}

		counts.set(value, (counts.get(value) ?? 0) + 1);
	}

	if (counts.size === 0) {
		return [];
	}

	const optionLabelByValue = new Map(
		(fieldDef.options ?? []).map(
			(option) => [option.value, option.label] as const
		)
	);
	const summary = [...counts.entries()]
		.sort((left, right) =>
			right[1] === left[1]
				? left[0].localeCompare(right[0])
				: right[1] - left[1]
		)
		.map(
			([value, count]) => `${count} ${optionLabelByValue.get(value) ?? value}`
		)
		.join(", ");

	return [
		{
			fieldDefId: column.fieldDefId,
			fieldName: column.name,
			label: column.label,
			summary,
		},
	];
}

export function buildTableFooterAggregates(args: {
	columns: readonly ViewColumnDefinition[];
	fieldDefsById: ReadonlyMap<string, FieldDef>;
	records: readonly UnifiedRecord[];
}): TableFooterAggregateResult[] {
	return args.columns
		.filter((column) => column.isVisible)
		.flatMap((column) => {
			const fieldDef = args.fieldDefsById.get(column.fieldDefId.toString());
			if (!fieldDef?.aggregation?.enabled) {
				return [];
			}

			const values = args.records
				.map((record) => record.fields[column.name])
				.filter((value) => value !== null && value !== undefined);

			switch (fieldDef.fieldType) {
				case "number":
				case "currency":
				case "percentage":
					return summarizeNumericColumn(column, values);
				case "date":
				case "datetime":
					return summarizeTemporalColumn(column, values);
				case "select":
					return summarizeSelectColumn(column, fieldDef, values);
				default:
					return [];
			}
		});
}
