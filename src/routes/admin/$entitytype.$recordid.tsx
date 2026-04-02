import { createFileRoute } from "@tanstack/react-router";
import { AdminRecordDetailPage } from "#/components/admin/shell/AdminRecordDetailPage";
import { isAdminEntityType } from "#/lib/admin-entities";

export const Route = createFileRoute("/admin/$entitytype/$recordid")({
	component: RouteComponent,
});

function RouteComponent() {
	const { entitytype, recordid } = Route.useParams();

	if (!isAdminEntityType(entitytype)) {
		return (
			<div className="p-6 text-muted-foreground text-sm">
				Unknown admin entity type: {entitytype}
			</div>
		);
	}

	return <AdminRecordDetailPage entityType={entitytype} recordId={recordid} />;
}
