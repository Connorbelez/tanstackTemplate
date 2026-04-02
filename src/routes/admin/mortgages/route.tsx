import { createFileRoute, Outlet, useMatch } from "@tanstack/react-router";
import {
	AdminPageSkeleton,
	AdminRouteErrorBoundary,
	AdminTableSkeleton,
} from "#/components/admin/shell/AdminRouteStates";
import EntityTable, { columns } from "#/components/admin/shell/EntityTable.tsx";
import { useAdminDetailSheet } from "#/hooks/useAdminDetailSheet";

export const Route = createFileRoute("/admin/mortgages")({
	component: EntityList,
	errorComponent: AdminRouteErrorBoundary,
	loader: async () => {
		const fakeData = Array.from({ length: 10 }, (_, index) => ({
			id: index,
			name: `Mortgage ${index}`,
			amount: Math.random() * 1000,
		}));

		return { fakeData };
	},
	pendingComponent: MortgagesPendingPage,
});

function EntityList() {
	const { fakeData } = Route.useLoaderData();
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
			columns={columns}
			data={fakeData}
			onRowClick={(row) => open(String(row.id))}
		/>
	);
}

function MortgagesPendingPage() {
	return (
		<AdminPageSkeleton titleWidth="w-52">
			<AdminTableSkeleton columnCount={columns.length} />
		</AdminPageSkeleton>
	);
}
