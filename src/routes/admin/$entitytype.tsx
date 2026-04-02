import {
	createFileRoute,
	getRouteApi,
	Outlet,
	redirect,
	useMatch,
} from "@tanstack/react-router";
import {
	AdminPageSkeleton,
	AdminRouteErrorBoundary,
	AdminTableSkeleton,
} from "#/components/admin/shell/AdminRouteStates";
import EntityTable, { columns } from "#/components/admin/shell/EntityTable.tsx";
import { isAdminEntityType } from "#/components/admin/shell/entity-registry";
import { useAdminDetailSheet } from "#/hooks/useAdminDetailSheet";
import { EMPTY_ADMIN_DETAIL_SEARCH } from "#/lib/admin-detail-search";

const routeApi = getRouteApi("/admin/$entitytype");

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
	errorComponent: AdminRouteErrorBoundary,
	loader: async ({ params }) => {
		const fakeData = Array.from({ length: 10 }, (_, index) => ({
			id: index,
			name: `Entity ${index}`,
			amount: Math.random() * 1000,
		}));

		return { fakeData };
	},
	pendingComponent: GenericEntityPendingPage,
});

function EntityList() {
	const { fakeData } = routeApi.useLoaderData();
	const { open } = useAdminDetailSheet();
	const recordId = useMatch({
		from: "/admin/$entitytype/$recordid",
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

function GenericEntityPendingPage() {
	return (
		<AdminPageSkeleton titleWidth="w-48">
			<AdminTableSkeleton columnCount={columns.length} />
		</AdminPageSkeleton>
	);
}
