import type { Meta, StoryObj } from "@storybook/react-vite";
import { rankItem } from "@tanstack/match-sorter-utils";
import type { ColumnDef, ColumnFiltersState } from "@tanstack/react-table";
import {
	type FilterFn,
	getCoreRowModel,
	getFilteredRowModel,
	useReactTable,
} from "@tanstack/react-table";
import { useState } from "react";
import { Button } from "#/components/ui/button";
import {
	EntityTableToolbar,
	type EntityTableViewMode,
} from "./EntityTableToolbar";

interface ToolbarRow {
	id: string;
	name: string;
	stage: "active" | "draft" | "review";
}

const data: ToolbarRow[] = [
	{ id: "1", name: "Listings", stage: "active" },
	{ id: "2", name: "Mortgages", stage: "review" },
	{ id: "3", name: "Borrowers", stage: "draft" },
];

const columns: ColumnDef<ToolbarRow>[] = [
	{
		accessorKey: "name",
		header: "Entity",
		meta: { isTextSearchable: true, label: "Entity" },
	},
	{
		accessorKey: "stage",
		header: "Stage",
		meta: { isTextSearchable: true, label: "Stage" },
	},
];

const fuzzyFilter: FilterFn<ToolbarRow> = (row, columnId, value, addMeta) => {
	const itemRank = rankItem(
		String(row.getValue(columnId) ?? ""),
		String(value)
	);
	addMeta({ itemRank });
	return itemRank.passed;
};

function EntityTableToolbarStory({
	description = "Toolbar surface for table search, filters, and view switching.",
	enableViewToggle = true,
	title = "Entity records",
}: {
	description?: string;
	enableViewToggle?: boolean;
	title?: string;
}) {
	const [globalFilter, setGlobalFilter] = useState("");
	const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([
		{ id: "stage", value: "active" },
	]);
	const [viewMode, setViewMode] = useState<EntityTableViewMode>("table");

	const table = useReactTable({
		data,
		columns,
		filterFns: {
			fuzzy: fuzzyFilter,
		},
		getCoreRowModel: getCoreRowModel(),
		getColumnCanGlobalFilter: (column) =>
			column.columnDef.meta?.isTextSearchable ?? true,
		getFilteredRowModel: getFilteredRowModel(),
		globalFilterFn: "fuzzy",
		onColumnFiltersChange: setColumnFilters,
		onGlobalFilterChange: setGlobalFilter,
		state: {
			columnFilters,
			globalFilter,
		},
	});

	return (
		<div className="max-w-5xl rounded-lg border bg-background p-4">
			<EntityTableToolbar
				description={description}
				enableViewToggle={enableViewToggle}
				globalFilter={globalFilter}
				newButtonSlot={<Button size="sm">New entity</Button>}
				onGlobalFilterChange={setGlobalFilter}
				onViewModeChange={setViewMode}
				table={table}
				title={title}
				toolbarSlot={
					<Button size="sm" variant="outline">
						Export
					</Button>
				}
				viewMode={viewMode}
			/>
		</div>
	);
}

const meta = {
	title: "Admin/EntityTableToolbar",
	component: EntityTableToolbarStory,
	parameters: { layout: "padded" },
	tags: ["autodocs"],
} satisfies Meta<typeof EntityTableToolbarStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithoutViewToggle: Story = {
	args: {
		enableViewToggle: false,
	},
};
