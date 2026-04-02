import { createFileRoute, redirect } from "@tanstack/react-router";
import { AdminRecordDetailPage } from "#/components/admin/shell/AdminRecordDetailPage";
import {
	AdminPageSkeleton,
	AdminRouteErrorBoundary,
} from "#/components/admin/shell/AdminRouteStates";
import { isAdminEntityType } from "#/components/admin/shell/entity-registry";
import { EMPTY_ADMIN_DETAIL_SEARCH } from "#/lib/admin-detail-search";

export const Route = createFileRoute("/admin/$entitytype/$recordid")({
	beforeLoad: ({ params }) => {
		if (!isAdminEntityType(params.entitytype)) {
			throw redirect({
				to: "/admin",
				search: EMPTY_ADMIN_DETAIL_SEARCH,
			});
		}
	},
	component: RouteComponent,
	errorComponent: AdminRouteErrorBoundary,
	pendingComponent: GenericEntityDetailPendingPage,
});

function RouteComponent() {
	const { entitytype, recordid } = Route.useParams();

	return <AdminRecordDetailPage entityType={entitytype} recordId={recordid} />;
}

function GenericEntityDetailPendingPage() {
	return <AdminPageSkeleton descriptionWidth="w-64" titleWidth="w-56" />;
}
