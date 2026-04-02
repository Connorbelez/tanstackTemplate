"use client";

import type { ColumnDef } from "@tanstack/react-table";
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

export interface AdminEntityTableRow {
	id: string;
	status?: string;
	subtitle: string;
	title: string;
	updatedAt?: number;
}

function compareNullableStrings(
	valueA: string | undefined,
	valueB: string | undefined
): number {
	return (valueA ?? "").localeCompare(valueB ?? "");
}

function compareNullableNumbers(
	valueA: number | undefined,
	valueB: number | undefined
): number {
	if (valueA === valueB) {
		return 0;
	}
	if (valueA === undefined) {
		return -1;
	}
	if (valueB === undefined) {
		return 1;
	}
	return valueA > valueB ? 1 : -1;
}

export const adminEntityTableColumns: ColumnDef<AdminEntityTableRow>[] = [
	{
		accessorKey: "id",
		header: () => <div className="text-left">ID</div>,
		cell: ({ row }) => (
			<div className="max-w-48 truncate text-left font-mono text-xs">
				{row.original.id}
			</div>
		),
		filterFn: "equalsString",
		sortingFn: (rowA, rowB, columnId) =>
			compareNullableStrings(
				rowA.getValue<string>(columnId),
				rowB.getValue<string>(columnId)
			),
	},
	{
		accessorKey: "title",
		header: () => <div className="text-left">Record</div>,
		cell: ({ row }) => (
			<div className="space-y-1 text-left">
				<div className="font-medium">{row.original.title}</div>
				<div className="text-muted-foreground text-xs">
					{row.original.subtitle}
				</div>
			</div>
		),
		filterFn: "includesString",
		sortingFn: (rowA, rowB, columnId) =>
			compareNullableStrings(
				rowA.getValue<string>(columnId),
				rowB.getValue<string>(columnId)
			),
	},
	{
		accessorKey: "status",
		header: () => <div className="text-left">Status</div>,
		cell: ({ row }) => (
			<div className="text-left">{row.original.status ?? "—"}</div>
		),
		filterFn: "includesString",
		sortingFn: (rowA, rowB, columnId) =>
			compareNullableStrings(
				rowA.getValue<string | undefined>(columnId),
				rowB.getValue<string | undefined>(columnId)
			),
	},
	{
		accessorKey: "updatedAt",
		header: () => <div className="text-right">Updated</div>,
		cell: ({ row }) => {
			if (!row.original.updatedAt) {
				return <div className="text-right">—</div>;
			}

			return (
				<div className="text-right">
					{new Intl.DateTimeFormat("en-CA", {
						dateStyle: "medium",
					}).format(row.original.updatedAt)}
				</div>
			);
		},
		sortingFn: (rowA, rowB, columnId) =>
			compareNullableNumbers(
				rowA.getValue<number | undefined>(columnId),
				rowB.getValue<number | undefined>(columnId)
			),
	},
	{
		id: "actions",
		cell: ({ row }) => {
			const rowData = row.original;

			return (
				<div className="text-right">
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								className="h-8 w-8 p-0"
								onClick={(event) => event.stopPropagation()}
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
								onClick={() => navigator.clipboard.writeText(rowData.id)}
							>
								Copy record ID
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuItem>View record details</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			);
		},
	},
];
