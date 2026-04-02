"use client";

import { rankItem } from "@tanstack/match-sorter-utils";
import {
	type ColumnDef,
	flexRender,
	getCoreRowModel,
	useReactTable,
} from "@tanstack/react-table";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";

interface DataTableProps<TData, TValue> {
	columns: ColumnDef<TData, TValue>[];
	data: TData[];
	emptyMessage?: string;
	errorMessage?: string;
	isLoading?: boolean;
	loadingRowCount?: number;
	onRowClick?: (row: TData) => void;
}

import { MoreHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const columns: ColumnDef<{
	id: number;
	name: string;
	amount: number;
}>[] = [
	{
		accessorKey: "id",
		header: () => <div className="text-left">ID</div>,
		cell: ({ row }) => <div className="text-left">{row.original.id}</div>,
		filterFn: "equalsString",
		sortingFn: (rowA, rowB, columnId) => {
			const itemA =
				rowA.original[
					columnId as keyof { id: number; name: string; amount: number }
				];
			const itemB =
				rowB.original[
					columnId as keyof { id: number; name: string; amount: number }
				];
			return itemA > itemB ? 1 : -1;
		},
	},
	{
		accessorKey: "name",
		header: () => <div className="text-left">Name</div>,
		cell: ({ row }) => <div className="text-left">{row.original.name}</div>,
		filterFn: "includesString",
		sortingFn: (rowA, rowB, columnId) => {
			const itemA =
				rowA.original[
					columnId as keyof { id: number; name: string; amount: number }
				];
			const itemB =
				rowB.original[
					columnId as keyof { id: number; name: string; amount: number }
				];
			return itemA > itemB ? 1 : -1;
		},
	},
	{
		accessorKey: "amount",
		header: () => <div className="text-right">Amount</div>,
		cell: ({ row }) => {
			const amount = Number.parseFloat(row.getValue("amount"));
			const formatted = new Intl.NumberFormat("en-US", {
				style: "currency",
				currency: "USD",
			}).format(amount);

			return <div className="text-right font-medium">{formatted}</div>;
		},
	},
	{
		id: "actions",
		cell: ({ row }) => {
			const payment = row.original;

			return (
				<div className="text-right">
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								className="h-8 w-8 p-0"
								onClick={(e) => e.stopPropagation()}
								type="button"
								variant="ghost"
							>
								<span className="sr-only">Open menu</span>
								<MoreHorizontal className="h-4 w-4" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuLabel>Actions</DropdownMenuLabel>
							<DropdownMenuItem
								onClick={() =>
									navigator.clipboard.writeText(payment.id.toString())
								}
							>
								Copy payment ID
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuItem>View customer</DropdownMenuItem>
							<DropdownMenuItem>View payment details</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			);
		},
	},
	// ...
];

export default function EntityTable<TData, TValue>({
	columns,
	data,
	emptyMessage = "No results.",
	errorMessage,
	isLoading = false,
	loadingRowCount = 6,
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
	const rowModel = table.getRowModel();
	const loadingRowKeys = Array.from(
		{ length: loadingRowCount },
		(_, rowIndex) => `loading-row-${rowIndex + 1}`
	);
	const loadingCellKeys = Array.from(
		{ length: columns.length },
		(_, columnIndex) => `loading-cell-${columnIndex + 1}`
	);

	let bodyContent: React.ReactNode;

	if (isLoading) {
		bodyContent = loadingRowKeys.map((rowKey) => (
			<TableRow key={rowKey}>
				{columns.map((column, columnIndex) => (
					<TableCell
						key={`${rowKey}-${column.id ?? loadingCellKeys[columnIndex]}`}
					>
						<Skeleton
							className={
								columnIndex === columns.length - 1
									? "ml-auto h-4 w-16"
									: "h-4 w-full max-w-36"
							}
						/>
					</TableCell>
				))}
			</TableRow>
		));
	} else if (errorMessage) {
		bodyContent = (
			<TableRow>
				<TableCell
					className="h-24 text-center text-destructive"
					colSpan={columns.length}
				>
					{errorMessage}
				</TableCell>
			</TableRow>
		);
	} else if (rowModel.rows.length > 0) {
		bodyContent = rowModel.rows.map((row) => (
			<TableRow
				className={onRowClick ? "cursor-pointer hover:bg-muted/50" : undefined}
				data-state={row.getIsSelected() && "selected"}
				key={row.id}
				onClick={
					onRowClick
						? () => {
								onRowClick(row.original);
							}
						: undefined
				}
			>
				{row.getVisibleCells().map((cell) => (
					<TableCell key={cell.id}>
						{flexRender(cell.column.columnDef.cell, cell.getContext())}
					</TableCell>
				))}
			</TableRow>
		));
	} else {
		bodyContent = (
			<TableRow>
				<TableCell className="h-24 text-center" colSpan={columns.length}>
					{emptyMessage}
				</TableCell>
			</TableRow>
		);
	}

	return (
		<div className="overflow-hidden rounded-md border">
			<Table>
				<TableHeader>
					{table.getHeaderGroups().map((headerGroup) => (
						<TableRow key={headerGroup.id}>
							{headerGroup.headers.map((header) => {
								return (
									<TableHead key={header.id}>
										{header.isPlaceholder
											? null
											: flexRender(
													header.column.columnDef.header,
													header.getContext()
												)}
									</TableHead>
								);
							})}
						</TableRow>
					))}
				</TableHeader>
				<TableBody>{bodyContent}</TableBody>
			</Table>
		</div>
	);
}
