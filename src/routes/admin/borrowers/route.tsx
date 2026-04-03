import { createFileRoute, Outlet, useMatch } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { AdminDetailSheet } from "#/components/admin/shell/AdminDetailSheet";
import { BadgeCell, TextCell } from "#/components/admin/shell/cell-renderers";
import EntityTable from "#/components/admin/shell/EntityTable.tsx";
import { useAdminDetailSheet } from "#/hooks/useAdminDetailSheet";

interface BorrowerTableRow {
	id: number;
	name: string;
	portfolioCount: number;
	status: "active" | "prospect" | "under_review";
}

function getBorrowerStatus(index: number): BorrowerTableRow["status"] {
	if (index % 4 === 0) {
		return "under_review";
	}

	if (index % 2 === 0) {
		return "active";
	}

	return "prospect";
}

function getBorrowerStatusColor(status: BorrowerTableRow["status"]): string {
	switch (status) {
		case "active":
			return "#16a34a";
		case "under_review":
			return "#2563eb";
		default:
			return "#64748b";
	}
}

export const Route = createFileRoute("/admin/borrowers")({
	component: EntityList,
	loader: async () => {
		const fakeData: BorrowerTableRow[] = Array.from(
			{ length: 10 },
			(_, index) => ({
				id: index,
				name: `Borrower ${index + 1}`,
				portfolioCount: 1 + (index % 5),
				status: getBorrowerStatus(index),
			})
		);

		return { fakeData };
	},
});

function EntityList() {
	const { fakeData } = Route.useLoaderData();
	const { open } = useAdminDetailSheet();
	const columns: ColumnDef<BorrowerTableRow>[] = [
		{
			accessorKey: "name",
			header: "Borrower",
			cell: ({ row }) => <TextCell value={row.original.name} />,
			meta: { isTextSearchable: true, label: "Borrower" },
		},
		{
			accessorKey: "status",
			header: "Status",
			cell: ({ row }) => (
				<BadgeCell
					color={getBorrowerStatusColor(row.original.status)}
					value={row.original.status.replaceAll("_", " ")}
				/>
			),
			meta: { isTextSearchable: true, label: "Status" },
		},
		{
			accessorKey: "portfolioCount",
			header: "Active loans",
			cell: ({ row }) => (
				<TextCell value={String(row.original.portfolioCount)} />
			),
			meta: { align: "right", label: "Active loans" },
		},
	];
	const recordId = useMatch({
		from: "/admin/borrowers/$recordid",
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
				description="Dedicated route scaffold for the borrowers system entity."
				onRowClick={(row) => open(String(row.id))}
				title="Borrowers"
			/>
			<AdminDetailSheet entityType="borrowers" />
		</>
	);
}
