import {
	createFileRoute,
	getRouteApi,
	Outlet,
	useMatch,
} from "@tanstack/react-router";
import { AdminDetailSheet } from "#/components/admin/shell/AdminDetailSheet";
import EntityTable, { columns } from "#/components/admin/shell/EntityTable.tsx";
import { useAdminDetailSheet } from "#/hooks/useAdminDetailSheet";

const routeApi = getRouteApi("/admin/$entitytype");

export const Route = createFileRoute("/admin/$entitytype")({
	component: EntityList,
	loader: async ({ params }) => {
		const { entitytype } = params;

		const fakeData = Array.from({ length: 10 }, (_, index) => ({
			id: index,
			name: `Entity ${index}`,
			amount: Math.random() * 1000,
		}));

		return { entitytype: entitytype as string, fakeData };
	},
});

function EntityList() {
	const { fakeData } = routeApi.useLoaderData();
	const { open } = useAdminDetailSheet();
	const { entitytype } = routeApi.useParams();
	const recordId = useMatch({
		from: "/admin/$entitytype/$recordid",
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
			<AdminDetailSheet entityType={entitytype} />
		</>
	);
}
