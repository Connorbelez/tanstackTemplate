import { createFileRoute } from "@tanstack/react-router";
import { AdminRecordDetailPage } from "#/components/admin/shell/AdminRecordDetailPage";
import { AdminNotFoundState } from "#/components/admin/shell/AdminRouteStates";
import { isAdminEntityType } from "#/lib/admin-entities";

export const Route = createFileRoute("/admin/$entitytype/$recordid")({
	component: RouteComponent,
});

function RouteComponent() {
	const { entitytype, recordid } = Route.useParams();

	if (!isAdminEntityType(entitytype)) {
		return <AdminNotFoundState entityType={entitytype} variant="entity" />;
	}

	return <AdminRecordDetailPage entityType={entitytype} recordId={recordid} />;
}
