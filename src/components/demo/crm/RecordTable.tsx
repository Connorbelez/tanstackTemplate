import type { RankingInfo } from "@tanstack/match-sorter-utils";
import { compareItems, rankItem } from "@tanstack/match-sorter-utils";
import type {
	CellContext,
	ColumnDef,
	ColumnFiltersState,
	FilterFn,
	HeaderContext,
	SortingFn,
} from "@tanstack/react-table";
import {
	flexRender,
	getCoreRowModel,
	getFilteredRowModel,
	getPaginationRowModel,
	getSortedRowModel,
	sortingFns,
	useReactTable,
} from "@tanstack/react-table";
import { ArrowUpDown, Search } from "lucide-react";
import type { ComponentProps } from "react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow as UITableRow,
} from "#/components/ui/table";
import { cn } from "#/lib/utils";
import type { Doc } from "../../../../convex/_generated/dataModel";
import {
	getRecordSupportingText,
	getRecordTitle,
	renderFieldValue,
	renderSourceBadge,
} from "./cell-renderers";
import type { CrmDemoRecordReference, CrmDemoTableResult } from "./types";

type FieldDef = Doc<"fieldDefs">;
type RecordTableRow = CrmDemoTableResult["rows"][number];

declare module "@tanstack/react-table" {
	interface FilterFns {
		fuzzy: FilterFn<unknown>;
	}
	interface FilterMeta {
		itemRank: RankingInfo;
	}
}

const fuzzyFilter: FilterFn<RecordTableRow> = (
	row,
	columnId,
	value,
	addMeta
) => {
	const itemRank = rankItem(String(row.getValue(columnId) ?? ""), value);
	addMeta({ itemRank });
	return itemRank.passed;
};

const fuzzySort: SortingFn<RecordTableRow> = (rowA, rowB, columnId) => {
	let direction = 0;
	const rowAMeta = rowA.columnFiltersMeta[columnId];
	const rowBMeta = rowB.columnFiltersMeta[columnId];

	if (rowAMeta?.itemRank && rowBMeta?.itemRank) {
		direction = compareItems(rowAMeta.itemRank, rowBMeta.itemRank);
	}

	return direction === 0
		? sortingFns.alphanumeric(rowA, rowB, columnId)
		: direction;
};

function DebouncedInput({
	value: initialValue,
	onChange,
	...props
}: Omit<ComponentProps<typeof Input>, "onChange"> & {
	onChange: (value: string) => void;
	value: string;
}) {
	const [value, setValue] = useState(initialValue);

	useEffect(() => {
		setValue(initialValue);
	}, [initialValue]);

	useEffect(() => {
		const timeout = setTimeout(() => onChange(value), 150);
		return () => clearTimeout(timeout);
	}, [onChange, value]);

	return (
		<div className="relative">
			<Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
			<Input
				{...props}
				className={cn("pl-9", props.className)}
				onChange={(event) => setValue(event.target.value)}
				value={value}
			/>
		</div>
	);
}

interface RecordTableProps {
	fields: FieldDef[];
	objectDef: Pick<Doc<"objectDefs">, "nativeTable" | "singularLabel">;
	onSelectRecord?: (record: CrmDemoRecordReference) => void;
	rows: CrmDemoTableResult["rows"];
	selectedRecordId?: string;
	viewColumns: CrmDemoTableResult["columns"];
}

export function RecordTable({
	fields,
	objectDef,
	onSelectRecord,
	rows,
	selectedRecordId,
	viewColumns,
}: RecordTableProps) {
	const [globalFilter, setGlobalFilter] = useState("");
	const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
	const fieldMap = useMemo(
		() => new Map(fields.map((field) => [field.name, field])),
		[fields]
	);

	const columns = useMemo<ColumnDef<RecordTableRow>[]>(
		() => [
			{
				accessorKey: "_id",
				header: "Record",
				cell: ({ row }) => (
					<div className="space-y-1">
						<div className="flex items-center gap-2">
							<p className="font-medium">
								{getRecordTitle(row.original, fields)}
							</p>
							{renderSourceBadge(row.original._kind)}
						</div>
						<p className="text-muted-foreground text-xs">
							{getRecordSupportingText(row.original, objectDef)}
						</p>
					</div>
				),
				sortingFn: (rowA, rowB) =>
					getRecordTitle(rowA.original, fields).localeCompare(
						getRecordTitle(rowB.original, fields)
					),
			},
			...viewColumns
				.filter((column) => column.isVisible)
				.sort((a, b) => a.displayOrder - b.displayOrder)
				.map(
					(column): ColumnDef<RecordTableRow> => ({
						accessorFn: (row: RecordTableRow) => row.fields[column.name],
						id: column.name,
						header: ({
							column: headerColumn,
						}: HeaderContext<RecordTableRow, unknown>) => (
							<Button
								className="h-auto px-0 py-0 font-medium text-foreground hover:bg-transparent"
								onClick={headerColumn.getToggleSortingHandler()}
								size="sm"
								variant="ghost"
							>
								{column.label}
								<ArrowUpDown className="size-3.5 text-muted-foreground" />
							</Button>
						),
						cell: ({ row }: CellContext<RecordTableRow, unknown>) => {
							const field = fieldMap.get(column.name);
							if (!field) {
								return <span className="text-muted-foreground">—</span>;
							}

							return (
								<div className="max-w-[220px] truncate text-sm">
									{renderFieldValue(field, row.original.fields[column.name])}
								</div>
							);
						},
						filterFn: "fuzzy" as const,
						sortingFn: fuzzySort,
					})
				),
		],
		[fieldMap, fields, objectDef, viewColumns]
	);

	const table = useReactTable({
		columns,
		data: rows,
		filterFns: { fuzzy: fuzzyFilter },
		getCoreRowModel: getCoreRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		getSortedRowModel: getSortedRowModel(),
		globalFilterFn: "fuzzy",
		onColumnFiltersChange: setColumnFilters,
		onGlobalFilterChange: setGlobalFilter,
		state: {
			columnFilters,
			globalFilter,
		},
	});

	useEffect(() => {
		if (table.getState().pagination.pageIndex > 0) {
			table.setPageIndex(0);
		}
	}, [table]);

	return (
		<div className="space-y-4">
			<div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
				<DebouncedInput
					className="w-full lg:max-w-sm"
					onChange={setGlobalFilter}
					placeholder="Search visible columns"
					value={globalFilter}
				/>
				<div className="flex items-center gap-2">
					<Badge variant="secondary">
						{table.getFilteredRowModel().rows.length} rows
					</Badge>
					<Badge variant="outline">
						Page {table.getState().pagination.pageIndex + 1} of{" "}
						{Math.max(table.getPageCount(), 1)}
					</Badge>
				</div>
			</div>

			<div className="overflow-hidden rounded-2xl border border-border/70">
				<Table>
					<TableHeader>
						{table.getHeaderGroups().map((headerGroup) => (
							<UITableRow key={headerGroup.id}>
								{headerGroup.headers.map((header) => (
									<TableHead key={header.id}>
										{header.isPlaceholder
											? null
											: flexRender(
													header.column.columnDef.header,
													header.getContext()
												)}
									</TableHead>
								))}
							</UITableRow>
						))}
					</TableHeader>
					<TableBody>
						{table.getRowModel().rows.length === 0 ? (
							<UITableRow>
								<TableCell
									className="py-10 text-center text-muted-foreground"
									colSpan={columns.length}
								>
									No rows match the current search.
								</TableCell>
							</UITableRow>
						) : (
							table.getRowModel().rows.map((row) => {
								const nextReference: CrmDemoRecordReference = {
									labelValue: getRecordTitle(row.original, fields),
									objectDefId: row.original.objectDefId,
									recordId: row.original._id,
									recordKind: row.original._kind,
								};

								return (
									<UITableRow
										className={cn(
											onSelectRecord &&
												"cursor-pointer transition-colors hover:bg-muted/30",
											selectedRecordId === row.original._id && "bg-muted/40"
										)}
										key={row.id}
										onClick={() => onSelectRecord?.(nextReference)}
									>
										{row.getVisibleCells().map((cell) => (
											<TableCell key={cell.id}>
												{flexRender(
													cell.column.columnDef.cell,
													cell.getContext()
												)}
											</TableCell>
										))}
									</UITableRow>
								);
							})
						)}
					</TableBody>
				</Table>
			</div>

			<div className="flex items-center justify-between">
				<p className="text-muted-foreground text-xs">
					Showing {table.getRowModel().rows.length} of {rows.length} loaded
					rows.
				</p>
				<div className="flex items-center gap-2">
					<Button
						disabled={!table.getCanPreviousPage()}
						onClick={() => table.previousPage()}
						size="sm"
						variant="outline"
					>
						Previous
					</Button>
					<Button
						disabled={!table.getCanNextPage()}
						onClick={() => table.nextPage()}
						size="sm"
						variant="outline"
					>
						Next
					</Button>
				</div>
			</div>
		</div>
	);
}
