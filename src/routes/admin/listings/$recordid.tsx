import { createFileRoute } from "@tanstack/react-router";
import { AdminRecordDetailPage } from "#/components/admin/shell/AdminRecordDetailPage";
import {
	AdminPageSkeleton,
	AdminRouteErrorBoundary,
} from "#/components/admin/shell/AdminRouteStates";

export const Route = createFileRoute("/admin/listings/$recordid")({
	component: RouteComponent,
	errorComponent: AdminRouteErrorBoundary,
	pendingComponent: ListingDetailPendingPage,
});

function RouteComponent() {
	const { recordid } = Route.useParams();

	return <AdminRecordDetailPage entityType="listings" recordId={recordid} />;
}

function ListingDetailPendingPage() {
	return <AdminPageSkeleton descriptionWidth="w-64" titleWidth="w-56" />;
}
