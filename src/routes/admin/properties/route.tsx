import { createFileRoute, Outlet, useMatch } from "@tanstack/react-router";

import { AdminDetailSheet } from "#/components/admin/shell/AdminDetailSheet";
import {
	AdminPageSkeleton,
	AdminRouteErrorBoundary,
	AdminTableSkeleton,
} from "#/components/admin/shell/AdminRouteStates";
import EntityTable, { columns } from "#/components/admin/shell/EntityTable.tsx";
import { useAdminDetailSheet } from "#/hooks/useAdminDetailSheet";

export const Route = createFileRoute("/admin/properties")({
	component: EntityList,
	errorComponent: AdminRouteErrorBoundary,
	loader: async () => {
		const fakeData = Array.from({ length: 10 }, (_, index) => ({
			id: index,
			name: `Property ${index}`,
			amount: Math.random() * 1000,
		}));

		return { fakeData };
	},
	pendingComponent: PropertiesPendingPage,
});

function EntityList() {
	const { fakeData } = Route.useLoaderData();
	const { open } = useAdminDetailSheet();
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
				data={fakeData}
				onRowClick={(row) => open(String(row.id))}
			/>
			<AdminDetailSheet entityType="properties" />
		</>
	);
}

function PropertiesPendingPage() {
	return (
		<AdminPageSkeleton titleWidth="w-44">
			<AdminTableSkeleton columnCount={columns.length} />
		</AdminPageSkeleton>
	);
}
