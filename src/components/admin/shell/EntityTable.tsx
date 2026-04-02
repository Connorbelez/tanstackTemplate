"use client";

import type { RankingInfo } from "@tanstack/match-sorter-utils";
import { rankItem } from "@tanstack/match-sorter-utils";
import {
	type ColumnDef,
	type FilterFn,
	flexRender,
	getCoreRowModel,
	getFilteredRowModel,
	getPaginationRowModel,
	getSortedRowModel,
	type Header,
	type RowData,
	type SortingState,
	useReactTable,
	type VisibilityState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, Rows3, SearchX } from "lucide-react";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { Checkbox } from "#/components/ui/checkbox";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "#/components/ui/empty";
import {
	Pagination,
	PaginationContent,
	PaginationItem,
	PaginationNext,
	PaginationPrevious,
} from "#/components/ui/pagination";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { Skeleton } from "#/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import { cn } from "#/lib/utils";
import {
	EntityTableToolbar,
	type EntityTableViewMode,
} from "./EntityTableToolbar";

export interface EntityTableColumnMeta {
	align?: "left" | "center" | "right";
	isHideable?: boolean;
	isTextSearchable?: boolean;
	label?: string;
	width?: number;
}

declare module "@tanstack/react-table" {
	interface ColumnMeta<TData extends RowData, TValue>
		extends EntityTableColumnMeta {}
	interface FilterFns {
		fuzzy: FilterFn<unknown>;
	}
	interface FilterMeta {
		itemRank: RankingInfo;
	}
}

export interface EntityTableProps<TData> {
	columns: ColumnDef<TData, unknown>[];
	data: TData[];
	description?: string;
	emptyState?: ReactNode;
	enableRowSelection?: boolean;
	initialPageSize?: number;
	isLoading?: boolean;
	newButtonSlot?: ReactNode;
	onRowClick?: (row: TData) => void;
	onViewModeChange?: (mode: EntityTableViewMode) => void;
	pageSizeOptions?: number[];
	title?: string;
	toolbarSlot?: ReactNode;
	viewMode?: EntityTableViewMode;
}

const DEFAULT_PAGE_SIZE = 10;
const DEFAULT_PAGE_SIZE_OPTIONS = [10, 25, 50];
const SKELETON_ROW_COUNT = 5;

function createSequentialKeys(prefix: string, count: number): string[] {
	return Array.from({ length: count }, (_, index) => `${prefix}-${index + 1}`);
}

const fuzzyFilter: FilterFn<unknown> = (row, columnId, value, addMeta) => {
	const itemRank = rankItem(
		String(row.getValue(columnId) ?? ""),
		String(value)
	);
	addMeta({ itemRank });
	return itemRank.passed;
};

function getAlignmentClass(align: EntityTableColumnMeta["align"]): string {
	switch (align) {
		case "center":
			return "text-center";
		case "right":
			return "text-right";
		default:
			return "text-left";
	}
}

function getSelectionCheckboxState(
	isAllSelected: boolean,
	isSomeSelected: boolean
): boolean | "indeterminate" {
	if (isAllSelected) {
		return true;
	}

	if (isSomeSelected) {
		return "indeterminate";
	}

	return false;
}

function getSortableAriaSort(
	sorted: false | "asc" | "desc"
): "ascending" | "descending" | "none" {
	switch (sorted) {
		case "asc":
			return "ascending";
		case "desc":
			return "descending";
		default:
			return "none";
	}
}

function getHeaderLabel<TData>(column: ColumnDef<TData, unknown>): string {
	if (column.meta?.label) {
		return column.meta.label;
	}

	if (typeof column.header === "string") {
		return column.header;
	}

	if ("accessorKey" in column && typeof column.accessorKey === "string") {
		return column.accessorKey;
	}

	return "Column";
}

function getHeaderContentAlignmentClass(alignClass: string): string {
	if (alignClass === "text-right") {
		return "justify-end";
	}

	if (alignClass === "text-center") {
		return "justify-center";
	}

	return "justify-start";
}

function renderTableHeaderCell<TData>(header: Header<TData, unknown>) {
	const alignClass = getAlignmentClass(header.column.columnDef.meta?.align);
	const headerLabel = getHeaderLabel(
		header.column.columnDef as ColumnDef<TData, unknown>
	);
	const sorted = header.column.getIsSorted();
	let sortingLabel = "Not sorted";
	if (sorted === "asc") {
		sortingLabel = "Sorted ascending";
	} else if (sorted === "desc") {
		sortingLabel = "Sorted descending";
	}

	let sortingIcon: ReactNode = (
		<ArrowUpDown className="size-4 text-muted-foreground" />
	);
	if (sorted === "asc") {
		sortingIcon = <ArrowUp className="size-4" />;
	} else if (sorted === "desc") {
		sortingIcon = <ArrowDown className="size-4" />;
	}

	let content: ReactNode = null;
	if (!header.isPlaceholder) {
		if (header.column.getCanSort()) {
			content = (
				<button
					aria-label={`Sort by ${headerLabel}`}
					className={cn(
						"inline-flex w-full items-center gap-2 rounded-sm px-1 py-1 font-medium transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
						getHeaderContentAlignmentClass(alignClass)
					)}
					onClick={header.column.getToggleSortingHandler()}
					type="button"
				>
					<span>
						{flexRender(header.column.columnDef.header, header.getContext())}
					</span>
					{sortingIcon}
					<span className="sr-only">{sortingLabel}</span>
				</button>
			);
		} else {
			content = flexRender(header.column.columnDef.header, header.getContext());
		}
	}

	return (
		<TableHead
			aria-sort={
				header.column.getCanSort() ? getSortableAriaSort(sorted) : undefined
			}
			className={cn(alignClass, "whitespace-nowrap")}
			key={header.id}
			style={{
				width: header.column.columnDef.meta?.width,
			}}
		>
			{content}
		</TableHead>
	);
}

function isInteractiveTarget(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) {
		return false;
	}

	return Boolean(
		target.closest(
			"a, button, input, textarea, select, [role='button'], [role='checkbox'], [role='menuitem']"
		)
	);
}

function renderDefaultEmptyState(
	hasActiveFilters: boolean,
	onClearFilters: () => void
) {
	return (
		<Empty className="border-0 p-6">
			<EmptyHeader>
				<EmptyMedia variant="icon">
					{hasActiveFilters ? (
						<SearchX className="size-5" />
					) : (
						<Rows3 className="size-5" />
					)}
				</EmptyMedia>
				<EmptyTitle>
					{hasActiveFilters ? "No matching rows" : "No records yet"}
				</EmptyTitle>
				<EmptyDescription>
					{hasActiveFilters
						? "Adjust or clear your current filters to see results."
						: "Rows will appear here once data is available."}
				</EmptyDescription>
			</EmptyHeader>
			{hasActiveFilters ? (
				<EmptyContent>
					<button
						className="font-medium text-primary text-sm underline underline-offset-4"
						onClick={onClearFilters}
						type="button"
					>
						Clear filters
					</button>
				</EmptyContent>
			) : null}
		</Empty>
	);
}

export default function EntityTable<TData>({
	columns,
	data,
	description,
	emptyState,
	enableRowSelection = false,
	initialPageSize = DEFAULT_PAGE_SIZE,
	isLoading = false,
	newButtonSlot,
	onRowClick,
	pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
	title,
	toolbarSlot,
	viewMode,
	onViewModeChange,
}: EntityTableProps<TData>) {
	const [sorting, setSorting] = useState<SortingState>([]);
	const [globalFilter, setGlobalFilter] = useState("");
	const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
	const [rowSelection, setRowSelection] = useState({});

	const tableColumns = useMemo<ColumnDef<TData, unknown>[]>(() => {
		if (!enableRowSelection) {
			return columns;
		}

		const selectionColumn: ColumnDef<TData, unknown> = {
			id: "select",
			enableGlobalFilter: false,
			enableHiding: false,
			enableSorting: false,
			header: ({ table }) => (
				<div className="flex justify-center">
					<Checkbox
						aria-label="Select all rows on this page"
						checked={getSelectionCheckboxState(
							table.getIsAllPageRowsSelected(),
							table.getIsSomePageRowsSelected()
						)}
						onCheckedChange={(value) =>
							table.toggleAllPageRowsSelected(Boolean(value))
						}
					/>
				</div>
			),
			cell: ({ row }) => (
				<div className="flex justify-center">
					<Checkbox
						aria-label={`Select row ${row.index + 1}`}
						checked={row.getIsSelected()}
						onCheckedChange={(value) => row.toggleSelected(Boolean(value))}
						onClick={(event) => event.stopPropagation()}
					/>
				</div>
			),
			meta: {
				align: "center",
				isHideable: false,
				isTextSearchable: false,
				label: "Select",
			},
		};

		return [selectionColumn, ...columns];
	}, [columns, enableRowSelection]);

	const table = useReactTable({
		data,
		columns: tableColumns,
		enableRowSelection,
		filterFns: {
			fuzzy: fuzzyFilter,
		},
		getColumnCanGlobalFilter: (column) =>
			column.id !== "select" &&
			column.getIsVisible() &&
			(column.columnDef.meta?.isTextSearchable ?? true),
		getCoreRowModel: getCoreRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		getSortedRowModel: getSortedRowModel(),
		globalFilterFn: "fuzzy",
		initialState: {
			pagination: {
				pageIndex: 0,
				pageSize: initialPageSize,
			},
		},
		onColumnVisibilityChange: setColumnVisibility,
		onGlobalFilterChange: setGlobalFilter,
		onRowSelectionChange: setRowSelection,
		onSortingChange: setSorting,
		state: {
			columnVisibility,
			globalFilter,
			rowSelection,
			sorting,
		},
	});

	const visibleColumnCount =
		table.getVisibleLeafColumns().length || tableColumns.length;
	const hasActiveFilters =
		globalFilter.trim().length > 0 || table.getState().columnFilters.length > 0;
	const hasRows = table.getRowModel().rows.length > 0;
	const selectedRowCount = table.getFilteredSelectedRowModel().rows.length;
	const filteredRowCount = table.getFilteredRowModel().rows.length;
	const currentPageRowCount = table.getRowModel().rows.length;
	const pageCount = Math.max(table.getPageCount(), 1);
	const handleGlobalFilterChange = useCallback(
		(value: string) => {
			setGlobalFilter(value);
			table.setPageIndex(0);
		},
		[table]
	);
	const skeletonRowKeys = createSequentialKeys(
		"skeleton-row",
		Math.max(SKELETON_ROW_COUNT, table.getState().pagination.pageSize)
	);
	const skeletonCellKeys = createSequentialKeys(
		"skeleton-cell",
		visibleColumnCount
	);

	function clearFilters() {
		table.resetColumnFilters();
		setGlobalFilter("");
		table.setPageIndex(0);
	}

	let bodyContent: ReactNode;
	if (isLoading) {
		bodyContent = skeletonRowKeys.map((rowKey) => (
			<TableRow key={rowKey}>
				{skeletonCellKeys.map((cellKey) => (
					<TableCell key={`${rowKey}-${cellKey}`}>
						<Skeleton className="h-5 w-full max-w-[12rem]" />
					</TableCell>
				))}
			</TableRow>
		));
	} else if (hasRows) {
		bodyContent = table.getRowModel().rows.map((row) => (
			<TableRow
				className={cn(
					onRowClick && "cursor-pointer hover:bg-muted/50",
					row.getIsSelected() && "bg-muted/40"
				)}
				data-state={row.getIsSelected() ? "selected" : undefined}
				key={row.id}
				onClick={(event) => {
					if (!onRowClick || isInteractiveTarget(event.target)) {
						return;
					}
					onRowClick(row.original);
				}}
			>
				{row.getVisibleCells().map((cell, index) => (
					<TableCell
						className={getAlignmentClass(cell.column.columnDef.meta?.align)}
						key={cell.id}
					>
						{onRowClick &&
						cell.column.id !== "select" &&
						index ===
							(row.getVisibleCells()[0]?.column.id === "select" ? 1 : 0) ? (
							<div className="relative">
								<button
									aria-label="Open record details"
									className="sr-only rounded-sm focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-10 focus:bg-background focus:px-2 focus:py-1 focus:text-sm focus:outline-none focus:ring-2 focus:ring-ring"
									onClick={(event) => {
										event.stopPropagation();
										onRowClick(row.original);
									}}
									type="button"
								>
									Open details
								</button>
								{flexRender(cell.column.columnDef.cell, cell.getContext())}
							</div>
						) : (
							flexRender(cell.column.columnDef.cell, cell.getContext())
						)}
					</TableCell>
				))}
			</TableRow>
		));
	} else {
		bodyContent = (
			<TableRow>
				<TableCell colSpan={visibleColumnCount}>
					{emptyState ??
						renderDefaultEmptyState(hasActiveFilters, clearFilters)}
				</TableCell>
			</TableRow>
		);
	}

	return (
		<div className="space-y-4">
			<EntityTableToolbar
				description={description}
				enableViewToggle={Boolean(viewMode && onViewModeChange)}
				globalFilter={globalFilter}
				newButtonSlot={newButtonSlot}
				onGlobalFilterChange={handleGlobalFilterChange}
				onViewModeChange={onViewModeChange}
				table={table}
				title={title}
				toolbarSlot={toolbarSlot}
				viewMode={viewMode}
			/>

			<div className="overflow-hidden rounded-md border">
				<Table>
					<TableHeader>
						{table.getHeaderGroups().map((headerGroup) => (
							<TableRow key={headerGroup.id}>
								{headerGroup.headers.map((header) =>
									renderTableHeaderCell(header)
								)}
							</TableRow>
						))}
					</TableHeader>
					<TableBody>{bodyContent}</TableBody>
				</Table>
			</div>

			<div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
				<div className="flex flex-wrap items-center gap-3 text-muted-foreground text-sm">
					<span>
						Showing{" "}
						<strong className="text-foreground">{currentPageRowCount}</strong>{" "}
						of <strong className="text-foreground">{filteredRowCount}</strong>
					</span>
					{selectedRowCount > 0 ? (
						<span>
							<strong className="text-foreground">{selectedRowCount}</strong>{" "}
							selected
						</span>
					) : null}
				</div>

				<div className="flex flex-col gap-3 sm:flex-row sm:items-center">
					<div className="flex items-center gap-2 text-sm">
						<span className="text-muted-foreground">Rows per page</span>
						<Select
							onValueChange={(value) => table.setPageSize(Number(value))}
							value={String(table.getState().pagination.pageSize)}
						>
							<SelectTrigger className="w-[96px]" size="sm">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{pageSizeOptions.map((pageSize) => (
									<SelectItem key={pageSize} value={String(pageSize)}>
										{pageSize}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					<div className="text-muted-foreground text-sm">
						Page{" "}
						<strong className="text-foreground">
							{table.getState().pagination.pageIndex + 1}
						</strong>{" "}
						of <strong className="text-foreground">{pageCount}</strong>
					</div>

					<Pagination className="mx-0 w-auto justify-start sm:justify-end">
						<PaginationContent>
							<PaginationItem>
								<PaginationPrevious
									aria-disabled={!table.getCanPreviousPage()}
									className={cn(
										!table.getCanPreviousPage() &&
											"pointer-events-none opacity-50"
									)}
									href="#previous-page"
									onClick={(event) => {
										event.preventDefault();
										table.previousPage();
									}}
								/>
							</PaginationItem>
							<PaginationItem>
								<PaginationNext
									aria-disabled={!table.getCanNextPage()}
									className={cn(
										!table.getCanNextPage() && "pointer-events-none opacity-50"
									)}
									href="#next-page"
									onClick={(event) => {
										event.preventDefault();
										table.nextPage();
									}}
								/>
							</PaginationItem>
						</PaginationContent>
					</Pagination>
				</div>
			</div>
		</div>
	);
}
