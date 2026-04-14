import { createFileRoute, Outlet } from "@tanstack/react-router";
import {
	AdminPageSkeleton,
	AdminRouteErrorBoundary,
} from "#/components/admin/shell/AdminRouteStates";
import { guardAnyPermission } from "#/lib/auth";

export const Route = createFileRoute("/admin/underwriting")({
	beforeLoad: guardAnyPermission(["admin:access", "underwriter:access"], {
		allowAdminOverride: false,
	}),
	component: () => <Outlet />,
	errorComponent: AdminRouteErrorBoundary,
	pendingComponent: UnderwritingPendingPage,
});

function UnderwritingPendingPage() {
	return <AdminPageSkeleton descriptionWidth="w-56" titleWidth="w-48" />;
}
