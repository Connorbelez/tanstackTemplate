import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ColumnDef } from "@tanstack/react-table";
import { Button } from "#/components/ui/button";
import {
	AvatarCell,
	BadgeCell,
	CurrencyCell,
	DateCell,
	TextCell,
} from "./cell-renderers";
import EntityTable, { type EntityTableProps } from "./EntityTable";

interface DealTableRow {
	borrower: string;
	id: string;
	principalCents: number;
	stage: "closing" | "new" | "underwriting";
	updatedAt: string;
}

const sampleData: DealTableRow[] = [
	{
		id: "deal-001",
		borrower: "North River LP",
		principalCents: 12_500_000,
		stage: "underwriting",
		updatedAt: "2026-04-01T14:00:00.000Z",
	},
	{
		id: "deal-002",
		borrower: "Cedar Equity",
		principalCents: 8_900_000,
		stage: "closing",
		updatedAt: "2026-03-30T09:30:00.000Z",
	},
	{
		id: "deal-003",
		borrower: "Juniper Holdings",
		principalCents: 19_250_000,
		stage: "new",
		updatedAt: "2026-03-28T18:15:00.000Z",
	},
];

function getStageColor(stage: DealTableRow["stage"]): string {
	switch (stage) {
		case "closing":
			return "#16a34a";
		case "underwriting":
			return "#2563eb";
		default:
			return "#64748b";
	}
}

const columns: ColumnDef<DealTableRow>[] = [
	{
		accessorKey: "borrower",
		header: "Borrower",
		cell: ({ row }) => (
			<AvatarCell
				name={row.original.borrower}
				subtitle={`Record ${row.original.id}`}
			/>
		),
		meta: { isTextSearchable: true, label: "Borrower" },
	},
	{
		accessorKey: "stage",
		header: "Stage",
		cell: ({ row }) => (
			<BadgeCell
				color={getStageColor(row.original.stage)}
				value={row.original.stage}
			/>
		),
		meta: { isTextSearchable: true, label: "Stage" },
	},
	{
		accessorKey: "principalCents",
		header: "Principal",
		cell: ({ row }) => (
			<CurrencyCell isCents value={row.original.principalCents} />
		),
		meta: { align: "right", label: "Principal" },
	},
	{
		accessorKey: "updatedAt",
		header: "Updated",
		cell: ({ row }) => (
			<DateCell format="both" value={row.original.updatedAt} />
		),
		meta: { label: "Updated" },
	},
];

function EntityTableStory({
	data = sampleData,
	...props
}: Partial<EntityTableProps<DealTableRow>> & {
	data?: DealTableRow[];
}) {
	return (
		<div className="max-w-6xl">
			<EntityTable
				columns={columns}
				data={data}
				description="Reusable table shell for dedicated system entity routes."
				newButtonSlot={<Button size="sm">New deal</Button>}
				title="Deals"
				{...props}
			/>
		</div>
	);
}

const meta = {
	title: "Admin/EntityTable",
	component: EntityTableStory,
	parameters: { layout: "padded" },
	tags: ["autodocs"],
} satisfies Meta<typeof EntityTableStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Loading: Story = {
	args: {
		isLoading: true,
	},
};

export const Empty: Story = {
	args: {
		data: [],
		emptyState: (
			<div className="flex flex-col items-center gap-2 py-8 text-center">
				<TextCell value="No dedicated records are available yet." />
			</div>
		),
	},
};

export const WithSelection: Story = {
	args: {
		enableRowSelection: true,
	},
};
