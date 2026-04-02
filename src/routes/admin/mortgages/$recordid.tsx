import { createFileRoute } from "@tanstack/react-router";
import { AdminRecordDetailPage } from "#/components/admin/shell/AdminRecordDetailPage";
import {
	AdminPageSkeleton,
	AdminRouteErrorBoundary,
} from "#/components/admin/shell/AdminRouteStates";

export const Route = createFileRoute("/admin/mortgages/$recordid")({
	component: RouteComponent,
	errorComponent: AdminRouteErrorBoundary,
	pendingComponent: MortgageDetailPendingPage,
});

function RouteComponent() {
	const { recordid } = Route.useParams();

	return <AdminRecordDetailPage entityType="mortgages" recordId={recordid} />;
}

function MortgageDetailPendingPage() {
	return <AdminPageSkeleton descriptionWidth="w-64" titleWidth="w-56" />;
}
