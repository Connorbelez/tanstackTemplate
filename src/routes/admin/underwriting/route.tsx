import { createFileRoute, Outlet } from "@tanstack/react-router";
import {
	AdminPageSkeleton,
	AdminRouteErrorBoundary,
} from "#/components/admin/shell/AdminRouteStates";
import { guardRouteAccess } from "#/lib/auth";

export const Route = createFileRoute("/admin/underwriting")({
	beforeLoad: guardRouteAccess("adminUnderwriting"),
	component: () => <Outlet />,
	errorComponent: AdminRouteErrorBoundary,
	pendingComponent: UnderwritingPendingPage,
});

function UnderwritingPendingPage() {
	return <AdminPageSkeleton descriptionWidth="w-56" titleWidth="w-48" />;
}
