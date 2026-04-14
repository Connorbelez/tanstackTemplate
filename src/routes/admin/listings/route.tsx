import { createFileRoute, Outlet, useMatch } from "@tanstack/react-router";
import { AdminEntityViewPage } from "#/components/admin/shell/AdminEntityViewPage";

export const Route = createFileRoute("/admin/listings")({
	component: EntityList,
});

function EntityList() {
	const recordId = useMatch({
		from: "/admin/listings/$recordid",
		select: (match) => match.params.recordid,
		shouldThrow: false,
	});

	if (recordId) {
		return <Outlet />;
	}

	return <AdminEntityViewPage entityType="listings" />;
}
