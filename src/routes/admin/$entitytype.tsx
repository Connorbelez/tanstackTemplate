import { useSuspenseQuery } from "@tanstack/react-query";
import {
	createFileRoute,
	Outlet,
	redirect,
	useMatch,
} from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { AdminDetailSheet } from "#/components/admin/shell/AdminDetailSheet";
import {
	BadgeCell,
	DateCell,
	TextCell,
} from "#/components/admin/shell/cell-renderers";
import EntityTable from "#/components/admin/shell/EntityTable";
import { useAdminDetailSheet } from "#/hooks/useAdminDetailSheet";
import { EMPTY_ADMIN_DETAIL_SEARCH } from "#/lib/admin-detail-search";
import { type AdminEntityType, isAdminEntityType } from "#/lib/admin-entities";
import { adminEntityRowsQueryOptions } from "#/lib/admin-entity-queries";

interface GenericEntityTableRow {
	id: string;
	status?: string;
	subtitle: string;
	title: string;
	updatedAt?: number;
}

export const Route = createFileRoute("/admin/$entitytype")({
	beforeLoad: ({ params }) => {
		if (!isAdminEntityType(params.entitytype)) {
			throw redirect({
				to: "/admin",
				search: EMPTY_ADMIN_DETAIL_SEARCH,
			});
		}
	},
	component: EntityList,
	loader: async ({ context, params }) => {
		if (!isAdminEntityType(params.entitytype)) {
			return;
		}

		await context.queryClient.ensureQueryData(
			adminEntityRowsQueryOptions(params.entitytype)
		);
	},
});

function EntityList() {
	const { entitytype } = Route.useParams();

	if (!isAdminEntityType(entitytype)) {
		return (
			<div className="p-6 text-muted-foreground text-sm">
				Unknown admin entity type: {entitytype}
			</div>
		);
	}

	return <TypedEntityList entityType={entitytype} />;
}

function TypedEntityList({ entityType }: { entityType: AdminEntityType }) {
	const { open } = useAdminDetailSheet();
	const recordId = useMatch({
		from: "/admin/$entitytype/$recordid",
		select: (match) => match.params.recordid,
		shouldThrow: false,
	});
	const { data } = useSuspenseQuery(adminEntityRowsQueryOptions(entityType));
	const columns: ColumnDef<GenericEntityTableRow>[] = [
		{
			accessorKey: "title",
			header: "Record",
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
			meta: { isTextSearchable: true, label: "Record" },
		},
		{
			accessorKey: "status",
			header: "Status",
			cell: ({ row }) => (
				<BadgeCell
					color={row.original.status ? "#64748b" : undefined}
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

	if (recordId) {
		return <Outlet />;
	}

	return (
		<>
			<EntityTable
				columns={columns}
				data={data}
				description="Generic fallback route reserved for dynamic or lower-priority entities."
				onRowClick={(row) => open(row.id)}
				title={entityType}
			/>
			<AdminDetailSheet entityType={entityType} />
		</>
	);
}
