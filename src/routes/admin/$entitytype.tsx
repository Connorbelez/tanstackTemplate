import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Outlet, useMatch } from "@tanstack/react-router";
import { AdminDetailSheet } from "#/components/admin/shell/AdminDetailSheet";
import EntityTable from "#/components/admin/shell/EntityTable";
import { adminEntityTableColumns } from "#/components/admin/shell/entity-table-columns";
import { useAdminDetailSheet } from "#/hooks/useAdminDetailSheet";
import { type AdminEntityType, isAdminEntityType } from "#/lib/admin-entities";
import { adminEntityRowsQueryOptions } from "#/lib/admin-entity-queries";

export const Route = createFileRoute("/admin/$entitytype")({
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

	if (recordId) {
		return <Outlet />;
	}

	return (
		<>
			<EntityTable
				columns={adminEntityTableColumns}
				data={data}
				onRowClick={(row) => open(row.id)}
			/>
			<AdminDetailSheet entityType={entityType} />
		</>
	);
}
