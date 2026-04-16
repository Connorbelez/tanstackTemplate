import { createFileRoute } from "@tanstack/react-router";
import { OriginationCasesIndexPage } from "#/components/admin/origination/OriginationCasesIndexPage";
import {
	AdminPageSkeleton,
	AdminRouteErrorBoundary,
} from "#/components/admin/shell/AdminRouteStates";
import { guardOperationalAdminPermission } from "#/lib/auth";

export const Route = createFileRoute("/admin/originations")({
	beforeLoad: guardOperationalAdminPermission("mortgage:originate"),
	component: OriginationCasesIndexPage,
	errorComponent: AdminRouteErrorBoundary,
	pendingComponent: OriginationsPendingPage,
});

function OriginationsPendingPage() {
	return <AdminPageSkeleton descriptionWidth="w-72" titleWidth="w-64" />;
}
