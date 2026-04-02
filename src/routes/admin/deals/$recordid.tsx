import { createFileRoute } from "@tanstack/react-router";
import { AdminRecordDetailPage } from "#/components/admin/shell/AdminRecordDetailPage";
import {
	AdminPageSkeleton,
	AdminRouteErrorBoundary,
} from "#/components/admin/shell/AdminRouteStates";

export const Route = createFileRoute("/admin/deals/$recordid")({
	component: RouteComponent,
	errorComponent: AdminRouteErrorBoundary,
	pendingComponent: DealDetailPendingPage,
});

function RouteComponent() {
	const { recordid } = Route.useParams();

	return <AdminRecordDetailPage entityType="deals" recordId={recordid} />;
}

function DealDetailPendingPage() {
	return <AdminPageSkeleton descriptionWidth="w-64" titleWidth="w-56" />;
}
