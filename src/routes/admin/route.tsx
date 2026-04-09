import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AdminDetailSheet } from "#/components/admin/shell/AdminDetailSheet";
import { AdminRouteErrorBoundary } from "#/components/admin/shell/AdminRouteStates";
import DashboardShell from "#/components/admin/shell/DashboardShell";
import { RecordSidebarProvider } from "#/components/admin/shell/RecordSidebarProvider";
import { parseAdminDetailSearch } from "#/lib/admin-detail-search";
import { canAccessAdminPath } from "#/lib/auth";
import { buildSignInRedirect } from "#/lib/auth-redirect";

export const Route = createFileRoute("/admin")({
	beforeLoad: ({ context, location }) => {
		if (!context.userId) {
			throw redirect(buildSignInRedirect(location.href));
		}

		if (!canAccessAdminPath(location.pathname, context)) {
			throw redirect({ to: "/unauthorized" });
		}
	},
	errorComponent: AdminRouteErrorBoundary,
	validateSearch: (search: Record<string, unknown>) =>
		parseAdminDetailSearch(search),
	component: AdminPage,
});

function AdminPage() {
	return (
		<RecordSidebarProvider>
			<DashboardShell>
				<Outlet />
				<AdminDetailSheet />
			</DashboardShell>
		</RecordSidebarProvider>
	);
}
