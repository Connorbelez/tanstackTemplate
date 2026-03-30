import { useMutation, useQuery } from "convex/react";
import { Filter, Plus, X } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "#/components/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import {
	type FieldType,
	type FilterOperator,
	type LogicalOperator,
	OPERATOR_LABELS,
	OPERATOR_MAP,
	VALUELESS_OPERATORS,
} from "../../../../convex/crm/filterConstants";

// ── Field type helpers ──────────────────────────────────────────────

type ValueInputKind = "text" | "number" | "date" | "select" | "none";

const UNSUPPORTED_OPERATORS = new Set<FilterOperator>(["between", "is_any_of"]);
const utcDateFormatter = new Intl.DateTimeFormat(undefined, {
	timeZone: "UTC",
});

function getValueInputKind(
	fieldType: FieldType | null,
	operator: FilterOperator | null
): ValueInputKind {
	if (!(fieldType && operator)) {
		return "none";
	}
	if (VALUELESS_OPERATORS.has(operator)) {
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

// ── Value input renderer ────────────────────────────────────────────

function renderValueInput(
	kind: ValueInputKind,
	disabled: boolean,
	value: string,
	onChange: (value: string) => void,
	selectedField:
		| { fieldType: string; options?: Array<{ value: string; label: string }> }
		| undefined
): ReactNode {
	switch (kind) {
		case "text":
			return (
				<Input
					className="h-8"
					disabled={disabled}
					onChange={(e) => onChange(e.target.value)}
					placeholder={
						selectedField?.fieldType === "user_ref" ? "User ID" : "Value..."
					}
					type="text"
					value={value}
				/>
			);
		case "number":
			return (
				<Input
					className="h-8"
					disabled={disabled}
					onChange={(e) => onChange(e.target.value)}
					placeholder="Value..."
					type="number"
					value={value}
				/>
			);
		case "date":
			return (
				<Input
					className="h-8"
					disabled={disabled}
					onChange={(e) => onChange(e.target.value)}
					type="date"
					value={value}
				/>
			);
		case "select":
			if (!selectedField?.options) {
				return null;
			}
			return (
				<Select disabled={disabled} onValueChange={onChange} value={value}>
					<SelectTrigger className="h-8">
						<SelectValue placeholder="Select value..." />
					</SelectTrigger>
					<SelectContent>
						{selectedField.options.map((opt) => (
							<SelectItem key={opt.value} value={opt.value}>
								{opt.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			);
		case "none":
			return null;
		default: {
			const _exhaustive: never = kind;
			throw new Error(`Unknown input kind: ${String(_exhaustive)}`);
		}
	}
}

// ── Props ───────────────────────────────────────────────────────────

interface FilterBuilderProps {
	objectDefId: Id<"objectDefs">;
	viewDefId: Id<"viewDefs">;
}

// ── Component ───────────────────────────────────────────────────────

export function FilterBuilder({ viewDefId, objectDefId }: FilterBuilderProps) {
	const filters = useQuery(api.crm.viewFilters.listViewFilters, { viewDefId });
	const fieldDefs = useQuery(api.crm.fieldDefs.listFields, { objectDefId });
	const addFilter = useMutation(api.crm.viewFilters.addViewFilter);
	const removeFilter = useMutation(api.crm.viewFilters.removeViewFilter);

	// Form state — typed precisely to avoid `as` casts
	const [popoverOpen, setPopoverOpen] = useState(false);
	const [selectedFieldId, setSelectedFieldId] = useState<Id<"fieldDefs"> | "">(
		""
	);
	const [selectedOperator, setSelectedOperator] = useState<FilterOperator | "">(
		""
	);
	const [filterValue, setFilterValue] = useState<string>("");
	const [logicalOperator, setLogicalOperator] =
		useState<LogicalOperator>("and");
	const [submitting, setSubmitting] = useState(false);

	// Memoized lookups — only recompute when fieldDefs subscription fires
	const fieldLabelById = useMemo(
		() => new Map(fieldDefs?.map((f) => [f._id, f.label]) ?? []),
		[fieldDefs]
	);
	const fieldById = useMemo(
		() => new Map(fieldDefs?.map((f) => [f._id, f]) ?? []),
		[fieldDefs]
	);

	// Loading state
	if (filters === undefined || fieldDefs === undefined) {
		return (
			<div className="flex h-9 items-center gap-2">
				<div className="h-6 w-24 animate-pulse rounded bg-muted" />
				<div className="h-6 w-20 animate-pulse rounded bg-muted" />
			</div>
		);
	}

	// Derived state for the form
	const selectedField = selectedFieldId
		? fieldDefs.find((f) => f._id === selectedFieldId)
		: undefined;
	const selectedFieldType: FieldType | null = selectedField
		? (selectedField.fieldType as FieldType)
		: null;
	const availableOperators: readonly FilterOperator[] = selectedFieldType
		? OPERATOR_MAP[selectedFieldType].filter(
				(operator) => !UNSUPPORTED_OPERATORS.has(operator)
			)
		: [];
	const valueInputKind = getValueInputKind(
		selectedFieldType,
		selectedOperator || null
	);

	// ── Handlers ──────────────────────────────────────────────────────

	function resetForm() {
		setSelectedFieldId("");
		setSelectedOperator("");
		setFilterValue("");
		setLogicalOperator("and");
	}

	function handleFieldChange(fieldId: string) {
		setSelectedFieldId(fieldId as Id<"fieldDefs">);
		setSelectedOperator("");
		setFilterValue("");
	}

	function handleOperatorChange(operator: string) {
		setSelectedOperator(operator as FilterOperator);
		setFilterValue("");
	}

	async function handleSubmit() {
		if (!(selectedFieldId && selectedOperator)) {
			return;
		}

		const needsValue = !VALUELESS_OPERATORS.has(selectedOperator);

		if (needsValue && !filterValue.trim()) {
			return;
		}

		setSubmitting(true);
		try {
			// Encode value appropriately
			let encodedValue: string | undefined;
			if (!needsValue) {
				encodedValue = undefined;
			} else if (valueInputKind === "date") {
				// Convert date string (yyyy-mm-dd) to unix ms
				const ms = new Date(filterValue).getTime();
				if (Number.isNaN(ms)) {
					toast.error("Invalid date value");
					setSubmitting(false);
					return;
				}
				encodedValue = String(ms);
			} else {
				encodedValue = filterValue;
			}

			await addFilter({
				viewDefId,
				fieldDefId: selectedFieldId,
				operator: selectedOperator,
				value: encodedValue,
				logicalOperator:
					filters && filters.length > 0 ? logicalOperator : undefined,
			});

			resetForm();
			setPopoverOpen(false);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to add filter";
			toast.error(message);
		} finally {
			setSubmitting(false);
		}
	}

	async function handleRemoveFilter(filterId: Id<"viewFilters">) {
		try {
			await removeFilter({ filterId });
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to remove filter";
			toast.error(message);
		}
	}

	// ── Value preview for filter pills ────────────────────────────────

	function formatFilterValue(
		value: string | undefined,
		fieldDefId: Id<"fieldDefs">,
		operator: string
	): string {
		if (VALUELESS_OPERATORS.has(operator as FilterOperator)) {
			return "";
		}
		if (!value) {
			return "";
		}

		const field = fieldById.get(fieldDefId);
		if (!field) {
			return value;
		}

		const ft = field.fieldType as FieldType;
		if (ft === "date" || ft === "datetime") {
			const ms = Number(value);
			if (!Number.isNaN(ms)) {
				return utcDateFormatter.format(new Date(ms));
			}
		}

		if ((ft === "select" || ft === "multi_select") && field.options) {
			const opt = field.options.find((o) => o.value === value);
			if (opt) {
				return opt.label;
			}
		}

		return value;
	}

	// ── Render ────────────────────────────────────────────────────────

	const canSubmit =
		selectedFieldId &&
		selectedOperator &&
		(VALUELESS_OPERATORS.has(selectedOperator) || filterValue.trim());

	return (
		<div className="flex flex-wrap items-center gap-2">
			{/* Active filter pills */}
			{filters.map((filter, index) => (
				<div className="flex items-center gap-1" key={filter._id}>
					{index > 0 && filter.logicalOperator && (
						<span className="font-medium text-muted-foreground text-xs uppercase">
							{filter.logicalOperator}
						</span>
					)}
					<Badge className="flex items-center gap-1 pr-1" variant="secondary">
						<span className="font-medium">
							{fieldLabelById.get(filter.fieldDefId) ?? "Unknown"}
						</span>
						<span className="text-muted-foreground">
							{OPERATOR_LABELS[filter.operator as FilterOperator] ??
								filter.operator}
						</span>
						{!VALUELESS_OPERATORS.has(filter.operator as FilterOperator) &&
							filter.value && (
								<span>
									{formatFilterValue(
										filter.value,
										filter.fieldDefId,
										filter.operator
									)}
								</span>
							)}
						<button
							aria-label="Remove filter"
							className="ml-1 rounded-sm p-0.5 hover:bg-muted"
							onClick={() =>
								handleRemoveFilter(filter._id as Id<"viewFilters">)
							}
							type="button"
						>
							<X className="h-3 w-3" />
						</button>
					</Badge>
				</div>
			))}

			{/* Add filter button + popover */}
			<Popover onOpenChange={setPopoverOpen} open={popoverOpen}>
				<PopoverTrigger asChild>
					<Button className="gap-1" size="sm" variant="outline">
						<Filter className="h-3.5 w-3.5" />
						<Plus className="h-3 w-3" />
						Filter
					</Button>
				</PopoverTrigger>
				<PopoverContent align="start" className="w-80 space-y-3">
					<p className="font-medium text-sm">Add filter</p>

					{/* Logical connector (shown only when existing filters) */}
					{filters.length > 0 && (
						<div className="flex items-center gap-2">
							<span className="text-muted-foreground text-sm">Where</span>
							<Select
								onValueChange={(v) => setLogicalOperator(v as LogicalOperator)}
								value={logicalOperator}
							>
								<SelectTrigger className="h-8 w-20">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="and">AND</SelectItem>
									<SelectItem value="or">OR</SelectItem>
								</SelectContent>
							</Select>
						</div>
					)}

					{/* Field selector */}
					<Select onValueChange={handleFieldChange} value={selectedFieldId}>
						<SelectTrigger className="h-8">
							<SelectValue placeholder="Select field..." />
						</SelectTrigger>
						<SelectContent>
							{fieldDefs.map((field) => (
								<SelectItem key={field._id} value={field._id}>
									{field.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>

					{/* Operator selector */}
					<Select
						disabled={!selectedFieldId}
						onValueChange={handleOperatorChange}
						value={selectedOperator}
					>
						<SelectTrigger className="h-8">
							<SelectValue placeholder="Select operator..." />
						</SelectTrigger>
						<SelectContent>
							{availableOperators.map((op) => (
								<SelectItem key={op} value={op}>
									{OPERATOR_LABELS[op]}
								</SelectItem>
							))}
						</SelectContent>
					</Select>

					{/* Value input (varies by field type) */}
					{renderValueInput(
						valueInputKind,
						!selectedOperator,
						filterValue,
						setFilterValue,
						selectedField
					)}

					{/* Submit */}
					<Button
						className="w-full"
						disabled={!canSubmit || submitting}
						onClick={handleSubmit}
						size="sm"
					>
						{submitting ? "Adding..." : "Add filter"}
					</Button>
				</PopoverContent>
			</Popover>
		</div>
	);
}
