"use client";

import { ListFilter, Search, X } from "lucide-react";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { cn } from "#/lib/utils";
import type { Id } from "../../../../convex/_generated/dataModel";
import { OPERATOR_LABELS } from "../../../../convex/crm/filterConstants";
import type { RecordFilter, RecordSort } from "../../../../convex/crm/types";
import { AdminTableColumnVisibilityPopover } from "./AdminTableColumnVisibilityPopover";
import type { AdminViewSchemaColumn } from "./admin-view-types";

interface AdminTableHeaderControlsProps {
	readonly activeFilters: readonly RecordFilter[];
	readonly activeSort?: RecordSort;
	readonly columns: readonly AdminViewSchemaColumn[];
	readonly defaultVisibleFieldIds: readonly Id<"fieldDefs">[];
	readonly disabled?: boolean;
	readonly onClearAll: () => void;
	readonly onClearFieldFilter: (fieldDefId: Id<"fieldDefs">) => void;
	readonly onClearSort: () => void;
	readonly onRestoreDefaults: () => void;
	readonly onSearchChange: (value: string) => void;
	readonly onToggleColumnVisibility: (
		fieldDefId: Id<"fieldDefs">,
		nextVisible: boolean
	) => void;
	readonly searchValue: string;
}

function formatFilterBadgeValue(
	column: AdminViewSchemaColumn | undefined,
	filter: RecordFilter
) {
	if (filter.value === undefined) {
		return undefined;
	}

	if (column?.fieldType === "select" && typeof filter.value === "string") {
		return (
			column.options?.find((option) => option.value === filter.value)?.label ??
			filter.value
		);
	}

	if (
		(column?.fieldType === "date" || column?.fieldType === "datetime") &&
		typeof filter.value === "number"
	) {
		return new Date(filter.value).toLocaleDateString();
	}

	return String(filter.value);
}

export function AdminTableHeaderControls({
	activeFilters,
	activeSort,
	columns,
	defaultVisibleFieldIds,
	disabled = false,
	onClearAll,
	onClearFieldFilter,
	onClearSort,
	onRestoreDefaults,
	onSearchChange,
	onToggleColumnVisibility,
	searchValue,
}: AdminTableHeaderControlsProps) {
	const columnsById = new Map(
		columns.map((column) => [String(column.fieldDefId), column] as const)
	);
	const hasActiveControls =
		searchValue.trim().length > 0 ||
		activeFilters.length > 0 ||
		activeSort !== undefined;

	return (
		<div className="border-border/70 border-b bg-muted/15 px-3 py-3">
			<div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
				<div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center">
					<div className="relative min-w-0 flex-1 sm:max-w-sm">
						<Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
						<Input
							className="pl-9"
							onChange={(event) => onSearchChange(event.target.value)}
							placeholder="Search current page"
							value={searchValue}
						/>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<AdminTableColumnVisibilityPopover
							columns={columns}
							defaultVisibleFieldIds={defaultVisibleFieldIds}
							disabled={disabled}
							onRestoreDefaults={onRestoreDefaults}
							onToggleVisibility={onToggleColumnVisibility}
						/>
						<Button
							disabled={disabled}
							onClick={onRestoreDefaults}
							size="sm"
							type="button"
							variant="ghost"
						>
							Restore defaults
						</Button>
					</div>
				</div>

				{hasActiveControls ? (
					<Button
						className="self-start lg:self-auto"
						disabled={disabled}
						onClick={onClearAll}
						size="sm"
						type="button"
						variant="ghost"
					>
						Clear all
					</Button>
				) : null}
			</div>

			{hasActiveControls ? (
				<div className="mt-3 flex flex-wrap items-center gap-2">
					<div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-[0.12em]">
						<ListFilter className="size-3.5" />
						<span>Active controls</span>
					</div>

					{searchValue.trim().length > 0 ? (
						<Badge className="gap-2" variant="secondary">
							<span>Search: {searchValue.trim()}</span>
							<button
								aria-label="Clear local page search"
								className={cn(
									"rounded-full p-0.5 transition-colors hover:bg-black/10",
									disabled && "pointer-events-none opacity-50"
								)}
								onClick={() => onSearchChange("")}
								type="button"
							>
								<X className="size-3" />
							</button>
						</Badge>
					) : null}

					{activeSort ? (
						<Badge className="gap-2" variant="secondary">
							<span>
								Sorted by{" "}
								{columnsById.get(String(activeSort.fieldDefId))?.label ??
									String(activeSort.fieldDefId)}{" "}
								({activeSort.direction})
							</span>
							<button
								aria-label="Clear saved sort"
								className={cn(
									"rounded-full p-0.5 transition-colors hover:bg-black/10",
									disabled && "pointer-events-none opacity-50"
								)}
								onClick={onClearSort}
								type="button"
							>
								<X className="size-3" />
							</button>
						</Badge>
					) : null}

					{activeFilters.map((filter) => {
						const column = columnsById.get(String(filter.fieldDefId));
						const valueLabel = formatFilterBadgeValue(column, filter);
						return (
							<Badge
								className="gap-2"
								key={`${filter.fieldDefId}:${filter.operator}:${String(filter.value)}`}
								variant="secondary"
							>
								<span>
									{column?.label ?? String(filter.fieldDefId)}{" "}
									{
										OPERATOR_LABELS[
											filter.operator as keyof typeof OPERATOR_LABELS
										]
									}
									{valueLabel ? ` ${valueLabel}` : ""}
								</span>
								<button
									aria-label={`Clear ${column?.label ?? "column"} filter`}
									className={cn(
										"rounded-full p-0.5 transition-colors hover:bg-black/10",
										disabled && "pointer-events-none opacity-50"
									)}
									onClick={() => onClearFieldFilter(filter.fieldDefId)}
									type="button"
								>
									<X className="size-3" />
								</button>
							</Badge>
						);
					})}
				</div>
			) : null}
		</div>
	);
}
