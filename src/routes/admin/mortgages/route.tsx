import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Outlet, useMatch } from "@tanstack/react-router";
import EntityTable from "#/components/admin/shell/EntityTable";
import { adminEntityTableColumns } from "#/components/admin/shell/entity-table-columns";
import { useAdminDetailSheet } from "#/hooks/useAdminDetailSheet";
import { adminEntityRowsQueryOptions } from "#/lib/admin-entity-queries";

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
	const recordId = useMatch({
		from: "/admin/mortgages/$recordid",
		select: (match) => match.params.recordid,
		shouldThrow: false,
	});

	if (recordId) {
		return <Outlet />;
	}

	return (
		<EntityTable
			columns={adminEntityTableColumns}
			data={data}
			onRowClick={(row) => open(row.id)}
		/>
	);
}
