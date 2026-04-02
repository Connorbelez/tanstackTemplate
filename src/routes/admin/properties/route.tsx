import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Outlet, useMatch } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { AdminDetailSheet } from "#/components/admin/shell/AdminDetailSheet";
import { DateCell, TextCell } from "#/components/admin/shell/cell-renderers";
import EntityTable from "#/components/admin/shell/EntityTable";
import { useAdminDetailSheet } from "#/hooks/useAdminDetailSheet";
import { adminEntityRowsQueryOptions } from "#/lib/admin-entity-queries";

interface PropertyTableRow {
	id: string;
	subtitle: string;
	title: string;
	updatedAt?: number;
}

export const Route = createFileRoute("/admin/properties")({
	component: EntityList,
	loader: async ({ context }) => {
		await context.queryClient.ensureQueryData(
			adminEntityRowsQueryOptions("properties")
		);
	},
});

function EntityList() {
	const { data } = useSuspenseQuery(adminEntityRowsQueryOptions("properties"));
	const { open } = useAdminDetailSheet();
	const columns: ColumnDef<PropertyTableRow>[] = [
		{
			accessorKey: "title",
			header: "Property",
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
			meta: { isTextSearchable: true, label: "Property" },
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
		from: "/admin/properties/$recordid",
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
				description="Dedicated route scaffold for the properties system entity."
				onRowClick={(row) => open(row.id)}
				title="Properties"
			/>
			<AdminDetailSheet entityType="properties" />
		</>
	);
}
