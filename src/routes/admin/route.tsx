import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AdminDetailSheet } from "#/components/admin/shell/AdminDetailSheet";
import { AdminLayout } from "#/components/admin/shell/AdminLayout";
import { RecordSidebarProvider } from "#/components/admin/shell/RecordSidebarProvider";
import { AdminRouteErrorBoundary } from "#/components/admin/shell/AdminRouteStates";
import { parseAdminDetailSearch } from "#/lib/admin-detail-search";
import { guardPermission } from "#/lib/auth";

export const Route = createFileRoute("/admin")({
	beforeLoad: guardPermission("admin:access"),
	errorComponent: AdminRouteErrorBoundary,
	validateSearch: (search: Record<string, unknown>) =>
		parseAdminDetailSearch(search),
	component: AdminPage,
});

function AdminPage() {
	return (
		<RecordSidebarProvider>
			<AdminLayout>
				<Outlet />
				<AdminDetailSheet />
			</AdminLayout>
		</RecordSidebarProvider>
	);
}
