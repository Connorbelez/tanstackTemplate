import { createFileRoute } from "@tanstack/react-router";
import { OriginationWorkspacePage } from "#/components/admin/origination/OriginationWorkspacePage";
import {
	AdminPageSkeleton,
	AdminRouteErrorBoundary,
} from "#/components/admin/shell/AdminRouteStates";
import { guardRouteAccess } from "#/lib/auth";

export const Route = createFileRoute("/admin/originations/$caseId")({
	beforeLoad: guardRouteAccess("adminOriginations"),
	component: RouteComponent,
	errorComponent: AdminRouteErrorBoundary,
	pendingComponent: OriginationsPendingPage,
});

function RouteComponent() {
	const { caseId } = Route.useParams();

	return <OriginationWorkspacePage caseId={caseId} />;
}

function OriginationsPendingPage() {
	return <AdminPageSkeleton descriptionWidth="w-72" titleWidth="w-64" />;
}
