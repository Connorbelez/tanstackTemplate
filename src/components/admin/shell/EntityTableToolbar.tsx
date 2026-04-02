"use client";

import type { Column, Table as TanstackTable } from "@tanstack/react-table";
import {
	Columns3,
	LayoutGrid,
	ListFilter,
	Search,
	TableProperties,
	X,
} from "lucide-react";
import {
	type ReactNode,
	startTransition,
	useEffect,
	useMemo,
	useState,
} from "react";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { Input } from "#/components/ui/input";
import { cn } from "#/lib/utils";

export type EntityTableViewMode = "kanban" | "table";

interface EntityTableToolbarProps<TData> {
	description?: string;
	enableViewToggle?: boolean;
	globalFilter: string;
	newButtonSlot?: ReactNode;
	onGlobalFilterChange: (value: string) => void;
	onViewModeChange?: (mode: EntityTableViewMode) => void;
	table: TanstackTable<TData>;
	title?: string;
	toolbarSlot?: ReactNode;
	viewMode?: EntityTableViewMode;
}

function getColumnLabel<TData>(column: Column<TData, unknown>) {
	return column.columnDef.meta?.label ?? column.id;
}

export function EntityTableToolbar<TData>({
	description,
	enableViewToggle = false,
	globalFilter,
	newButtonSlot,
	onGlobalFilterChange,
	onViewModeChange,
	table,
	title,
	toolbarSlot,
	viewMode = "table",
}: EntityTableToolbarProps<TData>) {
	const [searchValue, setSearchValue] = useState(globalFilter);

	useEffect(() => {
		setSearchValue(globalFilter);
	}, [globalFilter]);

	useEffect(() => {
		const timeoutId = window.setTimeout(() => {
			startTransition(() => {
				onGlobalFilterChange(searchValue.trim());
			});
		}, 250);

		return () => window.clearTimeout(timeoutId);
	}, [onGlobalFilterChange, searchValue]);

	const activeFilters = useMemo(() => {
		const filters: Array<{ id: string; label: string; value: string }> = [];

		if (globalFilter.trim().length > 0) {
			filters.push({
				id: "global",
				label: "Search",
				value: globalFilter,
			});
		}

		for (const filter of table.getState().columnFilters) {
			const column = table.getColumn(filter.id);
			const value =
				typeof filter.value === "string"
					? filter.value
					: JSON.stringify(filter.value);

			if (!(column && value)) {
				continue;
			}

			filters.push({
				id: filter.id,
				label: getColumnLabel(column),
				value,
			});
		}

		return filters;
	}, [globalFilter, table]);

	function clearFilter(filterId: string) {
		if (filterId === "global") {
			setSearchValue("");
			onGlobalFilterChange("");
			return;
		}

		table.getColumn(filterId)?.setFilterValue(undefined);
	}

	const hideableColumns = table
		.getAllLeafColumns()
		.filter((column) => column.getCanHide() && column.id !== "select");

	return (
		<div className="space-y-3">
			{title || description ? (
				<div className="space-y-1">
					{title ? <h2 className="font-semibold text-lg">{title}</h2> : null}
					{description ? (
						<p className="text-muted-foreground text-sm">{description}</p>
					) : null}
				</div>
			) : null}

			<div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
				<div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
					<div className="relative min-w-[240px] flex-1 sm:max-w-md">
						<Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
						<Input
							aria-label="Search table rows"
							className="pl-9"
							onChange={(event) => setSearchValue(event.target.value)}
							placeholder="Search visible columns..."
							value={searchValue}
						/>
					</div>

					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button size="sm" type="button" variant="outline">
								<Columns3 className="size-4" />
								Columns
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="start" className="w-56">
							<DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
							<DropdownMenuSeparator />
							{hideableColumns.map((column) => (
								<DropdownMenuCheckboxItem
									checked={column.getIsVisible()}
									key={column.id}
									onCheckedChange={(checked) =>
										column.toggleVisibility(Boolean(checked))
									}
								>
									{getColumnLabel(column)}
								</DropdownMenuCheckboxItem>
							))}
						</DropdownMenuContent>
					</DropdownMenu>

					{enableViewToggle ? (
						<div
							aria-label="View mode"
							className="inline-flex items-center rounded-md border p-1"
							role="group"
						>
							<Button
								aria-pressed={viewMode === "table"}
								className={cn(
									"h-8 px-3",
									viewMode !== "table" && "shadow-none"
								)}
								onClick={() => onViewModeChange?.("table")}
								size="sm"
								type="button"
								variant={viewMode === "table" ? "secondary" : "ghost"}
							>
								<TableProperties className="size-4" />
								Table
							</Button>
							<Button
								aria-pressed={viewMode === "kanban"}
								className={cn(
									"h-8 px-3",
									viewMode !== "kanban" && "shadow-none"
								)}
								onClick={() => onViewModeChange?.("kanban")}
								size="sm"
								type="button"
								variant={viewMode === "kanban" ? "secondary" : "ghost"}
							>
								<LayoutGrid className="size-4" />
								Kanban
							</Button>
						</div>
					) : null}
				</div>

				<div className="flex flex-wrap items-center gap-2">
					{toolbarSlot}
					{newButtonSlot}
				</div>
			</div>

			{activeFilters.length > 0 ? (
				<div className="flex flex-wrap items-center gap-2">
					<div className="flex items-center gap-2 text-muted-foreground text-sm">
						<ListFilter className="size-4" />
						<span>Active filters</span>
					</div>
					{activeFilters.map((filter) => (
						<Badge
							className="gap-2"
							key={`${filter.id}-${filter.value}`}
							variant="secondary"
						>
							<span>
								{filter.label}: {filter.value}
							</span>
							<button
								aria-label={`Clear ${filter.label} filter`}
								className="rounded-full p-0.5 transition-colors hover:bg-black/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
								onClick={() => clearFilter(filter.id)}
								type="button"
							>
								<X className="size-3" />
							</button>
						</Badge>
					))}
					<Button
						onClick={() => {
							setSearchValue("");
							table.resetColumnFilters();
							onGlobalFilterChange("");
						}}
						size="sm"
						type="button"
						variant="ghost"
					>
						Clear all
					</Button>
				</div>
			) : null}
		</div>
	);
}
