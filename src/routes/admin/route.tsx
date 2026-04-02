import { createFileRoute, Outlet } from "@tanstack/react-router";
import DashboardShell from "#/components/admin/shell/DashboardShell";
import { parseAdminDetailSearch } from "#/lib/admin-detail-search";
import { guardPermission } from "#/lib/auth";

export const Route = createFileRoute("/admin")({
	beforeLoad: () => {
		guardPermission("admin:access");
	},
	validateSearch: (search: Record<string, unknown>) =>
		parseAdminDetailSearch(search),
	component: AdminPage,
});

function AdminPage() {
	return (
		<DashboardShell>
			<Outlet />
			{/* <AdminDetailSheet /> */}
		</DashboardShell>
	);
}
