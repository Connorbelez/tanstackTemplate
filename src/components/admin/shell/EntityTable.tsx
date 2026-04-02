"use client";

import { rankItem } from "@tanstack/match-sorter-utils";
import {
	type ColumnDef,
	flexRender,
	getCoreRowModel,
	useReactTable,
} from "@tanstack/react-table";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";

function getRowActionLabel(rowData: unknown): string {
	if (typeof rowData !== "object" || rowData === null) {
		return "Open record details";
	}

	const record = rowData as Record<string, unknown>;
	const label =
		typeof record.title === "string"
			? record.title
			: typeof record.name === "string"
				? record.name
				: typeof record.id === "string"
					? record.id
					: undefined;

	return label ? `Open details for ${label}` : "Open record details";
}

interface DataTableProps<TData, TValue> {
	columns: ColumnDef<TData, TValue>[];
	data: TData[];
	onRowClick?: (row: TData) => void;
}

export default function EntityTable<TData, TValue>({
	columns,
	data,
	onRowClick,
}: DataTableProps<TData, TValue>) {
	const table = useReactTable({
		data,
		filterFns: {
			fuzzy: (row, columnId, value, addMeta) => {
				const itemRank = rankItem(row.getValue(columnId), value);
				addMeta({ itemRank });
				return itemRank.passed;
			},
		},
		columns,
		getCoreRowModel: getCoreRowModel(),
	});

	return (
		<div className="overflow-hidden rounded-md border">
			<Table>
				<TableHeader>
					{table.getHeaderGroups().map((headerGroup) => (
						<TableRow key={headerGroup.id}>
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
						</TableRow>
					))}
				</TableHeader>
				<TableBody>
					{table.getRowModel().rows.length > 0 ? (
						table.getRowModel().rows.map((row) => {
							const isInteractive = Boolean(onRowClick);

							return (
								<TableRow
									aria-label={
										isInteractive
											? getRowActionLabel(row.original)
											: undefined
									}
									className={
										isInteractive
											? "cursor-pointer hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
											: undefined
									}
									data-state={row.getIsSelected() && "selected"}
									key={row.id}
									onClick={
										onRowClick ? () => onRowClick(row.original) : undefined
									}
									onKeyDown={
										onRowClick
											? (event) => {
													if (event.key === "Enter" || event.key === " ") {
														event.preventDefault();
														onRowClick(row.original);
													}
												}
											: undefined
									}
									role={isInteractive ? "button" : undefined}
									tabIndex={isInteractive ? 0 : undefined}
								>
									{row.getVisibleCells().map((cell) => (
										<TableCell key={cell.id}>
											{flexRender(
												cell.column.columnDef.cell,
												cell.getContext()
											)}
										</TableCell>
									))}
								</TableRow>
							);
						})
					) : (
						<TableRow>
							<TableCell className="h-24 text-center" colSpan={columns.length}>
								No results.
							</TableCell>
						</TableRow>
					)}
				</TableBody>
			</Table>
		</div>
	);
}
