import { createFileRoute, Outlet } from "@tanstack/react-router";
import {
	AdminPageSkeleton,
	AdminRouteErrorBoundary,
} from "#/components/admin/shell/AdminRouteStates";
import { guardPermission } from "#/lib/auth";

export const Route = createFileRoute("/admin/underwriting")({
	beforeLoad: guardPermission("admin:access"),
	component: () => <Outlet />,
	errorComponent: AdminRouteErrorBoundary,
	pendingComponent: UnderwritingPendingPage,
});

function UnderwritingPendingPage() {
	return <AdminPageSkeleton descriptionWidth="w-56" titleWidth="w-48" />;
}
