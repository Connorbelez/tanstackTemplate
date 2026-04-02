import { createFileRoute, Outlet, useMatch } from "@tanstack/react-router";

import EntityTable, { columns } from "#/components/admin/shell/EntityTable.tsx";
import { useAdminDetailSheet } from "#/hooks/useAdminDetailSheet";

export const Route = createFileRoute("/admin/properties")({
	component: EntityList,
	loader: async () => {
		const fakeData = Array.from({ length: 10 }, (_, index) => ({
			id: index,
			name: `Property ${index}`,
			amount: Math.random() * 1000,
		}));

		return { fakeData };
	},
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
		<EntityTable
			columns={columns}
			data={fakeData}
			onRowClick={(row) => open(String(row.id))}
		/>
	);
}
