import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Outlet, useMatch } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { AdminDetailSheet } from "#/components/admin/shell/AdminDetailSheet";
import {
	BadgeCell,
	DateCell,
	TextCell,
} from "#/components/admin/shell/cell-renderers";
import EntityTable from "#/components/admin/shell/EntityTable";
import { useAdminDetailSheet } from "#/hooks/useAdminDetailSheet";
import { adminEntityRowsQueryOptions } from "#/lib/admin-entity-queries";

interface MortgageTableRow {
	id: string;
	status?: string;
	subtitle: string;
	title: string;
	updatedAt?: number;
}

export const Route = createFileRoute("/admin/mortgages")({
	component: EntityList,
	loader: async ({ context }) => {
		await context.queryClient.ensureQueryData(
			adminEntityRowsQueryOptions("mortgages")
		);
	},
});

function EntityList() {
	const { data } = useSuspenseQuery(adminEntityRowsQueryOptions("mortgages"));
	const { open } = useAdminDetailSheet();
	const columns: ColumnDef<MortgageTableRow>[] = [
		{
			accessorKey: "id",
			header: "ID",
			cell: ({ row }) => (
				<TextCell
					className="font-mono text-xs"
					maxLength={18}
					value={row.original.id}
				/>
			),
			meta: { isTextSearchable: true, label: "ID" },
		},
		{
			accessorKey: "title",
			header: "Mortgage",
			cell: ({ row }) => (
				<div className="space-y-1">
					<TextCell className="font-medium" value={row.original.title} />
					<TextCell
						className="text-muted-foreground text-xs"
						maxLength={96}
						value={row.original.subtitle}
					/>
				</div>
			),
			meta: { isTextSearchable: true, label: "Mortgage" },
		},
		{
			accessorKey: "status",
			header: "Status",
			cell: ({ row }) => (
				<BadgeCell
					color={row.original.status ? "#16a34a" : undefined}
					value={row.original.status?.replaceAll("_", " ")}
				/>
			),
			meta: { isTextSearchable: true, label: "Status" },
		},
		{
			accessorKey: "updatedAt",
			header: "Updated",
			cell: ({ row }) => (
				<DateCell format="both" value={row.original.updatedAt} />
			),
			meta: { align: "right", label: "Updated" },
		},
	];
	const recordId = useMatch({
		from: "/admin/mortgages/$recordid",
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
				data={data}
				description="Dedicated route scaffold for the mortgages system entity."
				onRowClick={(row) => open(row.id)}
				title="Mortgages"
			/>
			<AdminDetailSheet entityType="mortgages" />
		</>
	);
}
