import { createFileRoute, Outlet, useMatch } from "@tanstack/react-router";
import { AdminEntityViewPage } from "#/components/admin/shell/AdminEntityViewPage";

export const Route = createFileRoute("/admin/borrowers")({
	component: EntityList,
});

function EntityList() {
	const recordId = useMatch({
		from: "/admin/borrowers/$recordid",
		select: (match) => match.params.recordid,
		shouldThrow: false,
	});

	if (recordId) {
		return <Outlet />;
	}

	return <AdminEntityViewPage entityType="borrowers" />;
}
