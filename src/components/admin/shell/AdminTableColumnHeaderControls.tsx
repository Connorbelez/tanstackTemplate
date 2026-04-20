"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, Filter } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import {
	Popover,
	PopoverContent,
	PopoverDescription,
	PopoverHeader,
	PopoverTitle,
	PopoverTrigger,
} from "#/components/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import {
	type FieldType,
	type FilterOperator,
	OPERATOR_LABELS,
	OPERATOR_MAP,
	VALUELESS_OPERATORS,
} from "../../../../convex/crm/filterConstants";
import type { RecordFilter, RecordSort } from "../../../../convex/crm/types";
import type { AdminViewSchemaColumn } from "./admin-view-types";

const UNSUPPORTED_OPERATORS = new Set<FilterOperator>(["between", "is_any_of"]);
const DATE_FORMAT_RE = /^\d{4}-\d{2}-\d{2}$/;

type ValueInputKind = "date" | "none" | "number" | "select" | "text";

export interface AdminTableColumnFilterState {
	readonly logicalOperator?: RecordFilter["logicalOperator"];
	readonly operator: RecordFilter["operator"];
	readonly value: unknown;
}

interface AdminTableColumnHeaderControlsProps {
	readonly column: AdminViewSchemaColumn;
	readonly currentFilter?: AdminTableColumnFilterState;
	readonly currentSortDirection?: RecordSort["direction"];
	readonly disabled?: boolean;
	readonly onApplyFilter: (
		nextFilter: AdminTableColumnFilterState | null
	) => void;
	readonly onChangeSort: (direction: RecordSort["direction"] | null) => void;
}

function parseDateToUtcMs(value: string): number | null {
	if (!DATE_FORMAT_RE.test(value)) {
		return null;
	}

	const [year, month, day] = value.split("-").map(Number);
	if (!year || month < 1 || month > 12 || day < 1 || day > 31) {
		return null;
	}

	const timestamp = Date.UTC(year, month - 1, day);
	if (Number.isNaN(timestamp)) {
		return null;
	}

	const date = new Date(timestamp);
	if (
		date.getUTCFullYear() !== year ||
		date.getUTCMonth() !== month - 1 ||
		date.getUTCDate() !== day
	) {
		return null;
	}

	return timestamp;
}

function formatFilterInputValue(
	fieldType: AdminViewSchemaColumn["fieldType"],
	value: unknown
) {
	if (typeof value === "string") {
		return value;
	}

	if (
		(fieldType === "date" || fieldType === "datetime") &&
		typeof value === "number"
	) {
		return new Date(value).toISOString().slice(0, 10);
	}

	if (typeof value === "number") {
		return String(value);
	}

	return "";
}

function getValueInputKind(
	fieldType: FieldType | null,
	operator: FilterOperator | null
): ValueInputKind {
	if (!(fieldType && operator) || VALUELESS_OPERATORS.has(operator)) {
		return "none";
	}

	switch (fieldType) {
		case "text":
		case "email":
		case "phone":
		case "url":
		case "rich_text":
		case "user_ref":
			return "text";
		case "number":
		case "currency":
		case "percentage":
			return "number";
		case "date":
		case "datetime":
			return "date";
		case "select":
		case "multi_select":
			return "select";
		case "boolean":
			return "none";
		default:
			return "none";
	}
}

function parseFilterValue(args: {
	fieldType: AdminViewSchemaColumn["fieldType"];
	operator: FilterOperator;
	value: string;
}) {
	if (VALUELESS_OPERATORS.has(args.operator)) {
		return undefined;
	}

	const trimmedValue = args.value.trim();
	if (trimmedValue.length === 0) {
		return undefined;
	}

	switch (args.fieldType) {
		case "number":
		case "currency":
		case "percentage": {
			const parsed = Number.parseFloat(trimmedValue);
			return Number.isFinite(parsed) ? parsed : undefined;
		}
		case "date":
		case "datetime":
			return parseDateToUtcMs(trimmedValue) ?? undefined;
		case "select":
		case "multi_select":
			return trimmedValue;
		default:
			return trimmedValue;
	}
}

function getSortIcon(direction: RecordSort["direction"] | undefined) {
	if (direction === "asc") {
		return ArrowUp;
	}

	if (direction === "desc") {
		return ArrowDown;
	}

	return ArrowUpDown;
}

export function AdminTableColumnHeaderControls({
	column,
	currentFilter,
	currentSortDirection,
	disabled = false,
	onApplyFilter,
	onChangeSort,
}: AdminTableColumnHeaderControlsProps) {
	const [draftOperator, setDraftOperator] = useState<FilterOperator | "">("");
	const [draftValue, setDraftValue] = useState("");
	const availableOperators = useMemo(() => {
		const operators = OPERATOR_MAP[column.fieldType as FieldType] ?? [];
		return operators.filter((operator) => !UNSUPPORTED_OPERATORS.has(operator));
	}, [column.fieldType]);
	const valueInputKind = getValueInputKind(
		column.fieldType as FieldType,
		draftOperator || null
	);
	const SortIcon = getSortIcon(currentSortDirection);
	const parsedValue =
		draftOperator === ""
			? undefined
			: parseFilterValue({
					fieldType: column.fieldType,
					operator: draftOperator,
					value: draftValue,
				});
	const filterRequiresValue =
		draftOperator !== "" && !VALUELESS_OPERATORS.has(draftOperator);
	const canApplyFilter =
		draftOperator !== "" && (!filterRequiresValue || parsedValue !== undefined);
	const hasFilterCapability = availableOperators.length > 0;

	useEffect(() => {
		if (!currentFilter) {
			setDraftOperator("");
			setDraftValue("");
			return;
		}

		setDraftOperator(currentFilter.operator as FilterOperator);
		setDraftValue(
			formatFilterInputValue(column.fieldType, currentFilter.value)
		);
	}, [column.fieldType, currentFilter]);

	return (
		<div className="flex items-center gap-0.5">
			<Button
				aria-label={`Sort ${column.label}`}
				className="h-7 w-7 p-0"
				disabled={disabled || !column.hasSortCapability}
				onClick={() => {
					const nextDirection =
						currentSortDirection === "asc"
							? "desc"
							: currentSortDirection === "desc"
								? null
								: "asc";
					onChangeSort(nextDirection);
				}}
				size="icon"
				title={
					column.hasSortCapability
						? currentSortDirection === "asc"
							? `Sorted ascending by ${column.label}. Click for descending.`
							: currentSortDirection === "desc"
								? `Sorted descending by ${column.label}. Click to clear.`
								: `Sort by ${column.label}`
						: `${column.label} does not support sorting`
				}
				type="button"
				variant={currentSortDirection ? "secondary" : "ghost"}
			>
				<SortIcon className="size-3.5" />
			</Button>

			<Popover>
				<PopoverTrigger asChild>
					<Button
						aria-label={`Filter ${column.label}`}
						className="h-7 w-7 p-0"
						disabled={disabled || !hasFilterCapability}
						size="icon"
						title={
							hasFilterCapability
								? `Filter ${column.label}`
								: `${column.label} does not support filtering`
						}
						type="button"
						variant={currentFilter ? "secondary" : "ghost"}
					>
						<Filter className="size-3.5" />
					</Button>
				</PopoverTrigger>
				<PopoverContent align="end" className="w-80">
					<PopoverHeader>
						<PopoverTitle>{column.label}</PopoverTitle>
						<PopoverDescription>
							Filter this column and persist the result into the active saved
							view.
						</PopoverDescription>
					</PopoverHeader>

					<div className="mt-4 space-y-4">
						<div className="space-y-2">
							<label
								className="font-medium text-muted-foreground text-xs uppercase tracking-[0.12em]"
								htmlFor={`column-filter-operator-${column.fieldDefId}`}
							>
								Operator
							</label>
							<Select
								onValueChange={(value) =>
									setDraftOperator(value as FilterOperator)
								}
								value={draftOperator}
							>
								<SelectTrigger
									id={`column-filter-operator-${column.fieldDefId}`}
								>
									<SelectValue placeholder="Choose an operator" />
								</SelectTrigger>
								<SelectContent>
									{availableOperators.map((operator) => (
										<SelectItem key={operator} value={operator}>
											{OPERATOR_LABELS[operator]}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						{valueInputKind === "text" || valueInputKind === "number" ? (
							<div className="space-y-2">
								<label
									className="font-medium text-muted-foreground text-xs uppercase tracking-[0.12em]"
									htmlFor={`column-filter-value-${column.fieldDefId}`}
								>
									Value
								</label>
								<Input
									id={`column-filter-value-${column.fieldDefId}`}
									onChange={(event) => setDraftValue(event.target.value)}
									placeholder="Value"
									type={valueInputKind === "number" ? "number" : "text"}
									value={draftValue}
								/>
							</div>
						) : null}

						{valueInputKind === "date" ? (
							<div className="space-y-2">
								<label
									className="font-medium text-muted-foreground text-xs uppercase tracking-[0.12em]"
									htmlFor={`column-filter-date-${column.fieldDefId}`}
								>
									Date
								</label>
								<Input
									id={`column-filter-date-${column.fieldDefId}`}
									onChange={(event) => setDraftValue(event.target.value)}
									type="date"
									value={draftValue}
								/>
							</div>
						) : null}

						{valueInputKind === "select" ? (
							<div className="space-y-2">
								<label
									className="font-medium text-muted-foreground text-xs uppercase tracking-[0.12em]"
									htmlFor={`column-filter-select-${column.fieldDefId}`}
								>
									Value
								</label>
								<Select onValueChange={setDraftValue} value={draftValue}>
									<SelectTrigger
										id={`column-filter-select-${column.fieldDefId}`}
									>
										<SelectValue placeholder="Choose a value" />
									</SelectTrigger>
									<SelectContent>
										{(column.options ?? []).map((option) => (
											<SelectItem key={option.value} value={option.value}>
												{option.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						) : null}

						{currentFilter ? (
							<Badge className="w-fit" variant="outline">
								Active filter
							</Badge>
						) : null}

						<div className="flex flex-wrap items-center justify-between gap-2">
							<Button
								disabled={!currentFilter || disabled}
								onClick={() => onApplyFilter(null)}
								type="button"
								variant="ghost"
							>
								Clear filter
							</Button>
							<Button
								disabled={!canApplyFilter || disabled}
								onClick={() => {
									if (draftOperator === "") {
										return;
									}

									onApplyFilter({
										logicalOperator: currentFilter?.logicalOperator ?? "and",
										operator: draftOperator,
										value: parsedValue,
									});
								}}
								type="button"
							>
								Apply filter
							</Button>
						</div>
					</div>
				</PopoverContent>
			</Popover>
		</div>
	);
}
