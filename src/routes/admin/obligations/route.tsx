import { createFileRoute, Outlet, useMatch } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { AdminDetailSheet } from "#/components/admin/shell/AdminDetailSheet";
import {
	BadgeCell,
	CurrencyCell,
	DateCell,
} from "#/components/admin/shell/cell-renderers";
import EntityTable from "#/components/admin/shell/EntityTable.tsx";
import { useAdminDetailSheet } from "#/hooks/useAdminDetailSheet";

interface ObligationTableRow {
	amountCents: number;
	dueDate: string;
	id: number;
	status: "due" | "paid" | "scheduled";
}

function getObligationStatus(index: number): ObligationTableRow["status"] {
	if (index % 4 === 0) {
		return "paid";
	}

	if (index % 2 === 0) {
		return "due";
	}

	return "scheduled";
}

function getObligationStatusColor(
	status: ObligationTableRow["status"]
): string {
	switch (status) {
		case "paid":
			return "#16a34a";
		case "due":
			return "#dc2626";
		default:
			return "#64748b";
	}
}

export const Route = createFileRoute("/admin/obligations")({
	component: EntityList,
	loader: async () => {
		const fakeData: ObligationTableRow[] = Array.from(
			{ length: 10 },
			(_, index) => ({
				id: index,
				amountCents: Math.round(Math.random() * 9_500_000),
				dueDate: new Date(Date.now() + index * 86_400_000 * 7).toISOString(),
				status: getObligationStatus(index),
			})
		);

		return { fakeData };
	},
});

function EntityList() {
	const { fakeData } = Route.useLoaderData();
	const { open } = useAdminDetailSheet();
	const columns: ColumnDef<ObligationTableRow>[] = [
		{
			accessorKey: "status",
			header: "Status",
			cell: ({ row }) => (
				<BadgeCell
					color={getObligationStatusColor(row.original.status)}
					value={row.original.status}
				/>
			),
			meta: { isTextSearchable: true, label: "Status" },
		},
		{
			accessorKey: "dueDate",
			header: "Due date",
			cell: ({ row }) => (
				<DateCell format="absolute" value={row.original.dueDate} />
			),
			meta: { label: "Due date" },
		},
		{
			accessorKey: "amountCents",
			header: "Amount",
			cell: ({ row }) => (
				<CurrencyCell isCents value={row.original.amountCents} />
			),
			meta: { align: "right", label: "Amount" },
		},
	];
	const recordId = useMatch({
		from: "/admin/obligations/$recordid",
		select: (match) => match.params.recordid,
		shouldThrow: false,
	});

	if (recordId) {
		return <Outlet />;
	}

	return (
		<>
			<EntityTable
				columns={columns}
				data={fakeData}
				description="Dedicated route scaffold for the obligations system entity."
				onRowClick={(row) => open(String(row.id))}
				title="Obligations"
			/>
			<AdminDetailSheet entityType="obligations" />
		</>
	);
}
