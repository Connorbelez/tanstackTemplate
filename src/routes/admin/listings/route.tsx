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

interface ListingTableRow {
	id: string;
	status?: string;
	subtitle: string;
	title: string;
	updatedAt?: number;
}

export const Route = createFileRoute("/admin/listings")({
	component: EntityList,
	loader: async ({ context }) => {
		await context.queryClient.ensureQueryData(
			adminEntityRowsQueryOptions("listings")
		);
	},
});

function EntityList() {
	const { data } = useSuspenseQuery(adminEntityRowsQueryOptions("listings"));
	const { open } = useAdminDetailSheet();
	const columns: ColumnDef<ListingTableRow>[] = [
		{
			accessorKey: "title",
			header: "Listing",
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
			meta: { isTextSearchable: true, label: "Listing" },
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
		from: "/admin/listings/$recordid",
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
				description="Dedicated route scaffold for the listings system entity."
				onRowClick={(row) => open(row.id)}
				title="Listings"
			/>
			<AdminDetailSheet entityType="listings" />
		</>
	);
}
