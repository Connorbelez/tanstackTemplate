import { createFileRoute } from "@tanstack/react-router";
import { NewOriginationBootstrap } from "#/components/admin/origination/NewOriginationBootstrap";
import {
	AdminPageSkeleton,
	AdminRouteErrorBoundary,
} from "#/components/admin/shell/AdminRouteStates";
import { guardRouteAccess } from "#/lib/auth";

export const Route = createFileRoute("/admin/originations/new")({
	beforeLoad: guardRouteAccess("adminOriginations"),
	component: NewOriginationBootstrap,
	errorComponent: AdminRouteErrorBoundary,
	pendingComponent: OriginationsPendingPage,
});

function OriginationsPendingPage() {
	return <AdminPageSkeleton descriptionWidth="w-72" titleWidth="w-64" />;
}
