import { createFileRoute } from "@tanstack/react-router";
import { AdminRecordDetailPage } from "#/components/admin/shell/AdminRecordDetailPage";
import {
	AdminPageSkeleton,
	AdminRouteErrorBoundary,
} from "#/components/admin/shell/AdminRouteStates";

export const Route = createFileRoute("/admin/properties/$recordid")({
	component: RouteComponent,
	errorComponent: AdminRouteErrorBoundary,
	pendingComponent: PropertyDetailPendingPage,
});

function RouteComponent() {
	const { recordid } = Route.useParams();

	return <AdminRecordDetailPage entityType="properties" recordId={recordid} />;
}

function PropertyDetailPendingPage() {
	return <AdminPageSkeleton descriptionWidth="w-64" titleWidth="w-56" />;
}
