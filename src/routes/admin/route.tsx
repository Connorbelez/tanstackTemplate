import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AdminLayout } from "#/components/admin/shell/AdminLayout";
import { AdminRouteErrorBoundary } from "#/components/admin/shell/AdminRouteStates";
import { parseAdminDetailSearch } from "#/lib/admin-detail-search";
import { canAccessAdminPath } from "#/lib/auth";
import { buildSignInRedirect } from "#/lib/auth-redirect";

export const Route = createFileRoute("/admin")({
	beforeLoad: ({ context, location }) => {
		if (!context.userId) {
			throw redirect(buildSignInRedirect(location.href));
		}

		if (!canAccessAdminPath(location.pathname, context.permissions)) {
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
		<AdminLayout>
			<Outlet />
			{/* <AdminDetailSheet /> */}
		</AdminLayout>
	);
}
