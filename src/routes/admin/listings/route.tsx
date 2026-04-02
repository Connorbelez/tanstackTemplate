import { createFileRoute, Outlet, useMatch } from "@tanstack/react-router";

import { AdminDetailSheet } from "#/components/admin/shell/AdminDetailSheet";
import {
	AdminPageSkeleton,
	AdminRouteErrorBoundary,
	AdminTableSkeleton,
} from "#/components/admin/shell/AdminRouteStates";
import EntityTable, { columns } from "#/components/admin/shell/EntityTable.tsx";
import { useAdminDetailSheet } from "#/hooks/useAdminDetailSheet";

export const Route = createFileRoute("/admin/listings")({
	component: EntityList,
	errorComponent: AdminRouteErrorBoundary,
	loader: async () => {
		const fakeData = Array.from({ length: 10 }, (_, index) => ({
			id: index,
			name: `Listing ${index}`,
			amount: Math.random() * 1000,
		}));

		return { fakeData };
	},
	pendingComponent: ListingsPendingPage,
});

function EntityList() {
	const { fakeData } = Route.useLoaderData();
	const { open } = useAdminDetailSheet();
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
				data={fakeData}
				onRowClick={(row) => open(String(row.id))}
			/>
			<AdminDetailSheet entityType="listings" />
		</>
	);
}

function ListingsPendingPage() {
	return (
		<AdminPageSkeleton titleWidth="w-40">
			<AdminTableSkeleton columnCount={columns.length} />
		</AdminPageSkeleton>
	);
}
